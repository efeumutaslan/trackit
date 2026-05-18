import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
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
    const r = await api.post(`/sessions/${id}/start`);
    setS((cur) => ({ ...cur, started_at: r.started_at }));
  }
  async function finishWO() {
    const r = await api.post(`/sessions/${id}/finish`);
    setS((cur) => ({ ...cur, finished_at: r.finished_at }));
  }

  async function delSession() {
    if (!confirm('Bu session silinsin mi?')) return;
    await api.del(`/sessions/${id}`);
    nav('/sessions');
  }

  return (
    <div className="app-shell">
      <TopBar
        back
        title={s.template_name || 'Session'}
        right={
          <button className="right-action" onClick={delSession} style={{ color: 'var(--red)' }}>Sil</button>
        }
      />
      <div className="content">
        <div className="card" style={{ borderLeft: `4px solid ${s.template_color || '#FFB07A'}` }}>
          <div className="field">
            <label>Tarih</label>
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
                const t = prompt('Başlangıç zamanı (HH:MM):', fmtTime(s.started_at));
                if (t) {
                  const [h, m] = t.split(':');
                  const d = new Date(s.session_date);
                  d.setHours(+h, +m, 0, 0);
                  saveMeta({ started_at: d.toISOString() });
                }
              } : startWO}
              style={{ flex: 1 }}
            >
              ⏱ Başlangıç: {s.started_at ? fmtTime(s.started_at) : 'Başlat'}
            </button>
            <button
              className="btn sm"
              onClick={s.finished_at ? () => {
                const t = prompt('Bitiş zamanı (HH:MM):', fmtTime(s.finished_at));
                if (t) {
                  const [h, m] = t.split(':');
                  const d = new Date(s.session_date);
                  d.setHours(+h, +m, 0, 0);
                  saveMeta({ finished_at: d.toISOString() });
                }
              } : finishWO}
              style={{ flex: 1 }}
            >
              🏁 Bitiş: {s.finished_at ? fmtTime(s.finished_at) : 'Bitir'}
            </button>
          </div>
        </div>

        {s.prev_workout_notes && (
          <div className="card compact" style={{ background: 'var(--peach-soft)' }}>
            <div className="small" style={{ fontWeight: 700, color: 'var(--peach-dark)' }}>Önceki workout notu</div>
            <div className="small" style={{ color: 'var(--ink-soft)' }}>{s.prev_workout_notes}</div>
          </div>
        )}

        <div className="field">
          <label>Workout notları</label>
          <textarea
            value={s.workout_notes || ''}
            onChange={(e) => setS((cur) => ({ ...cur, workout_notes: e.target.value }))}
            onBlur={() => saveMeta({ workout_notes: s.workout_notes })}
            placeholder="Bu antrenman hakkında notlar…"
          />
        </div>

        <div className="section-title">Egzersizler</div>
        {s.exercises.map((ex) => (
          <ExerciseBlock key={ex.id} sessionId={s.id} ex={ex} reload={load} sessionDate={s.session_date} />
        ))}

        <button className="btn mt-1" onClick={() => setShowAddEx(true)}>+ Egzersiz ekle</button>

        <div className="section-title">Şablon</div>
        {s.template_id ? (
          <button className="btn ghost" onClick={async () => {
            if (!confirm('Bu session\'daki değişiklikler şablona uygulansın mı? (Geçmiş workoutlar etkilenmez)')) return;
            await api.post(`/sessions/${id}/update-template`);
            alert('Şablon güncellendi');
          }}>♻ Bu şablonu güncelle</button>
        ) : null}
        <button className="btn ghost mt-1" onClick={() => setShowSaveTmpl(true)}>💾 Şablon olarak kaydet</button>

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
  const [showPrev, setShowPrev] = useState(false);
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
    if (!confirm(`${ex.exercise_name} silinsin mi?`)) return;
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
            title="Bir sonraki sefere arttır"
          >▲</button>
          <button
            className={`btn tiny ${adjust === 'down' ? '' : 'ghost'}`}
            onClick={() => setAdjustValue('down')}
            title="Bir sonraki sefere azalt"
          >▼</button>
          <button className="btn tiny ghost" onClick={delEx}>✕</button>
        </div>
      </div>

      <div className="row mb-1">
        <div>
          <label className="small" style={{ color: 'var(--ink-soft)' }}>Hedef rep aralığı</label>
          <input
            value={targetReps}
            onChange={(e) => setTargetReps(e.target.value)}
            onBlur={() => saveMeta({ target_reps: targetReps })}
            placeholder="örn 6-10"
          />
        </div>
        <div>
          <label className="small" style={{ color: 'var(--ink-soft)' }}>Tonnage</label>
          <div className="tonnage-line" style={{ padding: '10px 0' }}>
            <span className="tag">{ex.tonnage.toFixed(1)} kg</span>
            {ex.prev_tonnage > 0 && (
              <span className="tag muted">Önceki: {ex.prev_tonnage.toFixed(1)}</span>
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
      {ex.sets.map((set) => (
        <SetRow key={set.id} sessionId={sessionId} set={set} reload={reload} />
      ))}
      <button className="btn ghost tiny mt-1" onClick={addSet}>+ Set ekle</button>

      {ex.prev_exercise_notes && (
        <div className="card compact mt-2" style={{ background: 'var(--peach-soft)', marginBottom: 0 }}>
          <div className="small" style={{ fontWeight: 700, color: 'var(--peach-dark)' }}>Önceki notu</div>
          <div className="small" style={{ color: 'var(--ink-soft)' }}>{ex.prev_exercise_notes}</div>
        </div>
      )}

      <div className="field mt-2" style={{ marginBottom: 0 }}>
        <label>Egzersiz notu</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => saveMeta()}
          placeholder="Bu egzersiz hakkında not…"
        />
      </div>
    </div>
  );
}

