import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const rows = db
    .prepare(`
      SELECT e.*, g.name AS group_name
      FROM exercises e
      LEFT JOIN exercise_groups g ON g.id = e.group_id AND g.archived = 0
      WHERE e.user_id = ? AND e.archived = 0
      ORDER BY g.name IS NULL, g.name, e.name
    `)
    .all(req.userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, notes, group_id } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const cleanName = name.trim();
  try {
    // FIX: resurrect an archived exercise with the same name instead of
    // failing UNIQUE(user_id, name) — same pattern as groups.js
    const archived = db
      .prepare('SELECT * FROM exercises WHERE user_id = ? AND name = ? AND archived = 1')
      .get(req.userId, cleanName);
    if (archived) {
      db.prepare('UPDATE exercises SET archived = 0, notes = ?, group_id = ? WHERE id = ?')
        .run(notes || archived.notes,
             group_id !== undefined ? group_id : archived.group_id,
             archived.id);
      return res.json(db.prepare('SELECT * FROM exercises WHERE id = ?').get(archived.id));
    }
    const info = db
      .prepare('INSERT INTO exercises (user_id, name, notes, group_id) VALUES (?, ?, ?, ?)')
      .run(req.userId, cleanName, notes || '', group_id || null);
    const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(info.lastInsertRowid);
    res.json(row);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An exercise with this name already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, notes, group_id } = req.body || {};
  const id = req.params.id;
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE exercises SET name = ?, notes = ?, group_id = ? WHERE id = ?')
    .run(name?.trim() || ex.name, notes ?? ex.notes,
         group_id !== undefined ? group_id : ex.group_id, id);
  res.json(db.prepare('SELECT * FROM exercises WHERE id = ?').get(id));
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const ex = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!ex) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE exercises SET archived = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Last note for an exercise (from the most recent prior session).
// SIDE-AWARE: the note may live in exercise_notes (when this exercise
// was the primary) or in alt_exercise_notes (when it was logged as the
// alternate). We pick the most recent SE where this exercise appears in
// either role and a note exists on the matching side.
router.get('/:id/last-note', (req, res) => {
  const id = +req.params.id;
  const row = db.prepare(`
    SELECT
      CASE WHEN se.exercise_id = @ex THEN se.exercise_notes
           ELSE se.alt_exercise_notes END AS notes,
      ws.session_date
    FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE ws.user_id = @user
      AND (
        (se.exercise_id = @ex     AND COALESCE(se.exercise_notes, '')     != '')
        OR
        (se.alt_exercise_id = @ex AND COALESCE(se.alt_exercise_notes, '') != '')
      )
    ORDER BY ws.session_date DESC, ws.id DESC
    LIMIT 1
  `).get({ user: req.userId, ex: id });
  res.json(row || { notes: '', session_date: null });
});

// Exercise progress: rep-tonnage by session.
// SIDE-AWARE: an exercise can appear as a session's PRIMARY
// (se.exercise_id, sets with alt_active=0) or as the ALTERNATE
// (se.alt_exercise_id, sets with alt_active=1). We must only sum the
// sets logged on the side that actually matches this exercise — summing
// both would blend an unrelated movement's tonnage into the chart, and
// ignoring the alt role would drop every session where the user trained
// this exercise as the alternate.
router.get('/:id/progress', (req, res) => {
  const id = +req.params.id;
  const rows = db.prepare(`
    SELECT ws.id AS session_id, ws.session_date,
           COALESCE(SUM(ss.weight_kg * ss.reps_done), 0) AS tonnage,
           COALESCE(MAX(ss.weight_kg), 0) AS top_weight
    FROM workout_sessions ws
    JOIN session_exercises se ON se.session_id = ws.id
    LEFT JOIN session_sets ss
           ON ss.session_exercise_id = se.id
          AND ss.alt_active = CASE WHEN se.exercise_id = @ex THEN 0 ELSE 1 END
    WHERE ws.user_id = @user
      AND (se.exercise_id = @ex OR se.alt_exercise_id = @ex)
    GROUP BY ws.id
    HAVING tonnage > 0 OR top_weight > 0
    ORDER BY ws.session_date ASC, ws.id ASC
  `).all({ user: req.userId, ex: id });
  res.json(rows);
});

export default router;
