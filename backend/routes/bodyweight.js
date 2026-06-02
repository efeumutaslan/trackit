import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

// List all bodyweight entries for the user, newest first.
router.get('/', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM bodyweight WHERE user_id = ? ORDER BY log_date DESC, id DESC')
    .all(req.userId);
  res.json(rows);
});

// Add or update a bodyweight entry for a date.
router.post('/', (req, res) => {
  const { log_date, weight_kg, note } = req.body || {};
  if (!log_date || !weight_kg) return res.status(400).json({ error: 'log_date and weight_kg required' });
  // Last-write-wins: one entry per (user, date). If we already have one, update.
  const existing = db
    .prepare('SELECT id FROM bodyweight WHERE user_id = ? AND log_date = ?')
    .get(req.userId, log_date);
  if (existing) {
    db.prepare('UPDATE bodyweight SET weight_kg = ?, note = ? WHERE id = ?')
      .run(weight_kg, note || '', existing.id);
    res.json(db.prepare('SELECT * FROM bodyweight WHERE id = ?').get(existing.id));
  } else {
    const info = db
      .prepare('INSERT INTO bodyweight (user_id, log_date, weight_kg, note) VALUES (?, ?, ?, ?)')
      .run(req.userId, log_date, weight_kg, note || '');
    res.json(db.prepare('SELECT * FROM bodyweight WHERE id = ?').get(info.lastInsertRowid));
  }
});

router.delete('/:id', (req, res) => {
  const row = db
    .prepare('SELECT * FROM bodyweight WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM bodyweight WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Latest body weight (used for relative strength UI later)
router.get('/latest', (req, res) => {
  const row = db
    .prepare('SELECT * FROM bodyweight WHERE user_id = ? ORDER BY log_date DESC, id DESC LIMIT 1')
    .get(req.userId);
  res.json(row || null);
});

export default router;
