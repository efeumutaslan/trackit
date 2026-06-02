import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Calendar from '../components/Calendar.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

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
            title="Sign out"
          >
            Sign out
          </button>
        }
      />
      <div className="content">
        <div className="welcome-bar">
          <div className="welcome-bar__name">
            <span className="welcome-bar__hi">Hi,</span>
            <span className="welcome-bar__user">{user?.username}</span>
          </div>
          <Link to="/log" className="btn primary welcome-bar__cta">+ Log a workout</Link>
        </div>

        <div className="section-title">Calendar</div>
        <Calendar />

        <div className="section-title">Recent sessions</div>
        {recent.length === 0 ? (
          <div className="empty">
            <div className="icon">📋</div>
            <div>No sessions yet. Start your first workout!</div>
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
                  <div style={{ fontWeight: 600 }}>{s.template_name || 'Untitled session'}</div>
                  <div className="small text-muted">{fmtDate(s.session_date)}</div>
                </div>
              </div>
              <span style={{ color: 'var(--gray)' }}>›</span>
            </Link>
          ))
        )}
        {recent.length > 0 && (
          <Link to="/sessions" className="btn ghost mt-2">View all</Link>
        )}
      </div>
    </div>
  );
}
