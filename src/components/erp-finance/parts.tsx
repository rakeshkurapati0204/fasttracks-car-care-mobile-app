import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui';
import { FontWeights, Fonts, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const CHART_COLORS = ['#6AA4CC', '#36C87E', '#E8A828', '#E06868', '#9070C8', '#38B4C0', '#D88840'];

// Dashboard formatCurrency: en-IN currency, 0 decimals.
export const inr = (n: number | null | undefined) => `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`;
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};
export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Dashboard getPreset: full calendar month / quarter / year.
export function getPreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === 'quarter') {
    const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
    return { from: isoDate(qStart), to: isoDate(new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0)) };
  }
  if (preset === 'year') return { from: isoDate(new Date(y, 0, 1)), to: isoDate(new Date(y, 11, 31)) };
  return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
}

// Axis tick text used by the dashboard charts.
export const axisK = (v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v));

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.flex1}>
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        {sub ? <ThemedText themeColor="textMuted" style={styles.sectionSub}>{sub}</ThemedText> : null}
      </View>
      {right}
    </View>
  );
}

export function KPICard({ label, value, sub, color, mono = true }: { label: string; value: string; sub?: string; color?: string; mono?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.kpi, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.kpiLabel}>{label.toUpperCase()}</ThemedText>
      <ThemedText numberOfLines={1} style={[styles.kpiValue, { color: color ?? theme.text }, mono && { fontFamily: Fonts?.mono }]}>{value}</ThemedText>
      {sub ? <ThemedText themeColor="textMuted" style={styles.kpiSub}>{sub}</ThemedText> : null}
    </View>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  const theme = useTheme();
  const s = (status ?? '').toUpperCase();
  const colors: Record<string, string> = {
    PAID: theme.success, PARTIAL: theme.warning, PENDING: theme.textMuted, CANCELLED: theme.danger, COMPLETED: theme.success,
  };
  const c = colors[s] ?? theme.textMuted;
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(c, 0.13) }]}>
      <ThemedText style={[styles.badgeText, { color: c }]}>{s || '—'}</ThemedText>
    </View>
  );
}

export function HistBadge() {
  const theme = useTheme();
  return (
    <View style={[styles.hist, { backgroundColor: withAlpha(theme.warning, 0.13) }]}>
      <ThemedText style={[styles.histText, { color: theme.warning }]}>HIST</ThemedText>
    </View>
  );
}

export function Chip({ label, active, onPress, small }: { label: string; active: boolean; onPress: () => void; small?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, small && styles.chipSmall, { backgroundColor: active ? theme.primary : theme.surface, borderColor: active ? theme.primary : theme.border }]}>
      <ThemedText style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>{label}</ThemedText>
    </Pressable>
  );
}

export function OutlineBtn({ label, onPress, disabled, solid }: { label: string; onPress: () => void; disabled?: boolean; solid?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.chip, {
        backgroundColor: solid ? theme.primary : theme.surface,
        borderColor: solid ? theme.primary : theme.border,
        opacity: disabled ? 0.5 : 1,
      }]}>
      <ThemedText style={[styles.chipText, { color: solid ? '#fff' : theme.text }]}>{label}</ThemedText>
    </Pressable>
  );
}

// Horizontal bar chart (dashboard recharts vertical-layout BarChart): label, bar, value.
export function HBarChart({ rows, color, format }: { rows: { label: string; value: number }[]; color: string; format: (v: number) => string }) {
  const theme = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={styles.hbars}>
      {rows.map((r, i) => (
        <View key={`${r.label}-${i}`} style={styles.hrow}>
          <ThemedText numberOfLines={1} style={styles.hlabel}>{r.label}</ThemedText>
          <View style={[styles.htrack, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.hfill, { width: `${Math.max(2, (r.value / max) * 100)}%`, backgroundColor: color }]} />
          </View>
          <ThemedText themeColor="textMuted" style={styles.hval}>{format(r.value)}</ThemedText>
        </View>
      ))}
    </View>
  );
}

// Order Value bars + Profit line (dashboard ComposedChart). Tapping a column drills into days.
export function RevenueChart({ data, selected, onSelect, hFrom, hTo }: {
  data: { month: string; yearMonth?: string; revenue: number; profit: number }[];
  selected: string | null; onSelect: (ym: string) => void; hFrom: string; hTo: string;
}) {
  const theme = useTheme();
  const maxRev = Math.max(1, ...data.map((d) => d.revenue));
  const maxProfit = Math.max(1, ...data.map((d) => d.profit));
  const H = 160;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.rcWrap}>
        {data.map((d) => {
          const inRange = !!d.yearMonth && d.yearMonth >= hFrom && d.yearMonth <= hTo;
          const on = selected === d.yearMonth;
          return (
            <Pressable
              key={d.yearMonth ?? d.month}
              onPress={() => d.yearMonth && onSelect(d.yearMonth)}
              accessibilityRole="button"
              accessibilityLabel={`${d.month}: order value ${inr(d.revenue)}, profit ${inr(d.profit)}`}
              style={[styles.rcCol, (inRange || on) && { backgroundColor: withAlpha(theme.primary, on ? 0.16 : 0.08) }]}>
              <View style={{ height: H, justifyContent: 'flex-end', alignItems: 'center' }}>
                <View style={[styles.rcBar, { height: Math.max(2, (d.revenue / maxRev) * H), backgroundColor: CHART_COLORS[0] }]} />
                <View style={[styles.rcDot, { bottom: Math.max(0, (d.profit / maxProfit) * H - 3), backgroundColor: CHART_COLORS[1] }]} />
              </View>
              <ThemedText themeColor="textMuted" style={styles.rcLabel}>{d.month}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function SkeletonRows({ n = 5 }: { n?: number }) {
  return (
    <View style={styles.skel}>
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} height={16} />)}
    </View>
  );
}

export function TableCard({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.tableCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>{children}</View>;
}

export function EmptyText({ text }: { text: string }) {
  return <ThemedText themeColor="textMuted" style={styles.empty}>{text}</ThemedText>;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  sectionTitle: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.semiBold },
  sectionSub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  kpi: { borderWidth: 1, borderRadius: Radii.md, padding: 20, gap: 4, minWidth: 0 },
  kpiLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },
  kpiValue: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  kpiSub: { fontSize: 12, lineHeight: 16 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  hist: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  histText: { fontSize: 9, lineHeight: 12, fontFamily: FontWeights.bold },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  chipSmall: { paddingVertical: 4, minHeight: 28 },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  hbars: { gap: 10 },
  hrow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hlabel: { width: 96, fontSize: 11, lineHeight: 16 },
  htrack: { flex: 1, height: 14, borderRadius: 3, overflow: 'hidden' },
  hfill: { height: '100%', borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  hval: { width: 48, textAlign: 'right', fontSize: 10, lineHeight: 14, fontFamily: Fonts?.mono },
  rcWrap: { flexDirection: 'row', gap: 4, paddingRight: 8 },
  rcCol: { width: 44, alignItems: 'center', paddingVertical: 4, borderRadius: 6 },
  rcBar: { width: 24, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  rcDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  rcLabel: { fontSize: 11, lineHeight: 16, marginTop: 6 },
  skel: { gap: 12, padding: 16 },
  tableCard: { borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  empty: { textAlign: 'center', paddingVertical: 32, fontSize: 14, lineHeight: 20 },
});
