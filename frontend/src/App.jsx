import { Routes, Route, Navigate, useLocation, matchPath } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
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
