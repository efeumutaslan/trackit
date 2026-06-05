import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';
import Icon, { MOOD_ICON } from '../components/Icon.jsx';

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
  const [, setTick] = useState(0); // forces a re-render each second while timer runs
  // User-level preferences (sound, vibration, rep-input behaviour). Loaded
  // once for the page; cached and passed down to every ExerciseBlock.
  const [settings, setSettings] = useState({
    rep_placeholder_mode: 'empty',
    rest_timer_sound: 1,
    rest_timer_vibrate: 1,
  });
  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
  }, []);

  const load = useCallback(() => {
    api.get(`/sessions/${id}`).then(setS).catch(() => nav('/sessions'));
  }, [id, nav]);

  useEffect(() => { load(); }, [load]);

  // Tick to redraw the countdown each second. Using a separate counter
  // because setRestEnd(v => v) bails out (React skips re-renders when the
  // returned value is the same reference).
  useEffect(() => {
    if (!restEnd) return undefined;
    const t = setInterval(() => {
      if (Date.now() >= restEnd) {
        // Beep only if the user has sound enabled in settings.
        if (settings.rest_timer_sound) {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.frequency.value = 880; g.gain.value = 0.25;
            o.start(); o.stop(ctx.currentTime + 0.25);
          } catch { /* audio unavailable */ }
        }
        if (settings.rest_timer_vibrate && navigator.vibrate) {
          navigator.vibrate([200, 100, 200]);
        }
        setRestEnd(null);
      } else {
        setTick((n) => n + 1);
      }
    }, 250);
    return () => clearInterval(t);
  }, [restEnd, settings.rest_timer_sound, settings.rest_timer_vibrate]);

  function startRest(seconds) {
    if (!seconds || seconds <= 0) return;
    setRestTotal(seconds);
    setRestEnd(Date.now() + seconds * 1000);
  }
  function cancelRest() { setRestEnd(null); }

  if (!s) return <div className="app-shell page-session"><TopBar back brand /></div>;

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

  // Compute the rest timer's remaining seconds & matching colour band.
  // The colour drives a class on the topbar so the entire banner flashes
  // green / amber / red depending on how much time is left.
  const restRemainingSec = restEnd
    ? Math.max(0, Math.ceil((restEnd - Date.now()) / 1000))
    : 0;
  let restClass = '';
  if (restEnd) {
    if (restRemainingSec <= 10)      restClass = 'topbar--rest-red';
    else if (restRemainingSec <= 30) restClass = 'topbar--rest-amber';
    else                             restClass = 'topbar--rest-green';
  }

  return (
    <div className="app-shell page-session">
      <TopBar
        back
        className={restClass}
        title={
          restEnd
            // Replace the template name with a live countdown while the
            // rest timer is running. ⏱ + remaining seconds.
            ? `Rest: ${restRemainingSec}s`
            : (s.template_name || 'Session')
        }
        right={
          <button className="right-action" onClick={delSession} style={{ color: 'var(--red)' }}>Delete</button>
        }
      />
      <div className="content session-layout">
        <div
          className={`card session-meta${s.finished_at ? ' is-finished' : ''}`}
          style={{ borderLeft: `4px solid ${s.template_color || '#FFB07A'}` }}
          data-region="meta"
        >
          <div className="field">
            <label>Date</label>
            <input
              type="date"
              value={s.session_date}
              onChange={(e) => saveMeta({ session_date: e.target.value })}
            />
          </div>

          {/* Display mode toggle now lives next to the Exercises section
              title — see below. The dedicated row here was removed. */}
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
              <Icon name="stopwatch" /> Start: {s.started_at ? fmtTime(s.started_at) : 'Begin'}
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
              <Icon name="flag-checkered" /> Finish: {s.finished_at ? fmtTime(s.finished_at) : 'End'}
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

          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label>Workout notes</label>
            <textarea
              value={s.workout_notes || ''}
              onChange={(e) => setS((cur) => ({ ...cur, workout_notes: e.target.value }))}
              onBlur={() => saveMeta({ workout_notes: s.workout_notes })}
              placeholder="Notes about this workout…"
            />
          </div>
        </div>

        {s.prev_workout_notes && (
          <div className="prev-note-card" data-region="prev-note">
            <div className="prev-note-head">
              <span className="prev-note-icon"><Icon name="scroll" /></span>
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

        <div data-region="exercises">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Exercises</span>
            {/* Expandable / Fixed lives here now. When on, exercise cards
                collapse to their head until tapped; when off, every card
                is always open. The choice persists on the session row. */}
            <button
              className={`expand-toggle${s.expand_mode !== 'fixed' ? ' on' : ''}`}
              onClick={() => saveMeta({ expand_mode: s.expand_mode === 'fixed' ? 'expandable' : 'fixed' })}
              title="Tap exercise cards to expand"
            >
              {s.expand_mode === 'fixed' ? 'Fixed' : 'Expandable'}
            </button>
          </div>
          {s.exercises.map((ex, idx) => {
            // A run of consecutive exercises sharing the same superset_tag
            // forms a visual cluster — the first card has rounded top, the
            // last has rounded bottom, the middle ones are flush. Empty
            // tags ('' or null) never cluster, even with each other.
            const tag = ex.superset_tag || '';
            const prevTag = idx > 0 ? (s.exercises[idx - 1].superset_tag || '') : '';
            const nextTag = idx < s.exercises.length - 1
              ? (s.exercises[idx + 1].superset_tag || '')
              : '';
            let supersetPos = 'none';
            if (tag) {
              const inRun = (t1, t2) => t1 && t2 && t1 === t2;
              const startsRun = inRun(tag, nextTag) && !inRun(tag, prevTag);
              const endsRun   = inRun(tag, prevTag) && !inRun(tag, nextTag);
              const midRun    = inRun(tag, prevTag) && inRun(tag, nextTag);
              if (startsRun)      supersetPos = 'top';
              else if (midRun)    supersetPos = 'mid';
              else if (endsRun)   supersetPos = 'bot';
            }
            return (
              <ExerciseBlock
                key={ex.id}
                sessionId={s.id}
                ex={ex}
                reload={load}
                sessionDate={s.session_date}
                onAfterRestSet={startRest}
                expandMode={s.expand_mode || 'expandable'}
                settings={settings}
                supersetPos={supersetPos}
              />
            );
          })}

          <button className="btn mt-1" onClick={() => setShowAddEx(true)}>+ Add exercise</button>
        </div>

        <div data-region="template-actions">
          <div className="section-title">Template</div>
          {s.template_id ? (
            <button className="btn ghost" onClick={async () => {
              if (!confirm('Apply changes from this session to the template? (Past workouts are unaffected)')) return;
              await api.post(`/sessions/${id}/update-template`);
              alert('Template updated');
            }}><Icon name="refresh" /> Update this template</button>
        ) : null}
        <button className="btn ghost mt-1" onClick={() => setShowSaveTmpl(true)}><Icon name="save" /> Save as template</button>
        </div>

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
            <Icon name="stopwatch" /> Rest: {Math.max(0, Math.ceil((restEnd - Date.now()) / 1000))}s
          </div>
          <button className="rest-timer__skip" onClick={cancelRest}>Skip</button>
        </div>
      )}
    </div>
  );
}

