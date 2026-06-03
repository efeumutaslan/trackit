import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

// Fetch the past 53 weeks of sessions and render them as a GitHub-style
// contribution heatmap. Each cell tinted by template color, opacity by count.
export default function Heatmap() {
  const [byDate, setByDate] = useState({});
  const nav = useNavigate();
  const today = new Date();

  useEffect(() => {
    // Pull the last 12 months by calling the monthly endpoint for each month.
    (async () => {
      const map = {};
      const promises = [];
      for (let i = 0; i < 13; i++) {
        const dt = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const y = dt.getFullYear(); const m = dt.getMonth() + 1;
        promises.push(
          api.get(`/sessions/calendar/${y}/${m}`).then((rows) => {
            for (const r of rows) {
              const k = r.session_date.slice(0, 10);
              if (!map[k]) map[k] = [];
              map[k].push(r);
            }
          }).catch(() => {})
        );
      }
      await Promise.all(promises);
      setByDate(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build 53 weeks ending on the current week.
  // Each column = 1 week, 7 rows (Mon..Sun).
  const totalDays = 53 * 7;
  const end = new Date(today);
  // align so that the last column ends on Sunday of the current week
  const dow = (end.getDay() + 6) % 7; // Mon=0
  const daysToSundayEnd = 6 - dow;
  end.setDate(end.getDate() + daysToSundayEnd);
  const days = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const tz = d.getTimezoneOffset() * 60000;
    const iso = new Date(d - tz).toISOString().slice(0, 10);
    days.push({ iso, date: d });
  }

  // Group into 7-rows x 53-cols
  const cols = [];
  for (let c = 0; c < 53; c++) {
    cols.push(days.slice(c * 7, c * 7 + 7));
  }

  // For each column, decide if a month label should appear above it.
  // A label appears at the FIRST column whose first day's month differs
  // from the previous column's month. That way each month appears once,
  // anchored at its starting week.
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthLabels = cols.map((col, ci) => {
    if (!col || col.length === 0) return '';
    const m = col[0].date.getMonth();
    const prev = ci > 0 && cols[ci - 1].length > 0
      ? cols[ci - 1][0].date.getMonth()
      : -1;
    return m !== prev ? MONTHS[m] : '';
  });

  function dayStyle(list) {
    if (!list || list.length === 0) return null;
    const color = list[0]?.template_color || 'var(--peach)';
    const intensity = Math.min(1, 0.45 + list.length * 0.25);
    return { background: color, opacity: intensity };
  }

  function onCellClick(iso, list) {
    if (!list || list.length === 0) return;
    if (list.length === 1) nav(`/sessions/${list[0].id}`);
  }

  return (
    <div className="heatmap">
      <div className="heatmap-months">
        {monthLabels.map((m, ci) => (
          <div key={ci} className="heatmap-month">{m}</div>
        ))}
      </div>
      <div className="heatmap-grid">
        {cols.map((col, ci) => (
          <div className="heatmap-col" key={ci}>
            {col.map((d, ri) => {
              const list = byDate[d.iso] || [];
              const isFuture = d.date > today;
              return (
                <div
                  key={ri}
                  className={`heatmap-cell${list.length ? ' has-session' : ''}${isFuture ? ' future' : ''}`}
                  style={dayStyle(list)}
                  title={list.length ? `${d.iso} · ${list.length} workout${list.length > 1 ? 's' : ''}` : d.iso}
                  onClick={() => onCellClick(d.iso, list)}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="calendar-legend" style={{ marginTop: 8 }}>
        <span>Less</span>
        <span className="legend-box" style={{ opacity: 0.45 }} />
        <span className="legend-box" style={{ opacity: 0.7 }} />
        <span className="legend-box" style={{ opacity: 0.95 }} />
        <span>More</span>
      </div>
    </div>
  );
}
