import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/water?date=YYYY-MM-DD  → { date, goal_ml, total_ml, entries: [...] }
router.get('/', (req, res) => {
  const date = (req.query.date || todayISO()).slice(0, 10);
  const entries = db
    .prepare(`
      SELECT w.*, n.name AS item_name, n.water_factor AS item_factor
      FROM water_log w
      LEFT JOIN nutrition_items n ON n.id = w.nutrition_item_id
      WHERE w.user_id = ? AND w.log_date = ?
      ORDER BY w.created_at DESC, w.id DESC
    `)
    .all(req.userId, date);
  const total_ml = entries.reduce((s, e) => s + (e.water_ml || 0), 0);
  const settings = db.prepare('SELECT water_goal_ml FROM user_settings WHERE user_id = ?').get(req.userId);
  res.json({
    date,
    goal_ml: settings?.water_goal_ml ?? 2500,
    total_ml,
    entries,
  });
});

// POST /api/water  { nutrition_item_id, amount_ml, log_date? }
// water_ml is computed from the item's current water_factor and stored.
router.post('/', (req, res) => {
  const { nutrition_item_id, amount_ml, log_date } = req.body || {};
  const amount = Math.round(Number(amount_ml));
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount_ml must be a positive number' });
  }
  const date = (log_date || todayISO()).slice(0, 10);

  let factor = 1.0;
  let label = 'Water';
  if (nutrition_item_id != null) {
    const item = db
      .prepare('SELECT * FROM nutrition_items WHERE id = ? AND user_id = ?')
      .get(nutrition_item_id, req.userId);
    if (!item) return res.status(404).json({ error: 'Nutrition item not found' });
    factor = item.water_factor;
    label = item.name;
  }
  const water_ml = Math.round(amount * factor);

  const info = db
    .prepare(`
      INSERT INTO water_log (user_id, log_date, nutrition_item_id, label, amount_ml, water_ml)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(req.userId, date, nutrition_item_id ?? null, label, amount, water_ml);

  const row = db.prepare('SELECT * FROM water_log WHERE id = ?').get(info.lastInsertRowid);
  res.json(row);
});

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM water_log WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM water_log WHERE id = ?').run(row.id);
  res.status(204).end();
});

export default router;