function ExerciseBlock({ sessionId, ex, reload, sessionDate, onAfterRestSet,
                        expandMode, settings, supersetPos }) {
  const [notes, setNotes] = useState(ex.exercise_notes || '');
  const [adjust, setAdjust] = useState(ex.weight_adjust || '');
  const [targetReps, setTargetReps] = useState(ex.target_reps || '');
  const [targetTime, setTargetTime] = useState(ex.target_time_s ? fmtDuration(ex.target_time_s) : '');
  const [targetMileage, setTargetMileage] = useState(ex.target_mileage_m != null ? String(ex.target_mileage_m) : '');
  const [supersetTag, setSupersetTag] = useState(ex.superset_tag || '');
  const [restSecs, setRestSecs] = useState(ex.rest_seconds ?? '');
  const [showReplace, setShowReplace] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  // When the active side flips (A↔B) the parent reloads and sends a new
  // ex prop with the active side's notes / adjust. The local state was
  // initialised only on mount, so it would otherwise still show the
  // previous side's note. Re-sync every time alt_active changes.
  useEffect(() => {
    setNotes(ex.exercise_notes || '');
    setAdjust(ex.weight_adjust || '');
  }, [ex.alt_active, ex.exercise_notes, ex.weight_adjust]);

  // Accordion: in 'expandable' mode the card starts collapsed and only
  // shows the head. In 'fixed' mode it's always open. Per-card local state
  // so the user can open/close individually within an expandable session.
  const [expanded, setExpanded] = useState(expandMode === 'fixed');
  // When the session-level mode flips (Fixed ⇄ Expandable), reset every
  // card's expansion state immediately. Without this the local 'expanded'
  // stays stale and the cards look unchanged until the user reopens the
  // session.
  useEffect(() => {
    setExpanded(expandMode === 'fixed');
  }, [expandMode]);
  const isCollapsed = expandMode === 'expandable' && !expanded;

  // A/B alternate exercise — show the name of whichever one is currently
  // active (primary or alt). User toggles via the A|B segmented control.
  const hasAlt = !!ex.alt_exercise_id && !!ex.alt_exercise_name;
  const activeName = (hasAlt && ex.alt_active)
    ? ex.alt_exercise_name
    : ex.exercise_name;

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
    (ex.prev_weight_adjust === 'up'   ? ' exercise-block--prev-up'   : '') +
    (ex.prev_weight_adjust === 'down' ? ' exercise-block--prev-down' : '') +
    (supersetPos === 'top' ? ' superset-top' :
     supersetPos === 'mid' ? ' superset-mid' :
     supersetPos === 'bot' ? ' superset-bot' : '') +
    (isCollapsed ? ' is-collapsed' : '');

  // For the header summary line shown when the card is collapsed (gives
  // the user a glance at sets x reps @ weight without expanding).
  const summary = (() => {
    const reps = ex.sets.map((st) => st.reps_done).filter((x) => x != null);
    const ws   = ex.sets.map((st) => st.weight_kg).filter((x) => x != null);
    if (!reps.length && !ws.length) return null;
    const repsTxt = reps.length ? reps.join(' / ') : '–';
    const wMin = ws.length ? Math.min(...ws) : null;
    const wMax = ws.length ? Math.max(...ws) : null;
    const wTxt = ws.length
      ? (wMin === wMax ? `${wMin} kg` : `${wMin}–${wMax} kg`)
      : '';
    return `${repsTxt}${wTxt ? '  @  ' + wTxt : ''}`;
  })();

  return (
    <div className={cardClass}>
      <div
        className="exercise-head"
        onClick={(e) => {
          // Clicking the head toggles only when in expandable mode and
          // not clicking on an action button.
          if (expandMode !== 'expandable') return;
          if (e.target.closest('button')) return;
          setExpanded((v) => !v);
        }}
        style={{ cursor: expandMode === 'expandable' ? 'pointer' : 'default' }}
      >
        {/* Top row: exercise name on the left, move / replace / delete on the right */}
        <div className="exercise-head__top">
          <div className="exercise-head__name-wrap">
            <h4 className="exercise-head__name">
              {ex.superset_tag && <span className="superset-badge">{ex.superset_tag}</span>}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeName}</span>
            </h4>
            {isCollapsed && summary && (
              <div className="small text-muted exercise-head__summary">{summary}</div>
            )}
          </div>
          <div className="exercise-head__actions">
            <button className="btn tiny ghost" onClick={() => move('up')} title="Move up"><Icon name="arrow-up" /></button>
            <button className="btn tiny ghost" onClick={() => move('down')} title="Move down"><Icon name="arrow-down" /></button>
            <button className="btn tiny ghost" onClick={() => setShowReplace(true)} title="Replace exercise"><Icon name="swap" /></button>
            <button className="btn tiny ghost" onClick={delEx} title="Remove"><Icon name="xmark" /></button>
          </div>
        </div>
        {/* Bottom row: A/B toggle + settings cog. Always renders even when
            there is no alternate so the cog has a stable home. */}
        <div className="exercise-head__bottom" onClick={(e) => e.stopPropagation()}>
          {hasAlt ? (
            <span className="alt-toggle">
              <button
                className={`alt-toggle__btn${!ex.alt_active ? ' on' : ''}`}
                onClick={() => api.put(`/sessions/${sessionId}/exercises/${ex.id}`, { alt_active: 0 }).then(reload)}
                title={ex.exercise_name}
              >A</button>
              <button
                className={`alt-toggle__btn${ex.alt_active ? ' on' : ''}`}
                onClick={() => api.put(`/sessions/${sessionId}/exercises/${ex.id}`, { alt_active: 1 }).then(reload)}
                title={ex.alt_exercise_name}
              >B</button>
            </span>
          ) : <span />}
          <button
            className="btn tiny ghost"
            onClick={() => {
              if (expandMode === 'expandable' && !expanded) setExpanded(true);
              setShowTargets((v) => !v);
            }}
            title="Targets / superset / rest"
          ><Icon name="gear" /></button>
        </div>
      </div>

      {/* Body — hidden when card is collapsed (CSS handles it) */}
      <div className="exercise-body">
        {/* Previous exercise note — placed right below the exercise name */}
        {ex.prev_exercise_notes && (
          <div className="prev-note-card prev-note-card--sm" style={{ marginBottom: 10 }}>
            <div className="prev-note-head">
              <span className="prev-note-icon"><Icon name="scroll" /></span>
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
            <div className="row mb-1">
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
            <AltExerciseInline
              sessionId={sessionId}
              seId={ex.id}
              currentExerciseId={ex.exercise_id}
              currentAltId={ex.alt_exercise_id}
              currentAltName={ex.alt_exercise_name}
              reload={reload}
            />
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
            prevReps={Array.isArray(ex.prev_set_reps) ? ex.prev_set_reps[idx] : null}
            prevTime={Array.isArray(ex.prev_set_times) ? ex.prev_set_times[idx] : null}
            prevMileage={Array.isArray(ex.prev_set_mileages) ? ex.prev_set_mileages[idx] : null}
            repPlaceholderMode={settings?.rep_placeholder_mode || 'empty'}
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
            ><Icon name="caret-up" /></button>
            <button
              className={`adjust-btn adjust-down${adjust === 'down' ? ' pressed' : ''}`}
              onClick={() => setAdjustValue('down')}
              title="Plan to back off next time"
            ><Icon name="caret-down" /></button>
          </div>
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

// Inline picker for the A/B alternate exercise — lives inside the ⚙
// targets panel. A small searchable list; selecting an exercise sets
// alt_exercise_id and reloads. Clearing it removes the alternate.
function AltExerciseInline({ sessionId, seId, currentExerciseId, currentAltId, currentAltName, reload }) {
  const [roster, setRoster] = useState([]);
  const [q, setQ] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (pickerOpen) api.get('/exercises').then(setRoster).catch(() => {});
  }, [pickerOpen]);

  const normalize = (s) =>
    (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const nq = normalize(q);
  const filtered = roster
    .filter((e) => e.id !== currentExerciseId)
    .filter((e) => normalize(e.name).includes(nq))
    .slice(0, 8);

  async function pick(id) {
    await api.put(`/sessions/${sessionId}/exercises/${seId}`, { alt_exercise_id: id });
    setPickerOpen(false);
    setQ('');
    reload();
  }
  async function clearAlt() {
    await api.put(`/sessions/${sessionId}/exercises/${seId}`, { alt_exercise_id: null, alt_active: 0 });
    reload();
  }

  return (
    <div className="alt-picker">
      <label className="small" style={{ color: 'var(--ink-soft)' }}>Alternate exercise (B)</label>
      {currentAltId && !pickerOpen ? (
        <div className="row" style={{ alignItems: 'center' }}>
          <div className="alt-current"><Icon name="dumbbell" /> {currentAltName}</div>
          <button className="btn tiny ghost" onClick={() => setPickerOpen(true)}>Change</button>
          <button className="btn tiny ghost" onClick={clearAlt}>Remove</button>
        </div>
      ) : pickerOpen ? (
        <div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            autoFocus
          />
          <div className="alt-picker__list">
            {filtered.map((e) => (
              <div key={e.id} className="alt-picker__row" onClick={() => pick(e.id)}>
                <span><Icon name="dumbbell" /> {e.name}</span>
                <span style={{ color: 'var(--gray)' }}>+</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="small text-muted" style={{ padding: 8 }}>No matches</div>
            )}
          </div>
          <button className="btn tiny ghost mt-1" onClick={() => { setPickerOpen(false); setQ(''); }}>Cancel</button>
        </div>
      ) : (
        <button className="btn ghost tiny" onClick={() => setPickerOpen(true)}>+ Add an alternate</button>
      )}
    </div>
  );
}

function SetRow({ sessionId, set, onSaved, showCols, targets, prevReps, prevTime, prevMileage, repPlaceholderMode }) {
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
            className={
              (targets?.target_reps ? 'has-target' : '') +
              ((repPlaceholderMode === 'previous' && prevReps != null && r === '') ? ' has-prev-hint' : '')
            }
            value={r}
            onFocus={selectAll}
            onChange={(e) => setR(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={saveReps}
            placeholder={
              repPlaceholderMode === 'previous' && prevReps != null
                ? String(prevReps)
                : '-'
            }
          />
        )}
        <button className="del" onClick={del}>×</button>
      </div>
      {hasTimeOrMileage && (
        <div className="set-row set-row--time">
          <div className="set-num" style={{ visibility: 'hidden' }}>{set.set_number}</div>
          {showCols?.time ? (
            <TimeDropdown
              value={set.time_seconds}
              prev={prevTime}
              onCommit={async (sec) => {
                await api.put(`/sessions/${sessionId}/sets/${set.id}`, { time_seconds: sec });
                if (onSaved) await onSaved({ kind: 'time' });
              }}
            />
          ) : <div />}
          {showCols?.mileage ? (
            <input
              type="text"
              inputMode="numeric"
              className="mileage-input"
              value={mStr}
              onFocus={selectAll}
              onChange={(e) => setMStr(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={saveMileage}
              placeholder={prevMileage != null ? String(prevMileage) : 'metres'}
            />
          ) : <div />}
          <div />
        </div>
      )}
    </div>
  );
}

// Time input as three dropdowns (HH / MM / SS). Up to 23:59:59. Lets the
// user pick a duration with thumb-friendly selects instead of typing a
// raw HH:MM:SS string. If `prev` is provided (previous session's time),
// the dropdowns start at that value as a placeholder cue — but we render
// it as a small inline hint above so the user can see the prior value.
function TimeDropdown({ value, prev, onCommit }) {
  const init = (sec) => {
    const s = sec ?? 0;
    return {
      h: Math.floor(s / 3600),
      m: Math.floor((s % 3600) / 60),
      s: s % 60,
    };
  };
  const [hms, setHms] = useState(init(value));
  useEffect(() => { setHms(init(value)); }, [value]);

  const set = (key, v) => {
    const next = { ...hms, [key]: parseInt(v, 10) || 0 };
    setHms(next);
    onCommit(next.h * 3600 + next.m * 60 + next.s);
  };

  const opts = (max) => {
    const out = [];
    for (let i = 0; i <= max; i++) out.push(<option key={i} value={i}>{String(i).padStart(2,'0')}</option>);
    return out;
  };

  // Prior value rendered as a faint hint next to the dropdowns when the
  // current set has no value of its own yet (so we don't shout it once
  // they've started filling in).
  const showPrev = (value == null) && (prev != null && prev > 0);
  const prevFmt = (() => {
    if (!showPrev) return null;
    const h = Math.floor(prev / 3600);
    const m = Math.floor((prev % 3600) / 60);
    const s = prev % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  })();

  return (
    <div className="time-dropdown">
      <select value={hms.h} onChange={(e) => set('h', e.target.value)} aria-label="Hours">
        {opts(23)}
      </select>
      <span className="time-sep">:</span>
      <select value={hms.m} onChange={(e) => set('m', e.target.value)} aria-label="Minutes">
        {opts(59)}
      </select>
      <span className="time-sep">:</span>
      <select value={hms.s} onChange={(e) => set('s', e.target.value)} aria-label="Seconds">
        {opts(59)}
      </select>
      {showPrev && <span className="time-prev-hint" title="Previous">{prevFmt}</span>}
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

  // Accent- and case-insensitive search. "kurek" matches "Kürek Çekme",
  // "GOKDELEN" matches "gökdelen", etc.
  const normalize = (s) =>
    (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const nq = normalize(q);
  const filtered = roster.filter((e) => normalize(e.name).includes(nq));
  // An exact name match means the user is just searching the existing
  // entry — no point offering to "+ Create" a duplicate.
  const exactMatch = roster.some((e) => normalize(e.name) === nq && nq !== '');

  // Group the filtered roster by group_name for display.
  const grouped = filtered.reduce((acc, e) => {
    const k = e.group_name || 'Ungrouped';
    if (!acc[k]) acc[k] = [];
    acc[k].push(e);
    return acc;
  }, {});

  // Allow creating a new group inline without leaving the modal.
  async function createGroupInline() {
    const name = prompt('New group name:');
    if (!name || !name.trim()) return;
    try {
      const g = await api.post('/groups', { name: name.trim() });
      const list = await api.get('/groups');
      setGroups(list);
      setNewExGroup(String(g.id));
    } catch (e) { alert(e.message || String(e)); }
  }

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
          {/* Existing roster — searchable, grouped */}
          {Object.entries(grouped).map(([groupName, list]) => (
            <div key={groupName}>
              <div className="small text-muted" style={{ padding: '6px 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {groupName}
              </div>
              {list.map((e) => (
                <div className="list-row" key={e.id} onClick={() => add(e.id)}>
                  <div className="meta"><span><Icon name="dumbbell" /></span> {e.name}</div>
                  <span style={{ color: 'var(--gray)' }}>+</span>
                </div>
              ))}
            </div>
          ))}

          {/* Always offer to create a new exercise as long as the typed name
              doesn't exactly match an existing one. Earlier we hid this
              whenever the search returned any match (e.g. "kürek" matched
              "Kürek Çekme"), making it impossible to add a shorter-named
              new exercise. */}
          {q.trim() && !exactMatch && (
            <div className="card mt-2" style={{ background: 'var(--peach-bg)' }}>
              <div className="small text-muted" style={{ marginBottom: 8 }}>Create a new exercise</div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label className="small" style={{ color: 'var(--ink-soft)' }}>Group (optional)</label>
                <select
                  value={newExGroup}
                  onChange={(e) => {
                    if (e.target.value === '__new__') { createGroupInline(); return; }
                    setNewExGroup(e.target.value);
                  }}
                >
                  <option value="">— Ungrouped —</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  <option value="__new__">+ New group…</option>
                </select>
              </div>
              <button className="btn primary" onClick={createAndAdd}>+ Create "{q.trim()}" and add</button>
            </div>
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

  // Accent- / case-insensitive search (see AddExerciseModal).
  const normalize = (s) =>
    (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const nq = normalize(q);
  const filtered = roster
    .filter((e) => e.id !== currentExerciseId)
    .filter((e) => normalize(e.name).includes(nq));

  // An exact match means user is just looking at the current entry —
  // don't offer to "+ Create" a duplicate.
  const exactMatch = roster.some((e) => normalize(e.name) === nq && nq !== '');

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
          {filtered.map((e) => (
            <div className="list-row" key={e.id} onClick={() => pick(e.id)}>
              <div className="meta"><span><Icon name="dumbbell" /></span> {e.name}</div>
              <span style={{ color: 'var(--gray)' }}><Icon name="swap" /></span>
            </div>
          ))}
          {q.trim() && !exactMatch && (
            <button className="btn primary mt-2" onClick={createAndPick}>+ Create "{q.trim()}" and replace</button>
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
