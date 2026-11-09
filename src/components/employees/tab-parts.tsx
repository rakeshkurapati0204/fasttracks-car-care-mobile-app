import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shared bits of the employee panel's Pardon / Scans / Configure / Tasks tabs (dashboard employees/page.tsx).
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const errText = (err: unknown, fallback: string) => {
  const d = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
  return d?.error ?? d?.message ?? fallback;
};

/** "✓ …" messages are green, everything else red — same rule as every message strip on the dashboard panel. */
export function Flash({ msg, small }: { msg: string; small?: boolean }) {
  if (!msg) return null;
  const ok = msg.startsWith('✓');
  return (
    <View style={[styles.flash, small && styles.flashSmall, { backgroundColor: ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderColor: ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }]}>
      <ThemedText style={[small ? styles.flashTextSmall : styles.flashText, { color: ok ? '#16a34a' : '#dc2626' }]}>{msg}</ThemedText>
    </View>
  );
}

/** A message that clears itself after `ms` (the dashboard's setTimeout(() => setMsg(''), …)). */
export function useFlash(ms = 3000) {
  const [msg, setMsg] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const flash = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), ms);
  }, [ms]);
  const clear = useCallback(() => { if (timer.current) clearTimeout(timer.current); setMsg(''); }, []);
  return { msg, flash, clear };
}

/** Month + year pickers (year = last year and this year), shared by Pardon and Scans. */
export function MonthYearRow({ month, year, onMonth, onYear, nowYear }: { month: number; year: number; onMonth: (m: number) => void; onYear: (y: number) => void; nowYear: number }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex1}><Select value={String(month)} onChange={(v) => onMonth(Number(v))} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} /></View>
      <View style={styles.year}><Select value={String(year)} onChange={(v) => onYear(Number(v))} options={[nowYear - 1, nowYear].map((y) => ({ value: String(y), label: String(y) }))} /></View>
    </View>
  );
}

export function Card({ children, padded = true, style }: { children: React.ReactNode; padded?: boolean; style?: object }) {
  const theme = useTheme();
  return <View style={[styles.card, padded && styles.cardPad, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: string }) {
  return <ThemedText themeColor="textMuted" style={styles.sectionTitle}>{children.toUpperCase()}</ThemedText>;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  year: { width: 112 },
  flash: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radii.lg, borderWidth: 1 },
  flashSmall: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.md },
  flashText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  flashTextSmall: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  card: { borderWidth: 1, borderRadius: Radii.lg },
  cardPad: { padding: 16 },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.4 },
});
