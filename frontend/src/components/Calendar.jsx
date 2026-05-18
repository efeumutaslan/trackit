import { useEffect, useState } from 'react';
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

  useEffect(() => {
    api.get(`/sessions/calendar/${y}/${m}`).then(setSessions).catch(() => {});
  }, [y, m]);

  const dim = daysInMonth(y, m);
  const start = firstDow(y, m);
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);

  const sessByDay = sessions.reduce((acc, s) => {
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

  const monthName = new Date(y, m - 1, 1).toLocaleString('tr-TR', { month: 'long', year: 'numeric' });

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button onClick={prev}>‹</button>
        <h3>{monthName}</h3>
        <button onClick={next}>›</button>
      </div>
      <div className="calendar-grid">
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((d) => (
          <div className="dow" key={d}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div className="day empty" key={i} />;
          const list = sessByDay[d] || [];
          const isToday = y === today.getFullYear() && m === today.getMonth() + 1 && d === today.getDate();
          const color = list[0]?.template_color;
          return (
            <div
              key={i}
              className={`day${isToday ? ' today' : ''}${list.length ? ' has-session' : ''}`}
              style={list.length ? { background: color || 'var(--peach)' } : null}
              title={list.map((s) => s.template_name || 'Session').join(', ')}
            >
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}
