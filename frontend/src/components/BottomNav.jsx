import { NavLink } from 'react-router-dom';

export default function BottomNav() {
  return (
    <nav className="bottomnav">
      <NavLink to="/" end>
        <span className="icon">🏠</span>
        <span>Ana sayfa</span>
      </NavLink>
      <NavLink to="/sessions">
        <span className="icon">📋</span>
        <span>Sessionlar</span>
      </NavLink>
      <NavLink to="/templates">
        <span className="icon">📐</span>
        <span>Şablonlar</span>
      </NavLink>
      <NavLink to="/exercises">
        <span className="icon">💪</span>
        <span>Egzersizler</span>
      </NavLink>
    </nav>
  );
}
