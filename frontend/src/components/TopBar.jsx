import { useNavigate } from 'react-router-dom';

export default function TopBar({ title, back = false, brand = false, right = null }) {
  const nav = useNavigate();
  return (
    <header className="topbar">
      {back ? (
        <button className="back" onClick={() => nav(-1)} aria-label="Back">‹</button>
      ) : (
        <div style={{ width: 36 }} />
      )}
      {brand ? <span className="brand" style={{ flex: 1, textAlign: 'center' }}>TrackIt</span> : <h1>{title}</h1>}
      {right || <div style={{ width: 36 }} />}
    </header>
  );
}
