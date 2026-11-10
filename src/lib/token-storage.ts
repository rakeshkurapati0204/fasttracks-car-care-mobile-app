import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'ft_token';
// "Remember me" on the login screen: the dashboard keeps only the username (localStorage ft_remember_username),
// never the password. Same here, in the same secure store as the token.
const REMEMBER_KEY = 'ft_remember_username';

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
  getRememberedUsername: () => SecureStore.getItemAsync(REMEMBER_KEY),
  setRememberedUsername: (username: string) => SecureStore.setItemAsync(REMEMBER_KEY, username),
  clearRememberedUsername: () => SecureStore.deleteItemAsync(REMEMBER_KEY),
};
