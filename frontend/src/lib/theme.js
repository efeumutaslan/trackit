// Theme handling. The user picks one of three modes in Settings:
//   'system' (default) — follow the OS prefers-color-scheme
//   'dark'             — force the original dark palette
//   'light'            — force the light palette
//
// We store the *preference* (system/dark/light) in localStorage so it
// applies instantly on load, before any network call, and persists for
// logged-out screens. The backend also stores it (per user) so the
// choice syncs across devices; auth.jsx pushes the server value into
// here after login.
//
// What actually drives CSS is the resolved value written to
// <html data-theme="…"> — only ever 'light' or 'dark'. 'system' is
// resolved here against the media query.

const STORAGE_KEY = 'trackit_theme';
const VALID = ['system', 'dark', 'light'];

export function getThemePref() {
  const v = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
  return VALID.includes(v) ? v : 'system';
}

function systemPrefersDark() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Map a preference to the concrete palette to render.
export function resolveTheme(pref) {
  const p = VALID.includes(pref) ? pref : 'system';
  if (p === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return p;
}

// Write the resolved palette onto <html>. Dark is the default styling
// (no attribute needed), light is opt-in via the attribute — but we set
// it explicitly in both cases so toggling is unambiguous.
export function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  if (resolved === 'light') root.setAttribute('data-theme', 'light');
  else root.setAttribute('data-theme', 'dark');
  // Keep the browser/status-bar chrome colour in step with the canvas.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'light' ? '#F4F5F0' : '#0A0A0A');
}

// Persist the preference and apply it immediately.
export function setThemePref(pref) {
  const p = VALID.includes(pref) ? pref : 'system';
  try { localStorage.setItem(STORAGE_KEY, p); } catch {}
  applyTheme(p);
}

// Keep the page in sync when the OS theme flips while we're on 'system'.
// Call once at app start; returns a cleanup function.
export function watchSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getThemePref() === 'system') applyTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
