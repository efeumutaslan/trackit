import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function firstDow(y, m) {
  // Monday = 0
  const d = new Date(y, m - 1, 1).getDay();
  return (d + 6) % 7;
}

export default function Calendar() {
  const today = new Date();
  const [y, setY] = useState(today.getFullYear());
  const [m, setM] = useState(today.getMonth() + 1);
  const [sessions, setSessions] = useState([]);
  const [picker, setPicker] = useState(null); // { date, list } when a day with 2+ sessions is tapped
  const nav = useNavigate();

  useEffect(() => {
    api.get(`/sessions/calendar/${y}/${m}`).then(setSessions).catch(() => {});
  }, [y, m]);

  const dim = daysInMonth(y, m);
  const start = firstDow(y, m);
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);

  // group sessions by day-of-month
  const byDay = sessions.reduce((acc, s) => {
    const d = +s.session_date.slice(8, 10);
    if (!acc[d]) acc[d] = [];
    acc[d].push(s);
    return acc;
  }, {});

  function prev() {
    if (m === 1) { setY(y - 1); setM(12); }
    else setM(m - 1);
  }
  function next() {
    if (m === 12) { setY(y + 1); setM(1); }
    else setM(m + 1);
  }

  const monthName = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // GitHub-style density: opacity scales with workout count for that day
  function densityStyle(list) {
    if (!list || list.length === 0) return null;
    const n = list.length;
    // Use the first session's template color as the base hue; blend others
    const base = list[0]?.template_color || 'var(--peach)';
    // 1 workout -> 0.55, 2 -> 0.75, 3+ -> 1.0 opacity feel via layering
    const intensity = Math.min(1, 0.45 + n * 0.25);
    return {
      background: base,
      opacity: intensity,
    };
  }

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button onClick={prev}>‹</button>
        <h3>{monthName}</h3>
        <button onClick={next}>›</button>
      </div>
      <div className="calendar-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div className="dow" key={d}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div className="day empty" key={i} />;
          const list = byDay[d] || [];
          const isToday = y === today.getFullYear() && m === today.getMonth() + 1 && d === today.getDate();
          const names = list.map((s) => s.template_name || 'Session').join(', ');
          const clickable = list.length > 0;
          const onClick = clickable
            ? () => {
                if (list.length === 1) nav(`/sessions/${list[0].id}`);
                else setPicker({ y, m, d, list });
              }
            : undefined;
          return (
            <div
              key={i}
              className={`day${isToday ? ' today' : ''}${list.length ? ' has-session' : ''}${clickable ? ' clickable' : ''}`}
              style={densityStyle(list)}
              title={names ? `${names} (${list.length})` : ''}
              onClick={onClick}
              role={clickable ? 'button' : undefined}
            >
              <span className="day-num">{d}</span>
              {list.length > 1 && <span className="day-count">{list.length}</span>}
            </div>
          );
        })}
      </div>
      {sessions.length > 0 && (
        <div className="calendar-legend">
          <span>Less</span>
          <span className="legend-box" style={{ opacity: 0.45 }} />
          <span className="legend-box" style={{ opacity: 0.7 }} />
          <span className="legend-box" style={{ opacity: 0.95 }} />
          <span>More</span>
        </div>
      )}
      {picker && (
        <div className="modal-bg" onClick={() => setPicker(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{String(picker.d).padStart(2,'0')}.{String(picker.m).padStart(2,'0')}.{picker.y}</h3>
            {picker.list.map((s) => (
              <div key={s.id} className="list-row" onClick={() => { nav(`/sessions/${s.id}`); setPicker(null); }}>
                <div className="meta">
                  <span className="color-dot" style={{ background: s.template_color || 'var(--gray-soft)' }} />
                  <span style={{ fontWeight: 600 }}>{s.template_name || 'Untitled session'}</span>
                </div>
                <span style={{ color: 'var(--gray)' }}>›</span>
              </div>
            ))}
            <button className="btn ghost mt-1" onClick={() => setPicker(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
