import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/overview/parts';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { LedgerDetailView } from '@/components/purchase/ledger-detail';
import { NewLedgerSheet } from '@/components/purchase/ledger-sheets';
import { ACC_ROLES, money, shareCsv } from '@/components/purchase/helpers';
import { Checkbox, Mono } from '@/components/purchase/parts';
import { TransporterSheet } from '@/components/purchase/transporter-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, Button, Card, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLedgers, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { AccountingLedger } from '@/types/api';

const WIDE_MIN = 560;
type PartyFilter = '' | 'SUPPLIER' | 'TRANSPORTER';

function NameCell({ l }: { l: AccountingLedger }) {
  return (
    <View style={styles.nameCell}>
      <ThemedText numberOfLines={1} style={styles.name}>{l.name}</ThemedText>
      {/* Ledgers created before partyType existed have null: no badge. */}
      {l.partyType === 'TRANSPORTER' ? <Badge variant="orange" size="sm">Transporter</Badge> : null}
      {l.partyType === 'SUPPLIER' ? <Badge variant="blue" size="sm">Supplier</Badge> : null}
      {!l.isActive ? <Badge variant="danger" size="sm">Inactive</Badge> : null}
    </View>
  );
}

function BalanceCell({ l }: { l: AccountingLedger }) {
  const theme = useTheme();
  const n = Number(l.balance);
  return (
    <Mono style={{ color: n < 0 ? theme.danger : n > 0 ? theme.success : theme.text }}>
      {`${money(Math.abs(n))} ${n < 0 ? '(payable)' : n > 0 ? '(advance)' : ''}`.trim()}
    </Mono>
  );
}

