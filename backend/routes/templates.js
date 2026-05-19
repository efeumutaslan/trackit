import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

const PRESET_COLORS = [
  '#FFB07A', '#7AC4FF', '#9CD879', '#FF7A9C',
  '#C49CFF', '#FFD06B', '#5BC5C5', '#FF8C61',
  '#A28DFE', '#FFA8A8', '#6FCBA4', '#E8A87C',
];

function pickUnusedColor(userId) {
  const used = new Set(
    db.prepare('SELECT color FROM templates WHERE user_id = ?').all(userId).map(r => r.color)
  );
  const fresh = PRESET_COLORS.find(c => !used.has(c));
  if (fresh) return fresh;
  // fall back to random if all preset colors used
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 70% 65%)`;
}

router.get('/', (req, res) => {
  const templates = db
    .prepare('SELECT * FROM templates WHERE user_id = ? AND archived = 0 ORDER BY name')
    .all(req.userId);
  const withEx = templates.map(t => ({
    ...t,
    exercises: db.prepare(`
      SELECT te.*, e.name AS exercise_name
      FROM template_exercises te
      JOIN exercises e ON e.id = te.exercise_id
      WHERE te.template_id = ?
      ORDER BY te.order_idx
    `).all(t.id),
  }));
  res.json(withEx);
});

router.get('/:id', (req, res) => {
  const t = db
    .prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!t) return res.status(404).json({ error: 'Not found' });
  t.exercises = db.prepare(`
    SELECT te.*, e.name AS exercise_name
    FROM template_exercises te
    JOIN exercises e ON e.id = te.exercise_id
    WHERE te.template_id = ?
    ORDER BY te.order_idx
  `).all(t.id);
  res.json(t);
});

router.post('/', (req, res) => {
  const { name, color, exercises } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const finalColor = color && color.trim() ? color.trim() : pickUnusedColor(req.userId);
  const insertTmpl = db.prepare('INSERT INTO templates (user_id, name, color) VALUES (?, ?, ?)');
  const insertEx = db.prepare(
    'INSERT INTO template_exercises (template_id, exercise_id, order_idx, target_sets, target_reps) VALUES (?, ?, ?, ?, ?)'
  );
  const txn = db.transaction(() => {
    const info = insertTmpl.run(req.userId, name.trim(), finalColor);
    (exercises || []).forEach((ex, idx) => {
      insertEx.run(info.lastInsertRowid, ex.exercise_id, idx, ex.target_sets || 3, ex.target_reps || '');
    });
    return info.lastInsertRowid;
  });
  const id = txn();
  res.json(db.prepare('SELECT * FROM templates WHERE id = ?').get(id));
});

router.put('/:id', (req, res) => {
  const { name, color, exercises } = req.body || {};
  const id = req.params.id;
  const t = db.prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const txn = db.transaction(() => {
    db.prepare('UPDATE templates SET name = ?, color = ? WHERE id = ?')
      .run(name?.trim() || t.name, color || t.color, id);
    if (Array.isArray(exercises)) {
      db.prepare('DELETE FROM template_exercises WHERE template_id = ?').run(id);
      const stmt = db.prepare(
        'INSERT INTO template_exercises (template_id, exercise_id, order_idx, target_sets, target_reps) VALUES (?, ?, ?, ?, ?)'
      );
      exercises.forEach((ex, idx) => {
        stmt.run(id, ex.exercise_id, idx, ex.target_sets || 3, ex.target_reps || '');
      });
    }
  });
  txn();
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const id = req.params.id;
  const t = db.prepare('SELECT * FROM templates WHERE id = ? AND user_id = ?').get(id, req.userId);
  if (!t) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE templates SET archived = 1 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Get the workout_note from the most recent session using this template
router.get('/:id/last-note', (req, res) => {
  const row = db.prepare(`
    SELECT workout_notes AS notes, session_date
    FROM workout_sessions
    WHERE template_id = ? AND user_id = ? AND COALESCE(workout_notes,'') != ''
    ORDER BY session_date DESC, id DESC
    LIMIT 1
  `).get(req.params.id, req.userId);
  res.json(row || { notes: '', session_date: null });
});

export default router;
