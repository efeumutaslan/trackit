import { Router } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../db.js';
import { generateToken, authMiddleware } from '../auth.js';

const router = Router();

router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }
  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Kullanıcı adı min 3, şifre min 4 karakter' });
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
      return res.status(409).json({ error: 'Bu kullanıcı adı zaten alınmış' });
    }
    console.error(e);
    res.status(500).json({ error: 'Kayıt başarısız' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) return res.status(401).json({ error: 'Hatalı kullanıcı veya şifre' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Hatalı kullanıcı veya şifre' });
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
