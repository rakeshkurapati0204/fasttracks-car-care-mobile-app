import { useEffect, useState } from 'react';
import { Image, Keyboard, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

// Shared by the Login and Forgot Password screens (the dashboard's login card header).
const ICON = require('@/../assets/images/brand-logo-icon.png');
const WORDMARK = require('@/../assets/images/brand-logo-wordmark.png');
const WORDMARK_H = 28;
const WORDMARK_W = Math.round((WORDMARK_H * 5805) / 727);

/** White icon on a primary tile, wordmark (white in dark mode) and CAR CARE. */
export function AuthLogo() {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  return (
    <View style={styles.logo}>
      <View style={[styles.tile, { backgroundColor: theme.primary }]}>
        <Image source={ICON} style={styles.tileIcon} resizeMode="contain" tintColor="#ffffff" accessibilityLabel="Fasttracks icon" />
      </View>
      <Image source={WORDMARK} style={styles.wordmark} resizeMode="contain" tintColor={dark ? '#ffffff' : undefined} accessibilityLabel="Fasttracks" />
      <ThemedText themeColor="textMuted" style={styles.carCare}>CAR CARE</ThemedText>
    </View>
  );
}

/** Keyboard height, tracked by hand (KeyboardAvoidingView is unreliable on Android edge-to-edge). */
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, (e) => setH(e.endCoordinates.height));
    const b = Keyboard.addListener(hideEvt, () => setH(0));
    return () => { a.remove(); b.remove(); };
  }, []);
  return h;
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', marginBottom: 32, gap: 16 },
  tile: { width: 80, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  tileIcon: { width: 52, height: 52 },
  wordmark: { height: WORDMARK_H, width: WORDMARK_W, maxWidth: '100%' },
  carCare: { fontSize: 12, lineHeight: 16, letterSpacing: 1.2, fontFamily: FontWeights.medium, marginTop: -8 },
});
