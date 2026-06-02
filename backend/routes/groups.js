import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM exercise_groups WHERE user_id = ? AND archived = 0 ORDER BY name')
    .all(req.userId);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const info = db
      .prepare('INSERT INTO exercise_groups (user_id, name) VALUES (?, ?)')
      .run(req.userId, name.trim());
    res.json(db.prepare('SELECT * FROM exercise_groups WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name } = req.body || {};
  const grp = db
    .prepare('SELECT * FROM exercise_groups WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!grp) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE exercise_groups SET name = ? WHERE id = ?')
    .run(name?.trim() || grp.name, req.params.id);
  res.json(db.prepare('SELECT * FROM exercise_groups WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const grp = db
    .prepare('SELECT * FROM exercise_groups WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!grp) return res.status(404).json({ error: 'Not found' });
  // exercises.group_id is set NULL on cascade — they become "Ungrouped" again
  db.prepare('UPDATE exercise_groups SET archived = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
