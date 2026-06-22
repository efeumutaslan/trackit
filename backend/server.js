import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import './db.js';
import authRoutes from './routes/auth.js';
import exerciseRoutes from './routes/exercises.js';
import templateRoutes from './routes/templates.js';
import sessionRoutes from './routes/sessions.js';
import groupRoutes from './routes/groups.js';
import bodyweightRoutes from './routes/bodyweight.js';
import csvRoutes from './routes/csv.js';
import settingsRoutes from './routes/settings.js';
import nutritionRoutes from './routes/nutrition.js';
import waterRoutes from './routes/water.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// CSV import can include long histories; raise the body limit.
app.use(express.json({ limit: '25mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
app.use('/api/auth', authRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/bodyweight', bodyweightRoutes);
app.use('/api/csv', csvRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/nutrition', nutritionRoutes);
app.use('/api/water', waterRoutes);

// Production: serve frontend build
const publicDir = path.join(__dirname, 'public');

// Cache policy:
//  - /assets/* are content-hashed by Vite → safe to cache forever.
//  - index.html and the service worker MUST NOT be cached, or a deploy
//    won't be picked up until the user manually clears Safari's cache
//    (the recurring "had to wipe the PWA after every deploy" problem).
app.use(express.static(publicDir, {
  setHeaders(res, filePath) {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));
app.get(/^\/(?!api).*/, (req, res) => {
  // The SPA fallback always returns index.html; never let it be cached.
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('API error:', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => console.log(`TrackIt API listening on port ${PORT}`));
