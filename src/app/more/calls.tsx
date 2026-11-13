import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CallRow } from '@/components/call-row';
import { CustomerPhoneSearch } from '@/components/customer-phone-search';
import { ContactsTab } from '@/components/contacts-tab';
import { DialerPad } from '@/components/dialer-pad';
import { SkeletonList } from '@/components/ui/skeleton';
import { MenuButton } from '@/components/menu-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useIsDocked } from '@/lib/drawer-context';
import { fetchCallCapabilities, fetchCallLog, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { groupLabel } from '@/lib/call-format';
import type { CallCapabilities, CallLogEntry } from '@/types/api';

type SortKey = 'date' | 'duration' | 'person';

// GET /calls — requireRoles(CALL_ROLES=[OWNER,STORE_MANAGER,SALES])
// (backend/src/routes/calls.ts). GET /call-recordings/my-summary allows the
// same three roles. Full recording listen (GET /call-recordings/:id) is
// narrower still — OWNER/STORE_MANAGER only (requireFullRecordingAccess) —
// SALES never gets a usable callRecordingId from this list (calls.ts's own
// comment: SALES's "own" grant on calls:recording.listen only resolves for
// a specific resource, never this global list).
const VIEW_ROLES = ['OWNER', 'STORE_MANAGER', 'SALES'];
const RECORDING_ROLES = ['OWNER', 'STORE_MANAGER'];

type CallsTab = 'dialer' | 'recents' | 'contacts' | 'search';
const TABS: { key: CallsTab; label: string; icon: 'keypad' | 'time' | 'people' | 'search' }[] = [
  { key: 'dialer', label: 'Dialer', icon: 'keypad' },
  { key: 'recents', label: 'Recents', icon: 'time' },
  { key: 'contacts', label: 'Contacts', icon: 'people' },
  { key: 'search', label: 'Search', icon: 'search' },
];

export default function CallsScreen() {
  const insets = useSafeAreaInsets();
  const docked = useIsDocked();
  const theme = useTheme();
  const [tab, setTab] = useState<CallsTab>('dialer');
  const [dialSeed, setDialSeed] = useState<{ n: number; digits: string }>({ n: 0, digits: '' }); // a tapped contact: the dial pad is rebuilt with its number
  const [newContact, setNewContact] = useState<{ n: number; phone: string }>({ n: 0, phone: '' }); // "Add to contacts" on the dial pad
  const [padDigits, setPadDigits] = useState(''); // what is typed on the dial pad survives a visit to another tab
  // Calls is a top-level screen reached from the menu, like the others: the menu button, never a back arrow (beside a pinned sidebar there is none).
  // The options object is built once, not on every render: a new one each time makes the navigator rebuild the header (and the menu button in it).
  const headerOptions = useMemo(() => ({ title: 'Calls', headerLeft: docked ? () => null : () => <MenuButton /> }), [docked]);
  const { user } = useAuth();
  const isAuthorized = VIEW_ROLES.includes(user?.role ?? '');

  const canPlayRecordings = RECORDING_ROLES.includes(user?.role ?? '');
  const [calls, setCalls] = useState<CallLogEntry[] | null>(null);
  const [capabilities, setCapabilities] = useState<CallCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Client-side search + sort over the fetched rows.
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    setError(null);
    try {
      const [callLog, caps] = await Promise.all([
        fetchCallLog(),
        canPlayRecordings ? fetchCallCapabilities().catch(() => null) : Promise.resolve(null),
      ]);
      setCalls(callLog);
      setCapabilities(caps);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load calls.'));
    }
  }, [isAuthorized, canPlayRecordings]);

  // Recents is re-read each time it is opened and whenever the app comes back to the front on it, so a call just made shows up.
  useEffect(() => {
    if (tab !== 'recents') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the tab opens
    load();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => sub.remove();
  }, [load, tab]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const filteredCalls = useMemo(() => {
    if (!calls) return [];
    const q = search.trim().toLowerCase();
    const filtered = calls.filter((c) => {
      if (q) {
        const haystack = [c.customerName, c.counterpartyDisplay, c.counterpartyRaw, c.counterpartyRaw?.replace(/\D/g, ''), c.agentName].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
      else if (sortKey === 'duration') cmp = (a.durationSeconds ?? -1) - (b.durationSeconds ?? -1);
      else cmp = (a.customerName ?? a.counterpartyRaw ?? a.counterpartyDisplay ?? '').localeCompare(b.customerName ?? b.counterpartyRaw ?? b.counterpartyDisplay ?? '');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [calls, search, sortKey, sortDir]);

  if (!isAuthorized) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">
          Calls is only available to Owner, Store Manager, or Sales accounts.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex1}>
      <Stack.Screen options={headerOptions} />
      <View style={styles.flex1}>
      {tab === 'dialer' && <DialerPad key={dialSeed.n} initialDigits={padDigits} onLeave={setPadDigits} onAddContact={(phone) => { setNewContact((c) => ({ n: c.n + 1, phone })); setTab('contacts'); }} />}
      {tab === 'contacts' && <ContactsTab key={newContact.n} newPhone={newContact.phone} onCall={(digits) => { setPadDigits(digits); setDialSeed((s) => ({ n: s.n + 1, digits })); setTab('dialer'); }} />}
      {tab === 'search' && <CustomerPhoneSearch />}
      {tab === 'recents' && error && <ThemedText style={styles.error}>{error}</ThemedText>}
      {tab !== 'recents' ? null : calls === null && error ? (
        <Pressable onPress={load} accessibilityRole="button" style={[styles.chip, styles.retry, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Retry</ThemedText>
        </Pressable>
      ) : calls === null ? (
        <View style={styles.spinner}><SkeletonList items={6} /></View>
      ) : (
        <FlatList
          data={filteredCalls}
          keyExtractor={(call) => call.id}
          renderItem={({ item: call, index: i }) => {
            // Headings only make sense when sorted by date.
            const label = sortKey === 'date' ? groupLabel(call.startedAt) : null;
            const showHeading = label !== null && (i === 0 || groupLabel(filteredCalls[i - 1].startedAt) !== label);
            return (
              <View>
                {showHeading && <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupHeading}>{label}</ThemedText>}
                <CallRow call={call} />
              </View>
            );
          }}
          ListHeaderComponent={
            <View style={styles.callsHeader}>
          {capabilities && !capabilities.callingEnabled && (
            <ThemedView type="backgroundElement" style={styles.banner}>
              <ThemedText type="small" style={styles.bannerText}>
                Calling isn&apos;t available yet. Your call history is still shown below.
              </ThemedText>
            </ThemedView>
          )}
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or number"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          />
          <View style={styles.sortRow}>
            <ThemedText type="small" themeColor="textSecondary">Sort by</ThemedText>
            {(['date', 'duration', 'person'] as SortKey[]).map((k) => (
              <Pressable
                key={k}
                onPress={() => { if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(k); setSortDir('desc'); } }}
                style={[styles.chip, { backgroundColor: sortKey === k ? theme.primary : theme.backgroundElement }]}>
                <ThemedText type="small" style={sortKey === k ? styles.chipLabelActive : undefined}>
                  {k === 'date' ? 'Date' : k === 'duration' ? 'Duration' : 'Name'} {sortKey === k ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </ThemedText>
              </Pressable>
            ))}
          </View>
              <View style={styles.section}>
            <ThemedText type="smallBold">Call Log ({filteredCalls.length})</ThemedText>
            {filteredCalls.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">{calls && calls.length === 0 ? 'No calls yet. Calls you make and get show up here.' : 'No calls match your search.'}</ThemedText>
            ) : null}
              </View>
            </View>
          }
          contentContainerStyle={[styles.content, { paddingBottom: Spacing.three }]}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          // The call log can hold hundreds of calls: rows are virtualised (only the ones on screen are built), never mapped all at once.
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews
        />
      )}
      </View>
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.backgroundElement, borderTopColor: theme.border, paddingBottom: insets.bottom },
        ]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => { setNewContact((c) => ({ ...c, phone: '' })); setTab(t.key); }}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: active }}
              style={styles.tabItem}>
              <Ionicons name={t.icon} size={24} color={active ? theme.primary : theme.textSecondary} />
              <ThemedText type="small" style={{ color: active ? theme.primary : theme.textSecondary }}>{t.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  section: { gap: Spacing.two },
  callsHeader: { gap: Spacing.four },
  error: { color: '#B83030', marginHorizontal: Spacing.three, marginTop: Spacing.two },
  spinner: { marginTop: Spacing.three, paddingHorizontal: Spacing.three },
  input: { height: 46, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15 },
  chip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 999, marginRight: Spacing.one },
  retry: { alignSelf: 'center', marginTop: Spacing.three, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  chipLabelActive: { color: '#ffffff', fontWeight: '600' },
  banner: { borderRadius: Spacing.two, padding: Spacing.two, borderWidth: 1, borderColor: 'rgba(232,168,40,0.3)', backgroundColor: 'rgba(232,168,40,0.12)' },
  bannerText: { color: '#A86018' },
  flex1: { flex: 1 },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexWrap: 'wrap' },
  groupHeading: { marginTop: Spacing.two, marginBottom: Spacing.one },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.half, paddingVertical: Spacing.two, minHeight: Layout.minTouchTarget },
});
