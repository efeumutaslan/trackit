import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import BottomNav from './components/BottomNav.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import LogSession from './pages/LogSession.jsx';
import Session from './pages/Session.jsx';
import Sessions from './pages/Sessions.jsx';
import Templates from './pages/Templates.jsx';
import TemplateEdit from './pages/TemplateEdit.jsx';
import Exercises from './pages/Exercises.jsx';
import ExerciseEdit from './pages/ExerciseEdit.jsx';

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
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/log" element={<LogSession />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/sessions/:id" element={<Session />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/:id" element={<TemplateEdit />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/exercises/:id" element={<ExerciseEdit />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </>
  );
}
