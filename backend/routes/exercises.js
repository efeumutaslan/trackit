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
  try {
    const info = db
      .prepare('INSERT INTO exercises (user_id, name, notes, group_id) VALUES (?, ?, ?, ?)')
      .run(req.userId, name.trim(), notes || '', group_id || null);
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

// Last note for an exercise (from the most recent prior session)
router.get('/:id/last-note', (req, res) => {
  const row = db.prepare(`
    SELECT se.exercise_notes AS notes, ws.session_date
    FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE se.exercise_id = ? AND ws.user_id = ?
      AND COALESCE(se.exercise_notes, '') != ''
    ORDER BY ws.session_date DESC, ws.id DESC
    LIMIT 1
  `).get(req.params.id, req.userId);
  res.json(row || { notes: '', session_date: null });
});

// Exercise progress: rep-tonnage by session
router.get('/:id/progress', (req, res) => {
  const id = req.params.id;
  const rows = db.prepare(`
    SELECT ws.id AS session_id, ws.session_date,
           COALESCE(SUM(ss.weight_kg * ss.reps_done), 0) AS tonnage,
           COALESCE(MAX(ss.weight_kg), 0) AS top_weight
    FROM workout_sessions ws
    JOIN session_exercises se ON se.session_id = ws.id
    LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
    WHERE ws.user_id = ? AND se.exercise_id = ?
    GROUP BY ws.id
    ORDER BY ws.session_date ASC, ws.id ASC
  `).all(req.userId, id);
  res.json(rows);
});

export default router;
