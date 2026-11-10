import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONTH_NAMES, S, formatDate, formatTime12, statusLabel } from '@/components/attendance/attendance-format';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchMyMonthlyAttendance, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { AttendanceRecord } from '@/types/api';

const GREEN = '#22c55e';
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Dashboard StaffAttendance ("My Attendance"): a sync note, a month calendar
// with the status colours and a legend, then the Punch Times list.
export function StaffAttendance({ forceUserId }: { forceUserId?: string } = {}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const now = new Date();
  const [monthYear, setMonthYear] = useState({ month: now.getMonth(), year: now.getFullYear() });
  const [records, setRecords] = useState<AttendanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const userId = forceUserId || user?.id;

  const load = useCallback(async () => {
    setError(null);
    try {
      setRecords(await fetchMyMonthlyAttendance(monthYear.month + 1, monthYear.year, userId));
    } catch (err: unknown) {
      setRecords([]);
      setError(getErrorMessage(err, 'Could not load your attendance.'));
    }
  }, [monthYear, userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change
    setRecords(null);
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const daysInMonth = new Date(monthYear.year, monthYear.month + 1, 0).getDate();
  const firstDow = new Date(monthYear.year, monthYear.month, 1).getDay();

  const byDay = useMemo(() => {
    const m = new Map<string, AttendanceRecord>();
    for (const r of records ?? []) if (r.date) m.set(r.date.slice(0, 10), r);
    return m;
  }, [records]);

  const getDay = (day: number) => byDay.get(`${monthYear.year}-${String(monthYear.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

  const prevMonth = () => setMonthYear((p) => (p.month === 0 ? { month: 11, year: p.year - 1 } : { ...p, month: p.month - 1 }));
  const nextMonth = () => setMonthYear((p) => (p.month === 11 ? { month: 0, year: p.year + 1 } : { ...p, month: p.month + 1 }));

  // Calendar cells: leading blanks, then 1..N, padded to full weeks.
  const cells: (number | null)[] = [...Array.from({ length: firstDow }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const punches = (records ?? [])
    .filter((r) => r.status !== 'WEEKEND')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <ThemedText style={styles.h1}>My Attendance</ThemedText>

      <Card padding="lg">
        <View style={styles.note}>
          <View style={[styles.noteIcon, { backgroundColor: 'rgba(104,15,26,0.15)' }]}>
            <Ionicons name="checkmark-circle-outline" size={20} color={theme.primary} />
          </View>
          <View style={styles.flex1}>
            <ThemedText style={styles.noteTitle}>Attendance synced automatically</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.small}>
              Your attendance is recorded via the biometric device. Contact Rakesh Sir for any discrepancies.
            </ThemedText>
          </View>
        </View>
      </Card>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <Card padding="md">
        <View style={styles.monthRow}>
          <Pressable onPress={prevMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Previous month" style={styles.arrow}>
            <Ionicons name="chevron-back" size={20} color={theme.textMuted} />
          </Pressable>
          <ThemedText style={styles.monthTitle}>{`${MONTH_NAMES[monthYear.month]} ${monthYear.year}`}</ThemedText>
          <Pressable onPress={nextMonth} hitSlop={8} accessibilityRole="button" accessibilityLabel="Next month" style={styles.arrow}>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {DOW.map((d) => <ThemedText key={d} themeColor="textMuted" style={styles.dow}>{d}</ThemedText>)}
        </View>

        {records === null ? (
          <View style={styles.skeletons}><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></View>
        ) : (
          <View style={styles.grid}>
            {weeks.map((week, w) => (
              <View key={w} style={styles.weekRow}>
                {week.map((day, i) => {
                  if (day === null) return <View key={`e${i}`} style={styles.cellWrap} />;
                  const rec = getDay(day);
                  const sc = rec && rec.status !== 'WEEKEND' ? S[rec.status] : null;
                  const isToday = day === now.getDate() && monthYear.month === now.getMonth() && monthYear.year === now.getFullYear();
                  return (
                    <View key={day} style={styles.cellWrap}>
                      <View
                        accessibilityLabel={rec ? `${day}: ${rec.status}` : `${day}`}
                        style={[
                          styles.cell,
                          {
                            backgroundColor: sc ? sc.bg : isToday ? 'rgba(104,15,26,0.18)' : 'transparent',
                            borderColor: sc ? 'transparent' : isToday ? theme.primary : theme.border,
                            borderWidth: !sc && isToday ? 2 : 1,
                          },
                        ]}>
                        <ThemedText style={[styles.dayText, { color: sc ? '#fff' : isToday ? theme.primary : theme.textSecondary }]}>{day}</ThemedText>
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        <View style={styles.legend}>
          {Object.values(S).map((v) => (
            <View key={v.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: v.bg }]} />
              <ThemedText themeColor="textMuted" style={styles.small}>{statusLabel(v.label)}</ThemedText>
            </View>
          ))}
        </View>
      </Card>

      {punches.length > 0 ? (
        <Card padding="none" style={styles.clip}>
          <View style={[styles.cardHead, { borderBottomColor: theme.border }]}>
            <ThemedText style={styles.cardTitle}>Punch Times</ThemedText>
          </View>
          {punches.map((rec, i) => {
            const sc = S[rec.status];
            return (
              <View key={rec.id} style={[styles.punch, i < punches.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                <View style={styles.punchLeft}>
                  <ThemedText themeColor="textMuted" style={styles.punchDate}>{formatDate(rec.date).slice(0, 6)}</ThemedText>
                  <View style={[styles.tag, { backgroundColor: sc?.bg ?? '#6b7280' }]}>
                    <ThemedText style={styles.tagText}>{sc?.label ?? rec.status.slice(0, 1)}</ThemedText>
                  </View>
                </View>
                <View style={styles.punchRight}>
                  <View style={styles.time}>
                    <ThemedText themeColor="textMuted" style={styles.timeLabel}>IN</ThemedText>
                    <ThemedText style={[styles.mono, { color: rec.clockIn ? GREEN : theme.textMuted }]}>{rec.clockIn ? formatTime12(rec.clockIn) : '—'}</ThemedText>
                  </View>
                  <View style={styles.time}>
                    <ThemedText themeColor="textMuted" style={styles.timeLabel}>OUT</ThemedText>
                    <ThemedText style={[styles.mono, { color: rec.clockOut ? theme.text : theme.textMuted }]}>{rec.clockOut ? formatTime12(rec.clockOut) : '—'}</ThemedText>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { padding: 16, gap: 20, width: '100%', maxWidth: 900, alignSelf: 'center' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  small: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  noteIcon: { width: 36, height: 36, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  noteTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  arrow: { padding: 6, borderRadius: Radii.sm },
  monthTitle: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  weekRow: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: 11, lineHeight: 16, fontFamily: FontWeights.semiBold, paddingBottom: 4 },
  grid: { gap: 4 },
  cellWrap: { flex: 1, padding: 2 },
  cell: { height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  dayText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  skeletons: { gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  clip: { overflow: 'hidden' },
  cardHead: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  cardTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  punch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  punchLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  punchDate: { width: 56, fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  tag: { minWidth: 28, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tagText: { color: '#fff', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  punchRight: { flexDirection: 'row', gap: 24 },
  time: { alignItems: 'flex-end' },
  timeLabel: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  mono: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono, fontWeight: '700' },
});
