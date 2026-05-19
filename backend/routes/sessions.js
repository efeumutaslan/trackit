import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

function getPrevWorkoutNotes(userId, templateId, beforeDate) {
  if (!templateId) return '';
  const row = db.prepare(`
    SELECT workout_notes FROM workout_sessions
    WHERE user_id = ? AND template_id = ?
      AND session_date < ?
      AND COALESCE(workout_notes,'') != ''
    ORDER BY session_date DESC, id DESC LIMIT 1
  `).get(userId, templateId, beforeDate);
  return row?.workout_notes || '';
}

function getPrevExerciseNotes(userId, exerciseId, beforeDate) {
  const row = db.prepare(`
    SELECT se.exercise_notes FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE ws.user_id = ? AND se.exercise_id = ?
      AND ws.session_date < ?
      AND COALESCE(se.exercise_notes,'') != ''
    ORDER BY ws.session_date DESC, ws.id DESC LIMIT 1
  `).get(userId, exerciseId, beforeDate);
  return row?.exercise_notes || '';
}

function loadSession(userId, sessionId) {
  const s = db.prepare(`
    SELECT ws.*, t.name AS template_name, t.color AS template_color
    FROM workout_sessions ws
    LEFT JOIN templates t ON t.id = ws.template_id
    WHERE ws.id = ? AND ws.user_id = ?
  `).get(sessionId, userId);
  if (!s) return null;

  // Önceki workout notunu dinamik olarak çek (her zaman güncel)
  if (s.template_id) {
    const prevWN = db.prepare(`
      SELECT workout_notes, session_date FROM workout_sessions
      WHERE user_id = ? AND template_id = ?
        AND session_date < ?
        AND COALESCE(workout_notes,'') != ''
      ORDER BY session_date DESC, id DESC LIMIT 1
    `).get(userId, s.template_id, s.session_date);
    s.prev_workout_notes = prevWN?.workout_notes || '';
    s.prev_workout_notes_date = prevWN?.session_date || null;
  } else {
    s.prev_workout_notes = '';
    s.prev_workout_notes_date = null;
  }

  const exercises = db.prepare(`
    SELECT se.*, e.name AS exercise_name
    FROM session_exercises se
    JOIN exercises e ON e.id = se.exercise_id
    WHERE se.session_id = ?
    ORDER BY se.order_idx
  `).all(sessionId);
  for (const ex of exercises) {
    ex.sets = db.prepare(
      'SELECT * FROM session_sets WHERE session_exercise_id = ? ORDER BY set_number'
    ).all(ex.id);
    const totals = ex.sets.reduce(
      (acc, s) => {
        if (s.weight_kg && s.reps_done) acc.tonnage += s.weight_kg * s.reps_done;
        if (s.reps_done) acc.reps += s.reps_done;
        return acc;
      },
      { tonnage: 0, reps: 0 }
    );
    ex.tonnage = totals.tonnage;
    ex.total_reps = totals.reps;
    // önceki session aynı egzersizden tonnage
    const prev = db.prepare(`
      SELECT COALESCE(SUM(ss.weight_kg * ss.reps_done), 0) AS tonnage
      FROM workout_sessions ws
      JOIN session_exercises se ON se.session_id = ws.id
      LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
      WHERE ws.user_id = ? AND se.exercise_id = ?
        AND ws.session_date < ?
      GROUP BY ws.id
      ORDER BY ws.session_date DESC, ws.id DESC LIMIT 1
    `).get(userId, ex.exercise_id, s.session_date);
    ex.prev_tonnage = prev?.tonnage || 0;

    // önceki exercise notunu dinamik çek
    const prevExN = db.prepare(`
      SELECT se.exercise_notes, ws.session_date FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.user_id = ? AND se.exercise_id = ?
        AND ws.session_date < ?
        AND COALESCE(se.exercise_notes,'') != ''
      ORDER BY ws.session_date DESC, ws.id DESC LIMIT 1
    `).get(userId, ex.exercise_id, s.session_date);
    ex.prev_exercise_notes = prevExN?.exercise_notes || '';
    ex.prev_exercise_notes_date = prevExN?.session_date || null;
  }
  s.exercises = exercises;
  return s;
}

