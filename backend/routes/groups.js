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
  const cleanName = name.trim();
  try {
    // If an archived group with this exact name already exists, resurrect
    // it instead of failing the UNIQUE(user_id, name) constraint. This
    // means the user can delete a group and later recreate it under the
    // same name without getting stuck.
    const archived = db
      .prepare('SELECT * FROM exercise_groups WHERE user_id = ? AND name = ? AND archived = 1')
      .get(req.userId, cleanName);
    if (archived) {
      db.prepare('UPDATE exercise_groups SET archived = 0 WHERE id = ?').run(archived.id);
      return res.json(db.prepare('SELECT * FROM exercise_groups WHERE id = ?').get(archived.id));
    }
    const info = db
      .prepare('INSERT INTO exercise_groups (user_id, name) VALUES (?, ?)')
      .run(req.userId, cleanName);
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

// Preview which exercises live in this group — used by the UI to confirm
// "really delete? these N exercises will become ungrouped".
router.get('/:id/exercises', (req, res) => {
  const grp = db
    .prepare('SELECT * FROM exercise_groups WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!grp) return res.status(404).json({ error: 'Not found' });
  const rows = db
    .prepare('SELECT id, name FROM exercises WHERE user_id = ? AND group_id = ? AND archived = 0 ORDER BY name')
    .all(req.userId, req.params.id);
  res.json(rows);
});

router.delete('/:id', (req, res) => {
  const grp = db
    .prepare('SELECT * FROM exercise_groups WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!grp) return res.status(404).json({ error: 'Not found' });
  // Move every exercise in this group back to "Ungrouped" before archiving the group.
  db.prepare('UPDATE exercises SET group_id = NULL WHERE user_id = ? AND group_id = ?')
    .run(req.userId, req.params.id);
  db.prepare('UPDATE exercise_groups SET archived = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
