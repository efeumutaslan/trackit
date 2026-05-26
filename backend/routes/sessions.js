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
      AND session_date <= ?
      AND COALESCE(workout_notes,'') != ''
    ORDER BY session_date DESC, created_at DESC, id DESC LIMIT 1
  `).get(userId, templateId, beforeDate);
  return row?.workout_notes || '';
}

function getPrevExerciseNotes(userId, exerciseId, beforeDate) {
  const row = db.prepare(`
    SELECT se.exercise_notes FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE ws.user_id = ? AND se.exercise_id = ?
      AND ws.session_date <= ?
      AND COALESCE(se.exercise_notes,'') != ''
    ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
  `).get(userId, exerciseId, beforeDate);
  return row?.exercise_notes || '';
}

// Returns an ordered list of weight_kg values from the most recent prior
// session of the same exercise. Prefers a session with the same template.
// Called at creation time (the new session does not exist yet), so we
// include the same day (<=) and order by created_at to catch a workout
// logged earlier the same day.
function getPrevSetWeights(userId, exerciseId, templateId, beforeDate, excludeSessionId) {
  const exclude = excludeSessionId || -1;
  let sourceSE = null;
  if (templateId) {
    sourceSE = db.prepare(`
      SELECT se.id FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.user_id = ? AND se.exercise_id = ?
        AND ws.template_id = ? AND ws.session_date <= ? AND ws.id != ?
      ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
    `).get(userId, exerciseId, templateId, beforeDate, exclude);
  }
  if (!sourceSE) {
    sourceSE = db.prepare(`
      SELECT se.id FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.user_id = ? AND se.exercise_id = ?
        AND ws.session_date <= ? AND ws.id != ?
      ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
    `).get(userId, exerciseId, beforeDate, exclude);
  }
  if (!sourceSE) return [];
  const rows = db.prepare(`
    SELECT weight_kg FROM session_sets
    WHERE session_exercise_id = ?
    ORDER BY set_number
  `).all(sourceSE.id);
  return rows.map((r) => r.weight_kg);
}

function loadSession(userId, sessionId) {
  const s = db.prepare(`
    SELECT ws.*, t.name AS template_name, t.color AS template_color
    FROM workout_sessions ws
    LEFT JOIN templates t ON t.id = ws.template_id
    WHERE ws.id = ? AND ws.user_id = ?
  `).get(sessionId, userId);
  if (!s) return null;

  // Resolve previous workout note dynamically (always current).
  // "Previous" = the closest session that comes BEFORE this one in
  // chronological order, where order is (session_date, created_at, id).
  if (s.template_id) {
    const prevWN = db.prepare(`
      SELECT workout_notes, session_date FROM workout_sessions
      WHERE user_id = ? AND template_id = ?
        AND (session_date, created_at, id) < (?, ?, ?)
        AND COALESCE(workout_notes,'') != ''
      ORDER BY session_date DESC, created_at DESC, id DESC LIMIT 1
    `).get(userId, s.template_id, s.session_date, s.created_at, s.id);
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
    // previous session tonnage for the same exercise (chronological order)
    const prev = db.prepare(`
      SELECT COALESCE(SUM(ss.weight_kg * ss.reps_done), 0) AS tonnage
      FROM workout_sessions ws
      JOIN session_exercises se ON se.session_id = ws.id
      LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
      WHERE ws.user_id = ? AND se.exercise_id = ?
        AND (ws.session_date, ws.created_at, ws.id) < (?, ?, ?)
      GROUP BY ws.id
      ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
    `).get(userId, ex.exercise_id, s.session_date, s.created_at, s.id);
    ex.prev_tonnage = prev?.tonnage || 0;

    // resolve previous exercise note dynamically.
    // Priority: most recent note from a session using the SAME template;
    // fall back to the most recent note for this exercise from ANY session.
    let prevExN = null;
    if (s.template_id) {
      prevExN = db.prepare(`
        SELECT se.exercise_notes, ws.session_date FROM session_exercises se
        JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE ws.user_id = ? AND se.exercise_id = ?
          AND ws.template_id = ?
          AND (ws.session_date, ws.created_at, ws.id) < (?, ?, ?)
          AND COALESCE(se.exercise_notes,'') != ''
        ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
      `).get(userId, ex.exercise_id, s.template_id, s.session_date, s.created_at, s.id);
    }
    if (!prevExN) {
      prevExN = db.prepare(`
        SELECT se.exercise_notes, ws.session_date FROM session_exercises se
        JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE ws.user_id = ? AND se.exercise_id = ?
          AND (ws.session_date, ws.created_at, ws.id) < (?, ?, ?)
          AND COALESCE(se.exercise_notes,'') != ''
        ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
      `).get(userId, ex.exercise_id, s.session_date, s.created_at, s.id);
    }
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
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

// Create a new session from a template or empty
router.post('/', (req, res) => {
  const { template_id, session_date, exercises, start_now, started_at } = req.body || {};
  const date = session_date || new Date().toISOString().slice(0, 10);
  // Prefer client-provided started_at (correct timezone); fall back to start_now for compat
  const startedAt = started_at || (start_now ? new Date().toISOString() : null);
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
      // copy exercises from the template
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
      VALUES (?, ?, ?, NULL)
    `);
    exToInsert.forEach((ex, idx) => {
      const prevNote = getPrevExerciseNotes(req.userId, ex.exercise_id, date);
      const seInfo = insSE.run(
        sid, ex.exercise_id, idx,
        ex.target_sets || 3, ex.target_reps || '', prevNote
      );
      const seId = seInfo.lastInsertRowid;
      const setsCount = ex.target_sets || 3;
      // Pre-fill set weights with last session's weights (same template preferred)
      const prevWeights = getPrevSetWeights(req.userId, ex.exercise_id, template_id || null, date, sid);
      console.error('DEBUG prefill: exId=' + ex.exercise_id + ' tmplId=' + (template_id||null) + ' date=' + date + ' -> ' + JSON.stringify(prevWeights));
      for (let i = 1; i <= setsCount; i++) {
        const w = prevWeights[i - 1] != null ? prevWeights[i - 1] : null;
        insSet.run(seId, i, w);
      }
    });
    return sid;
  });

  const sid = txn();
  res.json(loadSession(req.userId, sid));
});

