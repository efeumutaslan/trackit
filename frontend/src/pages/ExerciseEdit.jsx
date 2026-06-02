import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

export default function ExerciseEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [progress, setProgress] = useState([]);

  useEffect(() => {
    if (!isNew) {
      api.get('/exercises').then((rows) => {
        const ex = rows.find((r) => r.id === +id);
        if (ex) { setName(ex.name); setNotes(ex.notes || ''); }
      });
      api.get(`/exercises/${id}/progress`).then(setProgress).catch(() => {});
    }
  }, [id, isNew]);

  async function save() {
    if (!name.trim()) { alert('Name is required'); return; }
    if (isNew) {
      await api.post('/exercises', { name: name.trim(), notes });
    } else {
      await api.put(`/exercises/${id}`, { name: name.trim(), notes });
    }
    nav('/exercises');
  }

  async function del() {
    if (!confirm('Delete this exercise? (Past records are kept)')) return;
    await api.del(`/exercises/${id}`);
    nav('/exercises');
  }

  return (
    <div className="app-shell">
      <TopBar
        back
        title={isNew ? 'New exercise' : 'Edit exercise'}
        right={!isNew && <button className="right-action" onClick={del} style={{ color: 'var(--red)' }}>Delete</button>}
      />
      <div className="content">
        <div className="card">
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DB OHP" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>General notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Form cues, etc." />
          </div>
        </div>
        <button className="btn primary mt-1" onClick={save}>Save</button>

        {!isNew && progress.length > 0 && (
          <>
            <div className="section-title">Rep-tonnage progress</div>
            <ProgressChart data={progress} />
            <div className="section-title">Session history</div>
            {[...progress].reverse().map((p) => (
              <div className="list-row" key={p.session_id}>
                <div className="meta">
                  <div>
                    <div style={{ fontWeight: 600 }}>{fmtDate(p.session_date)}</div>
                    <div className="small text-muted">Top: {p.top_weight} kg</div>
                  </div>
                </div>
                <span className="tag">{p.tonnage.toFixed(0)} kg</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ProgressChart({ data }) {
  const max = Math.max(...data.map((d) => d.tonnage), 1);
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
        {data.map((d) => (
          <div key={d.session_id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${fmtDate(d.session_date)}: ${d.tonnage.toFixed(0)} kg`}>
            <div style={{
              width: '100%',
              height: `${(d.tonnage / max) * 100}%`,
              background: 'var(--peach)',
              borderRadius: '4px 4px 0 0',
              minHeight: 2,
            }} />
          </div>
        ))}
      </div>
      <div className="small text-muted mt-1 text-center">{data.length} sessions</div>
    </div>
  );
}
