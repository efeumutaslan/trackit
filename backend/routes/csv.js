import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

// Escape one CSV value: wrap in quotes, escape internal quotes.
function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function csvRow(arr) { return arr.map(csvCell).join(',') + '\n'; }

// GET /api/csv/export  -> text/csv
// Single flat CSV: one row per set. Notes columns are deliberately last so
// the row stays readable in any spreadsheet client.
router.get('/export', (req, res) => {
  const rows = db.prepare(`
    SELECT
      ws.session_date,
      ws.started_at,
      ws.finished_at,
      ws.mood,
      ws.workout_notes,
      t.name           AS template_name,
      t.color          AS template_color,
      e.name           AS exercise_name,
      se.order_idx     AS exercise_order,
      se.target_sets,
      se.target_reps,
      se.target_time_s,
      se.target_mileage_m,
      se.superset_tag,
      se.weight_adjust,
      se.exercise_notes,
      ss.set_number,
      ss.weight_kg,
      ss.reps_done,
      ss.time_seconds,
      ss.mileage_m
    FROM workout_sessions ws
    LEFT JOIN templates t          ON t.id = ws.template_id
    LEFT JOIN session_exercises se ON se.session_id = ws.id
    LEFT JOIN exercises e          ON e.id = se.exercise_id
    LEFT JOIN session_sets ss      ON ss.session_exercise_id = se.id
    WHERE ws.user_id = ?
    ORDER BY ws.session_date, ws.id, se.order_idx, ss.set_number
  `).all(req.userId);

  const cols = [
    'session_date','started_at','finished_at','mood',
    'template_name','template_color',
    'exercise_name','exercise_order','superset_tag','weight_adjust',
    'target_sets','target_reps','target_time_s','target_mileage_m',
    'set_number','weight_kg','reps_done','time_seconds','mileage_m',
    'exercise_notes','workout_notes'
  ];
  let out = csvRow(cols);
  for (const r of rows) out += csvRow(cols.map((c) => r[c]));

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="trackit-export-${new Date().toISOString().slice(0,10)}.csv"`);
  res.send(out);
});

// Very small CSV parser (handles quoted cells and "" escapes).
function parseCsv(text) {
  const out = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); cell = ''; out.push(row); row = []; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); out.push(row); }
  return out;
}

// POST /api/csv/import — body: { csv: "<text>" }
// This is purposely additive: imports into the current user's account.
// Existing data is NOT touched. New session rows are created.
router.post('/import', (req, res) => {
  const text = req.body?.csv;
  if (!text) return res.status(400).json({ error: 'csv field required' });
  const lines = parseCsv(text).filter((r) => r.length > 1);
  if (lines.length < 2) return res.status(400).json({ error: 'no rows' });
  const header = lines[0];
  const idx = (name) => header.indexOf(name);
  // Be tolerant about missing optional cols
  const need = ['session_date', 'exercise_name', 'set_number'];
  for (const n of need) {
    if (idx(n) < 0) return res.status(400).json({ error: `missing column: ${n}` });
  }

  const findOrCreateTpl = (name, color) => {
    if (!name) return null;
    const e = db.prepare('SELECT id FROM templates WHERE user_id = ? AND name = ?').get(req.userId, name);
    if (e) return e.id;
    const i = db.prepare('INSERT INTO templates (user_id, name, color) VALUES (?, ?, ?)')
      .run(req.userId, name, color || '#FFB07A');
    return i.lastInsertRowid;
  };
  const findOrCreateEx = (name) => {
    if (!name) return null;
    const e = db.prepare('SELECT id FROM exercises WHERE user_id = ? AND name = ?').get(req.userId, name);
    if (e) return e.id;
    const i = db.prepare('INSERT INTO exercises (user_id, name) VALUES (?, ?)').run(req.userId, name);
    return i.lastInsertRowid;
  };

  let imported = 0;
  const tx = db.transaction(() => {
    // Group by (session_date, started_at, template, workout_notes) so multiple
    // exercises on the same row create ONE session.
    const sessionMap = new Map(); // key -> { sessionId, exMap (key->seId) }
    for (const row of lines.slice(1)) {
      if (row.length < header.length) continue;
      const get = (n) => (idx(n) >= 0 ? row[idx(n)] : '');
      const sdate = get('session_date');
      if (!sdate) continue;
      const startedAt   = get('started_at') || null;
      const finishedAt  = get('finished_at') || null;
      const mood        = get('mood') || '';
      const wnote       = get('workout_notes') || '';
      const tplName     = get('template_name');
      const tplColor    = get('template_color');
      const exName      = get('exercise_name');
      const exOrder     = +(get('exercise_order') || 0) || 0;
      const tgtSets     = +(get('target_sets') || 3) || 3;
      const tgtReps     = get('target_reps') || '';
      const tgtTime     = parseInt(get('target_time_s'), 10) || null;
      const tgtMile     = parseInt(get('target_mileage_m'), 10) || null;
      const ssTag       = get('superset_tag') || '';
      const adj         = get('weight_adjust') || '';
      const exNotes     = get('exercise_notes') || '';
      const setNum      = +(get('set_number') || 1) || 1;
      const w           = parseFloat(get('weight_kg')); const wkg = Number.isFinite(w) ? w : null;
      const r           = parseInt(get('reps_done'), 10); const rps = Number.isFinite(r) ? r : null;
      const tsec        = parseInt(get('time_seconds'), 10) || null;
      const mm          = parseInt(get('mileage_m'), 10)    || null;

      const sKey = `${sdate}|${startedAt || ''}|${tplName || ''}`;
      let bucket = sessionMap.get(sKey);
      if (!bucket) {
        const tplId = findOrCreateTpl(tplName, tplColor);
        const sInfo = db.prepare(`
          INSERT INTO workout_sessions (user_id, template_id, session_date, started_at, finished_at, mood, workout_notes)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(req.userId, tplId, sdate, startedAt, finishedAt, mood, wnote);
        bucket = { sessionId: sInfo.lastInsertRowid, exMap: new Map() };
        sessionMap.set(sKey, bucket);
      }
      if (!exName) continue;
      const exId = findOrCreateEx(exName);
      const exKey = `${exId}|${exOrder}`;
      let seId = bucket.exMap.get(exKey);
      if (!seId) {
        const seInfo = db.prepare(`
          INSERT INTO session_exercises
            (session_id, exercise_id, order_idx, target_sets, target_reps, target_time_s,
             target_mileage_m, exercise_notes, superset_tag, weight_adjust)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(bucket.sessionId, exId, exOrder, tgtSets, tgtReps, tgtTime, tgtMile, exNotes, ssTag, adj);
        seId = seInfo.lastInsertRowid;
        bucket.exMap.set(exKey, seId);
      }
      db.prepare(`
        INSERT INTO session_sets (session_exercise_id, set_number, weight_kg, reps_done, time_seconds, mileage_m)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(seId, setNum, wkg, rps, tsec, mm);
      imported++;
    }
  });
  try { tx(); }
  catch (e) { return res.status(500).json({ error: e.message }); }
  res.json({ ok: true, imported });
});

export default router;
