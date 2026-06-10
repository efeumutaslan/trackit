import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// GitHub-style yearly heatmap. The user picks a calendar year via the
// dropdown; the grid then shows that entire year's workout density.
//
// Layout: the year is rendered as 12 MONTH GROUPS. Each group is a
// vertical stack of [month label pill] + [that month's week-columns].
// Because the label lives INSIDE the same flex item as its columns, it
// is always exactly above its own month — no separate label row to
// drift out of alignment, and the whole strip scrolls as one unit on
// narrow screens.
export default function Heatmap({ onMonthClick } = {}) {
  const [byDate, setByDate] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  // When a day holds more than one workout we can't just navigate —
  // open a picker modal listing that day's sessions instead.
  const [dayPick, setDayPick] = useState(null); // { iso, list } | null
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

  // Group consecutive columns by the month of their first in-year day.
  // Each group renders as [label pill above] + [columns below], so the
  // label can never drift away from its own weeks.
  const groups = [];
  for (const col of cols) {
    const dayInYear = col.find((d) => d.inYear);
    const m = dayInYear ? dayInYear.date.getMonth() : null;
    const last = groups[groups.length - 1];
    if (last && last.monthIdx === m) last.cols.push(col);
    else groups.push({ monthIdx: m, cols: [col] });
  }

  function dayStyle(list) {
    if (!list || list.length === 0) return null;
    const color = list[0]?.template_color || 'var(--peach)';
    return { background: color };
  }

  function onCellClick(iso, list) {
    if (!list || list.length === 0) return;
    if (list.length === 1) { nav(`/sessions/${list[0].id}`); return; }
    // Multiple workouts that day — let the user pick which one to open.
    setDayPick({ iso, list });
  }

  // DD.MM.YYYY for the picker title
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };

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
      <div className="heatmap-scroll">
        {groups.map((g, gi) => (
          <div className={`heatmap-group${gi > 0 ? ' month-start' : ''}`} key={gi}>
            <div
              className={`heatmap-month${g.monthIdx != null && onMonthClick ? ' heatmap-month--clickable' : ''}`}
              onClick={() => {
                if (g.monthIdx != null && onMonthClick) {
                  // Months are 1-indexed in Calendar's URL/state.
                  onMonthClick(year, g.monthIdx + 1);
                }
              }}
              role={g.monthIdx != null && onMonthClick ? 'button' : undefined}
            >
              {g.monthIdx != null ? MONTHS[g.monthIdx] : ''}
            </div>
            <div className="heatmap-group-cols">
              {g.cols.map((col, ci) => (
                <div className="heatmap-col" key={ci}>
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
                      >
                        {list.length > 1 && <span className="heatmap-cell__multi">{list.length}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {dayPick && (
        <div className="modal-bg" onClick={() => setDayPick(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="calendar" /> {fmtDate(dayPick.iso)}
            </h3>
            <div className="small text-muted" style={{ marginBottom: 10 }}>
              {dayPick.list.length} workouts — pick one to open
            </div>
            {dayPick.list.map((w) => (
              <div
                className="list-row"
                key={w.id}
                onClick={() => { setDayPick(null); nav(`/sessions/${w.id}`); }}
              >
                <div className="meta">
                  <span
                    className="heatmap-pick__dot"
                    style={{ background: w.template_color || 'var(--peach)' }}
                  />
                  {w.template_name || 'Workout'}
                </div>
                <span style={{ color: 'var(--gray)' }}><Icon name="chevron-right" /></span>
              </div>
            ))}
            <button className="btn ghost mt-1" onClick={() => setDayPick(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
