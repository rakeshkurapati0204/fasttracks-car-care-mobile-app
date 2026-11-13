import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { createLatest } from '@/lib/latest';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCrmCustomers, getErrorMessage } from '@/lib/api';
import type { CrmCustomer } from '@/types/api';

// GET /crm/customers (backend/src/routes/crm.ts) is gated by hasCJAccess —
// the dynamic per-user 'customers_jobs' tab permission (view_only/sales_mode/
// full_access), NOT a static role list (verified 2026-09-19, freshly
// deep-dived per the task's flag that this file hadn't been checked before).
// In sales_mode the server itself filters to only the caller's own created
// customers — the client makes no such assumption. DELETE /customers/:id is
// requireOwner-only. This is a DIFFERENT screen from the existing
// `customers` registry entry (which hits the same /crm/customers/:id/profile
// endpoints but is scoped to the bottom-tab Customer directory) — kept
// separate per the task's module list, but note the overlap for anyone
// consolidating later. Access is unpredictable from role alone, so — same
// as the existing `customers` entry — this is left visible in the registry
// with no visibleToRoles restriction; the screen handles a 403 via
// getErrorMessage.
const PAGE_SIZE = 30;

export default function CrmScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [customers, setCustomers] = useState<CrmCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // The search box sends one request when typing pauses, and a slow old answer can never overwrite a newer one.
  const debouncedSearch = useDebouncedValue(search, 300);
  const [latest] = useState(createLatest);

  const load = useCallback(async (p: number, s: string, append: boolean) => {
    const ticket = append ? latest.current() : latest.next(); // a new list replaces everything; a next page only adds to the current list
    setError(null);
    try {
      const res = await fetchCrmCustomers(p, PAGE_SIZE, s || undefined);
      if (!latest.isCurrent(ticket)) return;
      setCustomers((prev) => (append && prev ? [...prev, ...res.customers] : res.customers));
      setHasMore(p * PAGE_SIZE < res.total);
    } catch (err: any) {
      if (!latest.isCurrent(ticket)) return;
      setError(getErrorMessage(err, 'Could not load customers.'));
      if (!append) setCustomers([]);
    }
  }, [latest]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load(1, debouncedSearch, false);
    setPage(1);
  }, [load, debouncedSearch]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load(1, debouncedSearch, false);
    setPage(1);
    setIsRefreshing(false);
  };

  // The list can ask for the next page several times while one is still loading: only one is in flight at a time.
  const loadingMore = useRef(false);
  const loadMore = () => {
    if (!hasMore || loadingMore.current) return;
    loadingMore.current = true;
    const next = page + 1;
    setPage(next);
    void load(next, debouncedSearch, true).finally(() => { loadingMore.current = false; });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'CRM' }} />
      <ThemedView style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search customers by name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        />
      </ThemedView>
      {error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {customers === null ? (
        <ActivityIndicator style={styles.spinner} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<ThemedText type="small" themeColor="textSecondary">No customers found.</ThemedText>}
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.row}>
              <View style={styles.flex1}>
                <ThemedText type="smallBold">{item.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{item.phone}</ThemedText>
              </View>
              {item._count && <ThemedText type="small" themeColor="textSecondary">{item._count.crmInvoices} invoice{item._count.crmInvoices === 1 ? '' : 's'}</ThemedText>}
            </ThemedView>
          )}
          ListFooterComponent={hasMore ? <ActivityIndicator style={styles.spinner} /> : null}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Layout.cardGap, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  searchWrap: { padding: Spacing.three, paddingBottom: 0 },
  input: { height: 42, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15 },
  error: { color: '#B83030', marginHorizontal: Spacing.three, marginTop: Spacing.two },
  spinner: { marginTop: Spacing.three },
  row: { borderRadius: Spacing.three, padding: Spacing.three, minHeight: Layout.minTouchTarget, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  flex1: { flex: 1 },
});
