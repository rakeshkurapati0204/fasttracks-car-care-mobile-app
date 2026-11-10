import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import * as api from '@/lib/api';
import { setUnauthorizedHandler } from '@/lib/api';
import { tokenStorage } from '@/lib/token-storage';
import { registerForPushNotifications } from '@/lib/push-notifications';
import type { AuthUser } from '@/types/api';

interface AuthContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  /** True after the app signed the user out because the token expired (a 401), so the login screen can say so. */
  sessionExpired: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Clears the must-change-password flag after the user has set a new password. */
  markPasswordChanged: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const userRef = useRef<AuthUser | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    tokenStorage
      .get()
      .then(async (token) => {
        if (!token) return;
        try {
          setUser(await api.fetchProfile());
          void registerForPushNotifications();
        } catch (err) {
          // Expired/invalid token — the response interceptor already clears it on a 401.
          if ((err as { response?: { status?: number } })?.response?.status === 401) setSessionExpired(true);
        }
      })
      .finally(() => setIsReady(true));
    setUnauthorizedHandler(() => {
      // A 401 while signed in = the session expired. (A wrong password at the login form also 401s, but then nobody is signed in.)
      if (userRef.current) setSessionExpired(true);
      setUser(null);
    });
  }, []);

  const signIn = async (username: string, password: string) => {
    const result = await api.login(username, password);
    await tokenStorage.set(result.token);
    setSessionExpired(false);
    // The backend puts mustChangePassword on the user object; the dashboard reads it from there too.
    setUser({ ...result.user, mustChangePassword: result.user.mustChangePassword ?? result.mustChangePassword });
    void registerForPushNotifications();
  };

  const signOut = async () => {
    await tokenStorage.clear();
    setSessionExpired(false);
    setUser(null);
  };

  const markPasswordChanged = () => setUser((u) => (u ? { ...u, mustChangePassword: false } : u));

  const value = useMemo<AuthContextValue>(
    () => ({ isReady, isAuthenticated: !!user, user, sessionExpired, signIn, signOut, markPasswordChanged }),
    [isReady, user, sessionExpired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
