import { createContext, useContext, useState, useEffect } from 'react';
import { api, setToken, getStoredUser, setStoredUser } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('trackit_token')) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then((u) => { setUser(u); setStoredUser(u); })
      .catch(() => {
        setToken(null);
        setStoredUser(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(username, password) {
    const data = await api.post('/auth/login', { username, password });
    setToken(data.token);
    const u = { id: data.userId, username: data.username };
    setStoredUser(u);
    setUser(u);
  }

  async function register(username, password) {
    const data = await api.post('/auth/register', { username, password });
    setToken(data.token);
    const u = { id: data.userId, username: data.username };
    setStoredUser(u);
    setUser(u);
  }

  async function logout() {
    try { await api.post('/auth/logout'); } catch {}
    setToken(null);
    setStoredUser(null);
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
