import React, { createContext, useState, useEffect, useContext } from 'react';
import { STORAGE_PREFIX } from '../config/brand';

const AuthContext = createContext(null);
const TOKEN_KEY = `${STORAGE_PREFIX}_token`;

const resolveApiUrl = (url) => {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const baseUrl = (typeof window !== 'undefined' && window.location.protocol === 'file:') 
    ? 'http://localhost:5000' 
    : '';
  return `${baseUrl}${url.startsWith('/') ? url : `/${url}`}`;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    return sessionStorage.getItem(TOKEN_KEY) || '';
  });
  const [loading, setLoading] = useState(true);

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
        .then(data => {
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

  const login = async (username, password) => {
    const res = await fetch(resolveApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    sessionStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
    setToken('');
    setUser(null);
  };

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
        alert('⚠️ Your account has been deactivated by an Administrator. Access revoked.');
        logout();
      }
    }

    return res;
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
