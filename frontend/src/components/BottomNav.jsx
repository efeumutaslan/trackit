import { NavLink } from 'react-router-dom';

// Bottom nav layout (mobile only):
//   Home  Sessions  [ + ]  Exercises  Body  ⚙
// The + is the primary "Log a workout" CTA — a peach circle with a white
// plus, floating about 30% above the bar so it visually pops out of the
// row. ⚙ replaces the previous Templates tab; Templates moves to the
// stat-card grid on Home (still reachable via deep link).
//
// Actually we keep Templates AND add Settings, by removing the icon
// labels and tightening padding so 6 items still fit.
export default function BottomNav() {
  return (
    <nav className="bottomnav">
      <NavLink to="/" end className="bn-item">
        <span className="icon">🏠</span>
        <span className="label">Home</span>
      </NavLink>
      <NavLink to="/sessions" className="bn-item">
        <span className="icon">📋</span>
        <span className="label">Sessions</span>
      </NavLink>
      <NavLink to="/templates" className="bn-item">
        <span className="icon">📐</span>
        <span className="label">Templates</span>
      </NavLink>

      {/* The floating + sits between Templates and Exercises. Use a
          NavLink (not a button) so the same routing semantics apply. */}
      <NavLink to="/log" className="bn-fab" aria-label="Log a workout">
        <span className="bn-fab__plus">+</span>
      </NavLink>

      <NavLink to="/exercises" className="bn-item">
        <span className="icon">💪</span>
        <span className="label">Exercises</span>
      </NavLink>
      <NavLink to="/bodyweight" className="bn-item">
        <span className="icon">⚖️</span>
        <span className="label">Body</span>
      </NavLink>
      <NavLink to="/settings" className="bn-item">
        <span className="icon">⚙️</span>
        <span className="label">Settings</span>
      </NavLink>
    </nav>
  );
}
