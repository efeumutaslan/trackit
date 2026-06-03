import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

// Vertical navigation, visible only on >=1024px viewports. The bottom-nav
// is hidden in the same range, so this becomes the sole nav surface for
// desktop users.
export default function Sidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <span className="sidebar-logo">TrackIt</span>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" end>
          <span className="icon">🏠</span>
          <span>Home</span>
        </NavLink>
        <NavLink to="/sessions">
          <span className="icon">📋</span>
          <span>Sessions</span>
        </NavLink>
        <NavLink to="/templates">
          <span className="icon">📐</span>
          <span>Templates</span>
        </NavLink>
        <NavLink to="/exercises">
          <span className="icon">💪</span>
          <span>Exercises</span>
        </NavLink>
        <NavLink to="/bodyweight">
          <span className="icon">⚖️</span>
          <span>Body</span>
        </NavLink>
        <NavLink to="/settings">
          <span className="icon">⚙️</span>
          <span>Settings</span>
        </NavLink>
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user" title={user?.username}>
          <span className="user-dot">{(user?.username || '?').slice(0, 1).toUpperCase()}</span>
          <span className="user-name">{user?.username}</span>
        </div>
        <button
          className="sidebar-signout"
          onClick={() => { logout(); nav('/login'); }}
          title="Sign out"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
