import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function LogSession() {
  const [templates, setTemplates] = useState([]);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.get('/templates').then(setTemplates).catch(() => {});
  }, []);

  async function startWithTemplate(t) {
    if (busy) return;
    setBusy(true);
    try {
      const s = await api.post('/sessions', {
        template_id: t.id,
        session_date: date,
        start_now: true,
      });
      nav(`/sessions/${s.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function startEmpty() {
    if (busy) return;
    setBusy(true);
    try {
      const s = await api.post('/sessions', {
        session_date: date,
        start_now: true,
      });
      nav(`/sessions/${s.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <TopBar back title="Log a workout" />
      <div className="content">
        <div className="field">
          <label>Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="section-title">Choose a template</div>
        {templates.length === 0 ? (
          <div className="empty">
            <div className="icon">📐</div>
            <div>No templates yet.</div>
            <Link to="/templates/new" className="btn ghost mt-2" style={{ display: 'inline-flex' }}>
              + Add a new template
            </Link>
          </div>
        ) : (
          templates.map((t) => (
            <div className="card selectable" key={t.id} onClick={() => startWithTemplate(t)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span className="color-dot" style={{ background: t.color }} />
                  <div>
                    <h3>{t.name}</h3>
                    <div className="sub">{t.exercises?.length || 0} exercises</div>
                  </div>
                </div>
                <span style={{ color: 'var(--gray)' }}>›</span>
              </div>
            </div>
          ))
        )}

        <div className="section-title">or</div>
        <button className="btn" onClick={startEmpty} disabled={busy}>
          + Start blank (add exercises one by one)
        </button>

        <div className="section-title">Manage</div>
        <Link to="/templates/new" className="btn ghost">+ Add a new template</Link>
        <Link to="/exercises/new" className="btn ghost mt-1">+ Add a new exercise</Link>
      </div>
    </div>
  );
}
