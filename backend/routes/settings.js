import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

function ensureRow(userId) {
  db.prepare(`INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)`).run(userId);
}

router.get('/', (req, res) => {
  ensureRow(req.userId);
  const row = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId);
  res.json(row);
});

router.put('/', (req, res) => {
  ensureRow(req.userId);
  const cur = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId);
  const { rep_placeholder_mode, rest_timer_sound, rest_timer_vibrate } = req.body || {};

  // Whitelist string values
  const mode = rep_placeholder_mode === 'previous' ? 'previous'
             : rep_placeholder_mode === 'empty' ? 'empty'
             : cur.rep_placeholder_mode;

  db.prepare(`
    UPDATE user_settings
       SET rep_placeholder_mode = ?,
           rest_timer_sound     = ?,
           rest_timer_vibrate   = ?
     WHERE user_id = ?
  `).run(
    mode,
    rest_timer_sound   === undefined ? cur.rest_timer_sound   : (rest_timer_sound   ? 1 : 0),
    rest_timer_vibrate === undefined ? cur.rest_timer_vibrate : (rest_timer_vibrate ? 1 : 0),
    req.userId
  );
  res.json(db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId));
});

export default router;
