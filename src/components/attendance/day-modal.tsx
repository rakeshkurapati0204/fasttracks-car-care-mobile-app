import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fmt, S } from '@/components/attendance/attendance-format';
import { SearchBar } from '@/components/attendance/search-bar';
import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchAttendanceDailyLog, type AttendanceDailyLogResponse } from '@/lib/api';

const GREEN = '#22c55e';
const RED = '#ef4444';
const AMBER = '#f59e0b';

type Props = {
  date: string;
  onClose: () => void;
  initialSearch?: string;
  onSearchChange?: (v: string) => void;
  initialStatus?: string | null;
};

// Dashboard DayModal as a bottom sheet: the day's counts, a name search, an
// optional "Showing: … only" status filter, the Absent chips and the Punch Log.
export function DayModal({ date, onClose, initialSearch = '', onSearchChange, initialStatus = null }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<AttendanceDailyLogResponse | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  // Keep in sync when the parent search bar changes while the modal is open.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the parent's search
    setSearch(initialSearch);
  }, [initialSearch]);

  const load = useCallback(async () => {
    setFetchError(null);
    try {
      setData(await fetchAttendanceDailyLog(date));
    } catch {
      setFetchError('Failed to load attendance data — tap to retry');
    }
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    load();
  }, [load]);

  const label = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  const q = search.trim().toLowerCase();
  // ABSENT isn't a per-person status on the presentees list; it is the separate
  // absentees array, so filtering to it shows only that section.
  const showAbsentSection = !statusFilter || statusFilter === 'ABSENT';
  const showPresentSection = !statusFilter || statusFilter !== 'ABSENT';
  const absentees = data && showAbsentSection ? data.absentees.filter((p) => !q || p.name.toLowerCase().includes(q)) : [];
  const presentees = data && showPresentSection
    ? [...data.presentees]
        .sort((a, b) => (a.clockIn ?? '').localeCompare(b.clockIn ?? ''))
        .filter((p) => !q || p.name.toLowerCase().includes(q))
        .filter((p) => !statusFilter || statusFilter === 'ABSENT' || p.status === statusFilter)
    : [];
  const totalInModal = data ? data.absentees.length + data.presentees.length : 0;
  const shownInModal = absentees.length + presentees.length;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: insets.bottom }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.headTop}>
              <View style={styles.flex1}>
                <ThemedText style={styles.title}>{label}</ThemedText>
                {data ? (
                  <View style={styles.counts}>
                    <ThemedText style={[styles.count, { color: GREEN }]}>
                      {`${data.counts.present} present`}
                      {data.counts.late > 0 ? <ThemedText style={[styles.countLight, { color: AMBER }]}>{` (${data.counts.late} late)`}</ThemedText> : null}
                    </ThemedText>
                    <ThemedText style={[styles.count, { color: RED }]}>{`${data.counts.absent} absent`}</ThemedText>
                  </View>
                ) : null}
              </View>
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={[styles.close, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="close" size={18} color={theme.textMuted} />
              </Pressable>
            </View>
            {data ? (
              <View style={styles.headBottom}>
                <SearchBar value={search} onChange={(v) => { setSearch(v); onSearchChange?.(v); }} placeholder="Search employees…" shown={shownInModal} total={totalInModal} />
                {statusFilter ? (
                  <View style={[styles.filterChip, { backgroundColor: theme.primary }]}>
                    <ThemedText style={styles.filterText}>{`Showing: ${statusFilter === 'ABSENT' ? 'Absent' : statusFilter === 'LATE' ? 'Late' : 'Present'} only`}</ThemedText>
                    <Pressable onPress={() => setStatusFilter(null)} hitSlop={8} accessibilityLabel="Clear status filter"><ThemedText style={styles.filterText}>×</ThemedText></Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {fetchError ? (
              <Pressable onPress={load} style={styles.message}><ThemedText style={[styles.body, { color: RED }]}>{fetchError}</ThemedText></Pressable>
            ) : !data ? (
              <View style={styles.padded}><Skeleton height={20} width="50%" /><Skeleton height={44} /><Skeleton height={44} /></View>
            ) : (
              <View>
                {absentees.length > 0 ? (
                  <View style={[styles.section, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                    <ThemedText style={[styles.sectionTitle, { color: RED }]}>{`ABSENT (${absentees.length})`}</ThemedText>
                    <View style={styles.chips}>
                      {absentees.map((p) => (
                        <View key={p.id} style={styles.absentChip}>
                          <ThemedText style={[styles.chipText, { color: RED }]}>{p.name}</ThemedText>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={styles.section}>
                  <ThemedText themeColor="textMuted" style={styles.sectionTitle}>{`PUNCH LOG${q ? ` (${presentees.length})` : ''}`}</ThemedText>
                  {presentees.length === 0 ? (
                    <ThemedText themeColor="textMuted" style={styles.body}>{q ? 'No matches' : 'No records'}</ThemedText>
                  ) : (
                    presentees.map((p, i) => {
                      const sc = S[p.status];
                      return (
                        <View key={p.id} style={[styles.punch, i < presentees.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
                          <View style={[styles.badge, { backgroundColor: sc?.bg ?? '#6b7280' }]}>
                            <ThemedText style={styles.badgeText}>{sc?.label ?? '?'}</ThemedText>
                          </View>
                          <View style={styles.flex1}>
                            <ThemedText style={styles.name} numberOfLines={1}>{p.name}</ThemedText>
                            <ThemedText themeColor="textMuted" style={styles.small}>{p.role.replace(/_/g, ' ')}</ThemedText>
                          </View>
                          <View style={styles.time}>
                            <ThemedText themeColor="textMuted" style={styles.timeLabel}>IN</ThemedText>
                            <ThemedText style={[styles.mono, { color: GREEN }]}>{fmt(p.clockIn)}</ThemedText>
                          </View>
                          <View style={styles.time}>
                            <ThemedText themeColor="textMuted" style={styles.timeLabel}>OUT</ThemedText>
                            <ThemedText style={[styles.mono, { color: p.clockOut ? theme.text : theme.textMuted }]}>{fmt(p.clockOut)}</ThemedText>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '85%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden' },
  header: { borderBottomWidth: 1 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  headBottom: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  counts: { flexDirection: 'row', gap: 12, marginTop: 4 },
  count: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  countLight: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.regular },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.pill },
  filterText: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  message: { padding: 32, alignItems: 'center' },
  padded: { padding: 20, gap: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  section: { paddingHorizontal: 20, paddingVertical: 16 },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  absentChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radii.pill, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  chipText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  punch: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  time: { alignItems: 'flex-end', minWidth: 44 },
  timeLabel: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  mono: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono, fontWeight: '700' },
});
