import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addIncentiveCredit, addIncentiveTarget, editIncentiveCredit, fetchEmployees, fetchIncentiveHistory,
  fetchIncentiveLedger, fetchIncentives, getErrorMessage, recordIncentivePayout,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { EmployeeListItem, IncentiveCredit, IncentiveHistoryEntry, IncentiveLedger, IncentiveRosterEntry } from '@/types/api';

const WIDE_MIN = 560;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Dashboard's canAccess / canWrite. Reads: OWNER, STORE_MANAGER, HR, ACCOUNTING,
// CASHIER; every write route is OWNER or CASHIER only.
const ACCESS_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'];
const WRITE_ROLES = ['OWNER', 'CASHIER'];

// ₹1,200: Indian grouping, no decimals.
function formatINR(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Mono({ children, style }: { children: React.ReactNode; style?: object }) {
  return <ThemedText style={[styles.mono, style]}>{children}</ThemedText>;
}

// Small amount + note form shared by "Add Incentive", "Mark Paid" and edit.
function AmountNoteForm({
  defaultAmount, defaultNote, submitLabel, error, saving, wide, onSubmit, onCancel,
}: {
  defaultAmount: string; defaultNote?: string; submitLabel: string; error: string | null; saving: boolean; wide: boolean;
  onSubmit: (amount: number, note: string) => void; onCancel: () => void;
}) {
  const theme = useTheme();
  const [amount, setAmount] = useState(defaultAmount);
  const [note, setNote] = useState(defaultNote ?? '');
  const parsed = parseFloat(amount);
  const valid = !isNaN(parsed) && parsed > 0;

  return (
    <View style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.formFields, wide && styles.formFieldsWide]}>
        <View style={wide ? { width: 112 } : undefined}>
          <Input value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" autoFocus />
        </View>
        <View style={styles.flex1}>
          <Input value={note} onChangeText={setNote} placeholder="Note (optional)" />
        </View>
      </View>
      {error ? <ThemedText style={styles.formError}>{error}</ThemedText> : null}
      <View style={styles.formBtns}>
        <Button size="sm" onPress={() => valid && onSubmit(parsed, note.trim())} disabled={!valid || saving} loading={saving}>
          {saving ? 'Saving…' : submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onPress={onCancel}>Cancel</Button>
      </View>
    </View>
  );
}

function IconBtn({ icon, label, onPress, color, bg, disabled }: { icon?: keyof typeof Ionicons.glyphMap; label?: string; onPress: () => void; color: string; bg: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.iconBtn, { backgroundColor: bg }, disabled && { opacity: 0.3 }]}>
      {icon ? <Ionicons name={icon} size={18} color={color} /> : <ThemedText style={[styles.rupee, { color }]}>{label}</ThemedText>}
    </Pressable>
  );
}

type Entry = {
  kind: 'credit' | 'payout'; id: string; amount: number; note: string | null; by: string; when: string;
  edited: boolean; history: IncentiveCredit['history'];
};

