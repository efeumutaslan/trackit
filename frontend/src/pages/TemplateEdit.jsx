import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { useNavGuard } from '../lib/navguard.jsx';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

const COLORS = ['#FFB07A','#7AC4FF','#9CD879','#FF7A9C','#C49CFF','#FFD06B','#5BC5C5','#FF8C61','#A28DFE','#FFA8A8','#6FCBA4','#E8A87C'];

// Helpers — kept module-scoped so the AddExerciseModal at the bottom and
// the per-row inputs above can share them.
function fmtDurationLocal(seconds) {
  if (seconds == null || seconds === '') return '';
  const s = Math.max(0, Math.floor(Number(seconds)));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
function parseDurationLocal(s) {
  if (s == null || String(s).trim() === '') return null;
  const txt = String(s).replace(/[^0-9:]/g, '').trim();
  if (!txt) return null;
  if (!txt.includes(':')) {
    const n = parseInt(txt, 10);
    return Number.isFinite(n) ? n : null;
  }
  const parts = txt.split(':').map((p) => parseInt(p, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// Accent- and case-insensitive normalizer shared by all the pickers.
const normalize = (s) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Serialize the editable state so dirty-checking is a string compare.
function snapshot(name, color, exercises) {
  return JSON.stringify({
    name: name.trim(),
    color,
    exercises: exercises.map((e) => ({
      exercise_id: e.exercise_id,
      target_sets: e.target_sets,
      target_reps: e.target_reps,
      target_time_s: e.target_time_s ?? null,
      target_mileage_m: e.target_mileage_m ?? null,
      alt_exercise_id: e.alt_exercise_id ?? null,
      superset_tag: e.superset_tag ?? '',
      rest_seconds: e.rest_seconds ?? null,
    })),
  });
}

export default function TemplateEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [exercises, setExercises] = useState([]);
  const [roster, setRoster] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [replaceIdx, setReplaceIdx] = useState(null); // index being replaced
  const [showLeave, setShowLeave] = useState(false);  // Save / Discard prompt
  const [saveState, setSaveState] = useState('idle'); // idle | saving | saved | error
  // Where to go after the Save/Discard prompt resolves. null => back to
  // /templates (the back-button case); a function => run it (nav-guard).
  const pendingNavRef = useRef(null);
  const { setGuard, clearGuard } = useNavGuard();

  // The template id we are persisting to. For an existing template it's
  // the route param; for a brand-new one it gets filled the moment
  // auto-save creates the row.
  const tmplIdRef = useRef(isNew ? null : +id);
  // What's currently on the server (string snapshot). Dirty = differs.
  const savedSnapRef = useRef(snapshot('', COLORS[0], []));
  const loadedRef = useRef(false);

  useEffect(() => {
    api.get('/exercises').then(setRoster);
    if (!isNew) {
      api.get(`/templates/${id}`).then((t) => {
        setName(t.name);
        setColor(t.color);
        const exs = t.exercises.map((e) => ({
          exercise_id: e.exercise_id,
          exercise_name: e.exercise_name,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
          target_time_s:    e.target_time_s    ?? null,
          target_mileage_m: e.target_mileage_m ?? null,
          alt_exercise_id:  e.alt_exercise_id  ?? null,
          superset_tag:     e.superset_tag     ?? '',
          rest_seconds:     e.rest_seconds     ?? null,
        }));
        setExercises(exs);
        savedSnapRef.current = snapshot(t.name, t.color, exs);
        loadedRef.current = true;
      });
    } else {
      loadedRef.current = true;
    }
  }, [id, isNew]);

  const currentSnap = useMemo(() => snapshot(name, color, exercises), [name, color, exercises]);
  const dirty = loadedRef.current && currentSnap !== savedSnapRef.current;

  const buildPayload = useCallback(() => ({
    name: name.trim(),
    color,
    exercises: exercises.map((e) => ({
      exercise_id: e.exercise_id,
      target_sets: e.target_sets,
      target_reps: e.target_reps,
      target_time_s: e.target_time_s ?? null,
      target_mileage_m: e.target_mileage_m ?? null,
      alt_exercise_id: e.alt_exercise_id ?? null,
      superset_tag: e.superset_tag ?? '',
      rest_seconds: e.rest_seconds ?? null,
    })),
  }), [name, color, exercises]);

  // Persist the current state. Creates the template on first save when
  // the editor was opened as /templates/new.
  const persist = useCallback(async () => {
    if (!name.trim()) return false;       // can't save a nameless template
    setSaveState('saving');
    try {
      const payload = buildPayload();
      if (!tmplIdRef.current) {
        const t = await api.post('/templates', payload);
        tmplIdRef.current = t.id;
        await api.put(`/templates/${t.id}`, payload);
      } else {
        await api.put(`/templates/${tmplIdRef.current}`, payload);
      }
      savedSnapRef.current = snapshot(name, color, exercises);
      setSaveState('saved');
      return true;
    } catch (e) {
      setSaveState('error');
      return false;
    }
  }, [name, color, exercises, buildPayload]);

  // ── Auto-save ──
  // Debounced autosave — ONLY for brand-new templates. While creating a
  // template the first valid name triggers a create and subsequent edits
  // are saved automatically. For an EXISTING template we deliberately do
  // NOT autosave: changes are kept locally and only committed when the
  // user confirms via the "Do you want to save changes?" prompt on back
  // (or are discarded). This prevents half-finished edits to an
  // established template from being persisted silently.
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    if (!isNew) return undefined;            // existing templates: no autosave
    if (!dirty || !name.trim()) return undefined;
    const t = setTimeout(() => { persistRef.current(); }, 800);
    return () => clearTimeout(t);
  }, [currentSnap, dirty, name, isNew]);

  // Register / clear the unsaved-changes guard so that clicking the
  // sidebar or bottom-nav (any in-app link) while dirty shows the
  // Save/Discard prompt instead of silently losing changes.
  useEffect(() => {
    if (dirty) {
      setGuard((proceed) => {
        pendingNavRef.current = proceed;   // run this if the user leaves
        setShowLeave(true);
      });
    } else {
      clearGuard();
    }
    return () => clearGuard();
  }, [dirty, setGuard, clearGuard]);

  // Also guard a hard browser navigation (refresh / close tab).
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // Run the pending navigation (or fall back to /templates), clearing the
  // guard first so the interceptor doesn't re-fire.
  function doLeave() {
    clearGuard();
    const proceed = pendingNavRef.current;
    pendingNavRef.current = null;
    if (proceed) proceed();
    else nav('/templates');
  }

  // Back navigation: if everything is saved just leave; if there are
  // unsaved changes (autosave still pending, name missing, or a save
  // failed) ask Save / Discard first.
  function onBack() {
    if (!dirty) { nav('/templates'); return; }
    pendingNavRef.current = null;   // back button => default destination
    setShowLeave(true);
  }
  async function leaveSave() {
    const ok = await persistRef.current();
    if (ok) { setShowLeave(false); doLeave(); }
    else alert('Could not save — check the template name and your connection.');
  }
  function leaveDiscard() {
    savedSnapRef.current = currentSnap; // mark clean so guard clears
    setShowLeave(false);
    doLeave();
  }
  function leaveCancel() {
    pendingNavRef.current = null;
    setShowLeave(false);
  }

  async function del() {
    if (!confirm('Delete this template? (Past sessions are unaffected)')) return;
    if (tmplIdRef.current) await api.del(`/templates/${tmplIdRef.current}`);
    savedSnapRef.current = currentSnap; // suppress the leave prompt
    clearGuard();
    nav('/templates');
  }

  function move(idx, dir) {
    const next = [...exercises];
    const t = next[idx + dir];
    if (!t) return;
    next[idx + dir] = next[idx];
    next[idx] = t;
    setExercises(next);
  }

  function remove(idx) {
    setExercises(exercises.filter((_, i) => i !== idx));
  }

  function addExercise(ex) {
    setExercises((cur) => [...cur, {
      exercise_id: ex.id,
      exercise_name: ex.name,
      target_sets:      ex.target_sets      ?? 3,
      target_reps:      ex.target_reps      ?? '',
      target_time_s:    ex.target_time_s    ?? null,
      target_mileage_m: ex.target_mileage_m ?? null,
      alt_exercise_id:  null,
      superset_tag:     '',
      rest_seconds:     null,
    }]);
    setShowAdd(false);
  }

  async function createAndAdd(q, withTargets) {
    const created = await api.post('/exercises', { name: q.trim() });
    setRoster((r) => [...r, created]);
    addExercise({ ...created, ...(withTargets || {}) });
  }

  // Replace the exercise at `idx` with another (existing or new) one,
  // keeping targets / superset / rest exactly as they were.
  function replaceExercise(idx, ex) {
    setExercises((cur) => {
      const next = [...cur];
      next[idx] = {
        ...next[idx],
        exercise_id: ex.id,
        exercise_name: ex.name,
        // A self-referencing alternate makes no sense — drop it.
        alt_exercise_id: next[idx].alt_exercise_id === ex.id ? null : next[idx].alt_exercise_id,
      };
      return next;
    });
    setReplaceIdx(null);
  }

  const saveBadge =
    saveState === 'saving' ? 'Saving…'
    : saveState === 'error' ? 'Save failed'
    : dirty ? 'Unsaved'
    : saveState === 'saved' ? 'Saved'
    : '';

  return (
    <div className="app-shell page-template-edit">
      <TopBar
        back
        onBack={onBack}
        title={isNew ? 'New template' : 'Edit template'}
        right={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {saveBadge && (
              <span className={`save-badge${saveState === 'error' ? ' save-badge--err' : ''}`}>{saveBadge}</span>
            )}
            {!isNew && <button className="right-action" onClick={del} style={{ color: 'var(--red)' }}>Delete</button>}
          </span>
        }
      />
      <div className="content">
        <div className="card">
          <div className="field">
            <label>Template name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DAY 1 PUSH" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Color</label>
            <div className="color-picker">
              {COLORS.map((c) => (
                <button key={c} className={color === c ? 'selected' : ''} style={{ background: c }} onClick={() => setColor(c)} />
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
              <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#hex" />
            </div>
          </div>
        </div>

        <div className="section-title">Exercises</div>
        {exercises.length === 0 ? (
          <div className="empty small">No exercises yet</div>
        ) : (
          exercises.map((ex, idx) => (
            <div className="card compact" key={`${ex.exercise_id}-${idx}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <strong>{ex.exercise_name}</strong>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn tiny ghost" onClick={() => setReplaceIdx(idx)} title="Replace exercise"><Icon name="swap" /></button>
                  <button className="btn tiny ghost" onClick={() => move(idx, -1)}><Icon name="arrow-up" /></button>
                  <button className="btn tiny ghost" onClick={() => move(idx, 1)}><Icon name="arrow-down" /></button>
                  <button className="btn tiny ghost" onClick={() => remove(idx)}><Icon name="xmark" /></button>
                </div>
              </div>
              <div className="row">
                <div>
                  <label className="small text-muted">Sets</label>
                  <input type="number" value={ex.target_sets} onChange={(e) => {
                    const next = [...exercises];
                    next[idx] = { ...ex, target_sets: +e.target.value };
                    setExercises(next);
                  }} />
                </div>
                <div>
                  <label className="small text-muted">Reps</label>
                  <input value={ex.target_reps} onChange={(e) => {
                    const next = [...exercises];
                    next[idx] = { ...ex, target_reps: e.target.value };
                    setExercises(next);
                  }} placeholder="6-10" />
                </div>
              </div>
              <div className="row mt-1">
                <div>
                  <label className="small text-muted">Target time</label>
                  <input
                    value={ex.target_time_s == null ? '' : fmtDurationLocal(ex.target_time_s)}
                    onChange={(e) => {
                      const next = [...exercises];
                      const sec = parseDurationLocal(e.target.value);
                      next[idx] = { ...ex, target_time_s: sec };
                      setExercises(next);
                    }}
                    placeholder="HH:MM:SS"
                  />
                </div>
                <div>
                  <label className="small text-muted">Target distance (m)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={ex.target_mileage_m ?? ''}
                    onChange={(e) => {
                      const next = [...exercises];
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      next[idx] = { ...ex, target_mileage_m: v === '' ? null : parseInt(v, 10) };
                      setExercises(next);
                    }}
                    placeholder="2400"
                  />
                </div>
              </div>
              {/* A/B alternate — searchable picker; typing a name that
                  doesn't exist yet offers to create it on the spot. */}
              <div className="field mt-1">
                <label className="small text-muted">Alternate exercise (B) — optional</label>
                <AltPicker
                  roster={roster}
                  excludeId={ex.exercise_id}
                  value={ex.alt_exercise_id}
                  onChange={(altId) => {
                    const next = [...exercises];
                    next[idx] = { ...ex, alt_exercise_id: altId };
                    setExercises(next);
                  }}
                  onCreate={async (newName) => {
                    const created = await api.post('/exercises', { name: newName.trim() });
                    setRoster((r) => [...r, created]);
                    const next = [...exercises];
                    next[idx] = { ...ex, alt_exercise_id: created.id };
                    setExercises(next);
                  }}
                />
              </div>
              {/* Superset pre-grouping: any two rows sharing the same tag
                  (A, B, ...) will be visually merged inside the session.
                  Rest seconds applies to this exercise's rest timer. */}
              <div className="row mt-1">
                <div>
                  <label className="small text-muted">Superset tag (A, B…)</label>
                  <input
                    value={ex.superset_tag || ''}
                    onChange={(e) => {
                      const next = [...exercises];
                      next[idx] = { ...ex, superset_tag: e.target.value.toUpperCase().slice(0, 2) };
                      setExercises(next);
                    }}
                    placeholder="A"
                  />
                </div>
                <div>
                  <label className="small text-muted">Rest (sec)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={ex.rest_seconds ?? ''}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      const next = [...exercises];
                      next[idx] = { ...ex, rest_seconds: v === '' ? null : parseInt(v, 10) };
                      setExercises(next);
                    }}
                    placeholder="90"
                  />
                </div>
              </div>
            </div>
          ))
        )}

        <button className="btn" onClick={() => setShowAdd(true)}>+ Add exercise</button>

        <button
          className="btn primary mt-2"
          onClick={async () => {
            const ok = await persistRef.current();
            if (!ok) alert('Could not save — check the template name and your connection.');
          }}
          disabled={!dirty || !name.trim() || saveState === 'saving'}
        >
          {saveState === 'saving' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>

        {showAdd && (
          <AddExerciseModal
            roster={roster}
            existingIds={exercises.map((e) => e.exercise_id)}
            onAdd={addExercise}
            onCreate={createAndAdd}
            onClose={() => setShowAdd(false)}
          />
        )}

        {replaceIdx != null && (
          <ReplacePickModal
            roster={roster}
            currentExerciseId={exercises[replaceIdx]?.exercise_id}
            onPick={(ex) => replaceExercise(replaceIdx, ex)}
            onCreate={async (q) => {
              const created = await api.post('/exercises', { name: q.trim() });
              setRoster((r) => [...r, created]);
              replaceExercise(replaceIdx, created);
            }}
            onClose={() => setReplaceIdx(null)}
          />
        )}

        {showLeave && (
          <div className="modal-bg" onClick={leaveCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Do you want to save changes?</h3>
              <div className="small text-muted" style={{ marginBottom: 14 }}>
                This template has unsaved changes.
              </div>
              <button className="btn primary" onClick={leaveSave}>Save</button>
              <button className="btn ghost mt-1" onClick={leaveDiscard}>Discard</button>
              <button className="btn ghost mt-1" onClick={leaveCancel}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Searchable A/B alternate picker. Shows the current pick with Change /
// Remove; opening the search lists matches and offers "+ Create" when
// the typed name doesn't exist yet.
function AltPicker({ roster, excludeId, value, onChange, onCreate }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const current = roster.find((r) => r.id === value) || null;
  const nq = normalize(q);
  const filtered = roster
    .filter((e) => e.id !== excludeId)
    .filter((e) => normalize(e.name).includes(nq))
    .slice(0, 8);
  const exactMatch = roster.some((e) => normalize(e.name) === nq && nq !== '');

  if (!open) {
    return current ? (
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="alt-current"><Icon name="dumbbell" /> {current.name}</div>
        <button className="btn tiny ghost" onClick={() => { setQ(''); setOpen(true); }}>Change</button>
        <button className="btn tiny ghost" onClick={() => onChange(null)}>Remove</button>
      </div>
    ) : (
      <button className="btn ghost tiny" onClick={() => { setQ(''); setOpen(true); }}>+ Add an alternate</button>
    );
  }

  return (
    <div className="alt-picker">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search or type a new one…"
        autoFocus
      />
      <div className="alt-picker__list">
        {filtered.map((e) => (
          <div key={e.id} className="alt-picker__row" onClick={() => { onChange(e.id); setOpen(false); setQ(''); }}>
            <span><Icon name="dumbbell" /> {e.name}</span>
            <span style={{ color: 'var(--gray)' }}>+</span>
          </div>
        ))}
        {filtered.length === 0 && !q.trim() && (
          <div className="small text-muted" style={{ padding: 8 }}>Type to search…</div>
        )}
        {q.trim() && !exactMatch && (
          <div
            className="alt-picker__row alt-picker__row--create"
            onClick={async () => { await onCreate(q); setOpen(false); setQ(''); }}
          >
            <span><Icon name="plus" /> Create "{q.trim()}"</span>
          </div>
        )}
        {filtered.length === 0 && q.trim() && exactMatch && (
          <div className="small text-muted" style={{ padding: 8 }}>No matches</div>
        )}
      </div>
      <button className="btn tiny ghost mt-1" onClick={() => { setOpen(false); setQ(''); }}>Cancel</button>
    </div>
  );
}

// Replace modal — pick an existing exercise (or create a new one) to
// swap into the row, keeping sets/reps/superset/rest unchanged.
function ReplacePickModal({ roster, currentExerciseId, onPick, onCreate, onClose }) {
  const [q, setQ] = useState('');
  const nq = normalize(q);
  const filtered = roster
    .filter((e) => e.id !== currentExerciseId)
    .filter((e) => normalize(e.name).includes(nq));
  const exactMatch = roster.some((e) => normalize(e.name) === nq && nq !== '');

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal--search" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sticky">
          <h3>Replace exercise</h3>
          <div className="field" style={{ marginBottom: 0 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a new one…" autoFocus />
          </div>
        </div>
        <div className="modal-scroll">
          {filtered.map((e) => (
            <div className="list-row" key={e.id} onClick={() => onPick(e)}>
              <div className="meta"><span><Icon name="dumbbell" /></span> {e.name}</div>
              <span style={{ color: 'var(--gray)' }}><Icon name="swap" /></span>
            </div>
          ))}
          {q.trim() && !exactMatch && (
            <button className="btn primary mt-2" onClick={() => onCreate(q)}>+ Create "{q.trim()}" and replace</button>
          )}
        </div>
        <button className="btn ghost mt-1" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

function AddExerciseModal({ roster, existingIds, onAdd, onCreate, onClose }) {
  const [q, setQ] = useState('');
  const [targetSets, setTargetSets] = useState(3);
  const [targetReps, setTargetReps] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [targetMileage, setTargetMileage] = useState('');

  const nq = normalize(q);
  const filtered = roster.filter(
    (e) => normalize(e.name).includes(nq) && !existingIds.includes(e.id)
  );
  // Offer to "+ Create" as long as the typed name doesn't EXACTLY match
  // one of the existing roster entries (case- and accent-folded). This
  // means typing "kürek" when "kürek çekme" already exists still lets
  // the user create plain "kürek".
  const exactMatch = roster.some((e) => normalize(e.name) === nq && nq !== '');

  function withTargets(e) {
    return {
      ...e,
      target_sets: targetSets,
      target_reps: targetReps,
      target_time_s: parseDurationLocal(targetTime),
      target_mileage_m: targetMileage === '' ? null : (parseInt(targetMileage, 10) || null),
    };
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal--search" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sticky">
          <h3>Add exercise</h3>
          <div className="field" style={{ marginBottom: 10 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a new one…" autoFocus />
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
          {filtered.map((e) => (
            <div className="list-row" key={e.id} onClick={() => onAdd(withTargets(e))}>
              <div className="meta"><span><Icon name="dumbbell" /></span> {e.name}</div>
              <span>+</span>
            </div>
          ))}
          {q.trim() && !exactMatch && (
            <button className="btn primary mt-2" onClick={() => onCreate(q, withTargets({}))}>
              + Create "{q.trim()}" and add
            </button>
          )}
        </div>
        <button className="btn ghost mt-1" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
