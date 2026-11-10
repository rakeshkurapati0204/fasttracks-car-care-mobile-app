import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { AddRemarkSheet, InlineEmployeePanel, SearchDocsTab, type RosterEntry } from '@/components/all-timesheets/parts';
import {
  BLOCKED_ROLES,
  REGISTER_STATUS,
  addDaysToDateStr,
  formatDateLabel,
  getTodayIST,
  mondayOfWeek,
  weekdayLabel,
} from '@/components/all-timesheets/helpers';
import { ErrorBanner } from '@/components/overview/parts';
import { shareCsv } from '@/components/purchase/helpers';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchMentionableUsers,
  fetchTimesheetRegister,
  fetchTimesheetSummaryCounts,
  fetchTimesheetsForCsvExport,
  getErrorMessage,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { MentionableUser } from '@/types/api';

// Mirrors the dashboard's "All Timesheets" page (dashboard/timesheets/page.tsx). Page access: OWNER and
// STORE_MANAGER only (page.tsx client gate, navItems roles, and the manager-only register/summary/export routes).
const WIDE_MIN = 560;

export default function TimesheetsManagerScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ date?: string; employeeId?: string }>();
  const allowed = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER';
  const isOwner = user?.role === 'OWNER';

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;

  const [tab, setTab] = useState<'overview' | 'search'>('overview');
  const [nameSearch, setNameSearch] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<number | null>(null);
  const [roster, setRoster] = useState<RosterEntry[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [remarkFor, setRemarkFor] = useState<{ id: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mentionUsers, setMentionUsers] = useState<MentionableUser[]>([]);
  const [error, setError] = useState('');

  const [today] = useState(() => getTodayIST());
  const yesterday = useMemo(() => addDaysToDateStr(today, -1), [today]);
  const monday = useMemo(() => mondayOfWeek(today), [today]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysToDateStr(monday, i)), [monday]);

  const [selectedDate, setSelectedDate] = useState(() => (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today));
  const [showWeekChips, setShowWeekChips] = useState(false);

  const loadPendingApproval = useCallback(async () => {
    try { setPendingApproval((await fetchTimesheetSummaryCounts()).pendingApproval); } catch { /* silent, like the dashboard */ }
  }, []);

  // Everyone taggable, for the @-mention compose boxes. Loaded once; tagging degrades to plain text if this fails.
  useEffect(() => {
    if (!allowed) return;
    fetchMentionableUsers().then(setMentionUsers).catch(() => {});
  }, [allowed]);

  // A response for any date other than the most recently requested one is stale and discarded.
  const latestRosterRequest = useRef<string | null>(null);
  const loadRoster = useCallback(async () => {
    const requestedDate = selectedDate;
    latestRosterRequest.current = requestedDate;
    try {
      const res = await fetchTimesheetRegister(requestedDate, requestedDate);
      if (latestRosterRequest.current !== requestedDate) return;
      setError('');
      setRoster(res.employees.map((e) => {
        const cell = e.timesheets[requestedDate];
        return { id: e.id, name: e.name, role: e.role, status: cell?.status ?? 'NOT_SUBMITTED', timesheetId: cell?.id ?? null, totalHours: cell?.totalHours ?? 0 };
      }));
    } catch (e) {
      if (latestRosterRequest.current !== requestedDate) return;
      setError(getErrorMessage(e, 'Could not load the timesheet register.'));
      setRoster([]);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!allowed || tab !== 'overview') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadPendingApproval();
  }, [allowed, tab, loadPendingApproval]);
  useEffect(() => {
    if (!allowed || tab !== 'overview') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on date change
    loadRoster();
  }, [allowed, tab, loadRoster]);

  // Deep link (?employeeId=&date=): once the roster is in, pre-expand that person and filter to them — once only.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current || !roster || !params.employeeId) return;
    const match = roster.find((e) => e.id === params.employeeId);
    if (match) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time deep-link application
      setExpandedId(match.id);
      setNameSearch(match.name);
      deepLinkApplied.current = true;
    }
  }, [roster, params.employeeId]);

  const notSubmittedList = useMemo(() => (roster ?? []).filter((e) => e.status === 'NOT_SUBMITTED'), [roster]);
  const submittedCount = useMemo(() => (roster ?? []).filter((e) => e.status === 'SUBMITTED' || e.status === 'APPROVED').length, [roster]);

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshTick((t) => t + 1);
    await Promise.all([tab === 'overview' ? loadRoster() : Promise.resolve(), tab === 'overview' ? loadPendingApproval() : Promise.resolve()]);
    setRefreshing(false);
  };

  // Same rows/columns/ordering as the dashboard's GET /timesheets/export, month-to-date, built on the phone as CSV.
  const handleExport = async () => {
    setExportLoading(true);
    setError('');
    try {
      const monthStart = today.slice(0, 8) + '01';
      const list = await fetchTimesheetsForCsvExport(monthStart, today);
      list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.user.name.localeCompare(b.user.name)));
      const rows: (string | number)[][] = [['Employee', 'Designation', 'Date', 'Task', 'Hours', 'Notes', 'Status']];
      for (const ts of list) {
        const [y, m, d] = ts.date.slice(0, 10).split('-');
        const date = `${d}/${m}/${y}`;
        const entries = ts.entries ?? [];
        if (entries.length === 0) {
          rows.push([ts.user.name, ts.user.designation || '', date, '', ts.totalHours, ts.notes || '', ts.status]);
        } else {
          for (const e of entries) rows.push([ts.user.name, ts.user.designation || '', date, e.task, e.hours, e.notes || '', ts.status]);
        }
      }
      const shared = await shareCsv(`timesheets-${monthStart}-to-${today}.csv`, rows);
      if (!shared) setError('Sharing is not available on this device.');
    } catch { /* silent, like the dashboard */ } finally { setExportLoading(false); }
  };

  const toggleExpanded = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  // Numbered "N. Name" lines, no header — same as Attendance's copy-absentees.
  const handleCopyNotSubmitted = async () => {
    if (!notSubmittedList.length) return;
    try {
      await Clipboard.setStringAsync(notSubmittedList.map((p, i) => `${i + 1}. ${p.name}`).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* not copied */ }
  };

  const visibleRoster = useMemo(() => (roster ?? [])
    .filter((e) => !nameSearch.trim() || e.name.toLowerCase().includes(nameSearch.trim().toLowerCase()))
    .sort((a, b) => {
      const aB = BLOCKED_ROLES.includes(a.role) ? 1 : 0;
      const bB = BLOCKED_ROLES.includes(b.role) ? 1 : 0;
      return aB !== bB ? aB - bB : a.name.localeCompare(b.name);
    }), [roster, nameSearch]);

  if (!allowed) {
    return (
      <ThemedView style={styles.center}>
        <Stack.Screen options={{ title: 'All Timesheets' }} />
        <ThemedText themeColor="textSecondary" style={styles.centerText}>All Timesheets is only available to Owner and Store Manager accounts.</ThemedText>
      </ThemedView>
    );
  }

  const chip = (on: boolean) => ({
    backgroundColor: on ? theme.primary : theme.surface,
    borderColor: on ? theme.primary : theme.border,
  });
  const chipText = (on: boolean) => ({ color: on ? '#fff' : theme.textSecondary });

  const summary = [
    { label: 'Submitted', value: roster ? submittedCount : null, color: theme.success },
    { label: 'Pending Review', value: pendingApproval, color: theme.warning },
    { label: 'Not Submitted', value: roster ? notSubmittedList.length : null, color: theme.danger },
  ];

  // Two-column grid on wide screens; an expanded panel always takes a full row (CSS-grid `1 / -1`).
  const cols = wide ? 2 : 1;
  const rosterRows: ({ type: 'cells'; items: RosterEntry[] } | { type: 'panel'; emp: RosterEntry })[] = [];
  {
    let cur: RosterEntry[] = [];
    for (const emp of visibleRoster) {
      cur.push(emp);
      if (expandedId === emp.id) {
        rosterRows.push({ type: 'cells', items: cur });
        rosterRows.push({ type: 'panel', emp });
        cur = [];
      } else if (cur.length === cols) {
        rosterRows.push({ type: 'cells', items: cur });
        cur = [];
      }
    }
    if (cur.length) rosterRows.push({ type: 'cells', items: cur });
  }

  const rosterCard = (emp: RosterEntry) => {
    const s = REGISTER_STATUS[emp.status] ?? REGISTER_STATUS.NOT_SUBMITTED;
    const open = expandedId === emp.id;
    return (
      <Pressable key={emp.id} onPress={() => toggleExpanded(emp.id)} accessibilityRole="button"
        style={[styles.rosterCard, styles.flex1, { backgroundColor: open ? theme.surface : theme.backgroundElement, borderColor: open ? theme.primary : theme.border }]}>
        <View style={styles.flex1}>
          <ThemedText style={styles.empName} numberOfLines={1}>{emp.name}</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.xs}>{emp.role.replace(/_/g, ' ')}</ThemedText>
        </View>
        <View style={[styles.pill, { backgroundColor: s.bg }]}><ThemedText style={[styles.pillText, { color: s.fg }]}>{s.text}</ThemedText></View>
      </Pressable>
    );
  };

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'All Timesheets' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>Timesheets</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.sub}>Click a person to see their activity for the selected day, right here.</ThemedText>
          </View>
          {tab === 'overview' ? <Button variant="outline" icon="download-outline" onPress={handleExport} loading={exportLoading}>Export CSV</Button> : null}
        </View>

        <View style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}>
          {([['overview', 'Overview'], ['search', 'Search Docs']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" style={[styles.tab, tab === k && { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.tabText, { color: tab === k ? '#fff' : theme.textMuted }]}>{label}</ThemedText>
            </Pressable>
          ))}
        </View>

        {error ? <ErrorBanner message={error} onRetry={tab === 'overview' ? loadRoster : undefined} /> : null}

        {tab === 'search' ? (
          <SearchDocsTab wide={wide} />
        ) : (
          <>
            <View style={styles.gap8}>
              <View style={styles.chipRow}>
                <Pressable onPress={() => { setSelectedDate(today); setShowWeekChips(false); }} style={[styles.chip, chip(selectedDate === today)]}>
                  <ThemedText style={[styles.chipText, chipText(selectedDate === today)]}>Today</ThemedText>
                </Pressable>
                <Pressable onPress={() => { setSelectedDate(yesterday); setShowWeekChips(false); }} style={[styles.chip, chip(selectedDate === yesterday)]}>
                  <ThemedText style={[styles.chipText, chipText(selectedDate === yesterday)]}>Yesterday</ThemedText>
                </Pressable>
                <Pressable onPress={() => setShowWeekChips((v) => !v)} style={[styles.chip, chip(showWeekChips)]}>
                  <ThemedText style={[styles.chipText, chipText(showWeekChips)]}>This Week</ThemedText>
                </Pressable>
                <View style={styles.dateBox}>
                  <DateField label="Date" value={selectedDate} compact onChange={(v) => { if (v && v <= today) { setSelectedDate(v); setShowWeekChips(false); } }} />
                </View>
                {selectedDate !== today ? <ThemedText themeColor="textMuted" style={styles.xs}>Showing {formatDateLabel(selectedDate)}</ThemedText> : null}
              </View>
              {showWeekChips ? (
                <View style={styles.chipRow}>
                  {weekDays.map((d) => {
                    const disabled = d > today;
                    return (
                      <Pressable key={d} disabled={disabled} onPress={() => setSelectedDate(d)} style={[styles.chip, chip(selectedDate === d), disabled && { opacity: 0.4 }]}>
                        <ThemedText style={[styles.chipText, chipText(selectedDate === d)]}>{weekdayLabel(d)} {d.slice(8, 10)}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>

            <View style={styles.summaryRow}>
              {summary.map((s) => (
                <Card key={s.label} padding={wide ? 'md' : 'sm'} style={styles.flex1}>
                  <ThemedText style={[styles.statValue, { color: s.color }]}>{s.value ?? '—'}</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.xs, { marginTop: 4 }]}>{s.label}</ThemedText>
                </Card>
              ))}
            </View>

            <View style={styles.gap12}>
              <View style={styles.between}>
                <ThemedText style={styles.h2}>
                  Not Submitted
                  {roster ? <ThemedText style={{ color: '#ef4444', fontSize: 14, fontFamily: FontWeights.regular }}>{`  (${notSubmittedList.length})`}</ThemedText> : null}
                </ThemedText>
                {roster && notSubmittedList.length > 0 ? (
                  <Pressable onPress={handleCopyNotSubmitted} accessibilityRole="button"
                    style={[styles.copyBtn, { backgroundColor: copied ? 'rgba(34,197,94,0.15)' : theme.surface, borderColor: theme.border }]}>
                    {copied ? (
                      <ThemedText style={[styles.copyText, { color: '#22c55e' }]}>✓ Copied!</ThemedText>
                    ) : (
                      <>
                        <Ionicons name="copy-outline" size={14} color={theme.textMuted} />
                        <ThemedText themeColor="textMuted" style={styles.copyText}>Copy</ThemedText>
                      </>
                    )}
                  </Pressable>
                ) : null}
              </View>
              {!roster ? (
                <View style={styles.chipRow}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} width={112} height={40} style={{ borderRadius: Radii.pill }} />)}</View>
              ) : notSubmittedList.length === 0 ? (
                <Card padding="md">
                  <View style={styles.celebrate}>
                    <ThemedText style={{ fontSize: 24, lineHeight: 30 }}>🎉</ThemedText>
                    <ThemedText style={[styles.sm, styles.semi, styles.flex1]}>Everyone has submitted for this day — nothing outstanding!</ThemedText>
                  </View>
                </Card>
              ) : (
                <View style={styles.chipRow}>
                  {notSubmittedList.map((p) => (
                    <Pressable key={p.id} onPress={() => toggleExpanded(p.id)} accessibilityRole="button"
                      style={[styles.person, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' }]}>
                      <View style={styles.dot} />
                      <ThemedText style={[styles.sm, styles.semi]}>{p.name}</ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.xs}>{p.role.replace(/_/g, ' ')}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.gap12}>
              <View style={[styles.between, !wide && { flexDirection: 'column', alignItems: 'stretch' }]}>
                <ThemedText style={styles.h2}>Everyone</ThemedText>
                <TextInput
                  value={nameSearch}
                  onChangeText={setNameSearch}
                  placeholder="Search employee..."
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.nameSearch, wide && { width: 192 }, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
                />
              </View>

              {roster === null ? (
                <View style={styles.gap8}>{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={56} style={{ borderRadius: Radii.md }} />)}</View>
              ) : visibleRoster.length === 0 ? (
                <Card padding="lg"><ThemedText themeColor="textMuted" style={[styles.sm, styles.centerText]}>No employees match that search.</ThemedText></Card>
              ) : (
                <View style={styles.gap8}>
                  {rosterRows.map((row, i) => row.type === 'panel' ? (
                    <View key={`p-${row.emp.id}`} style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.primary }]}>
                      {isOwner ? (
                        <View style={styles.remarkRow}>
                          <Pressable onPress={() => setRemarkFor({ id: row.emp.id, name: row.emp.name })} accessibilityRole="button"
                            style={[styles.remarkBtn, { backgroundColor: 'rgba(99,102,241,0.12)', borderColor: 'rgba(99,102,241,0.35)' }]}>
                            <Ionicons name="document-text-outline" size={14} color="#4f46e5" />
                            <ThemedText style={[styles.copyText, { color: '#4f46e5' }]}>Add remark</ThemedText>
                          </Pressable>
                        </View>
                      ) : null}
                      <InlineEmployeePanel emp={row.emp} date={selectedDate} currentUserId={user?.id ?? ''} onReplySent={loadRoster} mentionUsers={mentionUsers} refreshTick={refreshTick} />
                    </View>
                  ) : (
                    <View key={`r-${i}`} style={styles.gridRow}>
                      {row.items.map(rosterCard)}
                      {row.items.length < cols ? <View style={styles.flex1} /> : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
      <AddRemarkSheet employee={remarkFor} onClose={() => setRemarkFor(null)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  centerText: { textAlign: 'center' },
  content: { padding: 16, gap: 20, width: '100%', maxWidth: 1024, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 24, lineHeight: 30, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: Radii.md, alignSelf: 'flex-start' },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radii.sm },
  tabText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill, borderWidth: 1 },
  chipText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  dateBox: { width: 150 },
  xs: { fontSize: 12, lineHeight: 18 },
  sm: { fontSize: 14, lineHeight: 20 },
  semi: { fontFamily: FontWeights.semiBold },
  summaryRow: { flexDirection: 'row', gap: 12 },
  statValue: { fontSize: 24, lineHeight: 30, fontFamily: Fonts?.mono, fontWeight: '700' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  h2: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.bold },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.sm, borderWidth: 1 },
  copyText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  celebrate: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.md, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  nameSearch: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm, borderWidth: 1, fontSize: 14 },
  gridRow: { flexDirection: 'row', gap: 8 },
  rosterCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderRadius: Radii.md, borderWidth: 1 },
  empName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.pill },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  panel: { borderRadius: Radii.md, borderWidth: 1, overflow: 'hidden' },
  remarkRow: { flexDirection: 'row', justifyContent: 'flex-end', padding: 8, paddingBottom: 0 },
  remarkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.sm, borderWidth: 1 },
});
