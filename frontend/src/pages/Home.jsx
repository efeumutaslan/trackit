import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import Calendar from '../components/Calendar.jsx';
import Heatmap from '../components/Heatmap.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useSettings } from '../lib/settings.jsx';
import Icon from '../components/Icon.jsx';

function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}

export default function Home() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const nav = useNavigate();
  const [recent, setRecent] = useState([]);
  const [stats, setStats] = useState({ thisWeek: 0, totalSessions: 0, latestBw: null });
  const [view, setView] = useState('month'); // 'month' | 'year'
  // When the user clicks a month label in the year heatmap we hop into
  // Month view with that year + month pre-selected. The pair acts as a
  // key so Calendar re-mounts and picks up the new initial values.
  const [pendingMonth, setPendingMonth] = useState(null);

  useEffect(() => {
    api.get('/sessions').then((rows) => {
      setRecent(rows.slice(0, 5));
      const now = new Date();
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      const inWeek = rows.filter((r) => new Date(r.session_date) >= weekAgo);
      setStats((s) => ({ ...s, thisWeek: inWeek.length, totalSessions: rows.length }));
    }).catch(() => {});
    api.get('/bodyweight/latest').then((bw) => {
      setStats((s) => ({ ...s, latestBw: bw }));
    }).catch(() => {});
  }, []);

  return (
    <div className="app-shell page-home">
      <TopBar
        brand
        brandSuffix={user?.username}
        right={
          // Sign out only on desktop now — the cog moved to the bottom nav
          // on mobile, and we don't want a duplicate sign-out either.
          <button
            className="right-action desktop-only"
            onClick={() => { logout(); nav('/login'); }}
            title="Sign out"
          >
            Sign out
          </button>
        }
      />
      <div className="content">
        {/* Desktop hero: greeting + stat cards + CTA */}
        <div className="desktop-hero desktop-only">
          <div className="desktop-hero__head">
            <div>
              <div className="desktop-hero__hi">Welcome back,</div>
              <div className="desktop-hero__user">{user?.username}</div>
            </div>
            <Link to="/log" className="btn primary desktop-hero__cta">+ Log a workout</Link>
          </div>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card__label">This week</div>
              <div className="stat-card__value">{stats.thisWeek}</div>
              <div className="stat-card__hint">workouts</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Total</div>
              <div className="stat-card__value">{stats.totalSessions}</div>
              <div className="stat-card__hint">sessions</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Bodyweight</div>
              <div className="stat-card__value">
                {stats.latestBw ? `${stats.latestBw.weight_kg} kg` : '—'}
              </div>
              <div className="stat-card__hint">
                {stats.latestBw ? fmtDate(stats.latestBw.log_date) : 'Log to start'}
              </div>
            </div>
          </div>
        </div>

        {/* 2-column dashboard on desktop, stacked on mobile */}
        <div className="home-grid">
          <section className="home-grid__main">
            {settings?.feat_heatmap !== 0 && (
              <>
                <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>{view === 'month' ? 'Calendar' : 'Year heatmap'}</span>
                  <div className="view-toggle">
                    <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Month</button>
                    <button className={view === 'year' ? 'on' : ''} onClick={() => setView('year')}>Year</button>
                  </div>
                </div>
                {view === 'month'
                  ? (
                    <Calendar
                      key={pendingMonth ? `${pendingMonth.y}-${pendingMonth.m}` : 'default'}
                      initialYear={pendingMonth?.y}
                      initialMonth={pendingMonth?.m}
                    />
                  )
                  : (
                    <Heatmap
                      onMonthClick={(y, m) => {
                        setPendingMonth({ y, m });
                        setView('month');
                      }}
                    />
                  )
                }
              </>
            )}
          </section>

          <aside className="home-grid__side">
            <div className="section-title">Recent sessions</div>
            {recent.length === 0 ? (
              <div className="empty">
                <div className="icon"><Icon name="clipboard" /></div>
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
                  <span style={{ color: 'var(--gray)' }}><Icon name="chevron-right" /></span>
                </Link>
              ))
            )}
            {recent.length > 0 && (
              <Link to="/sessions" className="btn ghost mt-2">View all</Link>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
