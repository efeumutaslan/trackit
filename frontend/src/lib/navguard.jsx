import { createContext, useContext, useRef, useState, useCallback } from 'react';

// A lightweight "unsaved changes" guard that works with the plain
// BrowserRouter setup (no data-router / useBlocker needed).
//
// A page (e.g. TemplateEdit) calls `setGuard(fn)` while it has unsaved
// changes, where `fn(proceed)` is asked to confirm before any in-app
// navigation. App.jsx installs a single capture-phase click listener that,
// when a guard is active and the user clicks an internal link/NavLink,
// prevents the navigation and hands control to the guard. The guard shows
// its own Save/Discard prompt and then calls `proceed()` (the captured
// navigation) if the user chooses to leave.

const NavGuardContext = createContext(null);

export function NavGuardProvider({ children }) {
  // guardRef holds either null (no unsaved changes) or a function
  // (proceed) => void that decides what to do with a blocked navigation.
  const guardRef = useRef(null);
  const [active, setActive] = useState(false);

  const setGuard = useCallback((fn) => {
    guardRef.current = fn;
    setActive(!!fn);
  }, []);

  const clearGuard = useCallback(() => {
    guardRef.current = null;
    setActive(false);
  }, []);

  // Returns true if navigation should proceed immediately, false if it was
  // intercepted (the guard will handle proceeding later).
  const runGuard = useCallback((proceed) => {
    if (!guardRef.current) return true;
    guardRef.current(proceed);
    return false;
  }, []);

  return (
    <NavGuardContext.Provider value={{ active, setGuard, clearGuard, runGuard }}>
      {children}
    </NavGuardContext.Provider>
  );
}

export function useNavGuard() {
  const ctx = useContext(NavGuardContext);
  if (!ctx) return { active: false, setGuard: () => {}, clearGuard: () => {}, runGuard: () => true };
  return ctx;
}
