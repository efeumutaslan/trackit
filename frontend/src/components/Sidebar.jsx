import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useSettings } from '../lib/settings.jsx';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

// Vertical navigation, visible only on >=1024px viewports. The bottom-nav
// is hidden in the same range, so this becomes the sole nav surface for
// desktop users.
export default function Sidebar() {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const nav = useNavigate();

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar-brand">
        <Logo size={26} className="sidebar-logo-mark" />
        <span className="sidebar-logo">TrackIt</span>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" end>
          <span className="icon"><Icon name="house" fw /></span>
          <span>Home</span>
        </NavLink>
        <NavLink to="/sessions">
          <span className="icon"><Icon name="clipboard" fw /></span>
          <span>Sessions</span>
        </NavLink>
        <NavLink to="/templates">
          <span className="icon"><Icon name="ruler" fw /></span>
          <span>Templates</span>
        </NavLink>
        <NavLink to="/exercises">
          <span className="icon"><Icon name="dumbbell" fw /></span>
          <span>Exercises</span>
        </NavLink>
        {settings?.feat_bodyweight !== 0 && (
          <NavLink to="/bodyweight">
            <span className="icon"><Icon name="scale" fw /></span>
            <span>Body</span>
          </NavLink>
        )}
        <NavLink to="/settings">
          <span className="icon"><Icon name="gear" fw /></span>
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
