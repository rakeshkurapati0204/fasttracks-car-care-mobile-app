import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';

// Dashboard MDM_ROLES / the ['OWNER','STORE_MANAGER','HR'] gate on every devices page.
export const MDM_ROLES = ['OWNER', 'STORE_MANAGER', 'HR'];
export const WIDE_MIN = 560;

export function useMdmAccess() {
  const { user } = useAuth();
  return { user, canAccess: !!user?.role && MDM_ROLES.includes(user.role) };
}

export function useWidth() {
  const [width, setWidth] = useState(0);
  return { width, wide: width >= WIDE_MIN, onLayout: (e: { nativeEvent: { layout: { width: number } } }) => setWidth(e.nativeEvent.layout.width) };
}

export function Restricted({ message }: { message: string }) {
  return (
    <ThemedView style={styles.restricted}>
      <ThemedText themeColor="textMuted" style={styles.restrictedText}>{message}</ThemedText>
    </ThemedView>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.flex1}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        {subtitle ? <ThemedText themeColor="textMuted" style={styles.sub}>{subtitle}</ThemedText> : null}
      </View>
      {right}
    </View>
  );
}

/** Rounded card with the dashboard's card background and border. */
export function CardBox({ children, border, pad = 16, style }: { children: ReactNode; border?: string; pad?: number; style?: object }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.surface, borderColor: border ?? theme.border, padding: pad }, style]}>{children}</View>;
}

export function Dot({ on, size = 8, color }: { on: boolean; size?: number; color?: string }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? (on ? '#22c55e' : '#9ca3af') }} />;
}

export function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <ThemedText style={[styles.tagText, { color: fg }]}>{label}</ThemedText>
    </View>
  );
}

export function fmtDateTime(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtShort(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export const mapsUrl = (lat: number, lng: number, zoom?: number) => `https://maps.google.com/?q=${lat},${lng}${zoom ? `&z=${zoom}` : ''}`;

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  restricted: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center' },
  restrictedText: { textAlign: 'center', fontSize: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: Radii.lg },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  tagText: { fontSize: 12, lineHeight: 16 },
});
