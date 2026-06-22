import { Routes, Route, Navigate, useLocation, matchPath, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from './lib/auth.jsx';
import { useNavGuard } from './lib/navguard.jsx';
import BottomNav from './components/BottomNav.jsx';
import Sidebar from './components/Sidebar.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import LogSession from './pages/LogSession.jsx';
import Session from './pages/Session.jsx';
import Sessions from './pages/Sessions.jsx';
import Templates from './pages/Templates.jsx';
import TemplateEdit from './pages/TemplateEdit.jsx';
import Exercises from './pages/Exercises.jsx';
import ExerciseEdit from './pages/ExerciseEdit.jsx';
import Bodyweight from './pages/Bodyweight.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }
  // Layout: at >=1024px the sidebar is visible to the left and the page
  // content fills the remaining width as a dashboard. At smaller widths
  // the sidebar collapses (display:none via CSS) and the mobile-shell
  // (max-width 540px, bottom nav) takes over. .app-frame is
  // display:contents on mobile so the chrome is unchanged.
  return (
    <div className="app-frame">
      <NavGuardInterceptor />
      <Sidebar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/log" element={<LogSession />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<Session />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/templates/:id" element={<TemplateEdit />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/exercises/:id" element={<ExerciseEdit />} />
          <Route path="/bodyweight" element={<Bodyweight />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ConditionalBottomNav />
    </div>
  );
}

function ConditionalBottomNav() {
  const loc = useLocation();
  const inSession = matchPath('/sessions/:id', loc.pathname);
  if (inSession) return null;
  return <BottomNav />;
}

// When a page registers an unsaved-changes guard, intercept clicks on
// internal links (NavLink in the sidebar / bottom nav, in-page <a> links)
// during the capture phase. If the click would navigate somewhere else,
// hand it to the guard, which shows its own Save/Discard prompt and then
// performs the navigation if the user confirms.
function NavGuardInterceptor() {
  const { active, runGuard } = useNavGuard();
  const navigate = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!active) return undefined;
    function onClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target.closest('a[href]');
      if (!anchor) return;
      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;        // external link
      const dest = url.pathname + url.search;
      if (dest === loc.pathname + loc.search) return;           // same page
      // Intercept and let the guard decide.
      const proceed = () => navigate(dest);
      const allow = runGuard(proceed);
      if (!allow) { e.preventDefault(); e.stopPropagation(); }
    }
    document.addEventListener('click', onClick, true); // capture phase
    return () => document.removeEventListener('click', onClick, true);
  }, [active, runGuard, navigate, loc.pathname, loc.search]);

  return null;
}
