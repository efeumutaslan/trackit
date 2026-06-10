import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

function getPrevWorkoutNotes(userId, templateId, beforeDate) {
  if (!templateId) return '';
  const row = db.prepare(`
    SELECT workout_notes FROM workout_sessions
    WHERE user_id = ? AND template_id = ?
      AND session_date <= ?
      AND COALESCE(workout_notes,'') != ''
    ORDER BY session_date DESC, created_at DESC, id DESC LIMIT 1
  `).get(userId, templateId, beforeDate);
  return row?.workout_notes || '';
}

// Find the most recent non-empty exercise note for an exercise.
// Walks every prior SE for this exercise (regardless of whether it was
// the primary or the alt at the time) and returns the first non-empty
// note found — checking both exercise_notes (A side) and
// alt_exercise_notes (B side) so a note typed under either role is
// recovered. weight_adjust uses the same logic.
function getPrevExerciseNotesAndAdjust(userId, exerciseId, beforeDate, excludeSessionId) {
  const exclude = excludeSessionId || -1;
  // Get latest SE where this exercise appears, in either role, with content.
  const row = db.prepare(`
    SELECT
      se.exercise_id, se.alt_exercise_id,
      se.exercise_notes, se.weight_adjust,
      se.alt_exercise_notes, se.alt_weight_adjust,
      ws.session_date
    FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE ws.user_id = ?
      AND ws.session_date <= ? AND ws.id != ?
      AND (
        (se.exercise_id = ? AND (COALESCE(se.exercise_notes,'') != '' OR COALESCE(se.weight_adjust,'') != ''))
        OR
        (se.alt_exercise_id = ? AND (COALESCE(se.alt_exercise_notes,'') != '' OR COALESCE(se.alt_weight_adjust,'') != ''))
      )
    ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
  `).get(userId, beforeDate, exclude, exerciseId, exerciseId);
  if (!row) return { notes: '', adjust: '', session_date: null };
  // Pull the side that matches the requested exercise.
  if (row.exercise_id === exerciseId) {
    return { notes: row.exercise_notes || '', adjust: row.weight_adjust || '', session_date: row.session_date };
  }
  return { notes: row.alt_exercise_notes || '', adjust: row.alt_weight_adjust || '', session_date: row.session_date };
}

function getPrevExerciseNotes(userId, exerciseId, beforeDate) {
  // Backward-compatible wrapper kept for the session POST + add-exercise
  // paths that only want the note string. They aren't side-aware yet —
  // we treat exercise_id as the primary lookup but still scan both
  // columns for the most-recent non-empty value.
  return getPrevExerciseNotesAndAdjust(userId, exerciseId, beforeDate, null).notes;
}

// Returns an ordered list of weight_kg values from the most recent prior
// session of the same exercise. Prefers a session with the same template.
// Called at creation time (the new session does not exist yet), so we
// include the same day (<=) and order by created_at to catch a workout
// logged earlier the same day.
// Find the most recent session for this exercise that the user actually
// LOGGED data into. A row that exists only as the auto-created placeholder
// (every set has weight_kg IS NULL AND reps_done IS NULL) is skipped —
// we want to walk back to the previous time the user actually trained
// this exercise, not the previous time they merely opened a workout
// containing it.
// SIDE-AWARE prev lookup. An exercise may have been logged either as
// the PRIMARY (se.exercise_id, sets with alt_active = 0) or as the
// ALTERNATE (se.alt_exercise_id, sets with alt_active = 1) in a prior
// session. We find the most recent SE where the exercise appears in
// EITHER role and the matching side actually has logged data, and
// return { id, side } so callers can read exactly that side's sets.
function findPrevLoggedSE(userId, exerciseId, templateId, beforeDate, excludeSessionId) {
  const exclude = excludeSessionId || -1;
  // "side" = the alt_active value this exercise was logged under in
  // that SE: 0 when it was the primary, 1 when it was the alternate.
  const sideExpr = 'CASE WHEN se.exercise_id = @ex THEN 0 ELSE 1 END';
  const hasData = `
    EXISTS (
      SELECT 1 FROM session_sets ss
      WHERE ss.session_exercise_id = se.id
        AND ss.alt_active = (${sideExpr})
        AND (ss.weight_kg IS NOT NULL OR ss.reps_done IS NOT NULL
             OR ss.time_seconds IS NOT NULL OR ss.mileage_m IS NOT NULL)
    )
  `;
  let found = null;
  if (templateId) {
    found = db.prepare(`
      SELECT se.id, ${sideExpr} AS side FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.user_id = @user
        AND (se.exercise_id = @ex OR se.alt_exercise_id = @ex)
        AND ws.template_id = @tmpl AND ws.session_date <= @before AND ws.id != @excl
        AND ${hasData}
      ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
    `).get({ user: userId, ex: exerciseId, tmpl: templateId, before: beforeDate, excl: exclude });
  }
  if (!found) {
    found = db.prepare(`
      SELECT se.id, ${sideExpr} AS side FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.user_id = @user
        AND (se.exercise_id = @ex OR se.alt_exercise_id = @ex)
        AND ws.session_date <= @before AND ws.id != @excl
        AND ${hasData}
      ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
    `).get({ user: userId, ex: exerciseId, before: beforeDate, excl: exclude });
  }
  return found || null;
}

