import { clearCallCapabilities } from '@/lib/call-caps';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import * as api from '@/lib/api';
import { setUnauthorizedHandler } from '@/lib/api';
import { parseCachedProfile, serializeProfile } from '@/lib/profile-cache';
import { tokenStorage } from '@/lib/token-storage';
import type { AuthUser } from '@/types/api';

interface AuthContextValue {
  isReady: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;
  /** True after the app signed the user out because the token expired (a 401), so the login screen can say so. */
  sessionExpired: boolean;
  signIn: (username: string, password: string, signal?: AbortSignal) => Promise<void>;
  signOut: () => Promise<void>;
  /** Clears the must-change-password flag after the user has set a new password. */
  markPasswordChanged: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// With no stored profile the server gets this long to answer at start-up before the app moves on to the sign-in screen.
const START_WAIT_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const userRef = useRef<AuthUser | null>(null);
  useEffect(() => { userRef.current = user; }, [user]);

  // Start: open straight to the person's screen from what is stored on the device, and check with the server in the background. The opening screen never
  // waits for the network when there is a stored profile; with no stored profile (first start after an update) it waits at most START_WAIT_MS.
  useEffect(() => {
    (async () => {
      const [token, stored] = await Promise.all([tokenStorage.get().catch(() => null), tokenStorage.getProfile().catch(() => null)]);
      if (!token) { setIsReady(true); return; }
      const cached = parseCachedProfile(stored);
      if (cached) { setUser(cached); setIsReady(true); }
      try {
        setUser(await api.fetchProfile(cached ? undefined : { timeout: START_WAIT_MS }));
      } catch (err) {
        // Expired/invalid token: the response interceptor already cleared it on a 401. Any other failure (offline, server down) keeps the stored profile.
        if ((err as { response?: { status?: number } })?.response?.status === 401) setSessionExpired(true);
      } finally {
        setIsReady(true);
      }
    })();
    setUnauthorizedHandler(() => {
      // A 401 while signed in = the session expired. (A wrong password at the login form also 401s, but then nobody is signed in.)
      if (userRef.current) setSessionExpired(true);
      setUser(null);
    });
  }, []);

  // Keep the stored profile in step with the signed-in person (sign-in, a refresh, a changed password).
  useEffect(() => {
    const raw = user ? serializeProfile(user) : null;
    if (raw) void tokenStorage.setProfile(raw).catch(() => { /* the next start just waits for the network once */ });
  }, [user]);

  const signIn = async (username: string, password: string, signal?: AbortSignal) => {
    const result = await api.login(username, password, signal);
    // The token is usable at once (memory); the write to the phone's secure store finishes in the background, so sign-in does not wait for it.
    const persisted = tokenStorage.set(result.token);
    void persisted.catch(() => { /* the next start asks for the password again */ });
    setSessionExpired(false);
    // The backend puts mustChangePassword on the user object; the dashboard reads it from there too.
    setUser({ ...result.user, mustChangePassword: result.user.mustChangePassword ?? result.mustChangePassword });
  };

  const signOut = async () => {
    clearCallCapabilities();
    await tokenStorage.clear();
    await tokenStorage.clearProfile().catch(() => { /* nothing stored */ });
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
