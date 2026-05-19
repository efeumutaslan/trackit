import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function Templates() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/templates').then(setRows); }, []);
  return (
    <div className="app-shell">
      <TopBar back title="Templates" />
      <div className="content">
        <Link to="/templates/new" className="btn primary mb-2">+ New template</Link>
        {rows.length === 0 ? (
          <div className="empty">
            <div className="icon">📐</div>
            <div>No templates yet</div>
          </div>
        ) : (
          rows.map((t) => (
            <Link to={`/templates/${t.id}`} key={t.id} className="list-row">
              <div className="meta">
                <span className="color-dot" style={{ background: t.color }} />
                <div>
                  <div style={{ fontWeight: 600 }}>{t.name}</div>
                  <div className="small text-muted">{t.exercises?.length || 0} exercises</div>
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
