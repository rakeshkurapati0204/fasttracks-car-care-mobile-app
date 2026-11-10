import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ── formatters — the dashboard's own helpers ────────────────────────────────
export const inr = (n: number | null | undefined) => (n == null ? '—' : `₹${Math.round(n).toLocaleString('en-IN')}`);
export const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-IN'));
export const dur = (s: number | null | undefined) =>
  s == null ? '—' : s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
// Times are shown in IST (the dashboard labels every time and date as Asia/Kolkata).
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
export const dayLabel = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const C_PAID = '#7a1c2e';
export const C_ORGANIC = '#779e92';

const TIER_STYLE: Record<string, { bg: string; fg: string; label: string; dashed?: boolean }> = {
  premium: { bg: 'rgba(31,122,77,.14)', fg: '#1f7a4d', label: 'PREMIUM' },
  mid: { bg: 'rgba(201,162,39,.18)', fg: '#b06a1a', label: 'MID' },
  low: { bg: 'rgba(122,114,109,.14)', fg: '#7a726d', label: 'LOW' },
  unknown: { bg: 'transparent', fg: '#7a726d', label: 'NOT STATED', dashed: true },
};

export function TierChip({ tier }: { tier: string }) {
  const s = TIER_STYLE[tier] ?? TIER_STYLE.unknown;
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }, s.dashed && styles.dashed]}>
      <ThemedText type="small" style={[styles.chipText, { color: s.fg }]}>{s.label}</ThemedText>
    </View>
  );
}

export function SourceChip({ paid }: { paid: boolean }) {
  return (
    <View style={[styles.chip, { backgroundColor: paid ? 'rgba(122,28,46,.12)' : 'rgba(119,158,146,.18)' }]}>
      <ThemedText type="small" style={[styles.chipText, { color: paid ? C_PAID : '#3f6b5d' }]}>{paid ? 'META · PAID' : 'DIRECT'}</ThemedText>
    </View>
  );
}

export function Stat({ label, value, sub, icon, onPress }: {
  label: string; value: string; sub?: string; icon: keyof typeof Ionicons.glyphMap; onPress?: () => void;
}) {
  const theme = useTheme();
  const body = (
    <View style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.statHead}>
        <ThemedText style={[styles.statLabel, { color: theme.textMuted }]}>{label}</ThemedText>
        <Ionicons name={icon} size={16} color={theme.textMuted} />
      </View>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      {sub ? <ThemedText style={[styles.statSub, { color: theme.textMuted }]}>{sub}</ThemedText> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} accessibilityRole="button" style={styles.statWrap}>{body}</Pressable> : <View style={styles.statWrap}>{body}</View>;
}

export function Panel({ title, note, right, children }: { title: string; note?: string; right?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.panelHead}>
        <View style={styles.flex1}>
          <ThemedText style={styles.panelTitle}>{title}</ThemedText>
          {note ? <ThemedText style={[styles.panelNote, { color: theme.textMuted }]}>{note}</ThemedText> : null}
        </View>
        {right}
      </View>
      <View style={styles.panelBody}>{children}</View>
    </View>
  );
}

export function Empty() {
  return <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>Nothing recorded in this range.</ThemedText>;
}

// A count that opens the leads behind it; plain text when there is nothing to
// open, so zeros never look clickable.
export function DrillLink({ children, onPress, disabled, bold }: { children: ReactNode; onPress: () => void; disabled?: boolean; bold?: boolean }) {
  const theme = useTheme();
  if (disabled) return <ThemedText type={bold ? 'smallBold' : 'small'}>{children}</ThemedText>;
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <ThemedText type={bold ? 'smallBold' : 'small'} style={{ color: theme.primary, textDecorationLine: 'underline' }}>{children}</ThemedText>
    </Pressable>
  );
}

export function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.filterChip, { backgroundColor: 'rgba(122,28,46,.10)' }]}>
      <ThemedText type="small" style={{ color: theme.primary, fontWeight: '600' }}>{label}</ThemedText>
      <Pressable onPress={onClear} hitSlop={8} accessibilityLabel={`Remove ${label}`}>
        <ThemedText type="small" style={{ color: theme.primary }}>×</ThemedText>
      </Pressable>
    </View>
  );
}

export function FollowRow({ label, note, value, onPress }: { label: string; note: string; value: number; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.followRow, { borderBottomColor: theme.backgroundElement }]}>
      <View style={styles.flex1}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{note}</ThemedText>
      </View>
      {onPress && value ? (
        <Pressable onPress={onPress} hitSlop={8}>
          <ThemedText type="subtitle" style={{ color: theme.primary }}>{value.toLocaleString('en-IN')}</ThemedText>
        </Pressable>
      ) : (
        <ThemedText type="subtitle">{value.toLocaleString('en-IN')}</ThemedText>
      )}
    </View>
  );
}

// Filter dropdown drawn inline (a labelled button that expands its options).
export function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { v: string; t: string }[];
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.v === value)?.t ?? options[0]?.t ?? '';
  return (
    <View style={styles.select}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.selectLabel}>{label.toUpperCase()}</ThemedText>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={[styles.selectBtn, { backgroundColor: theme.backgroundElement, borderColor: open ? theme.primary : 'transparent' }]}>
        <ThemedText type="small" numberOfLines={1} style={styles.flex1}>{current}</ThemedText>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.textSecondary} />
      </Pressable>
      {open && (
        <View style={[styles.options, { backgroundColor: theme.backgroundElement }]}>
          {options.map((o) => {
            const on = o.v === value;
            return (
              <Pressable
                key={o.v}
                onPress={() => { onChange(o.v); setOpen(false); }}
                style={[styles.option, on && { backgroundColor: theme.primary }]}>
                <ThemedText type="small" style={on ? styles.optionOn : undefined}>{o.t}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  chip: { alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: Spacing.four },
  chipText: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6 },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(122,114,109,.5)' },
  statWrap: { flex: 1, minWidth: 0 },
  stat: { borderWidth: 1, borderRadius: 12, padding: 20, gap: 8, flex: 1 },
  statHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
  statLabel: { fontSize: 12, lineHeight: 16, fontWeight: '600', flex: 1 },
  statValue: { fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8 },
  statSub: { fontSize: 12.5, lineHeight: 18 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 20 },
  panelTitle: { fontSize: 15, lineHeight: 22, fontWeight: '700' },
  panelNote: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  panelBody: { marginTop: 16 },
  empty: { paddingVertical: Spacing.three },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: Spacing.four },
  followRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingBottom: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  select: { gap: Spacing.half },
  selectLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, borderWidth: 1 },
  options: { borderRadius: Spacing.two, paddingVertical: Spacing.one, marginTop: Spacing.half },
  option: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  optionOn: { color: '#ffffff', fontWeight: '600' },
});
