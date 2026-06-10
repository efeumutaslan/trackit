import { db } from './db.js';
import crypto from 'crypto';

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required' });
  }
  const token = auth.slice(7);
  const row = db
    .prepare('SELECT user_id, created_at FROM sessions_auth WHERE token = ?')
    .get(token);
  if (!row) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  // FIX: expire tokens older than 90 days
  const ageMs = Date.now() - new Date(row.created_at + 'Z').getTime();
  if (ageMs > 90 * 24 * 3600 * 1000) {
    db.prepare('DELETE FROM sessions_auth WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Token expired' });
  }
  req.userId = row.user_id;
  req.token = token;
  next();
}
