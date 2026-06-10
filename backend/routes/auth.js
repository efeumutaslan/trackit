import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db.js';
import { generateToken, authMiddleware } from '../auth.js';

const router = Router();

// FIX: simple in-memory rate limit — 10 attempts / 15 min per IP
const attempts = new Map(); // ip -> { count, resetAt }
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  const now = Date.now();
  let e = attempts.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + 15 * 60 * 1000 }; attempts.set(ip, e); }
  if (e.count >= 10) return res.status(429).json({ error: 'Too many attempts, try again later' });
  e.count++;
  if (attempts.size > 10000) attempts.clear();
  next();
}

router.post('/register', rateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Username min 3 chars, password min 4 chars' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const info = db
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(username.trim(), hash);
    const token = generateToken();
    db.prepare('INSERT INTO sessions_auth (token, user_id) VALUES (?, ?)').run(token, info.lastInsertRowid);
    res.json({ token, username: username.trim(), userId: info.lastInsertRowid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error(e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', rateLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) return res.status(401).json({ error: 'Invalid username or password' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
  const token = generateToken();
  db.prepare('INSERT INTO sessions_auth (token, user_id) VALUES (?, ?)').run(token, user.id);
  res.json({ token, username: user.username, userId: user.id });
});

router.post('/logout', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM sessions_auth WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(req.userId);
  res.json(user);
});

export default router;
