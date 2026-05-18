import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'login') await login(username, password);
      else await register(username, password);
      nav('/');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="brand-big">TrackIt</div>
      <div className="tagline">Antrenmanını takip et 💪</div>

      <form onSubmit={submit}>
        {err && <div className="error-box">{err}</div>}
        <div className="field">
          <label>Kullanıcı adı</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Şifre</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? '…' : mode === 'login' ? 'Giriş yap' : 'Kayıt ol'}
        </button>
      </form>
      <div className="switch">
        {mode === 'login' ? (
          <>Hesabın yok mu? <button onClick={() => setMode('register')}>Kayıt ol</button></>
        ) : (
          <>Hesabın var mı? <button onClick={() => setMode('login')}>Giriş yap</button></>
        )}
      </div>
    </div>
  );
}
