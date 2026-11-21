// Holds "who is logged in" for the whole app (React Context), so any component can call useAuth().
import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user') || 'null'));

  function saveSession(data) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  }

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    saveSession(data);
  }

  async function register(name, email, password) {
    const { data } = await api.post('/auth/register', { name, email, password });
    saveSession(data);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  // api.js announces an expired token; log out when it happens
  useEffect(() => {
    window.addEventListener('auth-expired', logout);
    return () => window.removeEventListener('auth-expired', logout);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
