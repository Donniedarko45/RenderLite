import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import { disconnectSocket } from '../api/socket';

interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => 
    localStorage.getItem('token')
  );
  const [isLoading, setIsLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    let currentToken = token;

    if (!currentToken) {
      const explicitlyLoggedOut = sessionStorage.getItem('renderlite_logged_out') === 'true';
      if (!explicitlyLoggedOut) {
        let shouldAutoLogin = SKIP_AUTH;
        if (!shouldAutoLogin) {
          try {
            const configRes = await api.get('/auth/config');
            if (configRes.data?.skipAuth) {
              shouldAutoLogin = true;
            }
          } catch {
            // Ignore config check error
          }
        }

        if (shouldAutoLogin) {
          try {
            setIsLoading(true);
            const response = await api.post('/auth/dev-login');
            const newToken = response.data.token;
            disconnectSocket();
            localStorage.setItem('token', newToken);
            setToken(newToken);
            setUser(response.data.user);
            return;
          } catch {
            // Dev login failed, fall through to unauthenticated
          } finally {
            setIsLoading(false);
          }
        }
      }

      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (error) {
      // Token is invalid, clear it
      disconnectSocket();
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);

      const explicitlyLoggedOut = sessionStorage.getItem('renderlite_logged_out') === 'true';
      if (SKIP_AUTH && !explicitlyLoggedOut) {
        try {
          const response = await api.post('/auth/dev-login');
          const newToken = response.data.token;
          localStorage.setItem('token', newToken);
          setToken(newToken);
          setUser(response.data.user);
        } catch {
          // Dev login failed
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = useCallback((newToken: string) => {
    sessionStorage.removeItem('renderlite_logged_out');
    disconnectSocket();
    setIsLoading(true);
    localStorage.setItem('token', newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.setItem('renderlite_logged_out', 'true');
    disconnectSocket();
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