function SetRow({ sessionId, set, reload }) {
  const [w, setW] = useState(set.weight_kg ?? '');
  const [r, setR] = useState(set.reps_done ?? '');

  async function save() {
    await api.put(`/sessions/${sessionId}/sets/${set.id}`, {
      weight_kg: w === '' ? null : +w,
      reps_done: r === '' ? null : +r,
    });
    reload();
  }

  async function del() {
    if (!confirm('Set silinsin mi?')) return;
    await api.del(`/sessions/${sessionId}/sets/${set.id}`);
    reload();
  }

  return (
    <div className="set-row">
      <div className="set-num">{set.set_number}</div>
      <input
        type="number"
        inputMode="decimal"
        step="0.5"
        value={w}
        onChange={(e) => setW(e.target.value)}
        onBlur={save}
        placeholder="-"
      />
      <input
        type="number"
        inputMode="numeric"
        value={r}
        onChange={(e) => setR(e.target.value)}
        onBlur={save}
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Egzersiz ekle</h3>
        <div className="field">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Egzersiz ara veya yeni yaz…"
            autoFocus
          />
        </div>
        <div className="row mb-2">
          <div>
            <label className="small" style={{ color: 'var(--ink-soft)' }}>Set</label>
            <input type="number" value={targetSets} onChange={(e) => setTargetSets(+e.target.value)} />
          </div>
          <div>
            <label className="small" style={{ color: 'var(--ink-soft)' }}>Rep aralığı</label>
            <input value={targetReps} onChange={(e) => setTargetReps(e.target.value)} placeholder="6-10" />
          </div>
        </div>
        {filtered.length === 0 && q.trim() ? (
          <button className="btn primary" onClick={createAndAdd}>+ "{q}" oluştur ve ekle</button>
        ) : (
          filtered.map((e) => (
            <div className="list-row" key={e.id} onClick={() => add(e.id)}>
              <div className="meta"><span>💪</span> {e.name}</div>
              <span style={{ color: 'var(--gray)' }}>+</span>
            </div>
          ))
        )}
        <button className="btn ghost mt-2" onClick={onClose}>İptal</button>
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
        <h3>Şablon olarak kaydet</h3>
        <div className="field">
          <label>Şablon adı</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Renk</label>
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
          <input
            className="mt-1"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#hexkod"
          />
        </div>
        <button className="btn primary" onClick={save}>Kaydet</button>
        <button className="btn ghost mt-1" onClick={onClose}>İptal</button>
      </div>
    </div>
  );
}