// Update session (notes, start/finish, add/remove)
router.put('/:id', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

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
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const at = (req.body && req.body.at) || new Date().toISOString();
  db.prepare('UPDATE workout_sessions SET started_at = ? WHERE id = ?').run(at, id);
  res.json({ started_at: at });
});

router.post('/:id/finish', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const at = (req.body && req.body.at) || new Date().toISOString();
  db.prepare('UPDATE workout_sessions SET finished_at = ? WHERE id = ?').run(at, id);
  res.json({ finished_at: at });
});

router.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- Exercises within a session ---
router.post('/:id/exercises', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const { exercise_id, target_sets, target_reps } = req.body || {};
  if (!exercise_id) return res.status(400).json({ error: 'Select an exercise' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_idx), -1) AS m FROM session_exercises WHERE session_id = ?').get(id).m;
  const prevNote = getPrevExerciseNotes(req.userId, exercise_id, cur.session_date);
  const info = db.prepare(`
    INSERT INTO session_exercises
      (session_id, exercise_id, order_idx, target_sets, target_reps, prev_exercise_notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, exercise_id, maxOrder + 1, target_sets || 3, target_reps || '', prevNote);
  const seId = info.lastInsertRowid;
  const prevWeights = getPrevSetWeights(req.userId, exercise_id, cur.template_id || null, cur.session_date, cur.id);
  for (let i = 1; i <= (target_sets || 3); i++) {
    const w = prevWeights[i - 1] != null ? prevWeights[i - 1] : null;
    db.prepare('INSERT INTO session_sets (session_exercise_id, set_number, weight_kg) VALUES (?, ?, ?)').run(seId, i, w);
  }
  res.json(loadSession(req.userId, id));
});

router.put('/:id/exercises/:seId', (req, res) => {
  const { id, seId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const se = db.prepare('SELECT * FROM session_exercises WHERE id = ? AND session_id = ?').get(seId, id);
  if (!se) return res.status(404).json({ error: 'Exercise not found' });
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
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM session_exercises WHERE id = ? AND session_id = ?').run(seId, id);
  res.json({ ok: true });
});

// Update a set
router.put('/:id/sets/:setId', (req, res) => {
  const { id, setId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
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
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const max = db.prepare('SELECT COALESCE(MAX(set_number), 0) AS m FROM session_sets WHERE session_exercise_id = ?').get(seId).m;
  const info = db.prepare('INSERT INTO session_sets (session_exercise_id, set_number) VALUES (?, ?)')
    .run(seId, max + 1);
  res.json({ id: info.lastInsertRowid, set_number: max + 1 });
});

router.delete('/:id/sets/:setId', (req, res) => {
  const { id, setId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM session_sets WHERE id = ?').run(setId);
  res.json({ ok: true });
});

// Save the current session as a new template
router.post('/:id/save-as-template', (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Session not found' });
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

// Update the template attached to this session (affects future sessions)
router.post('/:id/update-template', (req, res) => {
  const { id } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Session not found' });
  if (!cur.template_id) return res.status(400).json({ error: 'This session was not started from a template' });
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

// Calendar feed: template_id/color/name within a date range
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
