import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

// Sensible starter items, seeded the first time a user opens their (empty)
// nutrition library so water tracking is usable immediately.
const DEFAULTS = [
  { name: 'Water',  water_factor: 1.0,  default_ml: 250 },
  { name: 'Coffee', water_factor: 0.95, default_ml: 200 },
  { name: 'Tea',    water_factor: 0.95, default_ml: 250 },
  { name: 'Juice',  water_factor: 0.85, default_ml: 200 },
];

function clampFactor(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

router.get('/', (req, res) => {
  let rows = db
    .prepare('SELECT * FROM nutrition_items WHERE user_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE')
    .all(req.userId);
  if (rows.length === 0) {
    // First visit: seed defaults.
    const ins = db.prepare(
      'INSERT INTO nutrition_items (user_id, name, water_factor, default_ml) VALUES (?, ?, ?, ?)'
    );
    const seed = db.transaction(() => {
      for (const d of DEFAULTS) {
        try { ins.run(req.userId, d.name, d.water_factor, d.default_ml); } catch { /* unique */ }
      }
    });
    seed();
    rows = db
      .prepare('SELECT * FROM nutrition_items WHERE user_id = ? AND archived = 0 ORDER BY name COLLATE NOCASE')
      .all(req.userId);
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, water_factor, default_ml } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const cleanName = name.trim();
  const wf = clampFactor(water_factor, 1.0);
  const ml = Number.isFinite(Number(default_ml)) ? Math.max(0, Math.round(Number(default_ml))) : null;
  try {
    // Resurrect an archived item with the same name instead of failing UNIQUE.
    const archived = db
      .prepare('SELECT * FROM nutrition_items WHERE user_id = ? AND name = ? AND archived = 1')
      .get(req.userId, cleanName);
    if (archived) {
      db.prepare('UPDATE nutrition_items SET archived = 0, water_factor = ?, default_ml = ? WHERE id = ?')
        .run(wf, ml, archived.id);
      return res.json(db.prepare('SELECT * FROM nutrition_items WHERE id = ?').get(archived.id));
    }
    const info = db
      .prepare('INSERT INTO nutrition_items (user_id, name, water_factor, default_ml) VALUES (?, ?, ?, ?)')
      .run(req.userId, cleanName, wf, ml);
    res.json(db.prepare('SELECT * FROM nutrition_items WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'An item with this name already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, water_factor, default_ml } = req.body || {};
  const item = db.prepare('SELECT * FROM nutrition_items WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const wf = water_factor === undefined ? item.water_factor : clampFactor(water_factor, item.water_factor);
  const ml = default_ml === undefined ? item.default_ml
    : (Number.isFinite(Number(default_ml)) ? Math.max(0, Math.round(Number(default_ml))) : null);
  db.prepare('UPDATE nutrition_items SET name = ?, water_factor = ?, default_ml = ? WHERE id = ?')
    .run(name?.trim() || item.name, wf, ml, item.id);
  res.json(db.prepare('SELECT * FROM nutrition_items WHERE id = ?').get(item.id));
});

router.delete('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM nutrition_items WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  // Soft-delete so historical water_log rows keep their label.
  db.prepare('UPDATE nutrition_items SET archived = 1 WHERE id = ?').run(item.id);
  res.status(204).end();
});

export default router;
