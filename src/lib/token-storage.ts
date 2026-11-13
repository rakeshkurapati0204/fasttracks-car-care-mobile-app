import * as SecureStore from 'expo-secure-store';

import { createCachedValue } from '@/lib/cached-value';

const TOKEN_KEY = 'ft_token';
// "Remember me" on the login screen: the dashboard keeps only the username (localStorage ft_remember_username),
// never the password. Same here, in the same secure store as the token.
const REMEMBER_KEY = 'ft_remember_username';
// Basic profile for an instant start (profile-cache.ts); refreshed in the background.
const PROFILE_KEY = 'ft_profile';

// Every network request needs the token. Reading the phone's secure store (the Android Keystore) for each one is slow, and a screen can start half a dozen
// requests at once, so the token is read once and then kept in memory (cached-value.ts). A change shows at once; the write to the secure store follows.
const token = createCachedValue<string | null>(() => SecureStore.getItemAsync(TOKEN_KEY));

export const tokenStorage = {
  get: () => token.get(),
  set: (value: string) => token.set(value, (v) => SecureStore.setItemAsync(TOKEN_KEY, v!)),
  clear: () => token.clear(() => SecureStore.deleteItemAsync(TOKEN_KEY), null),
  getRememberedUsername: () => SecureStore.getItemAsync(REMEMBER_KEY),
  setRememberedUsername: (username: string) => SecureStore.setItemAsync(REMEMBER_KEY, username),
  clearRememberedUsername: () => SecureStore.deleteItemAsync(REMEMBER_KEY),
  getProfile: () => SecureStore.getItemAsync(PROFILE_KEY),
  setProfile: (raw: string) => SecureStore.setItemAsync(PROFILE_KEY, raw),
  clearProfile: () => SecureStore.deleteItemAsync(PROFILE_KEY),
};
