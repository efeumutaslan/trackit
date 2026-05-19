import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'trackit.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions_auth (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS exercises (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  notes      TEXT DEFAULT '',
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#FFB07A',
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id  INTEGER NOT NULL,
  exercise_id  INTEGER NOT NULL,
  order_idx    INTEGER NOT NULL,
  target_sets  INTEGER DEFAULT 3,
  target_reps  TEXT DEFAULT '',
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL,
  template_id         INTEGER,
  session_date        TEXT NOT NULL,
  started_at          TEXT,
  finished_at         TEXT,
  workout_notes       TEXT DEFAULT '',
  prev_workout_notes  TEXT DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS session_exercises (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        INTEGER NOT NULL,
  exercise_id       INTEGER NOT NULL,
  order_idx         INTEGER NOT NULL,
  target_sets       INTEGER DEFAULT 3,
  target_reps       TEXT DEFAULT '',
  exercise_notes    TEXT DEFAULT '',
  prev_exercise_notes TEXT DEFAULT '',
  weight_adjust     TEXT DEFAULT '',
  FOREIGN KEY (session_id) REFERENCES workout_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_sets (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  session_exercise_id INTEGER NOT NULL,
  set_number          INTEGER NOT NULL,
  weight_kg           REAL,
  reps_done           INTEGER,
  FOREIGN KEY (session_exercise_id) REFERENCES session_exercises(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_date ON workout_sessions(user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_template ON workout_sessions(template_id);
CREATE INDEX IF NOT EXISTS idx_session_ex_session ON session_exercises(session_id);
CREATE INDEX IF NOT EXISTS idx_session_ex_exercise ON session_exercises(exercise_id);
CREATE INDEX IF NOT EXISTS idx_sets_session_ex ON session_sets(session_exercise_id);
CREATE INDEX IF NOT EXISTS idx_auth_user ON sessions_auth(user_id);
`);

console.log('DB ready:', DB_PATH);
