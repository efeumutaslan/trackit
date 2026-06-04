import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import TopBar from '../components/TopBar.jsx';
import { api } from '../lib/api.js';
import Icon from '../components/Icon.jsx';

function fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  const [y, m, day] = d.split('-');
  if (!y || !m || !day) return iso;
  return `${day}.${m}.${y}`;
}
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const diff = Math.max(0, new Date(endIso) - new Date(startIso));
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Sessions() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/sessions').then(setRows); }, []);

  return (
    <div className="app-shell page-sessions">
      <TopBar back title="Sessions" />
      <div className="content">
        <Link to="/log" className="btn primary mb-2">+ New session</Link>
        {rows.length === 0 ? (
          <div className="empty">
            <div className="icon"><Icon name="clipboard" /></div>
            <div>No sessions yet</div>
          </div>
        ) : (
          <>
            {/* Mobile: cards (the existing layout) */}
            <div className="mobile-only">
              {rows.map((s) => (
                <Link to={`/sessions/${s.id}`} key={s.id} className="list-row">
                  <div className="meta">
                    <span className="color-dot" style={{ background: s.template_color || 'var(--gray-soft)' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{s.template_name || 'Untitled session'}</div>
                      <div className="small text-muted">{fmtDate(s.session_date)}</div>
                    </div>
                  </div>
                  <span style={{ color: 'var(--gray)' }}><Icon name="chevron-right" /></span>
                </Link>
              ))}
            </div>
            {/* Desktop: data table */}
            <div className="desktop-only">
              <div className="data-table">
                <div className="data-table__head">
                  <div>Date</div>
                  <div>Workout</div>
                  <div>Start → End</div>
                  <div>Duration</div>
                  <div>Mood</div>
                  <div></div>
                </div>
                {rows.map((s) => (
                  <Link to={`/sessions/${s.id}`} key={s.id} className="data-table__row">
                    <div>{fmtDate(s.session_date)}</div>
                    <div className="data-table__wkt">
                      <span className="color-dot" style={{ background: s.template_color || 'var(--gray-soft)' }} />
                      <span style={{ fontWeight: 600 }}>{s.template_name || 'Untitled'}</span>
                    </div>
                    <div className="text-muted">
                      {s.started_at ? fmtTime(s.started_at) : '—'}
                      {' → '}
                      {s.finished_at ? fmtTime(s.finished_at) : '—'}
                    </div>
                    <div>{fmtDuration(s.started_at, s.finished_at) || '—'}</div>
                    <div className="data-table__mood">{s.mood || ''}</div>
                    <div style={{ color: 'var(--gray)' }}><Icon name="chevron-right" /></div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
