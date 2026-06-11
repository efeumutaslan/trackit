import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api.js';
import { getThemePref, setThemePref } from './theme.js';

// App-wide settings: loaded once after auth, exposed to every page so
// the optional-feature flags and theme are consistent without each page
// refetching. Falls back to sensible defaults before the first load
// resolves so nothing flickers off.
const DEFAULTS = {
  rep_placeholder_mode: 'empty',
  rest_timer_sound: 1,
  rest_timer_vibrate: 1,
  weight_increment: 2.5,
  theme: 'system',
  feat_rest_timer: 1,
  feat_bodyweight: 1,
  feat_weight_adjust: 1,
  feat_prev_note: 1,
  feat_tonnage: 1,
  feat_heatmap: 1,
};

const SettingsCtx = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!localStorage.getItem('trackit_token')) { setLoaded(true); return; }
    api.get('/settings')
      .then((s) => {
        const merged = { ...DEFAULTS, ...s };
        setSettings(merged);
        // The server is the source of truth for the theme once signed in;
        // mirror it into localStorage + <html> so it sticks and syncs
        // across devices. Only override the local pref if the server has
        // a value (it always does after the row is ensured).
        if (merged.theme && merged.theme !== getThemePref()) {
          setThemePref(merged.theme);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  useEffect(load, [load]);

  // Patch settings on the server and locally. Theme changes also update
  // localStorage + the live <html data-theme> immediately via setThemePref.
  const update = useCallback(async (patch) => {
    if ('theme' in patch) setThemePref(patch.theme);
    // optimistic local update so toggles feel instant
    setSettings((cur) => ({ ...cur, ...patch }));
    try {
      const next = await api.put('/settings', { ...patch });
      setSettings((cur) => ({ ...cur, ...next }));
      return next;
    } catch (e) {
      // reload authoritative state on failure
      load();
      throw e;
    }
  }, [load]);

  return (
    <SettingsCtx.Provider value={{ settings, loaded, update, reload: load }}>
      {children}
    </SettingsCtx.Provider>
  );
}

export const useSettings = () => useContext(SettingsCtx);
