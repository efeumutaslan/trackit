const BASE = '/api';

function getToken() {
  return localStorage.getItem('trackit_token');
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Sunucu hatası');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  get:  (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  put:  (p, body) => request(p, { method: 'PUT',  body }),
  del:  (p) => request(p, { method: 'DELETE' }),
};

export function setToken(t) {
  if (t) localStorage.setItem('trackit_token', t);
  else localStorage.removeItem('trackit_token');
}

export function getStoredUser() {
  const raw = localStorage.getItem('trackit_user');
  return raw ? JSON.parse(raw) : null;
}
export function setStoredUser(u) {
  if (u) localStorage.setItem('trackit_user', JSON.stringify(u));
  else localStorage.removeItem('trackit_user');
}
