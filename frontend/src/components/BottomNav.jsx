import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useSettings } from '../lib/settings.jsx';

// Bottom nav (mobile only). Templates and Exercises moved into the
// Settings page so the bar can breathe. Layout:
//   Home  Sessions  [ + FAB ]  Body  Settings
export default function BottomNav() {
  const { settings } = useSettings();
  const showBody = settings?.feat_bodyweight !== 0;
  return (
    <nav className="bottomnav">
      <NavLink to="/" end className="bn-item">
        <span className="icon"><Icon name="house" /></span>
        <span className="label">Home</span>
      </NavLink>
      <NavLink to="/sessions" className="bn-item">
        <span className="icon"><Icon name="clipboard" /></span>
        <span className="label">Sessions</span>
      </NavLink>

      <NavLink to="/log" className="bn-fab" aria-label="Log a workout">
        <span className="bn-fab__plus"><Icon name="plus" /></span>
      </NavLink>

      {showBody && (
        <NavLink to="/bodyweight" className="bn-item">
          <span className="icon"><Icon name="scale" /></span>
          <span className="label">Body</span>
        </NavLink>
      )}
      <NavLink to="/settings" className="bn-item">
        <span className="icon"><Icon name="gear" /></span>
        <span className="label">Settings</span>
      </NavLink>
    </nav>
  );
}
