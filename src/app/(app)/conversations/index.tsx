import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatPanel } from '@/components/conversations/chat';
import { ConversationCard } from '@/components/conversations/parts';
import { ManageNumbersSheet, NewConversationSheet } from '@/components/conversations/new-sheets';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchAssignableEmployees, fetchConversationList, fetchConversationStats, fetchStaffPhoneNumbers, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import type { Conversation, ConversationCategory, ConversationStats, StaffPhoneNumberRow } from '@/types/api';

const WIDE_MIN = 560;
const LIST_POLL_MS = 20000;

const TABS: { key: ConversationCategory; label: string; description: string }[] = [
  { key: 'CUSTOMER_WHATSAPP', label: 'Customer', description: 'WhatsApp conversations with customers' },
  { key: 'CALL', label: 'Calls', description: 'Recorded phone calls from customers' },
  { key: 'INSTAGRAM', label: 'Instagram', description: 'DMs & enquiries from Instagram' },
  { key: 'EMPLOYEE', label: 'Employee Messages', description: 'System messages sent to staff' },
  { key: 'OWNER', label: 'Founder', description: 'AI alerts, summaries & flags' },
];

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'WAITING', label: 'Waiting' },
  { key: 'CLOSED', label: 'Closed' },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]['key'];

const EMPTY_STATS: ConversationStats = {
  total: 0, active: 0, waiting: 0, highValue: 0,
  byCategory: { CUSTOMER_WHATSAPP: 0, INSTAGRAM: 0, EMPLOYEE: 0, OWNER: 0, CALL: 0 },
};

function InstagramPlaceholder() {
  return (
    <View style={styles.insta}>
      <View style={[styles.instaIcon, { backgroundColor: '#dc2743' }]}><Ionicons name="logo-instagram" size={32} color="#ffffff" /></View>
      <ThemedText style={styles.instaTitle}>Instagram messages</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.instaBody}>
        Instagram is not connected yet. Once it is, enquiries from your Instagram messages will show up here.
      </ThemedText>
    </View>
  );
}

