import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';
import Logo from './Logo.jsx';

export default function TopBar({ title, back = false, brand = false, brandSuffix = null, right = null, className = '' }) {
  const nav = useNavigate();
  return (
    <header className={`topbar${className ? ' ' + className : ''}`}>
      {back ? (
        <button className="back" onClick={() => nav(-1)} aria-label="Back"><Icon name="chevron-left" /></button>
      ) : (
        <div style={{ width: 36 }} />
      )}
      {brand ? (
        <span className="brand" style={{ flex: 1, textAlign: 'center', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Logo size={22} className="brand-logo" />
          TrackIt
          {brandSuffix && (
            <>
              <span className="brand-sep"> — </span>
              <span className="brand-suffix">{brandSuffix}</span>
            </>
          )}
        </span>
      ) : <h1>{title}</h1>}
      {right || <div style={{ width: 36 }} />}
    </header>
  );
}
