import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

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

export default function TemplateEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [exercises, setExercises] = useState([]); // [{exercise_id, exercise_name, target_sets, target_reps}]
  const [roster, setRoster] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    api.get('/exercises').then(setRoster);
    if (!isNew) {
      api.get(`/templates/${id}`).then((t) => {
        setName(t.name);
        setColor(t.color);
        setExercises(t.exercises.map((e) => ({
          exercise_id: e.exercise_id,
          exercise_name: e.exercise_name,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
          target_time_s:    e.target_time_s    ?? null,
          target_mileage_m: e.target_mileage_m ?? null,
          alt_exercise_id:  e.alt_exercise_id  ?? null,
        })));
      });
    }
  }, [id, isNew]);

  async function save() {
    if (!name.trim()) { alert('Name is required'); return; }
    const payload = {
      name: name.trim(),
      color,
      exercises: exercises.map((e) => ({
        exercise_id: e.exercise_id,
        target_sets: e.target_sets,
        target_reps: e.target_reps,
        target_time_s: e.target_time_s ?? null,
        target_mileage_m: e.target_mileage_m ?? null,
        alt_exercise_id: e.alt_exercise_id ?? null,
      })),
    };
    if (isNew) {
      const t = await api.post('/templates', payload);
      // update exercises after create
      await api.put(`/templates/${t.id}`, payload);
      nav('/templates');
    } else {
      await api.put(`/templates/${id}`, payload);
      nav('/templates');
    }
  }

  async function del() {
    if (!confirm('Delete this template? (Past sessions are unaffected)')) return;
    await api.del(`/templates/${id}`);
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
    setExercises([...exercises, {
      exercise_id: ex.id,
      exercise_name: ex.name,
      target_sets:      ex.target_sets      ?? 3,
      target_reps:      ex.target_reps      ?? '',
      target_time_s:    ex.target_time_s    ?? null,
      target_mileage_m: ex.target_mileage_m ?? null,
    }]);
    setShowAdd(false);
  }

  async function createAndAdd(q, withTargets) {
    const created = await api.post('/exercises', { name: q.trim() });
    setRoster([...roster, created]);
    addExercise({ ...created, ...(withTargets || {}) });
  }

  return (
    <div className="app-shell">
      <TopBar
        back
        title={isNew ? 'New template' : 'Edit template'}
        right={!isNew && <button className="right-action" onClick={del} style={{ color: 'var(--red)' }}>Delete</button>}
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
                  <button className="btn tiny ghost" onClick={() => move(idx, -1)}>↑</button>
                  <button className="btn tiny ghost" onClick={() => move(idx, 1)}>↓</button>
                  <button className="btn tiny ghost" onClick={() => remove(idx)}>✕</button>
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
              {/* A/B alternate — pre-pair an exercise here so the session
                  can toggle to it without having to use Replace. */}
              <div className="field mt-1" style={{ marginBottom: 0 }}>
                <label className="small text-muted">Alternate exercise (B) — optional</label>
                <select
                  value={ex.alt_exercise_id ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    const next = [...exercises];
                    next[idx] = { ...ex, alt_exercise_id: v === '' ? null : +v };
                    setExercises(next);
                  }}
                >
                  <option value="">— None —</option>
                  {roster
                    .filter((r) => r.id !== ex.exercise_id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                </select>
              </div>
            </div>
          ))
        )}

        <button className="btn" onClick={() => setShowAdd(true)}>+ Add exercise</button>
        <button className="btn primary mt-2" onClick={save}>Save</button>

        {showAdd && (
          <AddExerciseModal
            roster={roster}
            existingIds={exercises.map((e) => e.exercise_id)}
            onAdd={addExercise}
            onCreate={createAndAdd}
            onClose={() => setShowAdd(false)}
          />
        )}
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

  // Accent- and case-insensitive search.
  const normalize = (s) =>
    (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const nq = normalize(q);
  const filtered = roster.filter(
    (e) => normalize(e.name).includes(nq) && !existingIds.includes(e.id)
  );

  function parseDuration(s) {
    if (!s || !s.trim()) return null;
    const txt = s.trim();
    if (!txt.includes(':')) {
      const n = parseInt(txt, 10);
      return Number.isFinite(n) ? n : null;
    }
    const parts = txt.split(':').map((p) => parseInt(p, 10) || 0);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function withTargets(e) {
    return {
      ...e,
      target_sets: targetSets,
      target_reps: targetReps,
      target_time_s: parseDuration(targetTime),
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
          {filtered.length === 0 && q.trim() ? (
            <button className="btn primary" onClick={() => onCreate(q, withTargets({}))}>+ Create "{q}" and add</button>
          ) : (
            filtered.map((e) => (
              <div className="list-row" key={e.id} onClick={() => onAdd(withTargets(e))}>
                <div className="meta"><span>💪</span> {e.name}</div>
                <span>+</span>
              </div>
            ))
          )}
        </div>
        <button className="btn ghost mt-1" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