router.get('/', (req, res) => {
  const { from, to } = req.query;
  let where = 'WHERE ws.user_id = ?';
  const params = [req.userId];
  if (from) { where += ' AND ws.session_date >= ?'; params.push(from); }
  if (to)   { where += ' AND ws.session_date <= ?'; params.push(to); }
  const rows = db.prepare(`
    SELECT ws.id, ws.session_date, ws.started_at, ws.finished_at,
           ws.workout_notes, ws.template_id,
           t.name AS template_name, t.color AS template_color
    FROM workout_sessions ws
    LEFT JOIN templates t ON t.id = ws.template_id
    ${where}
    ORDER BY ws.session_date DESC, ws.id DESC
  `).all(...params);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const s = loadSession(req.userId, req.params.id);
  if (!s) return res.status(404).json({ error: 'Bulunamadı' });
  res.json(s);
});

// Yeni session başlat: template'den ya da boş
router.post('/', (req, res) => {
  const { template_id, session_date, exercises, start_now } = req.body || {};
  const date = session_date || new Date().toISOString().slice(0, 10);
  const startedAt = start_now ? new Date().toISOString() : null;
  const prevWN = getPrevWorkoutNotes(req.userId, template_id, date);

  const txn = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO workout_sessions
        (user_id, template_id, session_date, started_at, prev_workout_notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.userId, template_id || null, date, startedAt, prevWN);
    const sid = info.lastInsertRowid;

    let exToInsert = exercises;
    if (!exToInsert && template_id) {
      // template'ten egzersizleri kopyala
      exToInsert = db.prepare(`
        SELECT exercise_id, order_idx, target_sets, target_reps
        FROM template_exercises WHERE template_id = ?
        ORDER BY order_idx
      `).all(template_id);
    }
    exToInsert = exToInsert || [];

    const insSE = db.prepare(`
      INSERT INTO session_exercises
        (session_id, exercise_id, order_idx, target_sets, target_reps, prev_exercise_notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insSet = db.prepare(`
      INSERT INTO session_sets (session_exercise_id, set_number, weight_kg, reps_done)
      VALUES (?, ?, NULL, NULL)
    `);
    exToInsert.forEach((ex, idx) => {
      const prevNote = getPrevExerciseNotes(req.userId, ex.exercise_id, date);
      const seInfo = insSE.run(
        sid, ex.exercise_id, idx,
        ex.target_sets || 3, ex.target_reps || '', prevNote
      );
      const seId = seInfo.lastInsertRowid;
      const setsCount = ex.target_sets || 3;
      for (let i = 1; i <= setsCount; i++) insSet.run(seId, i);
    });
    return sid;
  });

  const sid = txn();
  res.json(loadSession(req.userId, sid));
});

// Session güncelle (notlar, başlangıç/bitiş, ekleme/silme)
router.put('/:id', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });

  const {
    session_date, started_at, finished_at, workout_notes, template_id,
  } = req.body || {};

  db.prepare(`
    UPDATE workout_sessions
    SET session_date = ?, started_at = ?, finished_at = ?,
        workout_notes = ?, template_id = ?
    WHERE id = ?
  `).run(
    session_date ?? cur.session_date,
    started_at ?? cur.started_at,
    finished_at ?? cur.finished_at,
    workout_notes ?? cur.workout_notes,
    template_id !== undefined ? template_id : cur.template_id,
    id
  );
  res.json(loadSession(req.userId, id));
});

router.post('/:id/start', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  const now = new Date().toISOString();
  db.prepare('UPDATE workout_sessions SET started_at = ? WHERE id = ?').run(now, id);
  res.json({ started_at: now });
});

router.post('/:id/finish', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  const now = new Date().toISOString();
  db.prepare('UPDATE workout_sessions SET finished_at = ? WHERE id = ?').run(now, id);
  res.json({ finished_at: now });
});

router.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- Session içindeki egzersizler ---
router.post('/:id/exercises', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  const { exercise_id, target_sets, target_reps } = req.body || {};
  if (!exercise_id) return res.status(400).json({ error: 'Egzersiz seç' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_idx), -1) AS m FROM session_exercises WHERE session_id = ?').get(id).m;
  const prevNote = getPrevExerciseNotes(req.userId, exercise_id, cur.session_date);
  const info = db.prepare(`
    INSERT INTO session_exercises
      (session_id, exercise_id, order_idx, target_sets, target_reps, prev_exercise_notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, exercise_id, maxOrder + 1, target_sets || 3, target_reps || '', prevNote);
  const seId = info.lastInsertRowid;
  for (let i = 1; i <= (target_sets || 3); i++) {
    db.prepare('INSERT INTO session_sets (session_exercise_id, set_number) VALUES (?, ?)').run(seId, i);
  }
  res.json(loadSession(req.userId, id));
});

router.put('/:id/exercises/:seId', (req, res) => {
  const { id, seId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  const se = db.prepare('SELECT * FROM session_exercises WHERE id = ? AND session_id = ?').get(seId, id);
  if (!se) return res.status(404).json({ error: 'Egzersiz bulunamadı' });
  const { exercise_notes, weight_adjust, target_reps, target_sets } = req.body || {};
  db.prepare(`
    UPDATE session_exercises
    SET exercise_notes = ?, weight_adjust = ?, target_reps = ?, target_sets = ?
    WHERE id = ?
  `).run(
    exercise_notes ?? se.exercise_notes,
    weight_adjust ?? se.weight_adjust,
    target_reps ?? se.target_reps,
    target_sets ?? se.target_sets,
    seId
  );
  res.json({ ok: true });
});

router.delete('/:id/exercises/:seId', (req, res) => {
  const { id, seId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  db.prepare('DELETE FROM session_exercises WHERE id = ? AND session_id = ?').run(seId, id);
  res.json({ ok: true });
});

// Set güncelle
router.put('/:id/sets/:setId', (req, res) => {
  const { id, setId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  const { weight_kg, reps_done } = req.body || {};
  db.prepare('UPDATE session_sets SET weight_kg = ?, reps_done = ? WHERE id = ?')
    .run(weight_kg ?? null, reps_done ?? null, setId);
  res.json({ ok: true });
});

// Set ekle / sil
router.post('/:id/exercises/:seId/sets', (req, res) => {
  const { id, seId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  const max = db.prepare('SELECT COALESCE(MAX(set_number), 0) AS m FROM session_sets WHERE session_exercise_id = ?').get(seId).m;
  const info = db.prepare('INSERT INTO session_sets (session_exercise_id, set_number) VALUES (?, ?)')
    .run(seId, max + 1);
  res.json({ id: info.lastInsertRowid, set_number: max + 1 });
});

router.delete('/:id/sets/:setId', (req, res) => {
  const { id, setId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Bulunamadı' });
  db.prepare('DELETE FROM session_sets WHERE id = ?').run(setId);
  res.json({ ok: true });
});

// Session'ı yeni template olarak kaydet
router.post('/:id/save-as-template', (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Template ismi gerekli' });
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Session bulunamadı' });
  const ses = db.prepare(`
    SELECT exercise_id, order_idx, target_sets, target_reps
    FROM session_exercises WHERE session_id = ? ORDER BY order_idx
  `).all(id);
  const txn = db.transaction(() => {
    const t = db.prepare('INSERT INTO templates (user_id, name, color) VALUES (?, ?, ?)')
      .run(req.userId, name.trim(), color || '#FFB07A');
    const ins = db.prepare(`
      INSERT INTO template_exercises (template_id, exercise_id, order_idx, target_sets, target_reps)
      VALUES (?, ?, ?, ?, ?)
    `);
    ses.forEach(s => ins.run(t.lastInsertRowid, s.exercise_id, s.order_idx, s.target_sets, s.target_reps));
    db.prepare('UPDATE workout_sessions SET template_id = ? WHERE id = ?').run(t.lastInsertRowid, id);
    return t.lastInsertRowid;
  });
  const tid = txn();
  res.json({ template_id: tid });
});

// Session'daki mevcut template'i güncelle (gelecek session'ları etkiler)
router.post('/:id/update-template', (req, res) => {
  const { id } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Session bulunamadı' });
  if (!cur.template_id) return res.status(400).json({ error: 'Bu session bir template ile başlamadı' });
  const ses = db.prepare(`
    SELECT exercise_id, order_idx, target_sets, target_reps
    FROM session_exercises WHERE session_id = ? ORDER BY order_idx
  `).all(id);
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM template_exercises WHERE template_id = ?').run(cur.template_id);
    const ins = db.prepare(`
      INSERT INTO template_exercises (template_id, exercise_id, order_idx, target_sets, target_reps)
      VALUES (?, ?, ?, ?, ?)
    `);
    ses.forEach(s => ins.run(cur.template_id, s.exercise_id, s.order_idx, s.target_sets, s.target_reps));
  });
  txn();
  res.json({ ok: true });
});

// Takvim için: tarih aralığında template_id/color/name
router.get('/calendar/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end   = `${year}-${String(month).padStart(2, '0')}-31`;
  const rows = db.prepare(`
    SELECT ws.id, ws.session_date, ws.template_id,
           t.name AS template_name, t.color AS template_color
    FROM workout_sessions ws
    LEFT JOIN templates t ON t.id = ws.template_id
    WHERE ws.user_id = ? AND ws.session_date BETWEEN ? AND ?
    ORDER BY ws.session_date
  `).all(req.userId, start, end);
  res.json(rows);
});

export default router;
