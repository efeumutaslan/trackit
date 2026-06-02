import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Format ISO date (YYYY-MM-DD or full ISO) as DD.MM.YYYY.
function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10); // YYYY-MM-DD
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

// Format a duration in seconds as HH:MM:SS.
function fmtDuration(seconds) {
  if (seconds == null || seconds === '') return '';
  const s = Math.max(0, Math.floor(Number(seconds)));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Parse HH:MM:SS or MM:SS or seconds-string into seconds. Returns null on empty.
function parseDuration(s) {
  if (s == null || String(s).trim() === '') return null;
  const txt = String(s).trim();
  if (!txt.includes(':')) {
    const n = parseInt(txt, 10);
    return Number.isFinite(n) ? n : null;
  }
  const parts = txt.split(':').map((p) => parseInt(p, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// Format mileage in metres as a friendly string ("2.4 km" or "850 m").
function fmtMileage(metres) {
  if (metres == null || metres === '') return '';
  const m = Number(metres);
  if (!Number.isFinite(m)) return '';
  if (m >= 1000) return `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 2)} km`;
  return `${m} m`;
}

export default function Session() {
  const { id } = useParams();
  const nav = useNavigate();
  const [s, setS] = useState(null);
  const [showAddEx, setShowAddEx] = useState(false);
  const [showSaveTmpl, setShowSaveTmpl] = useState(false);
  const [restEnd, setRestEnd] = useState(null); // epoch ms when timer ends, or null
  const [restTotal, setRestTotal] = useState(0); // total seconds for progress bar

  const load = useCallback(() => {
    api.get(`/sessions/${id}`).then(setS).catch(() => nav('/sessions'));
  }, [id, nav]);

  useEffect(() => { load(); }, [load]);

  // Tick to redraw the countdown each second.
  useEffect(() => {
    if (!restEnd) return undefined;
    const t = setInterval(() => {
      if (Date.now() >= restEnd) {
        // Beep + vibrate when rest ends.
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.frequency.value = 880; g.gain.value = 0.25;
          o.start(); o.stop(ctx.currentTime + 0.25);
        } catch { /* audio unavailable */ }
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        setRestEnd(null);
      } else {
        // force re-render
        setRestEnd((v) => v);
      }
    }, 250);
    return () => clearInterval(t);
  }, [restEnd]);

  function startRest(seconds) {
    if (!seconds || seconds <= 0) return;
    setRestTotal(seconds);
    setRestEnd(Date.now() + seconds * 1000);
  }
  function cancelRest() { setRestEnd(null); }

  if (!s) return <div className="app-shell"><TopBar back brand /></div>;

  async function saveMeta(patch) {
    setS((cur) => ({ ...cur, ...patch }));
    await api.put(`/sessions/${id}`, { ...s, ...patch });
  }

  async function startWO() {
    const nowIso = new Date().toISOString();
    const r = await api.post(`/sessions/${id}/start`, { at: nowIso });
    setS((cur) => ({ ...cur, started_at: r.started_at }));
  }
  async function finishWO() {
    const nowIso = new Date().toISOString();
    const r = await api.post(`/sessions/${id}/finish`, { at: nowIso });
    setS((cur) => ({ ...cur, finished_at: r.finished_at }));
  }

  async function delSession() {
    if (!confirm('Delete this session?')) return;
    await api.del(`/sessions/${id}`);
    nav('/sessions');
  }

  return (
    <div className="app-shell">
      <TopBar
        back
        title={s.template_name || 'Session'}
        right={
          <button className="right-action" onClick={delSession} style={{ color: 'var(--red)' }}>Delete</button>
        }
      />
      <div className="content">
        <div
          className={`card session-meta${s.finished_at ? ' is-finished' : ''}`}
          style={{ borderLeft: `4px solid ${s.template_color || '#FFB07A'}` }}
        >
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={s.session_date}
              onChange={(e) => saveMeta({ session_date: e.target.value })}
            />
          </div>
          <div className="row">
            <button
              className="btn sm"
              onClick={s.started_at ? () => {
                const t = prompt('Start time (HH:MM):', fmtTime(s.started_at));
                if (t) {
                  const [h, m] = t.split(':');
                  const d = new Date(s.session_date);
                  d.setHours(+h, +m, 0, 0);
                  saveMeta({ started_at: d.toISOString() });
                }
              } : startWO}
              style={{ flex: 1 }}
            >
              ⏱ Start: {s.started_at ? fmtTime(s.started_at) : 'Begin'}
            </button>
            <button
              className="btn sm"
              onClick={s.finished_at ? () => {
                const t = prompt('Finish time (HH:MM):', fmtTime(s.finished_at));
                if (t) {
                  const [h, m] = t.split(':');
                  const d = new Date(s.session_date);
                  d.setHours(+h, +m, 0, 0);
                  saveMeta({ finished_at: d.toISOString() });
                }
              } : finishWO}
              style={{ flex: 1 }}
            >
              🏁 Finish: {s.finished_at ? fmtTime(s.finished_at) : 'End'}
            </button>
          </div>
          {/* Mood emoji picker appears once the session is finished */}
          {s.finished_at && (
            <div className="mood-picker">
              {['🤮', '🙁', '😑', '🙂', '🤩'].map((emo) => (
                <button
                  key={emo}
                  className={`mood-btn${s.mood === emo ? ' selected' : ''}`}
                  onClick={() => saveMeta({ mood: s.mood === emo ? '' : emo })}
                >
                  {emo}
                </button>
              ))}
            </div>
          )}
        </div>

        {s.prev_workout_notes && (
          <div className="prev-note-card">
            <div className="prev-note-head">
              <span className="prev-note-icon">📜</span>
              {s.prev_workout_mood && (
                <span className="prev-note-mood">{s.prev_workout_mood}</span>
              )}
              <span className="prev-note-label">Previous workout note</span>
              {s.prev_workout_notes_date && (
                <span className="prev-note-date">{fmtDate(s.prev_workout_notes_date)}</span>
              )}
            </div>
            <div className="prev-note-body">{s.prev_workout_notes}</div>
          </div>
        )}

        <div className="field">
          <label>Workout notes</label>
          <textarea
            value={s.workout_notes || ''}
            onChange={(e) => setS((cur) => ({ ...cur, workout_notes: e.target.value }))}
            onBlur={() => saveMeta({ workout_notes: s.workout_notes })}
            placeholder="Notes about this workout…"
          />
        </div>

        <div className="section-title">Exercises</div>
        {s.exercises.map((ex) => (
          <ExerciseBlock
            key={ex.id}
            sessionId={s.id}
            ex={ex}
            reload={load}
            sessionDate={s.session_date}
            onAfterRestSet={startRest}
          />
        ))}

        <button className="btn mt-1" onClick={() => setShowAddEx(true)}>+ Add exercise</button>

        <div className="section-title">Template</div>
        {s.template_id ? (
          <button className="btn ghost" onClick={async () => {
            if (!confirm('Apply changes from this session to the template? (Past workouts are unaffected)')) return;
            await api.post(`/sessions/${id}/update-template`);
            alert('Template updated');
          }}>♻ Update this template</button>
        ) : null}
        <button className="btn ghost mt-1" onClick={() => setShowSaveTmpl(true)}>💾 Save as template</button>

        {showAddEx && <AddExerciseModal sessionId={s.id} onClose={() => setShowAddEx(false)} reload={load} />}
        {showSaveTmpl && (
          <SaveAsTemplateModal
            sessionId={s.id}
            defaultName={s.template_name || ''}
            onClose={() => setShowSaveTmpl(false)}
            reload={load}
          />
        )}
      </div>

      {/* Rest timer overlay — appears when a set finishes and the SE has rest_seconds set */}
      {restEnd && (
        <div className="rest-timer">
          <div className="rest-timer__bar" style={{
            width: `${Math.max(0, Math.min(100, ((restEnd - Date.now()) / (restTotal * 1000)) * 100))}%`,
          }} />
          <div className="rest-timer__text">
            ⏲ Rest: {Math.max(0, Math.ceil((restEnd - Date.now()) / 1000))}s
          </div>
          <button className="rest-timer__skip" onClick={cancelRest}>Skip</button>
        </div>
      )}
    </div>
  );
}

function ExerciseBlock({ sessionId, ex, reload, sessionDate, onAfterRestSet }) {
  const [notes, setNotes] = useState(ex.exercise_notes || '');
  const [adjust, setAdjust] = useState(ex.weight_adjust || '');
  const [targetReps, setTargetReps] = useState(ex.target_reps || '');
  const [targetTime, setTargetTime] = useState(ex.target_time_s ? fmtDuration(ex.target_time_s) : '');
  const [targetMileage, setTargetMileage] = useState(ex.target_mileage_m != null ? String(ex.target_mileage_m) : '');
  const [supersetTag, setSupersetTag] = useState(ex.superset_tag || '');
  const [restSecs, setRestSecs] = useState(ex.rest_seconds ?? '');
  const [showReplace, setShowReplace] = useState(false);
  const [showTargets, setShowTargets] = useState(false);

  // Determine which columns the SET rows should show. KG is always shown.
  // TIME/MILEAGE are shown if there's an exercise-level OR any set-level target,
  // OR any set already has an actual value for it (so existing data isn't hidden).
  const anySetHasTime    = ex.sets.some((s) => s.time_seconds != null);
  const anySetHasMileage = ex.sets.some((s) => s.mileage_m != null);
  const showCols = {
    kg: true,
    rep: true,
    time:    ex.target_time_s    != null || anySetHasTime,
    mileage: ex.target_mileage_m != null || anySetHasMileage,
  };

  async function saveMeta(patch) {
    await api.put(`/sessions/${sessionId}/exercises/${ex.id}`, {
      exercise_notes: notes,
      weight_adjust: adjust,
      target_reps: targetReps,
      target_sets: ex.target_sets,
      ...patch,
    });
  }

  async function saveTargets() {
    await api.put(`/sessions/${sessionId}/exercises/${ex.id}`, {
      target_time_s:    parseDuration(targetTime),
      target_mileage_m: targetMileage === '' ? null : (parseInt(targetMileage, 10) || null),
      rest_seconds:     restSecs === '' ? null : (parseInt(restSecs, 10) || null),
      superset_tag:     supersetTag,
    });
    reload();
  }

  async function setAdjustValue(v) {
    const next = adjust === v ? '' : v;
    setAdjust(next);
    await saveMeta({ weight_adjust: next });
  }

  async function addSet() {
    await api.post(`/sessions/${sessionId}/exercises/${ex.id}/sets`);
    reload();
  }
  async function delEx() {
    if (!confirm(`Delete ${ex.exercise_name}?`)) return;
    await api.del(`/sessions/${sessionId}/exercises/${ex.id}`);
    reload();
  }

  async function move(direction) {
    await api.post(`/sessions/${sessionId}/exercises/${ex.id}/move`, { direction });
    reload();
  }

  const cardClass =
    'card exercise-block' +
    (ex.prev_weight_adjust === 'up' ? ' exercise-block--prev-up' :
     ex.prev_weight_adjust === 'down' ? ' exercise-block--prev-down' : '');

  return (
    <div className={cardClass}>
      <div className="exercise-head">
        <h4 style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          {ex.superset_tag && (
            <span className="superset-badge">{ex.superset_tag}</span>
          )}
          <span>{ex.exercise_name}</span>
        </h4>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn tiny ghost" onClick={() => setShowTargets((v) => !v)} title="Targets / superset / rest">⚙</button>
          <button className="btn tiny ghost" onClick={() => move('up')} title="Move up">↑</button>
          <button className="btn tiny ghost" onClick={() => move('down')} title="Move down">↓</button>
          <button className="btn tiny ghost" onClick={() => setShowReplace(true)} title="Replace exercise">⇄</button>
          <button className="btn tiny ghost" onClick={delEx} title="Remove">✕</button>
        </div>
      </div>

      {/* Previous exercise note — placed right below the exercise name */}
      {ex.prev_exercise_notes && (
        <div className="prev-note-card prev-note-card--sm" style={{ marginBottom: 10 }}>
          <div className="prev-note-head">
            <span className="prev-note-icon">📜</span>
            <span className="prev-note-label">Previous exercise note</span>
            {ex.prev_exercise_notes_date && (
              <span className="prev-note-date">{fmtDate(ex.prev_exercise_notes_date)}</span>
            )}
          </div>
          <div className="prev-note-body">{ex.prev_exercise_notes}</div>
        </div>
      )}

      <div className="row mb-1">
        <div>
          <label className="small" style={{ color: 'var(--ink-soft)' }}>Target rep range</label>
          <input
            value={targetReps}
            onChange={(e) => setTargetReps(e.target.value)}
            onBlur={() => saveMeta({ target_reps: targetReps })}
            placeholder="e.g. 6-10"
          />
        </div>
        <div>
          <label className="small" style={{ color: 'var(--ink-soft)' }}>Tonnage</label>
          <div className="tonnage-line" style={{ padding: '10px 0' }}>
            <span className="tag">{ex.tonnage.toFixed(1)} kg</span>
            {ex.prev_tonnage > 0 && (
              <span className="tag muted">Previous: {ex.prev_tonnage.toFixed(1)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Targets panel — collapsed by default; opens with ⚙ */}
      {showTargets && (
        <div className="targets-panel">
          <div className="row mb-1">
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Target time (HH:MM:SS)</label>
              <input
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value.replace(/[^0-9:]/g, ''))}
                onBlur={saveTargets}
                placeholder="00:10:00"
              />
            </div>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Target distance (m)</label>
              <input
                type="text"
                inputMode="numeric"
                value={targetMileage}
                onChange={(e) => setTargetMileage(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={saveTargets}
                placeholder="2400"
              />
            </div>
          </div>
          <div className="row">
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Rest (sec)</label>
              <input
                type="text"
                inputMode="numeric"
                value={restSecs}
                onChange={(e) => setRestSecs(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={saveTargets}
                placeholder="90"
              />
            </div>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Superset tag (A, B…)</label>
              <input
                value={supersetTag}
                onChange={(e) => setSupersetTag(e.target.value.toUpperCase().slice(0, 2))}
                onBlur={saveTargets}
                placeholder="A"
              />
            </div>
          </div>
        </div>
      )}

      {/* Set rows */}
      <div className="set-row-header">
        <div className="text-center">SET</div>
        {showCols.kg && <div className="text-center">KG</div>}
        {showCols.rep && <div className="text-center">REP</div>}
        <div />
      </div>
      {(showCols.time || showCols.mileage) && (
        <div className="set-row-header set-row-header--time">
          <div />
          {showCols.time    && <div className="text-center">TIME</div>}
          {showCols.mileage && <div className="text-center">DIST (m)</div>}
          <div />
        </div>
      )}
      {ex.sets.map((set, idx) => (
        <SetRow
          key={set.id}
          sessionId={sessionId}
          set={set}
          showCols={showCols}
          targets={{
            target_reps:     ex.target_reps,
            target_time_s:   ex.target_time_s,
            target_mileage_m:ex.target_mileage_m,
          }}
          onSaved={async (evt) => {
            if (evt && evt.kind === 'kg') {
              const newW = evt.newW;
              const prevW = set.weight_kg;
              if (newW !== prevW) {
                const targets = ex.sets.slice(idx + 1);
                if (targets.length > 0) {
                  await Promise.all(
                    targets.map((s) =>
                      api.put(`/sessions/${sessionId}/sets/${s.id}`, {
                        weight_kg: newW,
                        reps_done: s.reps_done,
                      })
                    )
                  );
                }
              }
              // Trigger rest timer on the parent.
              if (onAfterRestSet && ex.rest_seconds) onAfterRestSet(ex.rest_seconds);
            }
            if (evt && (evt.kind === 'rep' || evt.kind === 'time' || evt.kind === 'mileage')) {
              if (onAfterRestSet && ex.rest_seconds) onAfterRestSet(ex.rest_seconds);
            }
            reload();
          }}
        />
      ))}
      <button className="btn ghost tiny mt-1" onClick={addSet}>+ Add set</button>

      {/* Note area: narrower textarea on the left, vertical adjust buttons on the right */}
      <div className="note-with-adjust mt-2">
        <textarea
          className="note-area"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => saveMeta()}
          placeholder="Note about this exercise…"
        />
        <div className="adjust-stack">
          <button
            className={`adjust-btn adjust-up${adjust === 'up' ? ' pressed' : ''}`}
            onClick={() => setAdjustValue('up')}
            title="Plan to go heavier next time"
          >▲</button>
          <button
            className={`adjust-btn adjust-down${adjust === 'down' ? ' pressed' : ''}`}
            onClick={() => setAdjustValue('down')}
            title="Plan to back off next time"
          >▼</button>
        </div>
      </div>

      {showReplace && (
        <ReplaceExerciseModal
          sessionId={sessionId}
          seId={ex.id}
          currentExerciseId={ex.exercise_id}
          onClose={() => setShowReplace(false)}
          reload={reload}
        />
      )}
    </div>
  );
}

function SetRow({ sessionId, set, onSaved, showCols, targets }) {
  // showCols = {kg, time, mileage, rep} — boolean. At least one is always true.
  // targets = optional { target_time_s, target_mileage_m } (from SE level) to
  // visually highlight cells that have a goal.
  const [w, setW] = useState(set.weight_kg ?? '');
  const [r, setR] = useState(set.reps_done ?? '');
  const [tStr, setTStr] = useState(set.time_seconds != null ? fmtDuration(set.time_seconds) : '');
  const [mStr, setMStr] = useState(set.mileage_m != null ? String(set.mileage_m) : '');

  useEffect(() => {
    setW(set.weight_kg ?? '');
    setR(set.reps_done ?? '');
    setTStr(set.time_seconds != null ? fmtDuration(set.time_seconds) : '');
    setMStr(set.mileage_m != null ? String(set.mileage_m) : '');
  }, [set.id, set.weight_kg, set.reps_done, set.time_seconds, set.mileage_m]);

  function parseW(val) {
    if (val === '' || val == null) return null;
    const n = parseFloat(String(val).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  async function patch(body, kind, extra) {
    await api.put(`/sessions/${sessionId}/sets/${set.id}`, body);
    if (onSaved) await onSaved({ kind, ...extra });
  }

  async function saveKg() {
    const newW = parseW(w);
    await patch({
      weight_kg: newW,
      reps_done: r === '' ? null : parseInt(r, 10),
    }, 'kg', { newW });
  }
  async function saveReps() {
    await patch({
      weight_kg: parseW(w),
      reps_done: r === '' ? null : parseInt(r, 10),
    }, 'rep');
  }
  async function saveTime() {
    const sec = parseDuration(tStr);
    await patch({ time_seconds: sec }, 'time');
  }
  async function saveMileage() {
    const m = mStr === '' ? null : parseInt(mStr, 10);
    await patch({ mileage_m: Number.isFinite(m) ? m : null }, 'mileage');
  }
  async function del() {
    if (!confirm('Delete this set?')) return;
    await api.del(`/sessions/${sessionId}/sets/${set.id}`);
    if (onSaved) await onSaved({ kind: 'del' });
  }

  function selectAll(e) {
    const el = e.target;
    requestAnimationFrame(() => {
      try { el.setSelectionRange(0, el.value.length); }
      catch { el.select?.(); }
    });
  }

  // Quick add: bump kg by ±2.5
  function bumpKg(delta) {
    const cur = parseW(w) ?? 0;
    const next = Math.max(0, +(cur + delta).toFixed(2));
    setW(String(next));
    // Save eagerly so cascade fires consistently.
    api.put(`/sessions/${sessionId}/sets/${set.id}`, {
      weight_kg: next,
      reps_done: r === '' ? null : parseInt(r, 10),
    }).then(() => onSaved && onSaved({ kind: 'kg', newW: next }));
  }

  const hasTimeOrMileage = showCols?.time || showCols?.mileage;

  return (
    <div className="set-row-wrap">
      <div className="set-row">
        <div className="set-num">{set.set_number}</div>
        {showCols?.kg && (
          <div className="set-kg-wrap">
            <button className="kg-bump" onClick={() => bumpKg(-2.5)} title="-2.5 kg">−</button>
            <input
              type="text"
              inputMode="decimal"
              value={w}
              onFocus={selectAll}
              onChange={(e) => setW(e.target.value.replace(/[^0-9.,]/g, ''))}
              onBlur={saveKg}
              placeholder="-"
            />
            <button className="kg-bump" onClick={() => bumpKg(2.5)} title="+2.5 kg">+</button>
          </div>
        )}
        {showCols?.rep && (
          <input
            type="text"
            inputMode="numeric"
            className={targets?.target_reps ? 'has-target' : ''}
            value={r}
            onFocus={selectAll}
            onChange={(e) => setR(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={saveReps}
            placeholder="-"
          />
        )}
        <button className="del" onClick={del}>×</button>
      </div>
      {hasTimeOrMileage && (
        <div className="set-row set-row--time">
          <div className="set-num" style={{ visibility: 'hidden' }}>{set.set_number}</div>
          {showCols?.time ? (
            <input
              type="text"
              inputMode="numeric"
              className={`time-input${targets?.target_time_s ? ' has-target' : ''}`}
              value={tStr}
              onFocus={selectAll}
              onChange={(e) => setTStr(e.target.value.replace(/[^0-9:]/g, ''))}
              onBlur={saveTime}
              placeholder="HH:MM:SS"
            />
          ) : <div />}
          {showCols?.mileage ? (
            <input
              type="text"
              inputMode="numeric"
              className={`mileage-input${targets?.target_mileage_m ? ' has-target' : ''}`}
              value={mStr}
              onFocus={selectAll}
              onChange={(e) => setMStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={saveMileage}
              placeholder="metres"
            />
          ) : <div />}
          <div />
        </div>
      )}
    </div>
  );
}

function AddExerciseModal({ sessionId, onClose, reload }) {
  const [roster, setRoster] = useState([]);
  const [groups, setGroups] = useState([]);
  const [q, setQ] = useState('');
  const [targetSets, setTargetSets] = useState(3);
  const [targetReps, setTargetReps] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [targetMileage, setTargetMileage] = useState('');
  const [newExGroup, setNewExGroup] = useState('');

  useEffect(() => {
    api.get('/exercises').then(setRoster).catch(() => {});
    api.get('/groups').then(setGroups).catch(() => {});
  }, []);

  const filtered = roster.filter((e) =>
    e.name.toLowerCase().includes(q.toLowerCase())
  );

  // Group the filtered roster by group_name for display.
  const grouped = filtered.reduce((acc, e) => {
    const k = e.group_name || 'Ungrouped';
    if (!acc[k]) acc[k] = [];
    acc[k].push(e);
    return acc;
  }, {});

  async function add(exerciseId) {
    await api.post(`/sessions/${sessionId}/exercises`, {
      exercise_id: exerciseId,
      target_sets: targetSets,
      target_reps: targetReps,
      target_time_s:    parseDuration(targetTime),
      target_mileage_m: targetMileage === '' ? null : (parseInt(targetMileage, 10) || null),
    });
    reload();
    onClose();
  }

  async function createAndAdd() {
    if (!q.trim()) return;
    const body = { name: q.trim() };
    if (newExGroup) body.group_id = +newExGroup;
    const ex = await api.post('/exercises', body);
    await add(ex.id);
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal--search" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sticky">
          <h3>Add exercise</h3>
          <div className="field" style={{ marginBottom: 10 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search or type a new one…"
              autoFocus
            />
          </div>
          <div className="row" style={{ marginBottom: 6 }}>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Sets</label>
              <input type="number" value={targetSets} onChange={(e) => setTargetSets(+e.target.value)} />
            </div>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Rep range</label>
              <input value={targetReps} onChange={(e) => setTargetReps(e.target.value)} placeholder="6-10" />
            </div>
          </div>
          <div className="row" style={{ marginBottom: 0 }}>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Target time</label>
              <input
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value.replace(/[^0-9:]/g, ''))}
                placeholder="HH:MM:SS"
              />
            </div>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Target distance (m)</label>
              <input
                type="text"
                inputMode="numeric"
                value={targetMileage}
                onChange={(e) => setTargetMileage(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="2400"
              />
            </div>
          </div>
        </div>
        <div className="modal-scroll">
          {filtered.length === 0 && q.trim() ? (
            <>
              {groups.length > 0 && (
                <div className="field" style={{ marginBottom: 8 }}>
                  <label className="small" style={{ color: 'var(--ink-soft)' }}>Add new exercise to group (optional)</label>
                  <select value={newExGroup} onChange={(e) => setNewExGroup(e.target.value)}>
                    <option value="">— Ungrouped —</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}
              <button className="btn primary" onClick={createAndAdd}>+ Create "{q}" and add</button>
            </>
          ) : (
            Object.entries(grouped).map(([groupName, list]) => (
              <div key={groupName}>
                <div className="small text-muted" style={{ padding: '6px 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {groupName}
                </div>
                {list.map((e) => (
                  <div className="list-row" key={e.id} onClick={() => add(e.id)}>
                    <div className="meta"><span>💪</span> {e.name}</div>
                    <span style={{ color: 'var(--gray)' }}>+</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
        <button className="btn ghost mt-1" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

const COLORS = ['#FFB07A','#7AC4FF','#9CD879','#FF7A9C','#C49CFF','#FFD06B','#5BC5C5','#FF8C61','#A28DFE','#FFA8A8'];

function ReplaceExerciseModal({ sessionId, seId, currentExerciseId, onClose, reload }) {
  const [roster, setRoster] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/exercises').then(setRoster).catch(() => {});
  }, []);

  const filtered = roster
    .filter((e) => e.id !== currentExerciseId)
    .filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));

  async function pick(exerciseId) {
    await api.post(`/sessions/${sessionId}/exercises/${seId}/replace`, { exercise_id: exerciseId });
    reload();
    onClose();
  }

  async function createAndPick() {
    if (!q.trim()) return;
    const ex = await api.post('/exercises', { name: q.trim() });
    await pick(ex.id);
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal--search" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sticky">
          <h3>Replace exercise</h3>
          <div className="field" style={{ marginBottom: 0 }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search or type a new one…"
              autoFocus
            />
          </div>
        </div>
        <div className="modal-scroll">
          {filtered.length === 0 && q.trim() ? (
            <button className="btn primary" onClick={createAndPick}>+ Create "{q}" and replace</button>
          ) : (
            filtered.map((e) => (
              <div className="list-row" key={e.id} onClick={() => pick(e.id)}>
                <div className="meta"><span>💪</span> {e.name}</div>
                <span style={{ color: 'var(--gray)' }}>⇄</span>
              </div>
            ))
          )}
        </div>
        <button className="btn ghost mt-1" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function SaveAsTemplateModal({ sessionId, defaultName, onClose, reload }) {
  const [name, setName] = useState(defaultName);
  const [color, setColor] = useState(COLORS[0]);

  async function save() {
    if (!name.trim()) return;
    await api.post(`/sessions/${sessionId}/save-as-template`, { name: name.trim(), color });
    reload();
    onClose();
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Save as template</h3>
        <div className="field">
          <label>Template name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Color</label>
          <div className="color-picker">
            {COLORS.map((c) => (
              <button
                key={c}
                className={color === c ? 'selected' : ''}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="color-row">
            <span className="color-preview" style={{ background: color }} />
            <input
              type="color"
              className="color-wheel"
              value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#FFB07A'}
              onChange={(e) => setColor(e.target.value)}
              title="Pick any color"
            />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#hex"
            />
          </div>
        </div>
        <button className="btn primary" onClick={save}>Save</button>
        <button className="btn ghost mt-1" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
