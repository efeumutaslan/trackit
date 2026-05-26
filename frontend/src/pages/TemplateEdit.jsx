import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

const COLORS = ['#FFB07A','#7AC4FF','#9CD879','#FF7A9C','#C49CFF','#FFD06B','#5BC5C5','#FF8C61','#A28DFE','#FFA8A8','#6FCBA4','#E8A87C'];

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
      target_sets: 3,
      target_reps: '',
    }]);
    setShowAdd(false);
  }

  async function createAndAdd(q) {
    const ex = await api.post('/exercises', { name: q.trim() });
    setRoster([...roster, ex]);
    addExercise(ex);
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
  const filtered = roster.filter((e) =>
    e.name.toLowerCase().includes(q.toLowerCase()) && !existingIds.includes(e.id)
  );
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal modal--search" onClick={(e) => e.stopPropagation()}>
        <div className="modal-sticky">
          <h3>Add exercise</h3>
          <div className="field" style={{ marginBottom: 0 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a new one…" autoFocus />
          </div>
        </div>
        <div className="modal-scroll">
          {filtered.length === 0 && q.trim() ? (
            <button className="btn primary" onClick={() => onCreate(q)}>+ Create "{q}" and add</button>
          ) : (
            filtered.map((e) => (
              <div className="list-row" key={e.id} onClick={() => onAdd(e)}>
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
