import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthLogo, useKeyboardHeight } from '@/components/login/auth-parts';
import { FloatingField } from '@/components/login/floating-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { tokenStorage } from '@/lib/token-storage';

// Mirrors the dashboard login page (frontend/src/app/login/page.tsx) with app wording: centred card (max 448) with the
// logo block, "Sign in to your App", floating-label Username / Password (eye toggle), Remember me (username only),
// error strip (also the session-expired message), Sign In, Forgot Password?, and the footer line. Not carried over
// because they are web-only: the radial background glow and the install-app banner.
const SESSION_EXPIRED = 'Your session expired. Please log in again.';

export default function LoginScreen() {
  const { signIn, sessionExpired } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  // Shown when the app signed the user out because the token expired (same strip as an error).
  const [error, setError] = useState(() => (sessionExpired ? SESSION_EXPIRED : ''));
  const [loading, setLoading] = useState(false);

  // Pre-fill the remembered username (never a password).
  useEffect(() => {
    let alive = true;
    tokenStorage.getRememberedUsername().then((u) => {
      if (alive && u) { setUsername(u); setRememberMe(true); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Keyboard: track it by hand (KeyboardAvoidingView is unreliable on Android edge-to-edge) and scroll the focused
  // field to the top of the visible area so neither inputs nor the button end up behind it.
  const keyboardH = useKeyboardHeight();

  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef(0);
  const fieldY = useRef({ username: 0, password: 0 });
  const passwordRef = useRef<TextInput>(null);
  const scrollTo = useCallback((key: 'username' | 'password') => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, cardY.current + fieldY.current[key] - 24), animated: true }), 150);
  }, []);

  const onSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.');
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    setError('');
    try {
      await signIn(username.trim(), password);
      try {
        if (rememberMe) await tokenStorage.setRememberedUsername(username.trim());
        else await tokenStorage.clearRememberedUsername();
      } catch { /* remembering is a convenience only */ }
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { message?: string; error?: string } } };
      if (e?.response?.status === 429) setError('Too many login attempts. Please wait a few minutes before trying again.');
      else if (e?.response?.status === 401) setError('Invalid username or password. Please try again.');
      else if (e?.response?.data?.message ?? e?.response?.data?.error) setError((e.response!.data!.message ?? e.response!.data!.error) as string);
      else setError('Unable to connect. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={[styles.flex1, { paddingBottom: keyboardH }]}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16, paddingBottom: keyboardH ? 16 : insets.bottom + 16 }]}>
        <View style={styles.wrap}>
          <View onLayout={(e) => { cardY.current = e.nativeEvent.layout.y; }} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <AuthLogo />

            <ThemedText themeColor="textSecondary" style={styles.heading}>Sign in to your App</ThemedText>

            <View style={styles.form}>
              <FloatingField
                label="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                editable={!loading}
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={() => passwordRef.current?.focus()}
                onFocus={() => scrollTo('username')}
                onFieldLayout={(e) => { fieldY.current.username = e.nativeEvent.layout.y; }}
                invalid={!!error && !username}
              />
              <FloatingField
                label="Password"
                value={password}
                onChangeText={setPassword}
                revealable
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                editable={!loading}
                returnKeyType="go"
                onSubmitEditing={onSubmit}
                inputRef={passwordRef}
                onFocus={() => scrollTo('password')}
                onFieldLayout={(e) => { fieldY.current.password = e.nativeEvent.layout.y; }}
              />

              {/* Remember me */}
              <Pressable onPress={() => setRememberMe((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: rememberMe }} hitSlop={8} style={styles.remember}>
                <View style={[styles.box, { backgroundColor: rememberMe ? theme.primary : 'transparent', borderColor: rememberMe ? theme.primary : theme.border }]}>
                  {rememberMe ? <Ionicons name="checkmark" size={12} color="#ffffff" /> : null}
                </View>
                <ThemedText themeColor="textSecondary" style={styles.rememberText}>Remember me</ThemedText>
              </Pressable>

              {error ? (
                <View style={styles.error}>
                  <Ionicons name="warning-outline" size={16} color={theme.danger} style={{ marginTop: 2 }} />
                  <ThemedText style={[styles.errorText, { color: theme.danger }]}>{error}</ThemedText>
                </View>
              ) : null}

              <Pressable
                onPress={onSubmit}
                disabled={loading}
                accessibilityRole="button"
                style={[styles.button, { backgroundColor: loading ? `${theme.primary}8C` : theme.primary }]}>
                {loading ? (
                  <>
                    <ActivityIndicator size="small" color="#ffffff" />
                    <ThemedText style={styles.buttonLabel}>Signing in...</ThemedText>
                  </>
                ) : (
                  <ThemedText style={styles.buttonLabel}>Sign In</ThemedText>
                )}
              </Pressable>
            </View>
          </View>

          {/* Forgot Password */}
          <Pressable onPress={() => router.push('/forgot-password')} hitSlop={8} accessibilityRole="link" style={styles.forgot}>
            <ThemedText themeColor="textMuted" style={styles.forgotText}>Forgot Password?</ThemedText>
          </Pressable>

          <ThemedText themeColor="textMuted" style={styles.footer}>Fasttracks App v1.0 — Secure Access Only</ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 },
  wrap: { width: '100%', maxWidth: 448, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 32, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  heading: { fontSize: 18, lineHeight: 28, fontFamily: FontWeights.semiBold, textAlign: 'center', marginBottom: 24 },
  form: { gap: 16 },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start', minHeight: 24 },
  box: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rememberText: { fontSize: 14, lineHeight: 20 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(224,104,104,0.1)', borderColor: 'rgba(224,104,104,0.3)' },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20 },
  button: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 },
  buttonLabel: { color: '#ffffff', fontSize: 16, lineHeight: 24, fontFamily: FontWeights.semiBold },
  forgot: { alignSelf: 'center', marginTop: 8, paddingVertical: 4, paddingHorizontal: 8 },
  forgotText: { fontSize: 12, lineHeight: 16, textDecorationLine: 'underline' },
  footer: { textAlign: 'center', fontSize: 12, lineHeight: 16, marginTop: 24 },
});
