import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shown where a screen is not built yet.
export function ComingSoon() {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="color-fill-outline" size={44} color={theme.primary} />
      </View>
      <ThemedText style={styles.title}>Coming soon</ThemedText>
      <ThemedText themeColor="textSecondary" style={styles.sub}>We are still working on this. It will appear here when it is ready.</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.note}>Need it sooner? Ask your manager.</ThemedText>
    </View>
  );
}

// The dashboard's red "still under test" strip.
export function UnderTestBanner({ note }: { note?: string }) {
  return (
    <View style={styles.banner}>
      <ThemedText style={styles.bannerText}>{`⚠️ This page is still under test — proceed with caution.${note ? ` ${note}` : ''}`}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 360, padding: 24, gap: 8 },
  icon: { width: 96, height: 96, borderRadius: Radii.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold, textAlign: 'center', letterSpacing: -0.3 },
  sub: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 8 },
  small: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium, letterSpacing: 1.6, textAlign: 'center' },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  bold: { fontFamily: FontWeights.bold, fontWeight: '700' },
  banner: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(224,104,104,0.12)', borderWidth: 1, borderColor: 'rgba(224,104,104,0.4)' },
  bannerText: { color: '#E06868', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