export default function ConversationsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { status: permStatus, hasTab } = usePermissions();
  const canAccess = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER' || hasTab('conversations');
  const isOwner = user?.role === 'OWNER';

  const [width, setWidth] = useState(0);
  const [activeTab, setActiveTab] = useState<ConversationCategory>('CUSTOMER_WHATSAPP');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [numberFilter, setNumberFilter] = useState('ALL');
  const [numbers, setNumbers] = useState<StaffPhoneNumberRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [stats, setStats] = useState<ConversationStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const wide = width >= WIDE_MIN;
  const isInstagram = activeTab === 'INSTAGRAM';
  const tabConfig = TABS.find((t) => t.key === activeTab)!;

  // Search runs against the server, so it's debounced rather than per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadNumbers = useCallback(() => {
    fetchStaffPhoneNumbers().then(setNumbers).catch(() => {});
  }, []);

  useEffect(() => {
    if (isOwner) loadNumbers();
  }, [isOwner, loadNumbers]);

  // The staff list for New Conversation and Manage Numbers.
  useEffect(() => {
    if (canAccess) fetchAssignableEmployees().then(setStaffList).catch(() => {});
  }, [canAccess]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const params: { category: string; status?: string; search?: string; staffPhoneNumberId?: string } = { category: activeTab };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (query) params.search = query;
      if (numberFilter !== 'ALL') params.staffPhoneNumberId = numberFilter;
      setConversations(await fetchConversationList(params));
    } catch (e: unknown) {
      if (!quiet) setError(getErrorMessage(e, "Couldn't load conversations. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, query, numberFilter]);

  const loadStats = useCallback(async () => {
    try {
      const p: { category?: string; staffPhoneNumberId?: string } = { category: activeTab };
      if (numberFilter !== 'ALL') p.staffPhoneNumberId = numberFilter;
      const s = await fetchConversationStats(p);
      if (s && 'total' in s) setStats(s);
    } catch {
      /* stats are manager-only; the bar just stays at zero */
    }
  }, [activeTab, numberFilter]);

  useEffect(() => {
    if (!canAccess || isInstagram) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    load();
  }, [canAccess, isInstagram, load]);

  useEffect(() => {
    if (!canAccess) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / tab change
    loadStats();
  }, [canAccess, loadStats]);

  // Live updates: re-read the list quietly while the app is in the foreground.
  useEffect(() => {
    if (!canAccess || isInstagram) return;
    const t = setInterval(() => {
      if (AppState.currentState === 'active') { load(true); loadStats(); }
    }, LIST_POLL_MS);
    return () => clearInterval(t);
  }, [canAccess, isInstagram, load, loadStats]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(true), loadStats()]);
    setRefreshing(false);
  };

  // WAITING first, then by last message time.
  const sorted = useMemo(
    () =>
      [...conversations].sort((a, b) => {
        if (a.status === 'WAITING' && b.status !== 'WAITING') return -1;
        if (b.status === 'WAITING' && a.status !== 'WAITING') return 1;
        return new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
      }),
    [conversations],
  );

  const open = (conv: Conversation) => {
    if (wide) setSelected(conv);
    else router.push(`/conversations/${conv.id}`);
  };

  const merged = (u: Partial<Conversation> & { id: string }) => {
    setConversations((prev) => prev.map((c) => (c.id === u.id ? { ...c, ...u } : c)));
    setSelected((prev) => (prev && prev.id === u.id ? { ...prev, ...u } : prev));
    loadStats();
  };

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>{children}</ThemedView>
  );

  if (permStatus !== 'ready') return shell(<View style={styles.pad}><Skeleton height={64} /></View>);
  if (!canAccess) {
    return shell(
      <View style={styles.pad}>
        <Card style={styles.centerCard}><ThemedText style={styles.emptyText}>You don&apos;t have access to Conversations.</ThemedText></Card>
      </View>,
    );
  }

  const top = (
    <View style={[styles.top, { borderBottomColor: theme.border }]}>
      <View style={styles.titleRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Conversations</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.desc}>{tabConfig.description}</ThemedText>
        </View>
        <View style={styles.topBtns}>
          {isOwner ? <Button variant="outline" size="sm" onPress={() => setShowManage(true)}>Manage Numbers</Button> : null}
          <Button size="sm" icon="add" onPress={() => setShowNew(true)}>New conversation</Button>
        </View>
      </View>
      {wide ? (
        <View style={styles.stats}>
          {([['Total', stats.total], ['Active', stats.active], ['Waiting', stats.waiting], ['High Value', stats.highValue]] as const).map(([label, value]) => (
            <View key={label} style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText style={styles.statValue}>{value}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.statLabel}>{label}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const tabsBar = (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { borderBottomColor: theme.border }]}>
        {TABS.map((tab) => {
          const on = activeTab === tab.key;
          const n = stats.byCategory[tab.key] ?? 0;
          return (
            <Pressable
              key={tab.key}
              onPress={() => { setActiveTab(tab.key); setSelected(null); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, { borderBottomColor: on ? theme.primary : 'transparent' }]}>
              <ThemedText style={[styles.tabText, { color: on ? theme.primary : theme.textMuted }]}>{tab.label}</ThemedText>
              {n > 0 ? <View style={styles.tabCount}><ThemedText style={[styles.tabCountText, { color: theme.primary }]}>{n}</ThemedText></View> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {numbers.length > 0 && activeTab === 'CUSTOMER_WHATSAPP' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabs, { borderBottomColor: theme.border }]}>
          {[{ key: 'ALL', label: 'All Numbers' }, ...numbers.map((n) => ({ key: n.phoneNumberId, label: `${n.employee?.name || n.label || n.displayPhone}${n.displayPhone ? ` (${n.displayPhone})` : ''}` }))].map((n) => {
            const on = numberFilter === n.key;
            return (
              <Pressable key={n.key} onPress={() => setNumberFilter(n.key)} accessibilityRole="tab" style={[styles.tab, { borderBottomColor: on ? theme.primary : 'transparent' }]}>
                <ThemedText style={[styles.tabText, { color: on ? theme.primary : theme.textMuted }]}>{n.label}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={[styles.filters, { borderBottomColor: theme.border }]}>
        <View style={styles.statusRow}>
          {STATUS_FILTERS.map((f) => {
            const on = statusFilter === f.key;
            return (
              <Pressable key={f.key} onPress={() => setStatusFilter(f.key)} accessibilityRole="button" style={[styles.statusBtn, on && { backgroundColor: theme.primary }]}>
                <ThemedText style={[styles.statusText, { color: on ? '#ffffff' : theme.textMuted }]}>{f.label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, phone or message…"
          placeholderTextColor={theme.textMuted}
          style={[styles.search, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }]}
        />
      </View>
    </>
  );

  const empty = isInstagram ? (
    <InstagramPlaceholder />
  ) : loading ? (
    <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={96} />)}</View>
  ) : error ? null : (
    <ThemedText themeColor="textMuted" style={styles.emptyText}>{query ? 'No conversations match your search.' : 'No conversations yet.'}</ThemedText>
  );

  const listPane = (
    <View style={[styles.listPane, wide && { width: 340, borderRightWidth: 1, borderRightColor: theme.border }]}>
      {tabsBar}
      {error ? <View style={styles.pad8}><ErrorBanner message={error} onRetry={() => load()} /></View> : null}
      <FlatList
        data={isInstagram || loading ? [] : sorted}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => <ConversationCard conv={item} isSelected={selected?.id === item.id} onPress={() => open(item)} />}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Sep}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
      />
    </View>
  );

  return shell(
    <>
      {top}
      <View style={styles.body}>
        {listPane}
        {wide ? (
          <View style={styles.flex1}>
            {selected ? (
              <ChatPanel key={selected.id} conv={selected} onClose={() => setSelected(null)} onUpdated={merged} />
            ) : (
              <View style={styles.select}>
                <View style={[styles.selectIcon, { backgroundColor: 'rgba(104,15,26,0.08)' }]}>
                  <Ionicons name="chatbubble-ellipses-outline" size={28} color={theme.primary} />
                </View>
                <ThemedText style={styles.selectTitle}>Select a conversation</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.selectSub}>Click any conversation on the left to view messages and reply.</ThemedText>
              </View>
            )}
          </View>
        ) : null}
      </View>
      {showNew ? (
        <NewConversationSheet
          initialCategory={isInstagram ? 'CUSTOMER_WHATSAPP' : activeTab}
          staffList={staffList}
          onClose={() => setShowNew(false)}
          onCreated={(conv) => {
            if (conv.category === activeTab) setConversations((prev) => [conv, ...prev]);
            loadStats();
            open(conv);
          }}
        />
      ) : null}
      {showManage && isOwner ? <ManageNumbersSheet staffList={staffList} onClose={() => setShowManage(false)} onUpdated={loadNumbers} /> : null}
    </>,
  );
}

function Sep() {
  return <View style={{ height: 6 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  pad: { padding: 16 },
  pad8: { padding: 8 },
  centerCard: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40, paddingHorizontal: 16 },
  gap: { gap: 8 },
  top: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  desc: { fontSize: 12, lineHeight: 16 },
  topBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: Radii.lg, padding: 12, alignItems: 'center' },
  statValue: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  statLabel: { fontSize: 10, lineHeight: 14 },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  listPane: { flex: 1, minHeight: 0 },
  tabs: { flexGrow: 0, borderBottomWidth: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 44, borderBottomWidth: 2 },
  tabText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  tabCount: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(104,15,26,0.12)' },
  tabCountText: { fontSize: 9, lineHeight: 12 },
  filters: { paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1 },
  statusRow: { flexDirection: 'row', gap: 4 },
  statusBtn: { flex: 1, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  search: { minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 12, fontFamily: FontWeights.regular },
  listContent: { padding: 8, flexGrow: 1 },
  select: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  selectIcon: { width: 56, height: 56, borderRadius: Radii.lg, alignItems: 'center', justifyContent: 'center' },
  selectTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  selectSub: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  insta: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 64, gap: 16 },
  instaIcon: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  instaTitle: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.semiBold, textAlign: 'center' },
  instaBody: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  instaPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(104,15,26,0.1)' },
  instaPillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
});
