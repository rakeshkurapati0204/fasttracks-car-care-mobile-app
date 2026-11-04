import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { logEmailCheck } from '@/lib/api';
import type { EmailCheckState } from '@/types/api';

import { fmtDateTime } from './helpers';
import type { Notify } from './parts';

const COLS = 13;
const GAP = 4;
const IST_MS = 5.5 * 60 * 60 * 1000;
const ymd = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// The signed-in Accounts user's own "checked email today" log (GET/POST /accounts/email-check).
// The OWNER-only all-staff route isn't used by the dashboard page either.
export function EmailCheckTab({ state, loading, isOwner, wide, notify, onChanged }: {
  state: EmailCheckState | null; loading: boolean; isOwner: boolean; wide: boolean; notify: Notify; onChanged: () => void;
}) {
  const theme = useTheme();
  const [checking, setChecking] = useState(false);
  const [gridW, setGridW] = useState(0);
  const [now] = useState(() => Date.now());

  const logCheck = async () => {
    setChecking(true);
    try {
      await logEmailCheck();
      notify('success', 'Email check logged!');
      onChanged();
    } catch {
      notify('error', 'Failed to log check');
    } finally {
      setChecking(false);
    }
  };

  if (loading && !state) return <View style={styles.gap}><Skeleton height={96} /><Skeleton height={72} /><Skeleton height={180} /></View>;
  if (!state) return null;

  const todayStr = ymd(new Date(now + IST_MS));
  const checkedDates = new Set(state.history.map((h) => h.date.slice(0, 10)));
  const days: { date: string; checked: boolean }[] = [];
  for (let i = 89; i >= 0; i--) {
    const ds = ymd(new Date(now + IST_MS - i * 86400000));
    days.push({ date: ds, checked: checkedDates.has(ds) });
  }
  const checkedCount = days.filter((d) => d.checked).length;
  const missedCount = days.filter((d) => !d.checked && d.date < todayStr).length;
  const rate = `${Math.round((checkedCount / Math.max(1, checkedCount + missedCount)) * 100)}%`;
  const cell = gridW > 0 ? Math.floor((gridW - GAP * (COLS - 1)) / COLS) : 0;

  const stats = [
    { label: 'Checked', value: String(checkedCount), color: theme.success },
    { label: 'Missed', value: String(missedCount), color: '#ef4444' },
    { label: '90-day rate', value: rate, color: theme.primary },
  ];
  const legend = [
    { color: theme.success, label: 'Checked' },
    { color: 'rgba(239,68,68,0.4)', label: 'Missed' },
    { color: 'rgba(245,158,11,0.3)', label: 'Today' },
  ];

  return (
    <View style={[styles.gapLg, wide && styles.narrow]}>
      <Card>
        <View style={styles.todayRow}>
          <Pressable
            onPress={!state.checkedToday ? logCheck : undefined}
            disabled={state.checkedToday || checking}
            accessibilityRole="button"
            accessibilityLabel={state.checkedToday ? 'Email checked today' : 'Mark email as checked'}
            style={[styles.box, {
              backgroundColor: state.checkedToday ? 'rgba(34,197,94,0.1)' : theme.backgroundElement,
              borderColor: state.checkedToday ? theme.success : theme.border,
              opacity: checking ? 0.6 : 1,
            }]}>
            <Ionicons name={state.checkedToday ? 'checkmark-circle' : 'mail-outline'} size={28} color={state.checkedToday ? theme.success : theme.textMuted} />
          </Pressable>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>{state.checkedToday ? 'Email checked today' : 'Mark email as checked'}</ThemedText>
            {state.checkedToday && state.todayLog ? (
              <ThemedText style={[styles.small, { color: theme.success }]}>{`Logged at ${fmtDateTime(state.todayLog.checkedAt)}`}</ThemedText>
            ) : (
              <ThemedText themeColor="textMuted" style={styles.small}>Tap to confirm you&apos;ve checked email today</ThemedText>
            )}
          </View>
        </View>
      </Card>

      <View style={styles.stats}>
        {stats.map((s) => (
          <View key={s.label} style={styles.stat}>
            <Card>
              <View style={styles.statInner}>
                <ThemedText style={[styles.statValue, { color: s.color }]}>{s.value}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.statLabel}>{s.label.toUpperCase()}</ThemedText>
              </View>
            </Card>
          </View>
        ))}
      </View>

      <Card>
        <ThemedText themeColor="textMuted" style={styles.caption}>LAST 90 DAYS</ThemedText>
        <View style={styles.grid} onLayout={(e) => setGridW(e.nativeEvent.layout.width)}>
          {cell > 0 ? days.map((d) => {
            const isToday = d.date === todayStr;
            const bg = d.checked ? theme.success : isToday ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.2)';
            return (
              <View
                key={d.date}
                accessibilityLabel={`${d.date}${d.checked ? ' checked' : isToday ? ' today' : ' missed'}`}
                style={{ width: cell, height: cell, borderRadius: 2, backgroundColor: bg, borderWidth: isToday ? 1 : 0, borderColor: theme.warning }}
              />
            );
          }) : null}
        </View>
        <View style={styles.legend}>
          {legend.map((l) => (
            <View key={l.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: l.color }]} />
              <ThemedText themeColor="textMuted" style={styles.tiny}>{l.label}</ThemedText>
            </View>
          ))}
        </View>
      </Card>

      {isOwner ? (
        <View style={[styles.note, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText themeColor="textMuted" style={styles.noteText}>
            This log is specific to the Accounts (Waseem) role. The calendar shows compliance at a glance — any gap day is a missed check.
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  gapLg: { gap: 20 },
  narrow: { maxWidth: 672 },
  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  box: { width: 56, height: 56, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  tiny: { fontSize: 10, lineHeight: 14 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, minWidth: 0 },
  statInner: { alignItems: 'center' },
  statValue: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  statLabel: { fontSize: 10, lineHeight: 14, letterSpacing: 0.5, marginTop: 2 },
  caption: { fontSize: 11, lineHeight: 15, fontFamily: FontWeights.semiBold, letterSpacing: 0.5, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  note: { padding: 12, borderRadius: 8 },
  noteText: { fontSize: 12, lineHeight: 18 },
});
