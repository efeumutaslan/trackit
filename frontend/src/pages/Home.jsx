import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Calendar from '../components/Calendar.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Home() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api.get('/sessions').then((rows) => setRecent(rows.slice(0, 5))).catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <TopBar
        brand
        right={
          <button
            className="right-action"
            onClick={() => { logout(); nav('/login'); }}
            title="Çıkış"
          >
            Çıkış
          </button>
        }
      />
      <div className="content">
        <div className="card" style={{ background: 'var(--peach-soft)', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--ink-soft)' }}>Hoş geldin</div>
          <h2 style={{ margin: '4px 0 14px', fontSize: 22 }}>{user?.username}</h2>
          <Link to="/log" className="btn primary">+ Antrenmanı kaydet</Link>
        </div>

        <div className="section-title">Takvim</div>
        <Calendar />

        <div className="section-title">Son sessionlar</div>
        {recent.length === 0 ? (
          <div className="empty">
            <div className="icon">📋</div>
            <div>Henüz session yok. İlk antrenmanını başlat!</div>
          </div>
        ) : (
          recent.map((s) => (
            <Link to={`/sessions/${s.id}`} key={s.id} className="list-row">
              <div className="meta">
                <span
                  className="color-dot"
                  style={{ background: s.template_color || 'var(--gray-soft)' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{s.template_name || 'Sessiz session'}</div>
                  <div className="small text-muted">{s.session_date}</div>
                </div>
              </div>
              <span style={{ color: 'var(--gray)' }}>›</span>
            </Link>
          ))
        )}
        {recent.length > 0 && (
          <Link to="/sessions" className="btn ghost mt-2">Tümünü gör</Link>
        )}
      </div>
    </div>
  );
}
