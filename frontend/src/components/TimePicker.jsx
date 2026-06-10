import { useEffect, useLayoutEffect, useState, useRef } from 'react';
import Icon from './Icon.jsx';

// Extracted from Session.jsx — the set-level duration input and its
// iOS-style wheel. Self-contained: depends only on React + <Icon/>.

// Time input. On mobile this is a 3-column wheel picker (iOS-style)
// styled with CSS scroll-snap, plus a keyboard toggle for manual entry.
// On desktop (>=1024px) only the text input is rendered — wheels don't
// help with a keyboard + mouse.
//
// The text input is a left-shifting digit buffer: the user just types
// digits and they flow in from the right ("3000" → 00:30:00, then
// typing "5" → 03:00:05 ... etc). No cursor management, no colon
// typing — fastest possible manual entry on both platforms.
export function TimePicker({ value, onCommit, spanCols = false }) {
  const init = (sec) => {
    const s = sec ?? 0;
    return {
      h: Math.floor(s / 3600),
      m: Math.floor((s % 3600) / 60),
      s: s % 60,
    };
  };
  const [hms, setHms] = useState(init(value));
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [mode, setMode] = useState('wheel');

  // The wheel reports every committed value through this ref. When the
  // session reloads after a save, the new `value` prop equals what the
  // wheel itself just reported — re-syncing scrollTop in that case is
  // what used to make the wheel stutter mid-flick. We only push the
  // scroll position when the value changed EXTERNALLY (A/B toggle,
  // another device, etc).
  const lastReported = useRef(value ?? null);
  useEffect(() => {
    if ((value ?? null) !== lastReported.current) {
      lastReported.current = value ?? null;
      setHms(init(value));
    }
  }, [value]);

  const commit = (next) => {
    setHms(next);
    const sec = next.h * 3600 + next.m * 60 + next.s;
    lastReported.current = sec;
    onCommit(sec);
  };

  const fmt = (sec) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
  };

  // ── Manual entry: digit buffer ──
  // Stored as a plain digit string (max 6). Rendering pads it to 6 and
  // formats HH:MM:SS, so typing left-shifts naturally.
  const secToDigits = (sec) => {
    if (sec == null) return '';
    const { h, m, s } = init(sec);
    return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${String(s).padStart(2, '0')}`;
  };
  const [digits, setDigits] = useState(secToDigits(value));
  useEffect(() => {
    if ((value ?? null) !== lastReported.current) return; // handled above
    setDigits(secToDigits(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const digitsToDisplay = (d) => {
    if (d === '') return '';
    const p = d.padStart(6, '0');
    return `${p.slice(0, 2)}:${p.slice(2, 4)}:${p.slice(4, 6)}`;
  };
  const onTextChange = (e) => {
    // Strip formatting; keep the last 6 digits typed.
    const d = e.target.value.replace(/\D/g, '').slice(-6);
    setDigits(d);
  };
  const onTextBlur = () => {
    if (digits === '') { lastReported.current = null; onCommit(null); return; }
    const p = digits.padStart(6, '0');
    const h = parseInt(p.slice(0, 2), 10);
    const m = parseInt(p.slice(2, 4), 10);
    const s = parseInt(p.slice(4, 6), 10);
    commit({ h, m, s });
    setDigits(secToDigits(h * 3600 + m * 60 + s));
  };

  const wrapStyle = spanCols ? { gridColumn: '2 / 4' } : undefined;

  if (isDesktop || mode === 'text') {
    return (
      <div className="time-picker time-picker--text" style={wrapStyle}>
        <input
          type="text"
          inputMode="numeric"
          className="time-text-input"
          value={digitsToDisplay(digits)}
          onChange={onTextChange}
          onBlur={onTextBlur}
          placeholder="00:00:00"
        />
        {!isDesktop && (
          <button
            type="button"
            className="time-mode-toggle"
            onClick={() => { setDigits(secToDigits(hms.h * 3600 + hms.m * 60 + hms.s)); setMode('wheel'); }}
            aria-label="Switch to wheel picker"
          >
            <Icon name="caret-down" />
          </button>
        )}
      </div>
    );
  }

  // Mobile wheel mode
  return (
    <div className="time-picker time-picker--wheel" style={wrapStyle}>
      <TimeWheel max={23} value={hms.h} onChange={(h) => commit({ ...hms, h })} label="hr" />
      <span className="time-wheel-sep">:</span>
      <TimeWheel max={59} value={hms.m} onChange={(m) => commit({ ...hms, m })} label="min" />
      <span className="time-wheel-sep">:</span>
      <TimeWheel max={59} value={hms.s} onChange={(s) => commit({ ...hms, s })} label="sec" />
      <button
        type="button"
        className="time-mode-toggle"
        onClick={() => { setDigits(secToDigits(hms.h * 3600 + hms.m * 60 + hms.s)); setMode('text'); }}
        aria-label="Switch to keyboard input"
      >
        <Icon name="edit" />
      </button>
    </div>
  );
}

// A single vertical wheel column. Renders the full range (0..max) as
// stacked cells in a scroll-snap container; the cell currently at the
// vertical centre of the viewport is the selected value.
//
// Smoothness rules learned the hard way:
//  1. NEVER touch scrollTop while the user's finger / momentum is
//     active — programmatic writes kill iOS momentum dead. We track
//     interaction and suppress external sync until the wheel settles.
//  2. Don't re-sync when the incoming `value` is the one this wheel
//     just reported (the post-save session reload echoes it back).
//  3. Prefer the native `scrollend` event to know when snapping is
//     done; fall back to a quiet-period timer elsewhere.
function TimeWheel({ max, value, onChange, label }) {
  const ref = useRef(null);
  const ITEM_HEIGHT = 32;
  const interacting = useRef(false);   // finger down or momentum running
  const lastSent = useRef(value);      // last value this wheel reported up

  // Sync external value → scroll position, but only when (a) the value
  // really came from outside and (b) the user isn't mid-scroll.
  useLayoutEffect(() => {
    if (value === lastSent.current) return;   // our own echo — ignore
    lastSent.current = value;
    let cancelled = false;
    const attempt = () => {
      if (cancelled || interacting.current) return;
      const el = ref.current;
      if (!el) return;
      const target = value * ITEM_HEIGHT;
      if (el.clientHeight === 0) {            // layout not ready (iOS)
        requestAnimationFrame(attempt);
        return;
      }
      el.scrollTop = target;
    };
    attempt();
    return () => { cancelled = true; };
  }, [value]);

  // Initial position on mount (the effect above skips it because
  // value === lastSent at mount time).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      if (!ref.current) return;
      if (ref.current.clientHeight === 0) { requestAnimationFrame(place); return; }
      ref.current.scrollTop = value * ITEM_HEIGHT;
    };
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settleTimer = useRef(null);
  const report = () => {
    const el = ref.current;
    if (!el) return;
    interacting.current = false;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(max, idx));
    if (clamped !== lastSent.current) {
      lastSent.current = clamped;
      onChange(clamped);
    }
  };
  const onScroll = () => {
    interacting.current = true;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // Quiet-period fallback for browsers without `scrollend` (iOS <17).
    settleTimer.current = setTimeout(report, 140);
  };
  useEffect(() => {
    const el = ref.current;
    if (!el || !('onscrollend' in el)) return undefined;
    const onEnd = () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      report();
    };
    el.addEventListener('scrollend', onEnd);
    return () => el.removeEventListener('scrollend', onEnd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = [];
  for (let i = 0; i <= max; i++) items.push(i);

  return (
    <div className="time-wheel" aria-label={label}>
      <div
        ref={ref}
        className="time-wheel__list"
        onScroll={onScroll}
        onTouchStart={() => { interacting.current = true; }}
      >
        {/* Top spacer so item 0 can sit at the centre row */}
        <div className="time-wheel__spacer" style={{ height: ITEM_HEIGHT }} />
        {items.map((n) => (
          <div
            key={n}
            className={`time-wheel__item${n === value ? ' is-selected' : ''}`}
            style={{ height: ITEM_HEIGHT }}
          >
            {String(n).padStart(2, '0')}
          </div>
        ))}
        {/* Bottom spacer so the last item can reach the centre row */}
        <div className="time-wheel__spacer" style={{ height: ITEM_HEIGHT }} />
      </div>
      {/* Centre highlight band */}
      <div
        className="time-wheel__centre"
        style={{ top: ITEM_HEIGHT, height: ITEM_HEIGHT }}
      />
    </div>
  );
}

