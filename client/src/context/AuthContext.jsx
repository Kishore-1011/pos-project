import React, { createContext, useState, useEffect, useContext } from 'react';
import { STORAGE_PREFIX } from '../config/brand';
import { setShopCalendar } from '../utils/datetime';
import { useToast } from '../components/ui';

const AuthContext = createContext(null);
const TOKEN_KEY = `${STORAGE_PREFIX}_token`;

// Shop time zone and business-day cutoff, needed before screens format any date.
async function loadShopCalendar(token) {
  try {
    const res = await fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setShopCalendar(await res.json());
  } catch (e) {
    // Keep defaults; screens still work
  }
}

// The UI is always served from the same origin as the API (the embedded server in the
// desktop app, or the Vite dev server which proxies /api and /uploads), so URLs are relative.
const resolveApiUrl = (url) => {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url.startsWith('/') ? url : `/${url}`;
};

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    return sessionStorage.getItem(TOKEN_KEY) || '';
  });
  const [loading, setLoading] = useState(true);

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    setToken('');
    setUser(null);
  };

  useEffect(() => {
    if (token) {
      // Validate token with backend
      fetch(resolveApiUrl('/api/auth/me'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
        .then(res => {
          if (res.ok) return res.json();
          throw new Error('Session invalid or revoked');
        })
        .then(async data => {
          await loadShopCalendar(token);
          setUser(data.user);
        })
        .catch(err => {
          console.warn('Auth check failed:', err.message);
          logout();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  // Password login and PIN login (quick user switching) share the same session start
  const startSession = async (endpoint, body, fallbackError) => {
    const res = await fetch(resolveApiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || fallbackError);
    }

    await loadShopCalendar(data.token);
    sessionStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const login = (username, password) => startSession('/api/auth/login', { username, password }, 'Login failed');
  const pinLogin = (username, pin) => startSession('/api/auth/pin-login', { username, pin }, 'Wrong PIN');

  const authFetch = async (url, options = {}) => {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    };

    const res = await fetch(resolveApiUrl(url), { ...options, headers });
    
    // If account was deactivated or token expired while user was using app
    if (res.status === 403 || res.status === 401) {
      const data = await res.clone().json().catch(() => ({}));
      if (data.error && data.error.includes('deactivated')) {
        toast.error('Your account has been deactivated by the shop owner.', { title: 'Signed out' });
        logout();
      }
    }

    return res;
  };

  // Permission check for showing/hiding screens and buttons. The server enforces the same rules;
  // this only keeps the UI from offering actions that would be refused.
  const can = (permission) => Boolean(user && Array.isArray(user.permissions) && user.permissions.includes(permission));

  return (
    <AuthContext.Provider value={{ user, token, loading, login, pinLogin, logout, authFetch, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
