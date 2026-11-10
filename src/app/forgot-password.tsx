import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthLogo, useKeyboardHeight } from '@/components/login/auth-parts';
import { FloatingField } from '@/components/login/floating-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requestPasswordReset } from '@/lib/api';
import { openExternalUrl } from '@/lib/open-url';

// Mirrors the dashboard's forgot-password page (frontend/src/app/forgot-password/page.tsx), same card and logo block
// as the login screen. The flow is the dashboard's: the user first messages "Hi" to the company WhatsApp number, enters
// the username, and POST /auth/forgot-password sends a reset link (WhatsApp / email) that opens the dashboard's
// reset-password page in the browser, so there is no in-app reset screen. The backend always answers success for an
// unknown username, and this screen shows the same fixed message either way.
type Result = { success: boolean; message: string; noContact?: boolean };

const STEPS_WA_URL = 'https://wa.me/918019965252?text=Hi';

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: theme.primary }]}><ThemedText style={styles.stepNumText}>{n}</ThemedText></View>
      <View style={styles.flex1}>{children}</View>
    </View>
  );
}

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardH = useKeyboardHeight();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef(0);
  const fieldY = useRef(0);
  const scrollToField = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, cardY.current + fieldY.current - 24), animated: true }), 150);
  }, []);

  const backToLogin = () => { if (router.canGoBack()) router.back(); else router.replace('/login'); };

  const onSubmit = async () => {
    if (!username.trim()) return;
    Keyboard.dismiss();
    setLoading(true);
    try {
      setResult(await requestPasswordReset(username.trim()));
    } catch (err: unknown) {
      const d = (err as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      setResult({ success: false, message: d?.message ?? d?.error ?? 'Something went wrong. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const tint = result?.success ? 'rgba(54,200,126,' : result?.noContact ? 'rgba(245,158,11,' : 'rgba(239,68,68,';
  const disabled = loading || !username.trim();

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
            <ThemedText style={styles.heading}>Reset your password</ThemedText>

            {result ? (
              <View style={styles.gap16}>
                <View style={[styles.result, { backgroundColor: `${tint}0.1)`, borderColor: `${tint}0.3)` }]}>
                  <ThemedText style={styles.resultText}>{result.success ? 'Reset link sent to your WhatsApp! Check your messages.' : result.message}</ThemedText>
                </View>
                <Pressable onPress={backToLogin} hitSlop={8} accessibilityRole="link" style={styles.centerLink}>
                  <ThemedText style={[styles.backLg, { color: theme.primary }]}>Back to Sign In</ThemedText>
                </Pressable>
              </View>
            ) : (
              <View style={styles.gap20}>
                <ThemedText themeColor="textSecondary" style={styles.intro}>First send ‘Hi’ to our WhatsApp number to receive your reset link.</ThemedText>

                <View style={styles.gap12}>
                  <Step n={1}><ThemedText themeColor="textSecondary" style={styles.stepText}>Open WhatsApp on your phone</ThemedText></Step>
                  <Step n={2}>
                    <View style={styles.gap8}>
                      <ThemedText themeColor="textSecondary" style={styles.stepText}>
                        Send “Hi” to <ThemedText style={[styles.stepText, { fontFamily: FontWeights.semiBold }]}>+91 80199 65252</ThemedText>
                      </ThemedText>
                      <Pressable onPress={() => openExternalUrl(STEPS_WA_URL)} accessibilityRole="link" style={styles.wa}>
                        <Ionicons name="logo-whatsapp" size={16} color="#ffffff" />
                        <ThemedText style={styles.waText}>Open WhatsApp Chat</ThemedText>
                      </Pressable>
                    </View>
                  </Step>
                  <Step n={3}><ThemedText themeColor="textSecondary" style={styles.stepText}>Then enter your username below and click Send</ThemedText></Step>
                </View>

                <FloatingField
                  label="Username (e.g. FT001)"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="send"
                  onSubmitEditing={onSubmit}
                  onFocus={scrollToField}
                  onFieldLayout={(e) => { fieldY.current = e.nativeEvent.layout.y; }}
                />

                <Pressable onPress={onSubmit} disabled={disabled} accessibilityRole="button" style={[styles.button, { backgroundColor: theme.primary, opacity: disabled ? 0.5 : 1 }]}>
                  {loading ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                  <ThemedText style={styles.buttonLabel}>{loading ? 'Sending...' : 'Send Reset Link'}</ThemedText>
                </Pressable>

                <Pressable onPress={backToLogin} hitSlop={8} accessibilityRole="link" style={styles.centerLink}>
                  <ThemedText themeColor="textMuted" style={styles.backSm}>Back to Sign In</ThemedText>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 },
  wrap: { width: '100%', maxWidth: 448, alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 32, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  heading: { fontSize: 18, lineHeight: 28, fontFamily: FontWeights.semiBold, textAlign: 'center', marginBottom: 24 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  gap20: { gap: 20 },
  intro: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#ffffff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  stepText: { fontSize: 14, lineHeight: 20 },
  wa: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#25D366' },
  waText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  button: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 },
  buttonLabel: { color: '#ffffff', fontSize: 16, lineHeight: 24, fontFamily: FontWeights.semiBold },
  centerLink: { alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  backSm: { fontSize: 12, lineHeight: 16, textDecorationLine: 'underline' },
  backLg: { fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' },
  result: { padding: 16, borderRadius: 12, borderWidth: 1 },
  resultText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