export default function PurchaseScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [width, setWidth] = useState(0);
  const [ledgers, setLedgers] = useState<AccountingLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showNewLedger, setShowNewLedger] = useState(false);
  const [showTransporter, setShowTransporter] = useState(false);
  const [selectedLedgerId, setSelectedLedgerId] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [partyTypeFilter, setPartyTypeFilter] = useState<PartyFilter>('');

  const isAllowed = !!user && ACC_ROLES.includes(user.role);
  const wide = width >= WIDE_MIN;

  const load = useCallback(async () => {
    setError('');
    try {
      // "Show inactive only" is a FILTER: the API only knows include-or-exclude,
      // so ask for everything and narrow to inactive ones here.
      const all = await fetchLedgers(showInactive, partyTypeFilter || undefined);
      setLedgers(showInactive ? all.filter((l) => !l.isActive) : all);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Couldn't load ledgers. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [showInactive, partyTypeFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    if (isAllowed) load();
  }, [isAllowed, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Overview export: one row per ledger with just its balance.
  const exportAll = async () => {
    const rows: (string | number)[][] = [
      ['Name', 'GSTIN', 'Balance', 'Balance Type'],
      ...ledgers.map((l) => {
        const n = Number(l.balance);
        return [l.name, l.gstin || '', Math.abs(n).toFixed(2), n < 0 ? 'payable' : n > 0 ? 'advance' : 'settled'];
      }),
    ];
    try {
      if (!(await shareCsv(`accounting-ledgers-${new Date().toISOString().slice(0, 10)}.csv`, rows))) setError('Sharing isn’t available on this device.');
    } catch (e: unknown) {
      setError(e instanceof Error && e.message ? e.message : "Couldn't export CSV. Try again.");
    }
  };

  const shell = (children: React.ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Purchase' }} />
      {children}
    </ThemedView>
  );

  if (!isAllowed) {
    return shell(
      <View style={[styles.pad, { padding: wide ? 24 : 16 }]}>
        <Card style={styles.denied}>
          <ThemedText style={styles.deniedText}>You don&apos;t have access to Purchase.</ThemedText>
        </Card>
      </View>,
    );
  }

  if (selectedLedgerId) {
    return shell(
      <LedgerDetailView
        ledgerId={selectedLedgerId}
        wide={wide}
        onBack={() => { setSelectedLedgerId(null); load(); }}
      />,
    );
  }

  // Client-side name search over the loaded list, independent of the filters.
  const q = search.trim().toLowerCase();
  const visible = q ? ledgers.filter((l) => l.name.toLowerCase().includes(q)) : ledgers;

  const searchBox = (
    <TextInput
      value={search}
      onChangeText={setSearch}
      placeholder="Search ledgers by name…"
      placeholderTextColor={theme.textMuted}
      style={[styles.search, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }, wide && { width: 220 }]}
    />
  );

  const header = (
    <View style={styles.headerWrap}>
      <View style={[styles.headRow, wide && styles.headRowWide]}>
        <View>
          <ThemedText style={styles.h1}>Purchase — Ledgers</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Manage ledger accounts and outstanding balances.</ThemedText>
        </View>
        <View style={[styles.toolbar, wide && styles.toolbarWide]}>
          {wide ? searchBox : null}
          <Checkbox label="Show inactive only" checked={showInactive} onChange={setShowInactive} />
          <View style={wide ? { width: 150 } : styles.flex1Min}>
            <Select
              value={partyTypeFilter}
              onChange={(v) => setPartyTypeFilter(v as PartyFilter)}
              options={[
                { value: '', label: 'All types' },
                { value: 'SUPPLIER', label: 'Suppliers' },
                { value: 'TRANSPORTER', label: 'Transporters' },
              ]}
            />
          </View>
          <View style={styles.btnRow}>
            <Button variant="outline" size="sm" onPress={exportAll}>Download All (CSV)</Button>
            <Button variant="outline" size="sm" onPress={() => setShowTransporter(true)}>+ Transporter Payment</Button>
            <Button size="sm" onPress={() => setShowNewLedger(true)}>+ New Ledger</Button>
          </View>
        </View>
      </View>
      {wide ? null : searchBox}
      {notice ? <SuccessBanner message={notice} /> : null}
      {error ? <ErrorBanner message={error} onRetry={() => { setLoading(true); load(); }} /> : null}
      {wide && !loading && visible.length > 0 ? (
        <View style={[styles.tr, styles.thRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText themeColor="textMuted" style={[styles.th, { flex: 4 }]}>Name</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.th, { flex: 2 }]}>GSTIN</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.th, { flex: 3 }]}>Balance</ThemedText>
          <View style={{ width: 72 }} />
        </View>
      ) : null}
    </View>
  );

  const renderItem = ({ item, index }: { item: AccountingLedger; index: number }) =>
    wide ? (
      <View
        style={[
          styles.tr,
          styles.bodyRow,
          { backgroundColor: theme.surface, borderColor: theme.border },
          index === visible.length - 1 && styles.lastRow,
        ]}>
        <View style={{ flex: 4, minWidth: 0 }}><NameCell l={item} /></View>
        <ThemedText style={[styles.cell, { flex: 2 }]}>{item.gstin || '—'}</ThemedText>
        <View style={{ flex: 3 }}><BalanceCell l={item} /></View>
        <View style={{ width: 72 }}><Button variant="outline" size="sm" onPress={() => setSelectedLedgerId(item.id)}>Open</Button></View>
      </View>
    ) : (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <NameCell l={item} />
        <View style={styles.kv}>
          <ThemedText themeColor="textMuted" style={styles.k}>GSTIN</ThemedText>
          <ThemedText style={styles.cell}>{item.gstin || '—'}</ThemedText>
        </View>
        <View style={styles.kv}>
          <ThemedText themeColor="textMuted" style={styles.k}>Balance</ThemedText>
          <BalanceCell l={item} />
        </View>
        <Button variant="outline" size="sm" onPress={() => setSelectedLedgerId(item.id)}>Open</Button>
      </View>
    );

  return shell(
    <FlatList
      data={loading ? [] : visible}
      keyExtractor={(l) => l.id}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListEmptyComponent={
        loading ? (
          <View style={styles.skels}>
            {[0, 1, 2].map((i) => <Skeleton key={i} height={wide ? 44 : 112} />)}
          </View>
        ) : (
          <Card style={styles.denied}>
            <ThemedText themeColor="textMuted" style={styles.deniedText}>
              {q ? `No ledgers match "${search.trim()}".` : 'No ledgers yet.'}
            </ThemedText>
          </Card>
        )
      }
      ItemSeparatorComponent={wide ? undefined : Gap}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      ListFooterComponent={
        <>
          {showNewLedger ? (
            <NewLedgerSheet
              onClose={() => setShowNewLedger(false)}
              onCreated={() => { setShowNewLedger(false); setNotice('Ledger created.'); load(); }}
            />
          ) : null}
          {showTransporter ? (
            <TransporterSheet
              onClose={() => setShowTransporter(false)}
              onDone={() => { setShowTransporter(false); setNotice('Transporter payment recorded.'); load(); }}
            />
          ) : null}
        </>
      }
    />,
  );
}

function Gap() {
  return <View style={{ height: 12 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  flex1Min: { flex: 1, minWidth: 140 },
  pad: { width: '100%', maxWidth: 896, alignSelf: 'center' },
  content: { width: '100%', maxWidth: 896, alignSelf: 'center' },
  headerWrap: { gap: 16, marginBottom: 16 },
  headRow: { gap: 12 },
  headRowWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  toolbarWide: { flex: 1, justifyContent: 'flex-end' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: FontWeights.regular },
  denied: { alignItems: 'center', paddingVertical: 48 },
  deniedText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, textAlign: 'center' },
  skels: { gap: 12 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1 },
  thRow: { minHeight: 40, borderTopLeftRadius: Radii.lg, borderTopRightRadius: Radii.lg },
  bodyRow: { minHeight: 56, borderTopWidth: 0 },
  lastRow: { borderBottomLeftRadius: Radii.lg, borderBottomRightRadius: Radii.lg },
  th: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  cell: { fontSize: 14, lineHeight: 20 },
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, flexShrink: 1, maxWidth: 220 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  k: { width: 64, fontSize: 12, lineHeight: 20 },
});
