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
  const {
    rep_placeholder_mode, rest_timer_sound, rest_timer_vibrate, weight_increment,
    theme,
    feat_rest_timer, feat_bodyweight, feat_weight_adjust,
    feat_prev_note, feat_tonnage, feat_heatmap,
    session_timer_start,
  } = req.body || {};

  // Whitelist string values
  const mode = rep_placeholder_mode === 'previous' ? 'previous'
             : rep_placeholder_mode === 'empty' ? 'empty'
             : cur.rep_placeholder_mode;

  // Theme: only three valid values; anything else keeps the current one.
  const themeVal = ['system', 'dark', 'light'].includes(theme) ? theme : cur.theme;

  // Session timer start preference: one of three modes.
  const timerStart = ['manual', 'on_start', 'on_first_input'].includes(session_timer_start)
    ? session_timer_start
    : cur.session_timer_start;

  // Weight increment: a positive number, capped to a sane range so the
  // bumpers stay usable. Falls back to the current value when omitted or
  // invalid.
  let inc = cur.weight_increment;
  if (weight_increment !== undefined) {
    const n = typeof weight_increment === 'number' ? weight_increment : parseFloat(weight_increment);
    if (Number.isFinite(n) && n > 0 && n <= 100) inc = n;
  }

  // Optional-feature flags: undefined → unchanged, otherwise coerce to 0/1.
  const flag = (v, curv) => (v === undefined ? curv : (v ? 1 : 0));

  db.prepare(`
    UPDATE user_settings
       SET rep_placeholder_mode = ?,
           rest_timer_sound     = ?,
           rest_timer_vibrate   = ?,
           weight_increment     = ?,
           theme                = ?,
           feat_rest_timer      = ?,
           feat_bodyweight      = ?,
           feat_weight_adjust   = ?,
           feat_prev_note       = ?,
           feat_tonnage         = ?,
           feat_heatmap         = ?,
           session_timer_start  = ?
     WHERE user_id = ?
  `).run(
    mode,
    rest_timer_sound   === undefined ? cur.rest_timer_sound   : (rest_timer_sound   ? 1 : 0),
    rest_timer_vibrate === undefined ? cur.rest_timer_vibrate : (rest_timer_vibrate ? 1 : 0),
    inc,
    themeVal,
    flag(feat_rest_timer,    cur.feat_rest_timer),
    flag(feat_bodyweight,    cur.feat_bodyweight),
    flag(feat_weight_adjust, cur.feat_weight_adjust),
    flag(feat_prev_note,     cur.feat_prev_note),
    flag(feat_tonnage,       cur.feat_tonnage),
    flag(feat_heatmap,       cur.feat_heatmap),
    timerStart,
    req.userId
  );
  res.json(db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(req.userId));
});

export default router;