function IncentiveRowCard({ row, canWrite, wide, refreshKey }: { row: IncentiveRosterEntry; canWrite: boolean; wide: boolean; refreshKey: number }) {
  const theme = useTheme();
  const [ledger, setLedger] = useState<IncentiveLedger | null>(null);
  const [ledgerFailed, setLedgerFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [preLedgerHistory, setPreLedgerHistory] = useState<IncentiveHistoryEntry[] | null>(null);

  const [addingCredit, setAddingCredit] = useState(false);
  const [creditSaving, setCreditSaving] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);

  const [markingPaid, setMarkingPaid] = useState(false);
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadLedger = useCallback(() => {
    setLedgerFailed(false);
    fetchIncentiveLedger(row.userId).then(setLedger).catch(() => { setLedger(null); setLedgerFailed(true); });
  }, [row.userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / pull-to-refresh
    loadLedger();
  }, [loadLedger, refreshKey]);

  const toggleExpand = async () => {
    setExpanded((v) => !v);
    if (preLedgerHistory === null) {
      try {
        setPreLedgerHistory((await fetchIncentiveHistory(row.userId)) ?? []);
      } catch {
        setPreLedgerHistory([]);
      }
    }
  };

  const submitCredit = async (amount: number, note: string) => {
    setCreditSaving(true);
    setCreditError(null);
    try {
      await addIncentiveCredit({ userId: row.userId, amount, note: note || undefined });
      setAddingCredit(false);
      loadLedger();
    } catch (err: unknown) {
      setCreditError(getErrorMessage(err, 'Failed to add incentive.'));
    } finally {
      setCreditSaving(false);
    }
  };

  const submitPayout = async (amount: number, note: string) => {
    setPaySaving(true);
    setPayError(null);
    try {
      await recordIncentivePayout({ userId: row.userId, amount, note: note || undefined });
      setMarkingPaid(false);
      loadLedger();
    } catch (err: unknown) {
      // The server's overpay rejection shows here when the amount exceeds the balance.
      setPayError(getErrorMessage(err, 'Failed to record payout.'));
    } finally {
      setPaySaving(false);
    }
  };

  const submitEdit = async (creditId: string, amount: number, note: string) => {
    setEditSaving(true);
    setEditError(null);
    try {
      await editIncentiveCredit(creditId, { amount, note: note || undefined });
      setEditingCreditId(null);
      loadLedger();
    } catch (err: unknown) {
      setEditError(getErrorMessage(err, 'Failed to edit incentive.'));
    } finally {
      setEditSaving(false);
    }
  };

  // Credits (+) and payouts (−) merged into one feed, newest first.
  const entries = useMemo<Entry[]>(() => {
    if (!ledger) return [];
    const credits: Entry[] = ledger.credits.map((c) => ({
      kind: 'credit', id: c.id, amount: c.amount, note: c.note, by: c.addedBy?.name ?? 'Unknown', when: c.addedAt,
      edited: !!c.updatedAt && !!c.addedAt && c.updatedAt !== c.addedAt,
      history: c.history ?? [],
    }));
    const payouts: Entry[] = ledger.payouts.map((p) => ({
      kind: 'payout', id: p.id, amount: p.amount, note: p.note, by: p.paidBy?.name ?? 'Unknown', when: p.paidAt, edited: false, history: [],
    }));
    return [...credits, ...payouts].sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  }, [ledger]);

  const balance = ledger?.balance ?? 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardHead}>
        <View style={styles.flex1}>
          <ThemedText numberOfLines={1} style={styles.name}>{row.name}</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.small}>{row.role.replace(/_/g, ' ')}</ThemedText>
        </View>

        <View style={styles.balanceBox}>
          <ThemedText themeColor="textMuted" style={styles.small}>Balance</ThemedText>
          {ledger === null ? (
            ledgerFailed ? (
              <Pressable onPress={loadLedger} accessibilityRole="button" hitSlop={8}>
                <ThemedText style={[styles.small, { color: theme.primary }]}>Retry</ThemedText>
              </Pressable>
            ) : (
              <ActivityIndicator size="small" color={theme.textMuted} />
            )
          ) : (
            <Mono style={[styles.balance, { color: balance > 0 ? '#b45309' : theme.text }]}>{formatINR(balance)}</Mono>
          )}
        </View>

        {canWrite ? (
          <View style={styles.iconRow}>
            <IconBtn
              icon="add"
              color={theme.primary}
              bg="rgba(59,130,246,0.08)"
              onPress={() => { setAddingCredit((v) => !v); setMarkingPaid(false); setCreditError(null); }}
            />
            <IconBtn
              label="₹"
              color="#15803d"
              bg="rgba(34,197,94,0.08)"
              disabled={balance <= 0}
              onPress={() => { setMarkingPaid((v) => !v); setAddingCredit(false); setPayError(null); }}
            />
          </View>
        ) : null}

        <Pressable onPress={toggleExpand} accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse' : 'Expand'} style={styles.chevron}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.textMuted} />
        </Pressable>
      </View>

      {addingCredit ? (
        <View style={styles.pad}>
          <AmountNoteForm
            wide={wide}
            defaultAmount=""
            submitLabel="Add Incentive"
            error={creditError}
            saving={creditSaving}
            onSubmit={submitCredit}
            onCancel={() => { setAddingCredit(false); setCreditError(null); }}
          />
        </View>
      ) : null}

      {markingPaid ? (
        <View style={styles.pad}>
          <AmountNoteForm
            wide={wide}
            defaultAmount={String(balance)}
            submitLabel="Mark Paid"
            error={payError}
            saving={paySaving}
            onSubmit={submitPayout}
            onCancel={() => { setMarkingPaid(false); setPayError(null); }}
          />
        </View>
      ) : null}

      {expanded ? (
        <View style={[styles.expanded, { borderTopColor: theme.border }]}>
          <View>
            <ThemedText themeColor="textMuted" style={styles.sectionLabel}>Ledger</ThemedText>
            {entries.length === 0 ? (
              <ThemedText themeColor="textMuted" style={styles.small}>No incentive credits or payouts yet.</ThemedText>
            ) : (
              <View style={styles.entries}>
                {entries.map((e) => {
                  const credit = e.kind === 'credit';
                  const amountEl = <Mono style={[styles.entryAmount, { color: credit ? '#15803d' : '#b91c1c' }]}>{`${credit ? '+' : '−'}${formatINR(e.amount)}`}</Mono>;
                  const noteEl = <ThemedText numberOfLines={wide ? 1 : 2} style={[styles.entryNote, wide && styles.flex1]}>{e.note || (credit ? 'Incentive added' : 'Paid out')}</ThemedText>;
                  const editedEl = e.edited ? <View style={styles.edited}><ThemedText style={styles.editedText}>edited</ThemedText></View> : null;
                  const byEl = <ThemedText themeColor="textMuted" style={styles.small}>{`by ${e.by}`}</ThemedText>;
                  const whenEl = <ThemedText themeColor="textMuted" style={styles.small}>{formatDateTime(e.when)}</ThemedText>;
                  const editBtn = canWrite && credit ? (
                    <Pressable
                      onPress={() => { setEditingCreditId((v) => (v === e.id ? null : e.id)); setEditError(null); }}
                      accessibilityRole="button"
                      accessibilityLabel="Edit"
                      hitSlop={8}
                      style={styles.pencil}>
                      <Ionicons name="pencil" size={13} color={theme.textMuted} />
                    </Pressable>
                  ) : null;
                  return (
                    <View key={`${e.kind}-${e.id}`} style={styles.entry}>
                      {wide ? (
                        <View style={styles.entryRow}>
                          {amountEl}{noteEl}{editedEl}{byEl}{whenEl}{editBtn}
                        </View>
                      ) : (
                        <View style={styles.entryStack}>
                          <View style={styles.entryRow}>{amountEl}{editedEl}<View style={styles.flex1} />{editBtn}</View>
                          {noteEl}
                          <ThemedText themeColor="textMuted" style={styles.small}>{`by ${e.by} · ${formatDateTime(e.when)}`}</ThemedText>
                        </View>
                      )}

                      {credit && editingCreditId === e.id ? (
                        <AmountNoteForm
                          wide={wide}
                          defaultAmount={String(e.amount)}
                          defaultNote={e.note ?? ''}
                          submitLabel="Save"
                          error={editError}
                          saving={editSaving}
                          onSubmit={(amount, note) => submitEdit(e.id, amount, note)}
                          onCancel={() => { setEditingCreditId(null); setEditError(null); }}
                        />
                      ) : null}

                      {credit && e.history.length > 0 ? (
                        <View style={styles.trail}>
                          {e.history.map((h) => (
                            <ThemedText key={h.id} themeColor="textMuted" style={styles.trailText}>
                              {`${h.oldAmount != null ? formatINR(h.oldAmount) : '—'} → ${formatINR(h.newAmount)} by ${h.changedBy?.name ?? 'Unknown'}, ${formatDateTime(h.createdAt)}`}
                            </ThemedText>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {preLedgerHistory !== null && preLedgerHistory.length > 0 ? (
            <View style={[styles.pre, { borderTopColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={styles.sectionLabel}>Pre-ledger history</ThemedText>
              <View style={styles.entries}>
                {preLedgerHistory.map((h) => (
                  <View key={h.id} style={wide ? styles.preRow : styles.preRowStack}>
                    <ThemedText themeColor="textSecondary" style={styles.small}>{`${MONTH_NAMES[h.month - 1]} ${h.year}`}</ThemedText>
                    <Mono style={styles.small}>{formatINR(h.amount)}</Mono>
                    <ThemedText themeColor="textMuted" style={styles.small}>{`by ${h.awardedBy?.name ?? 'Unknown'}`}</ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// Type-to-search picker for "Add person", as a bottom sheet.
function AddPersonSheet({
  candidates, error, onClose, onSelect,
}: { candidates: EmployeeListItem[]; error: string; onClose: () => void; onSelect: (userId: string) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? candidates.filter((e) => e.name.toLowerCase().includes(q)) : candidates;
  }, [candidates, query]);

  return (
    <Sheet visible onClose={onClose} title="Add person to Incentives">
      <Input value={query} onChangeText={setQuery} placeholder="Type a name…" autoFocus />
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
      {filtered.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.noMatch}>{`No employees match “${query}”.`}</ThemedText>
      ) : (
        filtered.map((e) => (
          <Pressable key={e.id} onPress={() => onSelect(e.id)} accessibilityRole="button" style={styles.pick}>
            <ThemedText style={styles.pickName}>{e.name}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>{e.role?.replace(/_/g, ' ')}</ThemedText>
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

export default function IncentivesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canAccess = ACCESS_ROLES.includes(user?.role ?? '');
  const canWrite = WRITE_ROLES.includes(user?.role ?? '');

  const [width, setWidth] = useState(0);
  const [rows, setRows] = useState<IncentiveRosterEntry[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [addError, setAddError] = useState('');
  const wide = width >= WIDE_MIN;

  const load = useCallback(async () => {
    setError('');
    const now = new Date();
    // Month/year only matter for the roster's membership: the ledger itself has
    // no month dimension, so the current month is just a stable value.
    try {
      setRows(await fetchIncentives(now.getMonth() + 1, now.getFullYear()));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not load incentives.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    if (canAccess) load();
  }, [canAccess, load]);

  useEffect(() => {
    if (canAccess) fetchEmployees().then((e) => setEmployees(e.filter((x) => x.isActive))).catch(() => {});
  }, [canAccess]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshKey((k) => k + 1);
    setRefreshing(false);
  };

  const rosterIds = useMemo(() => new Set((rows ?? []).map((r) => r.userId)), [rows]);
  const addCandidates = useMemo(() => employees.filter((e) => !rosterIds.has(e.id)), [employees, rosterIds]);

  const addPerson = async (userId: string) => {
    setAddError('');
    try {
      await addIncentiveTarget(userId);
      setShowAddPerson(false);
      load();
    } catch (err: unknown) {
      setAddError(getErrorMessage(err, 'Could not add this person.'));
    }
  };

  const shell = (children: React.ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Incentives' }} />
      {children}
    </ThemedView>
  );

  if (!canAccess) {
    return shell(
      <View style={[styles.page, { padding: wide ? 24 : 16 }]}>
        <Card style={styles.centerCard}>
          <ThemedText style={styles.emptyTitle}>You don&apos;t have access to Incentives.</ThemedText>
        </Card>
      </View>,
    );
  }

  const header = (
    <View style={styles.headerWrap}>
      <View style={styles.headRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Incentives</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Sales team + anyone manually added.</ThemedText>
        </View>
        {canWrite ? <Button size="sm" icon="add" onPress={() => { setAddError(''); setShowAddPerson(true); }}>Add person</Button> : null}
      </View>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
    </View>
  );

  const empty = rows === null ? (
    error ? null : <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={68} />)}</View>
  ) : (
    <View style={[styles.centerCard, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: Radii.lg }]}>
      <ThemedText style={styles.emptyTitle}>No one on the incentives roster yet.</ThemedText>
    </View>
  );

  return shell(
    <>
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.userId}
        renderItem={({ item }) => <IncentiveRowCard row={item} canWrite={canWrite} wide={wide} refreshKey={refreshKey} />}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Sep}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      />
      {showAddPerson ? (
        <AddPersonSheet candidates={addCandidates} error={addError} onClose={() => setShowAddPerson(false)} onSelect={addPerson} />
      ) : null}
    </>,
  );
}

function Sep() {
  return <View style={{ height: 8 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 896, alignSelf: 'center' },
  headerWrap: { gap: 20, marginBottom: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  small: { fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: Fonts?.mono, fontSize: 14, lineHeight: 20 },
  gap: { gap: 8 },
  centerCard: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, textAlign: 'center' },
  card: { borderWidth: 1, borderRadius: Radii.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  balanceBox: { alignItems: 'flex-end', gap: 2 },
  balance: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  iconRow: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rupee: { fontSize: 16, lineHeight: 20, fontFamily: FontWeights.bold },
  chevron: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: 16, paddingBottom: 12 },
  form: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
  formFields: { gap: 8 },
  formFieldsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  formError: { color: '#dc2626', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  formBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expanded: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 },
  sectionLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, marginBottom: 6 },
  entries: { gap: 6 },
  entry: { gap: 4 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryStack: { gap: 2 },
  entryAmount: { fontSize: 12, lineHeight: 18, fontWeight: '600', flexShrink: 0 },
  entryNote: { fontSize: 12, lineHeight: 18 },
  edited: { backgroundColor: 'rgba(180,83,9,0.1)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  editedText: { color: '#b45309', fontSize: 10, lineHeight: 12, fontFamily: FontWeights.semiBold },
  pencil: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  trail: { paddingLeft: 12, gap: 2 },
  trailText: { fontSize: 11, lineHeight: 16 },
  pre: { borderTopWidth: 1, paddingTop: 8 },
  preRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  preRowStack: { gap: 2 },
  noMatch: { fontSize: 12, lineHeight: 16, textAlign: 'center', paddingVertical: 24 },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 8 },
  pickName: { fontSize: 14, lineHeight: 20 },
});
