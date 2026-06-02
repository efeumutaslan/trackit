import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

export default function Sessions() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/sessions').then(setRows); }, []);
  return (
    <div className="app-shell">
      <TopBar back title="Sessions" />
      <div className="content">
        <Link to="/log" className="btn primary mb-2">+ New session</Link>
        {rows.length === 0 ? (
          <div className="empty">
            <div className="icon">📋</div>
            <div>No sessions yet</div>
          </div>
        ) : (
          rows.map((s) => (
            <Link to={`/sessions/${s.id}`} key={s.id} className="list-row">
              <div className="meta">
                <span className="color-dot" style={{ background: s.template_color || 'var(--gray-soft)' }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{s.template_name || 'Untitled session'}</div>
                  <div className="small text-muted">{fmtDate(s.session_date)}</div>
                </div>
              </div>
              <span style={{ color: 'var(--gray)' }}>›</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
