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

-- ── Exercise grouping (folders, optional) ──────────────────────────
CREATE TABLE IF NOT EXISTS exercise_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  name        TEXT NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (user_id, name)
);

-- ── Bodyweight log ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bodyweight (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  log_date      TEXT NOT NULL,
  weight_kg     REAL NOT NULL,
  note          TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bw_user_date ON bodyweight(user_id, log_date);
`);

// ── Incremental migrations for existing DBs (add columns if missing) ──
function colExists(table, col) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === col);
}
function addCol(table, col, def) {
  if (!colExists(table, col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}

// Exercise grouping (nullable FK)
addCol('exercises', 'group_id', 'INTEGER REFERENCES exercise_groups(id) ON DELETE SET NULL');

// Superset grouping per session-exercise (nullable text tag like 'A','B')
addCol('session_exercises', 'superset_tag', "TEXT DEFAULT ''");

// Mood emoji + workout duration goal-related (per workout_session)
addCol('workout_sessions', 'mood', "TEXT DEFAULT ''");

// Rest timer preference (seconds) per session_exercise; null = default 90
addCol('session_exercises', 'rest_seconds', 'INTEGER');

// Time / mileage targets on the SE level
addCol('session_exercises', 'target_time_s', 'INTEGER');
addCol('session_exercises', 'target_mileage_m', 'INTEGER');

// Per-set time/mileage actuals AND per-set target overrides
addCol('session_sets', 'time_seconds',     'INTEGER');
addCol('session_sets', 'mileage_m',        'INTEGER');
addCol('session_sets', 'target_time_s',    'INTEGER');
addCol('session_sets', 'target_mileage_m', 'INTEGER');

// Template-level targets for time/mileage (mirrors session level)
addCol('template_exercises', 'target_time_s',    'INTEGER');
addCol('template_exercises', 'target_mileage_m', 'INTEGER');

// A/B alternate exercise — each row in session_exercises or template_exercises
// can carry an optional alt_exercise_id (so the user can swap on the fly).
// alt_active (0/1) controls which one is currently being logged.
addCol('session_exercises',  'alt_exercise_id', 'INTEGER REFERENCES exercises(id)');
addCol('session_exercises',  'alt_active',      'INTEGER NOT NULL DEFAULT 0');
addCol('template_exercises', 'alt_exercise_id', 'INTEGER REFERENCES exercises(id)');

// A and B keep their own notes and ▲/▼ adjust hint independently.
addCol('session_exercises', 'alt_exercise_notes', 'TEXT');
addCol('session_exercises', 'alt_weight_adjust',  'TEXT');

// Each set belongs to either the A side (default 0) or the B side (1).
// The UI filters set rows by the currently active side so toggling A↔B
// shows that side's own kg / reps / time / mileage entries.
addCol('session_sets', 'alt_active', 'INTEGER NOT NULL DEFAULT 0');

// Templates can pre-pair exercises into supersets (A, B, ...) so a new
// session inherits the grouping automatically.
addCol('template_exercises', 'superset_tag', "TEXT DEFAULT ''");
addCol('template_exercises', 'rest_seconds', 'INTEGER');

// Per-session UI mode: 'expandable' (collapsed accordion) | 'fixed' (always open)
addCol('workout_sessions', 'expand_mode', "TEXT NOT NULL DEFAULT 'expandable'");

// User preferences (single row per user)
db.exec(`
CREATE TABLE IF NOT EXISTS user_settings (
  user_id              INTEGER PRIMARY KEY,
  rep_placeholder_mode TEXT NOT NULL DEFAULT 'empty',     -- 'empty' | 'previous'
  rest_timer_sound     INTEGER NOT NULL DEFAULT 1,        -- 0/1
  rest_timer_vibrate   INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

console.log('DB ready:', DB_PATH);
