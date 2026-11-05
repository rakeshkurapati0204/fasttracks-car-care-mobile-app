import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Select, Skeleton } from '@/components/ui';
import { FontWeights, Fonts, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  approveExpense, fetchAssignableEmployees, fetchExpenseSummary, fetchExpensesAdmin, fetchMentionableUsers,
  getErrorMessage, rejectExpense,
} from '@/lib/api';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type ExpenseSummary, type MentionableUser } from '@/types/api';

import { BILL_REQUIRED_ABOVE, fmt, fmtDate, monthStartStr, todayStr } from './helpers';
import { BillThumb, CategoryBadge, ExpenseThread, Money, Panel, SmallBtn, StatusBadge } from './parts';
import { StaffExpensesView } from './staff-view';

const LIMIT = 25;
const CHART_BLUE = '#6AA4CC';
type Tab = 'pending' | 'all' | 'trends';
const TABS: { k: Tab; label: string }[] = [{ k: 'pending', label: 'Pending' }, { k: 'all', label: 'All' }, { k: 'trends', label: 'Trends' }];
const CATEGORY_OPTIONS = [{ value: '', label: 'All' }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))];

const axisMoney = (v: number) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v)));
const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

// Dashboard AdminExpensesView. `canAdd` adds the "+ Add Expense" button that opens the staff view in a sheet.
export function AdminExpensesView({ wide, canAdd, currentUserId }: { wide: boolean; canAdd: boolean; currentUserId: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<Tab>('pending');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [mentionUsers, setMentionUsers] = useState<MentionableUser[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [fCategory, setFCategory] = useState('');
  const [fUser, setFUser] = useState('');
  const [fFrom, setFFrom] = useState(() => monthStartStr());
  const [fTo, setFTo] = useState(() => todayStr());

  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [summaryError, setSummaryError] = useState(false);

  // Filters go to the server (the dashboard's comment: never filter a truncated page in the client).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchExpensesAdmin({
        status: tab === 'pending' ? 'PENDING' : undefined,
        category: (fCategory || undefined) as ExpenseCategory | undefined,
        userId: fUser || undefined,
        from: tab === 'pending' ? undefined : fFrom,
        to: tab === 'pending' ? undefined : fTo,
        page,
        limit: LIMIT,
      });
      setExpenses(res.expenses ?? []);
      setTotal(res.total ?? 0);
      setLoadError('');
    } catch (e) {
      setLoadError(getErrorMessage(e, 'Failed to load expenses.'));
    } finally {
      setLoading(false);
    }
  }, [tab, fCategory, fUser, fFrom, fTo, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    if (tab !== 'trends') load();
  }, [load, tab]);

  useEffect(() => {
    fetchMentionableUsers().then(setMentionUsers).catch(() => {});
    fetchAssignableEmployees().then(setStaff).catch(() => {});
  }, []);

  const loadSummary = useCallback(async () => {
    setSummaryError(false);
    try { setSummary(await fetchExpenseSummary({ from: fFrom, to: fTo })); } catch { setSummary(null); setSummaryError(true); }
  }, [fFrom, fTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when Trends opens / range changes
    if (tab === 'trends') loadSummary();
  }, [tab, loadSummary]);

  const onRefresh = async () => {
    setRefreshing(true);
    await (tab === 'trends' ? loadSummary() : load());
    setRefreshing(false);
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const changeTab = (t: Tab) => { setPage(1); setTab(t); };
  const changeFilter = (fn: () => void) => { setPage(1); fn(); };

  const field = (label: string, node: React.ReactNode) => (
    <View style={wide ? styles.fWide : styles.fPhone}>
      <ThemedText themeColor="textMuted" style={styles.fLabel}>{label.toUpperCase()}</ThemedText>
      {node}
    </View>
  );

  const head = (
    <View style={styles.sections}>
      <View style={styles.titleRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Expenses</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.sub}>Review claims and track spend.</ThemedText>
        </View>
        {canAdd ? <Button size="sm" onPress={() => setShowAdd(true)}>+ Add Expense</Button> : null}
      </View>

      <View style={[styles.tabs, { backgroundColor: theme.surface, borderColor: theme.border }, !wide && styles.tabsPhone]}>
        {TABS.map((t) => (
          <Pressable
            key={t.k}
            onPress={() => changeTab(t.k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.k }}
            style={[styles.tab, !wide && styles.flex1, tab === t.k && { backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={[styles.tabText, { color: tab === t.k ? theme.text : theme.textMuted }]}>{t.label}</ThemedText>
          </Pressable>
        ))}
      </View>

      {tab !== 'pending' ? (
        <View style={styles.filters}>
          {field('From', <DateField label="From" value={fFrom} onChange={(v) => v && changeFilter(() => setFFrom(v))} compact />)}
          {field('To', <DateField label="To" value={fTo} onChange={(v) => v && changeFilter(() => setFTo(v))} compact />)}
          {tab === 'all' ? field('Category', <Select options={CATEGORY_OPTIONS} value={fCategory} onChange={(v) => changeFilter(() => setFCategory(v))} />) : null}
          {tab === 'all' ? field('Staff', <Select options={[{ value: '', label: 'Everyone' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} value={fUser} onChange={(v) => changeFilter(() => setFUser(v))} />) : null}
        </View>
      ) : null}

      {loadError && tab !== 'trends' ? <ErrorBanner message={loadError} onRetry={load} /> : null}

      {tab === 'trends' ? (
        <TrendsView summary={summary} failed={summaryError} wide={wide} onRetry={loadSummary} />
      ) : loading ? (
        <Skeleton height={160} />
      ) : expenses.length === 0 && !loadError ? (
        <Panel pad={32}>
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={20} color={theme.textMuted} />
            <ThemedText themeColor="textMuted" style={styles.small}>{tab === 'pending' ? 'Nothing waiting for review.' : 'No expenses in this range.'}</ThemedText>
          </View>
        </Panel>
      ) : null}
    </View>
  );

  const showList = tab !== 'trends' && !loading && expenses.length > 0;
  const footer = (
    <View style={styles.footerWrap}>
      {showList ? (
        <View style={styles.pager}>
          <ThemedText themeColor="textMuted" style={styles.small}>{total} total</ThemedText>
          <View style={styles.pagerBtns}>
            <SmallBtn label="Prev" onPress={() => setPage((p) => p - 1)} disabled={page <= 1} />
            <ThemedText themeColor="textMuted" style={styles.small}>{page} / {totalPages}</ThemedText>
            <SmallBtn label="Next" onPress={() => setPage((p) => p + 1)} disabled={page >= totalPages} />
          </View>
        </View>
      ) : null}
      {canAdd ? (
        <Sheet visible={showAdd} fullHeight title="Add Expense" onClose={() => { setShowAdd(false); load(); }}>
          <StaffExpensesView wide={false} embedded currentUserId={currentUserId} />
        </Sheet>
      ) : null}
    </View>
  );

  return (
    <FlatList
      data={showList ? expenses : []}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => <ExpenseAdminCard expense={item} currentUserId={currentUserId} mentionUsers={mentionUsers} onChanged={load} />}
      ListHeaderComponent={head}
      ListFooterComponent={footer}
      ItemSeparatorComponent={Gap}
      contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
    />
  );
}

function Gap() { return <View style={{ height: 12 }} />; }

function ExpenseAdminCard({ expense, currentUserId, mentionUsers, onChanged }: {
  expense: Expense; currentUserId: string; mentionUsers: MentionableUser[]; onChanged: () => void;
}) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Same rules as the dashboard: the note is optional for both actions, only PENDING can be decided.
  const act = async (action: 'approve' | 'reject') => {
    setBusy(true);
    setError('');
    try {
      if (action === 'approve') await approveExpense(expense.id, note || undefined);
      else await rejectExpense(expense.id, note || undefined);
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e, 'Action failed.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <View style={styles.cardGap}>
        <View style={styles.badges}>
          <Money value={fmt(expense.amount)} />
          <CategoryBadge category={expense.category} />
          <StatusBadge status={expense.status} />
        </View>
        <ThemedText style={styles.desc}>{expense.description}</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.tiny}>{expense.user?.name ?? 'Unknown'} · {fmtDate(expense.date ?? expense.createdAt)}</ThemedText>

        {(expense.attachments?.length ?? 0) > 0 ? (
          <View style={styles.thumbs}>{expense.attachments!.map((a) => <BillThumb key={a.id} attachment={a} onError={setError} />)}</View>
        ) : expense.amount > BILL_REQUIRED_ABOVE ? (
          <ThemedText style={[styles.tiny, { color: theme.danger }]}>No bill attached — this predates the {fmt(BILL_REQUIRED_ABOVE)} rule.</ThemedText>
        ) : null}

        {expense.reviewNote ? (
          <View style={[styles.note, { backgroundColor: theme.surface }]}>
            <ThemedText themeColor="textMuted" style={styles.small}>
              <ThemedText style={[styles.small, styles.bold]}>{expense.reviewedBy?.name ?? 'Reviewer'}:</ThemedText> {expense.reviewNote}
            </ThemedText>
          </View>
        ) : null}

        {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}

        {expense.status === 'PENDING' ? (
          <View style={styles.actions}>
            <NoteInput value={note} onChange={setNote} />
            <View style={styles.actionBtns}>
              <SmallBtn label="Approve" tone="ok" onPress={() => act('approve')} disabled={busy} />
              <SmallBtn label="Reject" tone="bad" onPress={() => act('reject')} disabled={busy} />
            </View>
          </View>
        ) : null}

        <ExpenseThread expense={expense} currentUserId={currentUserId} mentionUsers={mentionUsers} onChanged={onChanged} />
      </View>
    </Panel>
  );
}

function NoteInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="Note (optional)"
      placeholderTextColor={theme.textMuted}
      style={[styles.noteInput, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
    />
  );
}

function TrendsView({ summary, failed, wide, onRetry }: { summary: ExpenseSummary | null; failed: boolean; wide: boolean; onRetry: () => void }) {
  const theme = useTheme();
  if (failed) return <ErrorBanner message="Failed to load expense trends." onRetry={onRetry} />;
  if (!summary) return <Skeleton height={256} />;
  if (summary.count === 0) {
    return (
      <Panel pad={32}>
        <ThemedText themeColor="textMuted" style={[styles.small, styles.center]}>No expenses in this range.</ThemedText>
      </Panel>
    );
  }

  const kpis = [
    { label: 'Total spend', value: fmt(summary.total) },
    { label: 'Claims', value: String(summary.count) },
    { label: 'Average', value: fmt(summary.count ? summary.total / summary.count : 0) },
  ];

  return (
    <View style={styles.sections}>
      <View style={styles.kpiGrid}>
        {kpis.map((k) => (
          <View key={k.label} style={wide ? styles.kpiWide : styles.kpiPhone}>
            <Panel>
              <ThemedText themeColor="textMuted" style={styles.small}>{k.label}</ThemedText>
              <ThemedText style={[styles.kpiValue, { color: theme.text }]}>{k.value}</ThemedText>
            </Panel>
          </View>
        ))}
      </View>

      <View style={[styles.cols, wide && styles.colsRow]}>
        <View style={wide ? styles.flex1 : undefined}>
          <Panel pad={20}>
            <ThemedText themeColor="textMuted" style={styles.sectionTitle}>BY CATEGORY</ThemedText>
            <CategoryChart rows={summary.byCategory} />
          </Panel>
        </View>
        <View style={wide ? styles.flex1 : undefined}>
          <View style={[styles.table, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={[styles.tableHead, { borderBottomColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={styles.sectionTitle}>BY PERSON</ThemedText>
            </View>
            <View style={[styles.trow, { borderBottomColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.flex1]}>PERSON</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cClaims]}>CLAIMS</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cTotal]}>TOTAL</ThemedText>
            </View>
            {summary.byPerson.map((p) => (
              <View key={p.id} style={[styles.trow, { borderBottomColor: theme.border }]}>
                <ThemedText numberOfLines={1} style={[styles.td, styles.flex1]}>{p.name}</ThemedText>
                <ThemedText themeColor="textMuted" style={[styles.td, styles.cClaims]}>{p.count}</ThemedText>
                <ThemedText style={[styles.td, styles.cTotal, styles.mono, styles.semi]}>{fmt(p.total)}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

// Horizontal bar chart (dashboard recharts vertical-layout BarChart) drawn with react-native-svg.
function CategoryChart({ rows }: { rows: { category: string; amount: number }[] }) {
  const theme = useTheme();
  const [w, setW] = useState(0);
  const labelW = 76;
  const right = 16;
  const rowH = 28;
  const axisH = 20;
  const max = niceMax(Math.max(0, ...rows.map((r) => r.amount)));
  const plotW = Math.max(0, w - labelW - right);
  const h = rows.length * rowH + axisH;

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={`Spend by category: ${rows.map((r) => `${r.category} ${fmt(r.amount)}`).join(', ')}`}>
      {w > 0 ? (
        <Svg width={w} height={h}>
          {[0, 1, 2, 3, 4].map((i) => {
            const x = labelW + (plotW * i) / 4;
            return (
              <G key={i}>
                <Line x1={x} x2={x} y1={0} y2={rows.length * rowH} stroke={theme.border} strokeDasharray="3 3" strokeWidth={1} />
                <SvgText x={x} y={rows.length * rowH + 14} fontSize={10} fill={theme.textMuted} textAnchor="middle">{axisMoney((max * i) / 4)}</SvgText>
              </G>
            );
          })}
          {rows.map((r, i) => {
            const bw = (plotW * r.amount) / max;
            const inside = bw > plotW - 52;
            return (
              <G key={r.category}>
                <SvgText x={labelW - 8} y={i * rowH + rowH / 2 + 4} fontSize={11} fill={theme.text} textAnchor="end">{r.category}</SvgText>
                <Rect x={labelW} y={i * rowH + 5} width={Math.max(2, bw)} height={rowH - 10} rx={3} fill={CHART_BLUE} />
                <SvgText
                  x={inside ? labelW + bw - 4 : labelW + bw + 4}
                  y={i * rowH + rowH / 2 + 4}
                  fontSize={10}
                  fill={inside ? '#fff' : theme.textMuted}
                  textAnchor={inside ? 'end' : 'start'}>
                  {fmt(r.amount)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 1152, alignSelf: 'center' },
  sections: { gap: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 15 },
  bold: { fontFamily: FontWeights.bold },
  semi: { fontFamily: FontWeights.semiBold },
  mono: { fontFamily: Fonts?.mono },
  center: { textAlign: 'center' },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start' },
  tabsPhone: { alignSelf: 'stretch' },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radii.sm, alignItems: 'center' },
  tabText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' },
  fWide: { minWidth: 160 },
  fPhone: { width: '48%' },
  fLabel: { fontSize: 10, lineHeight: 14, marginBottom: 4 },
  emptyBox: { alignItems: 'center', gap: 8 },
  footerWrap: { marginTop: 16 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pagerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardGap: { gap: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  desc: { fontSize: 14, lineHeight: 20 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: Radii.sm },
  actions: { gap: 8 },
  actionBtns: { flexDirection: 'row', gap: 8 },
  noteInput: { minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  kpiWide: { flex: 1, minWidth: 0 },
  kpiPhone: { width: '48%', flexGrow: 1 },
  kpiValue: { fontSize: 24, lineHeight: 32, marginTop: 4, fontFamily: Fonts?.mono, fontWeight: '700' },
  cols: { gap: 20 },
  colsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6, marginBottom: 12 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tableHead: { paddingHorizontal: 16, paddingTop: 12, borderBottomWidth: 1 },
  trow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  th: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.5 },
  td: { fontSize: 14, lineHeight: 20 },
  cClaims: { width: 60 },
  cTotal: { width: 96 },
});
