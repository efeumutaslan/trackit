import { NavLink } from 'react-router-dom';

export default function BottomNav() {
  return (
    <nav className="bottomnav">
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
    </nav>
  );
}
