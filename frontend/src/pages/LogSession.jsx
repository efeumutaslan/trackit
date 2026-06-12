import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import DateField from '../components/DateField.jsx';

export default function LogSession() {
  const [templates, setTemplates] = useState([]);
  const [date, setDate] = useState(() => {
    // Local-time YYYY-MM-DD (avoids the UTC drift at night)
    const d = new Date();
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d - tzOffset).toISOString().slice(0, 10);
  });
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
        started_at: new Date().toISOString(),
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
        started_at: new Date().toISOString(),
      });
      nav(`/sessions/${s.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell page-log-session">
      <TopBar back title="Log a workout" />
      <div className="content">
        <div className="field">
          <label>Date</label>
          <DateField value={date} onChange={setDate} />
        </div>

        <div className="section-title">Choose a template</div>
        {templates.length === 0 ? (
          <div className="empty">
            <div className="icon"><Icon name="ruler" /></div>
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
                    <div className="sub">{t.exercises?.length || 0} {(t.exercises?.length || 0) === 1 ? 'exercise' : 'exercises'}</div>
                  </div>
                </div>
                <span style={{ color: 'var(--gray)' }}><Icon name="chevron-right" /></span>
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
