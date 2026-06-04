import { useNavigate } from 'react-router-dom';

export default function TopBar({ title, back = false, brand = false, brandSuffix = null, right = null }) {
  const nav = useNavigate();
  return (
    <header className="topbar">
      {back ? (
        <button className="back" onClick={() => nav(-1)} aria-label="Back">‹</button>
      ) : (
        <div style={{ width: 36 }} />
      )}
      {brand ? (
        <span className="brand" style={{ flex: 1, textAlign: 'center' }}>
          TrackIt
          {brandSuffix && (
            // Show the username (or whatever the caller passes in) right
            // after the logo on Home: "TrackIt — dafather". Keep the brand
            // color on the logo; the suffix uses the regular ink colour
            // so it reads as a small label, not a second brand mark.
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
