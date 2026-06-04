import { NavLink } from 'react-router-dom';
import Icon from './Icon.jsx';

// Bottom nav (mobile only):
//   Home  Sessions  Templates  [ + FAB ]  Exercises  Body  Settings
export default function BottomNav() {
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
      <NavLink to="/templates" className="bn-item">
        <span className="icon"><Icon name="ruler" /></span>
        <span className="label">Templates</span>
      </NavLink>

      <NavLink to="/log" className="bn-fab" aria-label="Log a workout">
        <span className="bn-fab__plus"><Icon name="plus" /></span>
      </NavLink>

      <NavLink to="/exercises" className="bn-item">
        <span className="icon"><Icon name="dumbbell" /></span>
        <span className="label">Exercises</span>
      </NavLink>
      <NavLink to="/bodyweight" className="bn-item">
        <span className="icon"><Icon name="scale" /></span>
        <span className="label">Body</span>
      </NavLink>
      <NavLink to="/settings" className="bn-item">
        <span className="icon"><Icon name="gear" /></span>
        <span className="label">Settings</span>
      </NavLink>
    </nav>
  );
}
