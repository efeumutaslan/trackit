import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

// The user's local calendar day (YYYY-MM-DD), so the tracker follows the
// user's own clock — a day boundary at their local 00:00, not UTC.
function localToday() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function drinkIcon(name) {
  const n = (name || '').toLowerCase();
  if (/coffee|americano|espresso|latte|cappuccino|mocha|tea|çay|kahve/.test(n)) return 'mug-hot';
  if (/juice|soda|cola|meyve|smoothie|shake|milk|süt/.test(n)) return 'glass-water';
  return 'droplet';
}

// Animated water ring: a circular progress ring whose interior fills with a
// gently moving wave as you approach the daily goal.
function WaterRing({ total, goal }) {
  const pct = goal > 0 ? Math.min(1, total / goal) : 0;
  const SIZE = 200, R = 88, CX = 100, CY = 100;
  const circ = 2 * Math.PI * R;
  // Smoothly animate the displayed percentage.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const from = shown;
    const dur = 700;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + (pct - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  // Wave fill: clip a moving sine path to a circle. The water level rises
  // with `shown`. Two layered waves drift at different speeds.
  const waterTop = CY + R - shown * (2 * R); // y of the surface
  const reached = pct >= 1;

  return (
    <div className="water-ring">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="200" height="200">
        <defs>
          <clipPath id="ringClip"><circle cx={CX} cy={CY} r={R - 6} /></clipPath>
          <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7Fd0ff" />
            <stop offset="100%" stopColor="#2b9cff" />
          </linearGradient>
        </defs>

        {/* track */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--gray-bg)" strokeWidth="12" />

        {/* water fill clipped to inner circle. The wave paths are wider than
            the view and tile on an 80px period, so a translateX of exactly
            one period (see CSS) loops seamlessly with no jump or side gap. */}
        <g clipPath="url(#ringClip)">
          <rect x="0" y="0" width={SIZE} height={SIZE} fill="rgba(43,156,255,0.06)" />
          {/* back wave (period 80px, starts well left of the view) */}
          <path className="water-wave water-wave--back"
                d={`M -160 ${waterTop} q 20 -10 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 V ${SIZE + 20} H -160 Z`}
                fill="rgba(127,208,255,0.55)" />
          {/* front wave */}
          <path className="water-wave water-wave--front"
                d={`M -160 ${waterTop} q 20 10 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 V ${SIZE + 20} H -160 Z`}
                fill="url(#waterGrad)" />
        </g>

        {/* progress arc */}
        <circle
          cx={CX} cy={CY} r={R} fill="none"
          stroke={reached ? 'var(--peach)' : '#2b9cff'}
          strokeWidth="12" strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - shown)}
          transform={`rotate(-90 ${CX} ${CY})`}
          style={{ transition: 'stroke 0.3s' }}
        />
      </svg>
      <div className="water-ring__center">
        <div className="water-ring__total">{Math.round(total)}<span>ml</span></div>
        <div className="water-ring__goal">of {goal} ml</div>
        {reached && <div className="water-ring__done">Goal reached 🎉</div>}
      </div>
    </div>
  );
}

export default function WaterTracker() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total_ml: 0, goal_ml: 2500, entries: [] });
  const [picking, setPicking] = useState(null);  // item being logged
  const [amount, setAmount] = useState('');
  const inputRef = useRef(null);

  // The day the tracker is showing — the user's local "today". It rolls
  // over automatically at local midnight (and whenever the tab regains
  // focus, in case the device slept across the boundary), so the ring
  // resets to 0 for the new day without needing a manual reload.
  const [date, setDate] = useState(localToday);
  useEffect(() => {
    function syncDay() {
      const t = localToday();
      setDate((cur) => (cur === t ? cur : t));
    }
    // Schedule a tick just after the next local midnight, then re-arm.
    let timer;
    function arm() {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 1, 0); // 00:00:01 local tomorrow
      timer = setTimeout(() => { syncDay(); arm(); }, next - now);
    }
    arm();
    document.addEventListener('visibilitychange', syncDay);
    window.addEventListener('focus', syncDay);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', syncDay);
      window.removeEventListener('focus', syncDay);
    };
  }, []);

  function loadSummary() {
    api.get(`/water?date=${date}`).then(setSummary).catch(() => {});
  }
  useEffect(() => {
    api.get('/nutrition').then(setItems).catch(() => {});
  }, []);
  useEffect(loadSummary, [date]);

  function openPicker(item) {
    setPicking(item);
    setAmount(item.default_ml != null ? String(item.default_ml) : '');
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function logAmount() {
    const ml = parseInt(amount, 10);
    if (!Number.isFinite(ml) || ml <= 0) return;
    await api.post('/water', { nutrition_item_id: picking.id, amount_ml: ml, log_date: date });
    setPicking(null);
    setAmount('');
    loadSummary();
    if (navigator.vibrate) navigator.vibrate(15);
  }

  async function delEntry(id) {
    await api.del(`/water/${id}`);
    loadSummary();
  }

  return (
    <div className="card water-card">
      <div className="section-title" style={{ marginTop: 0 }}>Water</div>

      <WaterRing total={summary.total_ml} goal={summary.goal_ml} />

      {/* Quick-add chips */}
      <div className="water-chips">
        {items.map((it) => (
          <button key={it.id} className="water-chip" onClick={() => openPicker(it)}>
            <Icon name={drinkIcon(it.name)} />
            <span>{it.name}</span>
          </button>
        ))}
      </div>

      {/* Today's entries */}
      {summary.entries.length > 0 && (
        <div className="water-entries">
          {summary.entries.map((e) => (
            <div key={e.id} className="water-entry">
              <span className="water-entry__icon"><Icon name={drinkIcon(e.label)} /></span>
              <span className="water-entry__label">{e.label}</span>
              <span className="water-entry__amt">
                {e.amount_ml}ml{e.water_ml !== e.amount_ml ? ` → ${e.water_ml}ml` : ''}
              </span>
              <button className="water-entry__del" onClick={() => delEntry(e.id)} aria-label="Remove">
                <Icon name="xmark" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Amount picker sheet */}
      {picking && (
        <div className="modal-bg" onClick={() => setPicking(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name={drinkIcon(picking.name)} /> {picking.name}
            </h3>
            <div className="small text-muted" style={{ marginBottom: 12 }}>
              How much did you drink? Counts as {Math.round(picking.water_factor * 100)}% water.
            </div>
            <div className="water-presets">
              {[100, 200, 330, 500].map((v) => (
                <button key={v} className="water-preset" onClick={() => setAmount(String(v))}>{v}ml</button>
              ))}
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Amount (ml)</label>
              <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 250"
              />
            </div>
            {amount && Number(amount) > 0 && (
              <div className="small text-muted" style={{ marginBottom: 10 }}>
                Adds <strong>{Math.round(Number(amount) * picking.water_factor)}ml</strong> of water.
              </div>
            )}
            <button className="btn primary" onClick={logAmount}>Add</button>
            <button className="btn ghost mt-1" onClick={() => setPicking(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