// Shared column reader: returns the requested column for the side of
// the SE that matched the exercise, ordered by set_number.
function getPrevSetColumn(column, userId, exerciseId, templateId, beforeDate, excludeSessionId) {
  const found = findPrevLoggedSE(userId, exerciseId, templateId, beforeDate, excludeSessionId);
  if (!found) return [];
  const rows = db.prepare(`
    SELECT ${column} AS v FROM session_sets
    WHERE session_exercise_id = ? AND alt_active = ?
    ORDER BY set_number
  `).all(found.id, found.side);
  return rows.map((r) => r.v);
}

function getPrevSetWeights(userId, exerciseId, templateId, beforeDate, excludeSessionId) {
  return getPrevSetColumn('weight_kg', userId, exerciseId, templateId, beforeDate, excludeSessionId);
}
// Same lookup, but returns reps_done. Used for the "Show previous reps"
// placeholder hint on the rep input.
function getPrevSetReps(userId, exerciseId, templateId, beforeDate, excludeSessionId) {
  return getPrevSetColumn('reps_done', userId, exerciseId, templateId, beforeDate, excludeSessionId);
}
// Time and distance — same idea, per-set, ordered by set_number.
function getPrevSetTimes(userId, exerciseId, templateId, beforeDate, excludeSessionId) {
  return getPrevSetColumn('time_seconds', userId, exerciseId, templateId, beforeDate, excludeSessionId);
}
function getPrevSetMileages(userId, exerciseId, templateId, beforeDate, excludeSessionId) {
  return getPrevSetColumn('mileage_m', userId, exerciseId, templateId, beforeDate, excludeSessionId);
}

