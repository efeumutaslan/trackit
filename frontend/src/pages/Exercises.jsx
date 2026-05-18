import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';

export default function Exercises() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/exercises').then(setRows); }, []);
  return (
    <div className="app-shell">
      <TopBar back title="Egzersizler" />
      <div className="content">
        <Link to="/exercises/new" className="btn primary mb-2">+ Yeni egzersiz</Link>
        {rows.length === 0 ? (
          <div className="empty">
            <div className="icon">💪</div>
            <div>Henüz egzersiz yok</div>
          </div>
        ) : (
          rows.map((e) => (
            <Link to={`/exercises/${e.id}`} key={e.id} className="list-row">
              <div className="meta"><span>💪</span> <span style={{ fontWeight: 600 }}>{e.name}</span></div>
              <span style={{ color: 'var(--gray)' }}>›</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
