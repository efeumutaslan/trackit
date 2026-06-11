import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function firstDow(y, m) {
  // Monday = 0
  const d = new Date(y, m - 1, 1).getDay();
  return (d + 6) % 7;
}

export default function Calendar({ initialYear, initialMonth } = {}) {
  const today = new Date();
  const [y, setY] = useState(initialYear ?? today.getFullYear());
  const [m, setM] = useState(initialMonth ?? (today.getMonth() + 1));
  const [sessions, setSessions] = useState([]);
  const [picker, setPicker] = useState(null); // { date, list } when a day with 2+ sessions is tapped
  const nav = useNavigate();

  // If the parent passes a different initial year/month later (eg user
  // clicked a month tile in the year heatmap), navigate to it.
  useEffect(() => {
    if (initialYear)  setY(initialYear);
    if (initialMonth) setM(initialMonth);
  }, [initialYear, initialMonth]);

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

  // Always show the selected template's colour at full strength — the
  // old GitHub-style opacity-by-count scaling is gone. Multiple workouts
  // on a day are indicated by the count badge, not a brighter fill.
  function dayStyle(list) {
    if (!list || list.length === 0) return null;
    return { background: list[0]?.template_color || 'var(--peach)' };
  }

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button onClick={prev} aria-label="Previous month"><Icon name="chevron-left" /></button>
        <h3>{monthName}</h3>
        <button onClick={next} aria-label="Next month"><Icon name="chevron-right" /></button>
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
              style={dayStyle(list)}
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
                <span style={{ color: 'var(--gray)' }}><Icon name="chevron-right" /></span>
              </div>
            ))}
            <button className="btn ghost mt-1" onClick={() => setPicker(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
