import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

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
    <div className="app-shell page-templates">
      <TopBar back title="Templates" />
      <div className="content">
        <Link to="/templates/new" className="btn primary mb-2">+ New template</Link>
        {rows.length === 0 ? (
          <div className="empty">
            <div className="icon"><Icon name="ruler" /></div>
            <div>No templates yet</div>
          </div>
        ) : (
          <div className="template-grid">
            {rows.map((t) => (
              <Link to={`/templates/${t.id}`} key={t.id} className="template-card">
                <div className="template-card__strip" style={{ background: t.color }} />
                <div className="template-card__body">
                  <div className="template-card__name">{t.name}</div>
                  <div className="template-card__count small text-muted">
                    {t.exercises?.length || 0} exercises
                  </div>
                  {t.exercises && t.exercises.length > 0 && (
                    <ul className="template-card__list">
                      {t.exercises.slice(0, 5).map((ex) => (
                        <li key={ex.id}>{ex.exercise_name || ex.name}</li>
                      ))}
                      {t.exercises.length > 5 && (
                        <li className="text-muted">…and {t.exercises.length - 5} more</li>
                      )}
                    </ul>
                  )}
                </div>
                <button className="template-card__clone btn tiny ghost" onClick={(e) => clone(e, t)} title="Duplicate template">Duplicate</button>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
