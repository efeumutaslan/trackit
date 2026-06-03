import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function Templates() {
  const [rows, setRows] = useState([]);
  const nav = useNavigate();
  function load() { api.get('/templates').then(setRows); }
  useEffect(load, []);

  async function clone(e, t) {
    e.preventDefault();
    e.stopPropagation();
    const name = prompt('Name for the copy:', `${t.name} copy`);
    if (name === null) return;
    const newTpl = await api.post(`/templates/${t.id}/clone`, { name });
    nav(`/templates/${newTpl.id}`);
  }

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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button className="btn tiny ghost" onClick={(e) => clone(e, t)} title="Duplicate template">Duplicate</button>
                <span style={{ color: 'var(--gray)' }}>›</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