function loadSession(userId, sessionId) {
  const s = db.prepare(`
    SELECT ws.*, t.name AS template_name, t.color AS template_color
    FROM workout_sessions ws
    LEFT JOIN templates t ON t.id = ws.template_id
    WHERE ws.id = ? AND ws.user_id = ?
  `).get(sessionId, userId);
  if (!s) return null;

  // Resolve previous workout note dynamically (always current).
  // "Previous" = the closest session that comes BEFORE this one in
  // chronological order, where order is (session_date, created_at, id).
  if (s.template_id) {
    const prevWN = db.prepare(`
      SELECT workout_notes, session_date, mood FROM workout_sessions
      WHERE user_id = ? AND template_id = ?
        AND (session_date, created_at, id) < (?, ?, ?)
        AND COALESCE(workout_notes,'') != ''
      ORDER BY session_date DESC, created_at DESC, id DESC LIMIT 1
    `).get(userId, s.template_id, s.session_date, s.created_at, s.id);
    s.prev_workout_notes = prevWN?.workout_notes || '';
    s.prev_workout_notes_date = prevWN?.session_date || null;
    s.prev_workout_mood = prevWN?.mood || '';
  } else {
    s.prev_workout_notes = '';
    s.prev_workout_notes_date = null;
    s.prev_workout_mood = '';
  }

  const exercises = db.prepare(`
    SELECT se.*,
           e.name  AS exercise_name,
           ea.name AS alt_exercise_name
    FROM session_exercises se
    JOIN exercises e ON e.id = se.exercise_id
    LEFT JOIN exercises ea ON ea.id = se.alt_exercise_id
    WHERE se.session_id = ?
    ORDER BY se.order_idx
  `).all(sessionId);
  for (const ex of exercises) {
    // Sets and notes/adjust are tracked per side (A = alt_active 0, B = 1).
    // The currently-active side's data is what the UI logs against.
    const activeSide = ex.alt_active ? 1 : 0;
    ex.sets = db.prepare(
      'SELECT * FROM session_sets WHERE session_exercise_id = ? AND alt_active = ? ORDER BY set_number'
    ).all(ex.id, activeSide);
    // Expose the inactive side's set count so the UI can hint "B has N saved sets" if needed
    ex.other_side_set_count = db.prepare(
      'SELECT COUNT(*) AS n FROM session_sets WHERE session_exercise_id = ? AND alt_active = ?'
    ).get(ex.id, activeSide ? 0 : 1).n;
    // Surface the active side's notes / adjust as the "exercise_notes"
    // and "weight_adjust" fields the frontend already binds to.
    if (activeSide === 1) {
      ex.exercise_notes = ex.alt_exercise_notes;
      ex.weight_adjust  = ex.alt_weight_adjust;
    }
    const totals = ex.sets.reduce(
      (acc, s) => {
        if (s.weight_kg && s.reps_done) acc.tonnage += s.weight_kg * s.reps_done;
        if (s.reps_done) acc.reps += s.reps_done;
        return acc;
      },
      { tonnage: 0, reps: 0 }
    );
    ex.tonnage = totals.tonnage;
    ex.total_reps = totals.reps;
    // previous session tonnage for the same exercise (chronological order)
    // FIX: compare the ACTIVE side's exercise, match it in either A/B role
    // in prior sessions, and sum only that side's sets.
    const cmpExId = (activeSide === 1 && ex.alt_exercise_id) ? ex.alt_exercise_id : ex.exercise_id;
    const prev = db.prepare(`
      SELECT COALESCE(SUM(ss.weight_kg * ss.reps_done), 0) AS tonnage
      FROM workout_sessions ws
      JOIN session_exercises se ON se.session_id = ws.id
      LEFT JOIN session_sets ss ON ss.session_exercise_id = se.id
        AND ss.alt_active = CASE WHEN se.exercise_id = ? THEN 0 ELSE 1 END
      WHERE ws.user_id = ? AND (se.exercise_id = ? OR se.alt_exercise_id = ?)
        AND (ws.session_date, ws.created_at, ws.id) < (?, ?, ?)
      GROUP BY ws.id
      ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
    `).get(cmpExId, userId, cmpExId, cmpExId, s.session_date, s.created_at, s.id);
    ex.prev_tonnage = prev?.tonnage || 0;

    // Resolve the previous exercise note + adjust SIDE-AWARE: the note
    // belongs to the exercise the user is actually doing right now
    // (primary when alt_active=0, the alternate when alt_active=1).
    // getPrevExerciseNotesAndAdjust scans both A and B roles of prior
    // sessions and returns the column matching the requested exercise,
    // so an A→B→C→D chain always surfaces that exercise's own last
    // note: the primary's note on primary days, the alt's note on alt
    // days — never a mix.
    const noteAdj = getPrevExerciseNotesAndAdjust(userId, cmpExId, s.session_date, s.id);
    ex.prev_exercise_notes = noteAdj.notes || '';
    ex.prev_exercise_notes_date = noteAdj.session_date || null;
    ex.prev_weight_adjust = noteAdj.adjust || '';

    // Per-set previous reps / time / mileage for the ACTIVE side's
    // exercise. Used by the UI to show what the user did last time.
    ex.prev_set_reps = getPrevSetReps(
      userId, cmpExId, s.template_id || null, s.session_date, s.id
    );
    ex.prev_set_times = getPrevSetTimes(
      userId, cmpExId, s.template_id || null, s.session_date, s.id
    );
    ex.prev_set_mileages = getPrevSetMileages(
      userId, cmpExId, s.template_id || null, s.session_date, s.id
    );
  }
  s.exercises = exercises;
  return s;
}

