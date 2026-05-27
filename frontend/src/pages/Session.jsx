import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function Session() {
  const { id } = useParams();
  const nav = useNavigate();
  const [s, setS] = useState(null);
  const [showAddEx, setShowAddEx] = useState(false);
  const [showSaveTmpl, setShowSaveTmpl] = useState(false);

  const load = useCallback(() => {
    api.get(`/sessions/${id}`).then(setS).catch(() => nav('/sessions'));
  }, [id, nav]);

  useEffect(() => { load(); }, [load]);

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
        <div className="card" style={{ borderLeft: `4px solid ${s.template_color || '#FFB07A'}` }}>
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
        </div>

        {s.prev_workout_notes && (
          <div className="prev-note-card">
            <div className="prev-note-head">
              <span className="prev-note-icon">📜</span>
              <span className="prev-note-label">Previous workout note</span>
              {s.prev_workout_notes_date && (
                <span className="prev-note-date">{s.prev_workout_notes_date}</span>
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
          <ExerciseBlock key={ex.id} sessionId={s.id} ex={ex} reload={load} sessionDate={s.session_date} />
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
    </div>
  );
}

function ExerciseBlock({ sessionId, ex, reload, sessionDate }) {
  const [notes, setNotes] = useState(ex.exercise_notes || '');
  const [adjust, setAdjust] = useState(ex.weight_adjust || '');
  const [targetReps, setTargetReps] = useState(ex.target_reps || '');

  async function saveMeta(patch) {
    await api.put(`/sessions/${sessionId}/exercises/${ex.id}`, {
      exercise_notes: notes,
      weight_adjust: adjust,
      target_reps: targetReps,
      target_sets: ex.target_sets,
      ...patch,
    });
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

  return (
    <div className="card exercise-block">
      <div className="exercise-head">
        <h4>{ex.exercise_name}</h4>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`btn tiny ${adjust === 'up' ? '' : 'ghost'}`}
            onClick={() => setAdjustValue('up')}
            title="Increase weight next time"
          >▲</button>
          <button
            className={`btn tiny ${adjust === 'down' ? '' : 'ghost'}`}
            onClick={() => setAdjustValue('down')}
            title="Decrease weight next time"
          >▼</button>
          <button className="btn tiny ghost" onClick={delEx}>✕</button>
        </div>
      </div>

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

      {/* Set rows */}
      <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 1fr 30px', gap: 8, fontSize: 11, color: 'var(--gray)', fontWeight: 600, marginBottom: 4 }}>
        <div className="text-center">SET</div>
        <div className="text-center">KG</div>
        <div className="text-center">REP</div>
        <div />
      </div>
      {ex.sets.map((set, idx) => (
        <SetRow
          key={set.id}
          sessionId={sessionId}
          set={set}
          onSaved={async (evt) => {
            // Cascade rule: when the user CHANGES a set's kg, propagate
            // the new value to ALL subsequent sets (overwriting them).
            // Earlier sets are never touched. Triggered only on the 'kg' kind.
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
            }
            reload();
          }}
        />
      ))}
      <button className="btn ghost tiny mt-1" onClick={addSet}>+ Add set</button>

      {ex.prev_exercise_notes && (
        <div className="prev-note-card prev-note-card--sm mt-2">
          <div className="prev-note-head">
            <span className="prev-note-icon">📜</span>
            <span className="prev-note-label">Previous exercise note</span>
            {ex.prev_exercise_notes_date && (
              <span className="prev-note-date">{ex.prev_exercise_notes_date}</span>
            )}
          </div>
          <div className="prev-note-body">{ex.prev_exercise_notes}</div>
        </div>
      )}

      <div className="field mt-2" style={{ marginBottom: 0 }}>
        <label>Exercise note</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => saveMeta()}
          placeholder="Note about this exercise…"
        />
      </div>
    </div>
  );
}

function SetRow({ sessionId, set, onSaved }) {
  const [w, setW] = useState(set.weight_kg ?? '');
  const [r, setR] = useState(set.reps_done ?? '');

  // Sync local state when set prop changes (after a parent reload),
  // unless the user is mid-edit (input focused). We keep it simple:
  // if the incoming prop differs from local state and local state matches
  // the previously seen prop, accept the new value.
  useEffect(() => {
    setW(set.weight_kg ?? '');
    setR(set.reps_done ?? '');
  }, [set.id, set.weight_kg, set.reps_done]);

  // Parse a weight string that may use comma as decimal separator
  function parseW(val) {
    if (val === '' || val == null) return null;
    const n = parseFloat(String(val).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  async function saveKg() {
    const newW = parseW(w);
    await api.put(`/sessions/${sessionId}/sets/${set.id}`, {
      weight_kg: newW,
      reps_done: r === '' ? null : parseInt(r, 10),
    });
    if (onSaved) await onSaved({ kind: 'kg', newW });
  }

  async function saveReps() {
    await api.put(`/sessions/${sessionId}/sets/${set.id}`, {
      weight_kg: parseW(w),
      reps_done: r === '' ? null : parseInt(r, 10),
    });
    if (onSaved) await onSaved({ kind: 'rep' });
  }

  async function del() {
    if (!confirm('Delete this set?')) return;
    await api.del(`/sessions/${sessionId}/sets/${set.id}`);
    if (onSaved) await onSaved({ kind: 'del' });
  }

  // iOS Safari sometimes ignores select() called synchronously in onFocus.
  // Using requestAnimationFrame + setSelectionRange is the most reliable
  // way to highlight the existing value so typing overwrites it.
  function selectAll(e) {
    const el = e.target;
    requestAnimationFrame(() => {
      try { el.setSelectionRange(0, el.value.length); }
      catch { el.select?.(); }
    });
  }

  return (
    <div className="set-row">
      <div className="set-num">{set.set_number}</div>
      <input
        type="text"
        inputMode="decimal"
        value={w}
        onFocus={selectAll}
        onChange={(e) => setW(e.target.value.replace(/[^0-9.,]/g, ''))}
        onBlur={saveKg}
        placeholder="-"
      />
      <input
        type="text"
        inputMode="numeric"
        value={r}
        onFocus={selectAll}
        onChange={(e) => setR(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={saveReps}
        placeholder="-"
      />
      <button className="del" onClick={del}>×</button>
    </div>
  );
}

function AddExerciseModal({ sessionId, onClose, reload }) {
  const [roster, setRoster] = useState([]);
  const [q, setQ] = useState('');
  const [targetSets, setTargetSets] = useState(3);
  const [targetReps, setTargetReps] = useState('');

  useEffect(() => {
    api.get('/exercises').then(setRoster).catch(() => {});
  }, []);

  const filtered = roster.filter((e) =>
    e.name.toLowerCase().includes(q.toLowerCase())
  );

  async function add(exerciseId) {
    await api.post(`/sessions/${sessionId}/exercises`, {
      exercise_id: exerciseId,
      target_sets: targetSets,
      target_reps: targetReps,
    });
    reload();
    onClose();
  }

  async function createAndAdd() {
    if (!q.trim()) return;
    const ex = await api.post('/exercises', { name: q.trim() });
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
          <div className="row" style={{ marginBottom: 0 }}>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Sets</label>
              <input type="number" value={targetSets} onChange={(e) => setTargetSets(+e.target.value)} />
            </div>
            <div>
              <label className="small" style={{ color: 'var(--ink-soft)' }}>Rep range</label>
              <input value={targetReps} onChange={(e) => setTargetReps(e.target.value)} placeholder="6-10" />
            </div>
          </div>
        </div>
        <div className="modal-scroll">
          {filtered.length === 0 && q.trim() ? (
            <button className="btn primary" onClick={createAndAdd}>+ Create "{q}" and add</button>
          ) : (
            filtered.map((e) => (
              <div className="list-row" key={e.id} onClick={() => add(e.id)}>
                <div className="meta"><span>💪</span> {e.name}</div>
                <span style={{ color: 'var(--gray)' }}>+</span>
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
