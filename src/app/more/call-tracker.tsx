import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CallDetail, CallDetailModal } from '@/components/call-tracker/call-detail';
import { CallList, CallRowSkeleton, orderCalls } from '@/components/call-tracker/call-list';
import { FilterSheet } from '@/components/call-tracker/filter-sheet';
import { activeChips, applyFilters, EMPTY_FILTERS, type Filters } from '@/components/call-tracker/filters';
import { FadeIn } from '@/components/call-tracker/primitives';
import { SearchBar, SummaryStrip } from '@/components/call-tracker/top-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { FontWeights, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fetchCallTrackerEntries, type CallTrackerEntry } from '@/lib/call-tracker';
import { rangeLabel } from '@/lib/call-tracker-format';
import { istToday } from '@/lib/overview-format';

// App-only screen, OWNER only: call recordings are for the founder.
const VIEW_ROLES = ['OWNER'];

// Two-pane (list | detail) from this width up.
const TWO_PANE_WIDTH = 768;

export default function CallTrackerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const twoPane = width >= TWO_PANE_WIDTH;
  const { user } = useAuth();
  const isAuthorized = VIEW_ROLES.includes(user?.role ?? '');

  const [calls, setCalls] = useState<CallTrackerEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setCalls(await fetchCallTrackerEntries());
      setLoadError(null);
    } catch (err) {
      // Nothing is shown in place of real data: the failure is stated (e.g. the backend route is not deployed yet).
      setCalls((prev) => prev ?? []);
      setLoadError(getErrorMessage(err, 'Could not load calls.'));
    }
  }, [isAuthorized]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((prev) => ({ ...prev, [key]: value }));
  const reset = () => setFilters(EMPTY_FILTERS);

  const visible = useMemo(() => (calls ? orderCalls(applyFilters(calls, filters)) : []), [calls, filters]);
  const salespeople = useMemo(() => [...new Set((calls ?? []).map((c) => c.salesperson))].sort(), [calls]);
  const sources = useMemo(() => [...new Set((calls ?? []).map((c) => c.source))].sort(), [calls]);
  const chips = useMemo(() => activeChips(filters), [filters]);

  if (!isAuthorized) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">Call Tracker is only available to the Owner account.</ThemedText>
      </ThemedView>
    );
  }

  const loading = calls === null;
  const count = (pred: (c: CallTrackerEntry) => boolean) => visible.filter(pred).length;
  const metrics = [
    { label: 'Calls', value: visible.length },
    { label: 'With audio', value: count((c) => c.recordingStatus === 'available') },
    { label: 'Transcribed', value: count((c) => c.transcriptStatus === 'completed') },
    { label: 'Summarised', value: count((c) => c.summaryStatus === 'completed') },
  ];

  const selected = visible.find((c) => c.callId === selectedId) ?? null;
  // Two-pane always shows a call: the chosen one, else the first.
  const paneCall = twoPane ? (selected ?? visible[0] ?? null) : null;
  const modalCall = twoPane ? null : (calls?.find((c) => c.callId === selectedId) ?? null);

  const list = (
    <ScrollView
      style={twoPane ? styles.listPane : styles.flex1}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Call Tracker</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.subtitle}>
          {loading ? ' ' : `${visible.length} call${visible.length === 1 ? '' : 's'} · ${rangeLabel(filters.from, filters.to)}`}
        </ThemedText>
      </View>

      <View style={styles.gutter}>
        <SummaryStrip metrics={metrics} loading={loading} />
      </View>

      <View style={[styles.gutter, styles.search]}>
        <SearchBar
          value={filters.search}
          onChange={(v) => set('search', v)}
          activeCount={chips.length}
          onOpenFilters={() => setSheetOpen(true)}
          chips={chips}
          onClearChip={(chip) => setFilters((prev) => ({ ...prev, ...chip.clear }))}
        />
      </View>

      {loadError ? (
        <View style={[styles.gutter, styles.errorBox]}>
          <ThemedText style={styles.emptyTitle}>Call Intelligence is not available</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.emptyText}>{loadError}</ThemedText>
          <Button variant="outline" onPress={onRefresh}>Try again</Button>
        </View>
      ) : loading ? (
        <View>
          {[0, 1, 2, 3].map((i) => <CallRowSkeleton key={i} />)}
        </View>
      ) : visible.length === 0 ? (
        <FadeIn style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: withAlpha(theme.primary, 0.08) }]}>
            <Ionicons name="call-outline" size={40} color={withAlpha(theme.primary, 0.7)} />
          </View>
          <ThemedText style={styles.emptyTitle}>No calls found</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.emptyText}>Try changing your filters</ThemedText>
          <Button variant="outline" onPress={reset}>Reset filters</Button>
        </FadeIn>
      ) : (
        <CallList calls={visible} todayYmd={istToday()} selectedId={paneCall?.callId ?? selectedId ?? undefined} onSelect={(c) => setSelectedId(c.callId)} />
      )}
    </ScrollView>
  );

  return (
    <ThemedView style={styles.flex1}>
      <Stack.Screen options={{ title: 'Call Tracker' }} />
      {twoPane ? (
        <View style={styles.panes}>
          {list}
          <View style={[styles.detailPane, { borderLeftColor: theme.border }]}>
            {paneCall ? (
              <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}>
                <CallDetail key={paneCall.callId} call={paneCall} />
              </ScrollView>
            ) : (
              <View style={styles.center}>
                <ThemedText themeColor="textMuted">{loading ? '' : 'Select a call to see its details'}</ThemedText>
              </View>
            )}
          </View>
        </View>
      ) : (
        list
      )}

      <CallDetailModal call={modalCall} onClose={() => setSelectedId(null)} />
      <FilterSheet
        visible={sheetOpen}
        filters={filters}
        onChange={set}
        onReset={reset}
        onClose={() => setSheetOpen(false)}
        salespeople={salespeople}
        sources={sources}
        resultCount={visible.length}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  panes: { flex: 1, flexDirection: 'row' },
  listPane: { flexBasis: '40%', flexGrow: 0, flexShrink: 0 },
  detailPane: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  content: { paddingTop: Spacing.three, gap: Spacing.three },
  gutter: { paddingHorizontal: Spacing.three },
  search: { marginBottom: Spacing.one },
  header: { paddingHorizontal: Spacing.three, gap: 2 },
  title: { fontSize: 28, lineHeight: 36, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, paddingHorizontal: Spacing.four },
  emptyIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.two },
  errorBox: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  emptyTitle: { fontSize: 18, lineHeight: 24, fontFamily: FontWeights.semiBold },
  emptyText: { fontSize: 14, lineHeight: 20, marginBottom: Spacing.two },
});