router.get('/', (req, res) => {
  const { from, to } = req.query;
  let where = 'WHERE ws.user_id = ?';
  const params = [req.userId];
  if (from) { where += ' AND ws.session_date >= ?'; params.push(from); }
  if (to)   { where += ' AND ws.session_date <= ?'; params.push(to); }
  const rows = db.prepare(`
    SELECT ws.id, ws.session_date, ws.started_at, ws.finished_at,
           ws.workout_notes, ws.template_id,
           t.name AS template_name, t.color AS template_color
    FROM workout_sessions ws
    LEFT JOIN templates t ON t.id = ws.template_id
    ${where}
    ORDER BY ws.session_date DESC, ws.id DESC
  `).all(...params);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const s = loadSession(req.userId, req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
});

// Create a new session from a template or empty
router.post('/', (req, res) => {
  const { template_id, session_date, exercises, start_now, started_at } = req.body || {};
  const date = session_date || new Date().toISOString().slice(0, 10);
  // Prefer client-provided started_at (correct timezone); fall back to start_now for compat
  const startedAt = started_at || (start_now ? new Date().toISOString() : null);
  const prevWN = getPrevWorkoutNotes(req.userId, template_id, date);

  const txn = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO workout_sessions
        (user_id, template_id, session_date, started_at, prev_workout_notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.userId, template_id || null, date, startedAt, prevWN);
    const sid = info.lastInsertRowid;

    let exToInsert = exercises;
    if (!exToInsert && template_id) {
      // copy exercises from the template
      exToInsert = db.prepare(`
        SELECT exercise_id, order_idx, target_sets, target_reps,
               target_time_s, target_mileage_m, alt_exercise_id,
               superset_tag, rest_seconds
        FROM template_exercises WHERE template_id = ?
        ORDER BY order_idx
      `).all(template_id);
    }
    exToInsert = exToInsert || [];

    const insSE = db.prepare(`
      INSERT INTO session_exercises
        (session_id, exercise_id, order_idx, target_sets, target_reps,
         target_time_s, target_mileage_m, prev_exercise_notes, alt_exercise_id,
         superset_tag, rest_seconds, alt_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insSet = db.prepare(`
      INSERT INTO session_sets
        (session_exercise_id, set_number, weight_kg, reps_done, time_seconds, mileage_m, alt_active)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
    `);
    // Which side (A=0 primary / B=1 alternate) did the user log this
    // exercise on the LAST time it appeared? If the previous session
    // finished on the alternate, the new session opens on the alternate
    // too — showing the alt's prefill, notes and history instead of
    // silently flipping back to the primary.
    const lastSideStmt = db.prepare(`
      SELECT se.alt_active, se.alt_exercise_id FROM session_exercises se
      JOIN workout_sessions ws ON ws.id = se.session_id
      WHERE ws.user_id = ? AND se.exercise_id = ?
        AND (? IS NULL OR ws.template_id = ?)
        AND ws.session_date <= ?
      ORDER BY ws.session_date DESC, ws.created_at DESC, ws.id DESC LIMIT 1
    `);
    exToInsert.forEach((ex, idx) => {
      // Resolve the starting side. Only meaningful when this row has an
      // alternate configured; we also require the prior row's alternate
      // to be the SAME exercise so the toggle keeps pointing at what the
      // user actually trained.
      let startSide = 0;
      if (ex.alt_exercise_id) {
        const last = lastSideStmt.get(
          req.userId, ex.exercise_id,
          template_id || null, template_id || null, date
        );
        if (last && last.alt_active === 1 && last.alt_exercise_id === ex.alt_exercise_id) {
          startSide = 1;
        }
      }
      // The exercise whose history we prefill from = the side we open on.
      const sideExId = startSide === 1 ? ex.alt_exercise_id : ex.exercise_id;
      const prevNote = getPrevExerciseNotesAndAdjust(req.userId, sideExId, date, null).notes;
      const seInfo = insSE.run(
        sid, ex.exercise_id, idx,
        ex.target_sets || 3, ex.target_reps || '',
        ex.target_time_s || null, ex.target_mileage_m || null,
        prevNote, ex.alt_exercise_id || null,
        ex.superset_tag || '', ex.rest_seconds || null,
        startSide
      );
      const seId = seInfo.lastInsertRowid;
      const setsCount = ex.target_sets || 3;
      // Pre-fill weight, time and mileage from the most recent prior
      // session that the user actually logged data in — for the side we
      // are opening on. Same recall behaviour as kg → the user sees
      // their last numbers and only changes what's different. Reps are
      // left blank to nudge fresh entry (and to match the existing
      // "Show previous reps" hint).
      const prevWeights  = getPrevSetWeights (req.userId, sideExId, template_id || null, date, sid);
      const prevTimes    = getPrevSetTimes   (req.userId, sideExId, template_id || null, date, sid);
      const prevMileages = getPrevSetMileages(req.userId, sideExId, template_id || null, date, sid);
      for (let i = 1; i <= setsCount; i++) {
        const w = prevWeights [i - 1] != null ? prevWeights [i - 1] : null;
        const t = prevTimes   [i - 1] != null ? prevTimes   [i - 1] : null;
        const m = prevMileages[i - 1] != null ? prevMileages[i - 1] : null;
        insSet.run(seId, i, w, t, m, startSide);
      }
    });
    return sid;
  });

  const sid = txn();
  res.json(loadSession(req.userId, sid));
});

// Update session (notes, start/finish, add/remove)
router.put('/:id', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  const {
    session_date, started_at, finished_at, workout_notes, template_id, mood,
    expand_mode,
  } = req.body || {};

  // Whitelist expand_mode
  const mode = expand_mode === 'fixed' ? 'fixed'
             : expand_mode === 'expandable' ? 'expandable'
             : cur.expand_mode;

  db.prepare(`
    UPDATE workout_sessions
    SET session_date = ?, started_at = ?, finished_at = ?,
        workout_notes = ?, template_id = ?, mood = ?, expand_mode = ?
    WHERE id = ?
  `).run(
    session_date ?? cur.session_date,
    started_at ?? cur.started_at,
    finished_at ?? cur.finished_at,
    workout_notes ?? cur.workout_notes,
    template_id !== undefined ? template_id : cur.template_id,
    mood ?? cur.mood,
    mode,
    id
  );
  res.json(loadSession(req.userId, id));
});

router.post('/:id/start', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const at = (req.body && req.body.at) || new Date().toISOString();
  db.prepare('UPDATE workout_sessions SET started_at = ? WHERE id = ?').run(at, id);
  res.json({ started_at: at });
});

router.post('/:id/finish', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const at = (req.body && req.body.at) || new Date().toISOString();
  db.prepare('UPDATE workout_sessions SET finished_at = ? WHERE id = ?').run(at, id);
  res.json({ finished_at: at });
});

router.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(id);
  res.json({ ok: true });
});

// --- Exercises within a session ---
router.post('/:id/exercises', (req, res) => {
  const id = +req.params.id;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const {
    exercise_id, target_sets, target_reps,
    target_time_s, target_mileage_m,
  } = req.body || {};
  if (!exercise_id) return res.status(400).json({ error: 'Select an exercise' });
  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_idx), -1) AS m FROM session_exercises WHERE session_id = ?').get(id).m;
  const prevNote = getPrevExerciseNotes(req.userId, exercise_id, cur.session_date);
  const info = db.prepare(`
    INSERT INTO session_exercises
      (session_id, exercise_id, order_idx, target_sets, target_reps,
       target_time_s, target_mileage_m, prev_exercise_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, exercise_id, maxOrder + 1,
    target_sets || 3, target_reps || '',
    target_time_s || null, target_mileage_m || null,
    prevNote
  );
  const seId = info.lastInsertRowid;
  // Same prev-recall as in session POST: kg + time + mileage carry over.
  const prevWeights  = getPrevSetWeights (req.userId, exercise_id, cur.template_id || null, cur.session_date, cur.id);
  const prevTimes    = getPrevSetTimes   (req.userId, exercise_id, cur.template_id || null, cur.session_date, cur.id);
  const prevMileages = getPrevSetMileages(req.userId, exercise_id, cur.template_id || null, cur.session_date, cur.id);
  const ins = db.prepare(
    'INSERT INTO session_sets (session_exercise_id, set_number, weight_kg, time_seconds, mileage_m) VALUES (?, ?, ?, ?, ?)'
  );
  for (let i = 1; i <= (target_sets || 3); i++) {
    const w = prevWeights [i - 1] != null ? prevWeights [i - 1] : null;
    const t = prevTimes   [i - 1] != null ? prevTimes   [i - 1] : null;
    const m = prevMileages[i - 1] != null ? prevMileages[i - 1] : null;
    ins.run(seId, i, w, t, m);
  }
  res.json(loadSession(req.userId, id));
});

router.put('/:id/exercises/:seId', (req, res) => {
  const { id, seId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const se = db.prepare('SELECT * FROM session_exercises WHERE id = ? AND session_id = ?').get(seId, id);
  if (!se) return res.status(404).json({ error: 'Exercise not found' });
  const {
    exercise_notes, weight_adjust, target_reps, target_sets,
    superset_tag, rest_seconds, target_time_s, target_mileage_m,
    alt_exercise_id, alt_active,
  } = req.body || {};

  // notes/adjust apply to whichever side is currently active. When the
  // toggle flips, the caller still sends "exercise_notes" — we route it
  // into the right column.
  const newAltActive = alt_active !== undefined ? (alt_active ? 1 : 0) : se.alt_active;
  const editingSideA = newAltActive === 0;
  const aNotes  = (editingSideA && exercise_notes !== undefined) ? exercise_notes : se.exercise_notes;
  const aAdjust = (editingSideA && weight_adjust  !== undefined) ? weight_adjust  : se.weight_adjust;
  const bNotes  = (!editingSideA && exercise_notes !== undefined) ? exercise_notes : se.alt_exercise_notes;
  const bAdjust = (!editingSideA && weight_adjust  !== undefined) ? weight_adjust  : se.alt_weight_adjust;

  db.prepare(`
    UPDATE session_exercises
    SET exercise_notes = ?, weight_adjust = ?,
        alt_exercise_notes = ?, alt_weight_adjust = ?,
        target_reps = ?, target_sets = ?,
        superset_tag = ?, rest_seconds = ?, target_time_s = ?, target_mileage_m = ?,
        alt_exercise_id = ?, alt_active = ?
    WHERE id = ?
  `).run(
    aNotes, aAdjust,
    bNotes, bAdjust,
    target_reps      ?? se.target_reps,
    target_sets      ?? se.target_sets,
    superset_tag     ?? se.superset_tag,
    rest_seconds     !== undefined ? rest_seconds     : se.rest_seconds,
    target_time_s    !== undefined ? target_time_s    : se.target_time_s,
    target_mileage_m !== undefined ? target_mileage_m : se.target_mileage_m,
    alt_exercise_id  !== undefined ? alt_exercise_id  : se.alt_exercise_id,
    newAltActive,
    seId
  );

  // If we just flipped to a side that has no sets yet, lazily create
  // target_sets rows for that side. We also pre-fill kg / time / mileage
  // AND the exercise note + adjust hint from the most recent prior
  // session of THAT side's exercise. So toggling A→B brings up the B
  // exercise's own history rather than a totally blank slate.
  if (alt_active !== undefined) {
    const existing = db.prepare(
      'SELECT COUNT(*) AS n FROM session_sets WHERE session_exercise_id = ? AND alt_active = ?'
    ).get(seId, newAltActive).n;
    if (existing === 0) {
      const targetN = (target_sets ?? se.target_sets) || 3; // FIX: use updated value
      const sideExerciseId = newAltActive === 1 ? se.alt_exercise_id : se.exercise_id;
      let prevWeights = [], prevTimes = [], prevMileages = [];
      let prevNote = '', prevAdjust = '';
      if (sideExerciseId) {
        const wsRow = db.prepare('SELECT template_id, session_date FROM workout_sessions WHERE id = ?').get(id);
        prevWeights  = getPrevSetWeights (req.userId, sideExerciseId, wsRow.template_id || null, wsRow.session_date, id);
        prevTimes    = getPrevSetTimes   (req.userId, sideExerciseId, wsRow.template_id || null, wsRow.session_date, id);
        prevMileages = getPrevSetMileages(req.userId, sideExerciseId, wsRow.template_id || null, wsRow.session_date, id);
        const noteAdj = getPrevExerciseNotesAndAdjust(req.userId, sideExerciseId, wsRow.session_date, id);
        prevNote   = noteAdj.notes;
        prevAdjust = noteAdj.adjust;
      }
      const ins = db.prepare(
        'INSERT INTO session_sets (session_exercise_id, set_number, weight_kg, time_seconds, mileage_m, alt_active) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (let i = 1; i <= targetN; i++) {
        const w = prevWeights [i - 1] != null ? prevWeights [i - 1] : null;
        const t = prevTimes   [i - 1] != null ? prevTimes   [i - 1] : null;
        const m = prevMileages[i - 1] != null ? prevMileages[i - 1] : null;
        ins.run(seId, i, w, t, m, newAltActive);
      }
      // Also pre-fill the side's note + adjust columns if they are still
      // blank. Only write into the side we just activated.
      if (prevNote || prevAdjust) {
        if (newAltActive === 1) {
          // B side — fill alt_exercise_notes / alt_weight_adjust if empty
          db.prepare(`
            UPDATE session_exercises
            SET alt_exercise_notes = COALESCE(NULLIF(alt_exercise_notes,''), ?),
                alt_weight_adjust  = COALESCE(NULLIF(alt_weight_adjust,''),  ?)
            WHERE id = ?
          `).run(prevNote || null, prevAdjust || null, seId);
        } else {
          // A side
          db.prepare(`
            UPDATE session_exercises
            SET exercise_notes = COALESCE(NULLIF(exercise_notes,''), ?),
                weight_adjust  = COALESCE(NULLIF(weight_adjust,''),  ?)
            WHERE id = ?
          `).run(prevNote || null, prevAdjust || null, seId);
        }
      }
    }
  }

  res.json({ ok: true });
});

router.delete('/:id/exercises/:seId', (req, res) => {
  const { id, seId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM session_exercises WHERE id = ? AND session_id = ?').run(seId, id);
  res.json({ ok: true });
});

// Reorder an exercise within a session: 'up' or 'down' swaps its order_idx
// with the neighbouring exercise.
router.post('/:id/exercises/:seId/move', (req, res) => {
  const { id, seId } = req.params;
  const dir = (req.body && req.body.direction) || 'up';
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const me = db.prepare('SELECT * FROM session_exercises WHERE id = ? AND session_id = ?').get(seId, id);
  if (!me) return res.status(404).json({ error: 'Exercise not found' });
  const neighbour = dir === 'up'
    ? db.prepare(`SELECT * FROM session_exercises WHERE session_id = ? AND order_idx < ? ORDER BY order_idx DESC LIMIT 1`).get(id, me.order_idx)
    : db.prepare(`SELECT * FROM session_exercises WHERE session_id = ? AND order_idx > ? ORDER BY order_idx ASC LIMIT 1`).get(id, me.order_idx);
  if (!neighbour) return res.json({ ok: true, swapped: false });
  // swap order_idx via a temp value to avoid unique-ish constraint issues
  const tx = db.transaction(() => {
    db.prepare('UPDATE session_exercises SET order_idx = ? WHERE id = ?').run(-1 - me.id, me.id);
    db.prepare('UPDATE session_exercises SET order_idx = ? WHERE id = ?').run(me.order_idx, neighbour.id);
    db.prepare('UPDATE session_exercises SET order_idx = ? WHERE id = ?').run(neighbour.order_idx, me.id);
  });
  tx();
  res.json({ ok: true, swapped: true });
});

// Replace the exercise referenced by a session_exercise row with a different
// exercise from the user's roster. Sets/notes/order are preserved.
router.post('/:id/exercises/:seId/replace', (req, res) => {
  const { id, seId } = req.params;
  const newExerciseId = req.body && +req.body.exercise_id;
  if (!newExerciseId) return res.status(400).json({ error: 'exercise_id required' });
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const me = db.prepare('SELECT * FROM session_exercises WHERE id = ? AND session_id = ?').get(seId, id);
  if (!me) return res.status(404).json({ error: 'Exercise not found' });
  const newEx = db.prepare('SELECT * FROM exercises WHERE id = ? AND user_id = ?').get(newExerciseId, req.userId);
  if (!newEx) return res.status(404).json({ error: 'Replacement exercise not found' });
  // Resolve previous-note for the NEW exercise so the card is meaningful.
  const newPrevNote = getPrevExerciseNotes(req.userId, newExerciseId, cur.session_date);
  db.prepare(`
    UPDATE session_exercises SET exercise_id = ?, prev_exercise_notes = ?, weight_adjust = NULL
    WHERE id = ?
  `).run(newExerciseId, newPrevNote, me.id);
  // Also refresh prefills for the new exercise (only if all sets are empty).
  const sets = db.prepare('SELECT id, weight_kg, time_seconds, mileage_m FROM session_sets WHERE session_exercise_id = ? ORDER BY set_number').all(me.id);
  const allEmpty = sets.every((s) => s.weight_kg == null && s.time_seconds == null && s.mileage_m == null);
  if (allEmpty) {
    const prevWeights  = getPrevSetWeights (req.userId, newExerciseId, cur.template_id || null, cur.session_date, cur.id);
    const prevTimes    = getPrevSetTimes   (req.userId, newExerciseId, cur.template_id || null, cur.session_date, cur.id);
    const prevMileages = getPrevSetMileages(req.userId, newExerciseId, cur.template_id || null, cur.session_date, cur.id);
    const upd = db.prepare('UPDATE session_sets SET weight_kg = ?, time_seconds = ?, mileage_m = ? WHERE id = ?');
    sets.forEach((s, i) => {
      const w = prevWeights [i] != null ? prevWeights [i] : null;
      const t = prevTimes   [i] != null ? prevTimes   [i] : null;
      const m = prevMileages[i] != null ? prevMileages[i] : null;
      upd.run(w, t, m, s.id);
    });
  }
  res.json({ ok: true });
});

// Update a set
router.put('/:id/sets/:setId', (req, res) => {
  const { id, setId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const setRow = db.prepare(`
    SELECT ss.* FROM session_sets ss
    JOIN session_exercises se ON se.id = ss.session_exercise_id
    JOIN workout_sessions ws  ON ws.id = se.session_id
    WHERE ss.id = ? AND ws.user_id = ?
  `).get(setId, req.userId);
  if (!setRow) return res.status(404).json({ error: 'Not found' });

  const {
    weight_kg, reps_done, time_seconds, mileage_m,
    target_time_s, target_mileage_m,
  } = req.body || {};

  db.prepare(`
    UPDATE session_sets
    SET weight_kg = ?, reps_done = ?, time_seconds = ?, mileage_m = ?,
        target_time_s = ?, target_mileage_m = ?
    WHERE id = ?
  `).run(
    weight_kg        !== undefined ? weight_kg        : setRow.weight_kg,
    reps_done        !== undefined ? reps_done        : setRow.reps_done,
    time_seconds     !== undefined ? time_seconds     : setRow.time_seconds,
    mileage_m        !== undefined ? mileage_m        : setRow.mileage_m,
    target_time_s    !== undefined ? target_time_s    : setRow.target_time_s,
    target_mileage_m !== undefined ? target_mileage_m : setRow.target_mileage_m,
    setId
  );
  res.json({ ok: true });
});

// Set ekle / sil
router.post('/:id/exercises/:seId/sets', (req, res) => {
  const { id, seId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  const se = db.prepare('SELECT alt_active FROM session_exercises WHERE id = ? AND session_id = ?').get(seId, id);
  if (!se) return res.status(404).json({ error: 'Exercise not found' });
  const side = se.alt_active ? 1 : 0;
  const max = db.prepare(
    'SELECT COALESCE(MAX(set_number), 0) AS m FROM session_sets WHERE session_exercise_id = ? AND alt_active = ?'
  ).get(seId, side).m;
  const info = db.prepare(
    'INSERT INTO session_sets (session_exercise_id, set_number, alt_active) VALUES (?, ?, ?)'
  ).run(seId, max + 1, side);
  res.json({ id: info.lastInsertRowid, set_number: max + 1 });
});

router.delete('/:id/sets/:setId', (req, res) => {
  const { id, setId } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Not found' });
  // FIX: verify the set belongs to this session before deleting
  const setRow = db.prepare(`
    SELECT ss.id FROM session_sets ss
    JOIN session_exercises se ON se.id = ss.session_exercise_id
    WHERE ss.id = ? AND se.session_id = ?
  `).get(setId, id);
  if (!setRow) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM session_sets WHERE id = ?').run(setId);
  res.json({ ok: true });
});

// Save the current session as a new template
router.post('/:id/save-as-template', (req, res) => {
  const { id } = req.params;
  const { name, color } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Session not found' });
  const ses = db.prepare(`
    SELECT exercise_id, order_idx, target_sets, target_reps,
           target_time_s, target_mileage_m, alt_exercise_id,
           superset_tag, rest_seconds
    FROM session_exercises WHERE session_id = ? ORDER BY order_idx
  `).all(id);
  const txn = db.transaction(() => {
    const t = db.prepare('INSERT INTO templates (user_id, name, color) VALUES (?, ?, ?)')
      .run(req.userId, name.trim(), color || '#FFB07A');
    const ins = db.prepare(`
      INSERT INTO template_exercises
        (template_id, exercise_id, order_idx, target_sets, target_reps,
         target_time_s, target_mileage_m, alt_exercise_id,
         superset_tag, rest_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    ses.forEach(s => ins.run(
      t.lastInsertRowid, s.exercise_id, s.order_idx,
      s.target_sets, s.target_reps, s.target_time_s, s.target_mileage_m,
      s.alt_exercise_id || null,
      s.superset_tag || '', s.rest_seconds || null
    ));
    db.prepare('UPDATE workout_sessions SET template_id = ? WHERE id = ?').run(t.lastInsertRowid, id);
    return t.lastInsertRowid;
  });
  const tid = txn();
  res.json({ template_id: tid });
});

// Update the template attached to this session (affects future sessions)
router.post('/:id/update-template', (req, res) => {
  const { id } = req.params;
  const cur = db.prepare('SELECT * FROM workout_sessions WHERE id = ? AND user_id = ?')
    .get(id, req.userId);
  if (!cur) return res.status(404).json({ error: 'Session not found' });
  if (!cur.template_id) return res.status(400).json({ error: 'This session was not started from a template' });
  const ses = db.prepare(`
    SELECT exercise_id, order_idx, target_sets, target_reps,
           target_time_s, target_mileage_m, alt_exercise_id,
           superset_tag, rest_seconds
    FROM session_exercises WHERE session_id = ? ORDER BY order_idx
  `).all(id);
  const txn = db.transaction(() => {
    db.prepare('DELETE FROM template_exercises WHERE template_id = ?').run(cur.template_id);
    const ins = db.prepare(`
      INSERT INTO template_exercises
        (template_id, exercise_id, order_idx, target_sets, target_reps,
         target_time_s, target_mileage_m, alt_exercise_id,
         superset_tag, rest_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    ses.forEach(s => ins.run(
      cur.template_id, s.exercise_id, s.order_idx,
      s.target_sets, s.target_reps, s.target_time_s, s.target_mileage_m,
      s.alt_exercise_id || null,
      s.superset_tag || '', s.rest_seconds || null
    ));
  });
  txn();
  res.json({ ok: true });
});

// Calendar feed: template_id/color/name within a date range
router.get('/calendar/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end   = `${year}-${String(month).padStart(2, '0')}-31`;
  const rows = db.prepare(`
    SELECT ws.id, ws.session_date, ws.template_id,
           t.name AS template_name, t.color AS template_color
    FROM workout_sessions ws
    LEFT JOIN templates t ON t.id = ws.template_id
    WHERE ws.user_id = ? AND ws.session_date BETWEEN ? AND ?
    ORDER BY ws.session_date
  `).all(req.userId, start, end);
  res.json(rows);
});

export default router;
