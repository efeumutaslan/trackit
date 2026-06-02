import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function Exercises() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/exercises').then(setRows); }, []);

  const grouped = rows.reduce((acc, e) => {
    const k = e.group_name || 'Ungrouped';
    if (!acc[k]) acc[k] = [];
    acc[k].push(e);
    return acc;
  }, {});

  return (
    <div className="app-shell">
      <TopBar back title="Exercises" />
      <div className="content">
        <Link to="/exercises/new" className="btn primary mb-2">+ New exercise</Link>
        {rows.length === 0 ? (
          <div className="empty">
            <div className="icon">💪</div>
            <div>No exercises yet</div>
          </div>
        ) : (
          Object.entries(grouped).map(([gname, list]) => (
            <div key={gname}>
              <div className="small text-muted" style={{ padding: '8px 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {gname}
              </div>
              {list.map((e) => (
                <Link to={`/exercises/${e.id}`} key={e.id} className="list-row">
                  <div className="meta"><span>💪</span> <span style={{ fontWeight: 600 }}>{e.name}</span></div>
                  <span style={{ color: 'var(--gray)' }}>›</span>
                </Link>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
