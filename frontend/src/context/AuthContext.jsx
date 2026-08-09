import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback(async (username, password) => {
    const data = await api.login({ username, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      const next = { ...prev, ...partial };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  }, []);

  // UI redesign (2026-08-09): api.me() (GET /auth/me) already existed and
  // worked but was never called anywhere — `user` was only ever set from
  // the login response, so a stale cached profile (or a token invalidated
  // server-side, e.g. an admin suspending the account) could persist
  // indefinitely across page loads. Revalidate once per app mount.
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api
      .me()
      .then((fresh) => {
        setUser((prev) => {
          const next = { ...prev, ...fresh };
          localStorage.setItem('user', JSON.stringify(next));
          return next;
        });
      })
      .catch(() => {
        // Invalid/expired/revoked token — same effect as an explicit logout.
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      });
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
