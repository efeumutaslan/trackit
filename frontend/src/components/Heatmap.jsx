import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// GitHub-style yearly heatmap. The user picks a calendar year via the
// dropdown; the grid then shows that entire year's workout density.
// Months are visually separated with a thin vertical line so each block
// reads as its own chunk rather than one long ribbon of weeks.
export default function Heatmap() {
  const [byDate, setByDate] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const nav = useNavigate();
  const today = new Date();

  // Provide a sensible window of years to pick from: a few back, current,
  // and one forward (so a December workout planning ahead still works).
  const thisYear = today.getFullYear();
  const years = [];
  for (let y = thisYear + 1; y >= thisYear - 4; y--) years.push(y);

  useEffect(() => {
    (async () => {
      const map = {};
      const promises = [];
      for (let m = 1; m <= 12; m++) {
        promises.push(
          api.get(`/sessions/calendar/${year}/${m}`).then((rows) => {
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
  }, [year]);

  // Build the year as columns of weeks. Each column = 7 cells (Mon..Sun).
  // We start from the Monday on/before Jan 1 of the selected year and walk
  // forward week-by-week through Dec 31. Leading and trailing cells that
  // fall outside the year are rendered blank.
  const yearStart = new Date(year, 0, 1);
  const yearEnd   = new Date(year, 11, 31);
  // back up to the Monday on/before Jan 1
  const startOffsetMon = (yearStart.getDay() + 6) % 7;
  const gridStart = new Date(yearStart);
  gridStart.setDate(yearStart.getDate() - startOffsetMon);

  const cols = [];
  const cur = new Date(gridStart);
  while (cur <= yearEnd || ((cur.getDay() + 6) % 7) !== 0) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const d = new Date(cur);
      const tz = d.getTimezoneOffset() * 60000;
      const iso = new Date(d - tz).toISOString().slice(0, 10);
      const inYear = d.getFullYear() === year;
      col.push({ iso, date: new Date(d), inYear });
      cur.setDate(cur.getDate() + 1);
    }
    cols.push(col);
    // safety stop — a year is at most 54 weeks
    if (cols.length > 54) break;
  }

  // Month label appears at the first column whose first in-year day's
  // month differs from the previous column's first in-year day's month.
  // We also flag those columns so CSS can paint a separator line.
  const monthLabels = cols.map((col, ci) => {
    const dayInYear = col.find((d) => d.inYear);
    if (!dayInYear) return { label: '', isStart: false };
    const m = dayInYear.date.getMonth();
    const prevCol = ci > 0 ? cols[ci - 1] : null;
    const prevDay = prevCol ? prevCol.find((d) => d.inYear) : null;
    const prevM = prevDay ? prevDay.date.getMonth() : -1;
    const isStart = m !== prevM;
    return { label: isStart ? MONTHS[m] : '', isStart };
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
      <div className="heatmap-toolbar">
        <select
          className="heatmap-year"
          value={year}
          onChange={(e) => setYear(+e.target.value)}
          aria-label="Year"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="heatmap-months">
        {monthLabels.map((m, ci) => (
          <div key={ci} className="heatmap-month">{m.label}</div>
        ))}
      </div>
      <div className="heatmap-grid">
        {cols.map((col, ci) => (
          <div
            className={`heatmap-col${monthLabels[ci].isStart && ci > 0 ? ' month-start' : ''}`}
            key={ci}
          >
            {col.map((d, ri) => {
              if (!d.inYear) {
                return <div key={ri} className="heatmap-cell outside" />;
              }
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
