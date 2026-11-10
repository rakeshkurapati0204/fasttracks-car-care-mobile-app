import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayEntrySheet } from '@/components/my-timesheet/day-sheet';
import { MONTH_NAMES, dateFromKey, entryDateKey, localDateStr } from '@/components/my-timesheet/parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { markNotificationRead } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { mtMyMonth, mtUnreadRemarks, type MtDay } from '@/lib/my-timesheet-api';

// Mirrors the dashboard's My Timesheet page (dashboard/timesheet/page.tsx): a month calendar of the caller's own days
// (tap a day to log / edit it), month totals, an "Entries this month" list, and the per-day entry sheet.
const WIDE_MIN = 560;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DRAFT_BG = 'rgba(104,15,26,0.22)';
const SUBMITTED_BG = 'rgba(54,200,126,0.2)';

export default function MyTimesheetScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;

  const [today] = useState(() => new Date());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [entries, setEntries] = useState<MtDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Days with an unread "manager replied to your timesheet" notice — drives the calendar's per-day dot, keyed by the
  // day's own timesheet id. Opening the day marks those notifications read and clears its dot immediately.
  const [unreadReplies, setUnreadReplies] = useState<{ id: string; timesheetId: string }[]>([]);
  const unreadReplyIds = useMemo(() => new Set(unreadReplies.map((n) => n.timesheetId)), [unreadReplies]);

  const loadUnread = useCallback(async () => {
    try { setUnreadReplies(await mtUnreadRemarks()); } catch { /* the dot is a nicety */ }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadUnread();
  }, [loadUnread]);

  const clearReplyBadge = (timesheetId: string) => {
    const toClear = unreadReplies.filter((n) => n.timesheetId === timesheetId);
    if (toClear.length === 0) return;
    setUnreadReplies((prev) => prev.filter((n) => n.timesheetId !== timesheetId));
    toClear.forEach((n) => { markNotificationRead(n.id).catch(() => {}); });
  };

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setEntries(await mtMyMonth(month, year));
    } catch {
      setEntries([]);
      setLoadError('Could not load your timesheets.');
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / when the month changes
    loadEntries();
  }, [loadEntries]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadEntries(), loadUnread()]);
    setRefreshing(false);
  };

  // YYYY-MM-DD -> entry (the date's first 10 chars, so no timezone shift).
  const entryByDate = useMemo(() => {
    const map: Record<string, MtDay> = {};
    for (const e of entries) map[entryDateKey(e.date)] = e;
    return map;
  }, [entries]);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const calendarDays: (number | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (calendarDays.length % 7 !== 0) calendarDays.push(null);

  const totalHours = entries.reduce((s, e) => s + Number(e.totalHours || 0), 0);
  const daysLogged = entries.length;
  const draftCount = entries.filter((e) => e.status === 'DRAFT').length;

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1);
  };
  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear();
  const todayStr = localDateStr(today.getFullYear(), today.getMonth() + 1, today.getDate());

  const sorted = useMemo(() => [...entries].sort((a, b) => entryDateKey(b.date).localeCompare(entryDateKey(a.date))), [entries]);

  const selectedKey = selectedDate ? localDateStr(selectedDate.getFullYear(), selectedDate.getMonth() + 1, selectedDate.getDate()) : '';

  const stat = (label: string, value: string, color: string) => (
    <View style={[styles.stat, { backgroundColor: theme.surface }]}>
      <ThemedText style={[styles.statValue, { color, fontFamily: Fonts?.mono }]}>{value}</ThemedText>
      <ThemedText themeColor="textMuted" style={[styles.small, { textAlign: 'center' }]}>{label}</ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'My Timesheet' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled">
        <View style={styles.inner}>
          <View>
            <ThemedText style={styles.title}>My Timesheet</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.sub}>Click any day to log your work</ThemedText>
          </View>

          {loadError ? <ErrorBanner message={loadError} onRetry={loadEntries} /> : null}

          <Card>
            <View style={styles.monthRow}>
              <Pressable onPress={prevMonth} hitSlop={8} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous month">
                <ThemedText themeColor="textSecondary" style={styles.navText}>‹</ThemedText>
              </Pressable>
              <ThemedText style={styles.monthTitle}>{MONTH_NAMES[month - 1]} {year}</ThemedText>
              <Pressable onPress={nextMonth} disabled={isCurrentMonth} hitSlop={8} style={[styles.navBtn, isCurrentMonth && styles.faint]} accessibilityRole="button" accessibilityLabel="Next month">
                <ThemedText themeColor="textSecondary" style={styles.navText}>›</ThemedText>
              </Pressable>
            </View>

            <View style={styles.statsRow}>
              {stat('Days Logged', String(daysLogged), theme.primary)}
              {stat('Total Hours', `${totalHours.toFixed(1)}h`, theme.text)}
              {stat('Pending Submit', String(draftCount), draftCount > 0 ? '#E8A828' : theme.textMuted)}
            </View>

            {loading ? (
              <View style={styles.grid}>
                {Array.from({ length: 35 }).map((_, i) => (
                  <View key={i} style={styles.cell}><Skeleton height={48} /></View>
                ))}
              </View>
            ) : (
              <>
                <View style={[styles.grid, styles.weekRow]}>
                  {WEEKDAYS.map((d) => (
                    <View key={d} style={styles.cell}><ThemedText themeColor="textMuted" style={styles.weekday}>{d}</ThemedText></View>
                  ))}
                </View>
                <View style={styles.grid}>
                  {calendarDays.map((day, i) => {
                    if (day === null) return <View key={i} style={styles.cell} />;
                    const dateKey = localDateStr(year, month, day);
                    const entry = entryByDate[dateKey];
                    const isToday = dateKey === todayStr;
                    const isFuture = dateKey > todayStr;
                    const bg = entry ? (entry.status === 'SUBMITTED' ? SUBMITTED_BG : DRAFT_BG) : 'transparent';
                    const hasUnreadReply = !!entry && unreadReplyIds.has(entry.id);
                    return (
                      <View key={i} style={styles.cell}>
                        <Pressable
                          disabled={isFuture}
                          onPress={() => {
                            if (entry) clearReplyBadge(entry.id);
                            setSelectedDate(new Date(year, month - 1, day));
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${day} ${MONTH_NAMES[month - 1]}${entry ? `, ${Number(entry.totalHours).toFixed(1)} hours` : ''}`}
                          style={({ pressed }) => [
                            styles.day,
                            { backgroundColor: bg },
                            isToday && { borderWidth: 2, borderColor: theme.primary },
                            isFuture && styles.future,
                            pressed && !isFuture && styles.pressed,
                          ]}>
                          {hasUnreadReply ? <View style={[styles.dot, { backgroundColor: theme.danger }]} /> : null}
                          <ThemedText style={[styles.dayNum, { color: isToday ? theme.primary : theme.text }]}>{day}</ThemedText>
                          {entry ? <ThemedText themeColor="textMuted" style={styles.dayHours}>{Number(entry.totalHours).toFixed(1)}h</ThemedText> : null}
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.legend}>
              <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: DRAFT_BG }]} /><ThemedText themeColor="textMuted" style={styles.small}>Draft</ThemedText></View>
              <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: SUBMITTED_BG }]} /><ThemedText themeColor="textMuted" style={styles.small}>Submitted</ThemedText></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: theme.danger }]} /><ThemedText themeColor="textMuted" style={styles.small}>Manager replied</ThemedText></View>
            </View>
          </Card>

          {sorted.length > 0 ? (
            <Card title="Entries this month">
              <View style={[styles.list, wide && styles.listWide]}>
                {sorted.map((entry) => {
                  const isDraft = entry.status === 'DRAFT';
                  const d = dateFromKey(entryDateKey(entry.date));
                  return (
                    <Pressable key={entry.id} onPress={() => setSelectedDate(d)} accessibilityRole="button" style={({ pressed }) => [styles.entryRow, wide && styles.entryWide, { backgroundColor: theme.surface }, pressed && styles.pressed]}>
                      <View style={styles.flex1}>
                        <ThemedText style={styles.entryDate}>{d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</ThemedText>
                        <ThemedText themeColor="textMuted" style={styles.small}>
                          {entry.entries.length} task{entry.entries.length !== 1 ? 's' : ''} · {Number(entry.totalHours).toFixed(1)}h
                        </ThemedText>
                      </View>
                      <View style={[styles.badge, { backgroundColor: isDraft ? 'rgba(232,168,40,0.15)' : 'rgba(54,200,126,0.15)' }]}>
                        <ThemedText style={[styles.badgeText, { color: isDraft ? '#A86018' : '#167A48' }]}>{isDraft ? 'Draft' : 'Submitted'}</ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          ) : null}
        </View>
      </ScrollView>

      {selectedDate ? (
        <DayEntrySheet
          key={selectedKey}
          date={selectedDate}
          existing={entryByDate[selectedKey]}
          user={user ? { id: user.id, role: user.role } : null}
          onClose={() => setSelectedDate(null)}
          onSaved={loadEntries}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { padding: 16 },
  inner: { width: '100%', maxWidth: 896, alignSelf: 'center', gap: 24 },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 24, lineHeight: 28 },
  faint: { opacity: 0.3 },
  monthTitle: { fontSize: 18, lineHeight: 24, fontFamily: FontWeights.semiBold },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stat: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: Radii.md },
  statValue: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  small: { fontSize: 12, lineHeight: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekRow: { marginBottom: 4 },
  cell: { width: `${100 / 7}%`, padding: 2 },
  weekday: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium, textAlign: 'center', paddingVertical: 4 },
  day: { height: 48, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontSize: 14, lineHeight: 18, fontFamily: FontWeights.medium },
  dayHours: { fontSize: 11, lineHeight: 14 },
  dot: { position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: 4 },
  future: { opacity: 0.3 },
  pressed: { opacity: 0.8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  list: { gap: 8 },
  listWide: { flexDirection: 'row', flexWrap: 'wrap' },
  entryWide: { width: '49%' },
  entryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, borderRadius: Radii.md },
  entryDate: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
});
