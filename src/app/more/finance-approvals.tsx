import { Stack } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, fmt, LoanSheet } from '@/components/finance-approvals/loan-sheets';
import { ErrorBanner } from '@/components/overview/parts';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { shareCsv } from '@/components/purchase/helpers';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { approveLoanWithNotes, createLoanAdmin, fetchEmployees, fetchLoans, getErrorMessage, rejectLoan, updateLoan } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import type { Loan } from '@/types/api';

const WIDE_MIN = 560;

// List/create/edit: the backend's ADMIN_ROLES (OWNER, STORE_MANAGER, CASHIER).
// Approve/reject: OWNER or STORE_MANAGER only, with the server blocking
// self-approval and a Store Manager acting on another Store Manager's request
// (surfaced through the error message, not predicted here). The dashboard's own
// frontend arrays are wider than the backend, so mobile follows the backend.
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'CASHIER'];
const DECIDE_ROLES = ['OWNER', 'STORE_MANAGER'];

const LOAN_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Pending' },
  APPROVED: { bg: 'rgba(34,197,94,0.12)', color: '#15803d', label: 'Approved' },
  REJECTED: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', label: 'Rejected' },
  COMPLETED: { bg: 'rgba(99,102,241,0.12)', color: '#4338ca', label: 'Completed' },
};

const FILTERS = ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', ''] as const;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Tab = 'active' | 'loans';

function Mono({ children, color, bold }: { children: ReactNode; color?: string; bold?: boolean }) {
  return <ThemedText style={[styles.mono, color ? { color } : null, bold && styles.bold]}>{children}</ThemedText>;
}

function KV({ k, children }: { k: string; children: ReactNode }) {
  return (
    <View style={styles.kv}>
      <ThemedText themeColor="textMuted" style={styles.k}>{k}</ThemedText>
      <View style={styles.v}>{children}</View>
    </View>
  );
}

function SmallBtn({ label, onPress, bg, color }: { label: string; onPress: () => void; bg?: string; color?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.smallBtn, bg ? { backgroundColor: bg, borderColor: 'transparent' } : { borderColor: theme.border }]}>
      <ThemedText style={[styles.smallBtnLabel, { color: color ?? theme.textMuted }]}>{label}</ThemedText>
    </Pressable>
  );
}

// Active table columns: first two left-aligned, the rest right-aligned.
const COLS = [
  { key: 'n', header: '#', width: 44 },
  { key: 'name', header: 'Employee', width: 160 },
  { key: 'given', header: 'Total Given', width: 104 },
  { key: 'paid', header: 'Paid Back', width: 104 },
  { key: 'owes', header: 'Still Owes', width: 104 },
  { key: 'cut', header: 'Monthly Cut', width: 104 },
  { key: 'left', header: 'Months Left', width: 100 },
  { key: 'since', header: 'Since', width: 110 },
  { key: 'notes', header: 'Notes', width: 160 },
  { key: 'edit', header: 'Edit', width: 76 },
];

export default function FinanceApprovalsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { status: permStatus, hasTab } = usePermissions();

  const canEdit = ADMIN_ROLES.includes(user?.role ?? '');
  const canApprove = DECIDE_ROLES.includes(user?.role ?? '');
  const canSeeActive = hasTab('finance_approvals_active_tab');
  const canSeeLoans = hasTab('finance_approvals_loans_tab');

  const [width, setWidth] = useState(0);
  const [tab, setTab] = useState<Tab>('active');
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loanFilter, setLoanFilter] = useState<(typeof FILTERS)[number]>('PENDING');
  const [activeSearch, setActiveSearch] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);

  const [loanAction, setLoanAction] = useState<{ id: string; action: 'approve' | 'reject'; name: string } | null>(null);
  const [loanActLoading, setLoanActLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [loanModal, setLoanModal] = useState<{ loan?: Loan } | null>(null);
  const [loanSaving, setLoanSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const wide = width >= WIDE_MIN;

  const load = useCallback(async () => {
    setError('');
    try {
      setLoans(await fetchLoans());
    } catch {
      setError("Couldn't load advances. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
    fetchEmployees()
      .then((list) => setEmployees(list.map((e) => ({ id: e.id, name: e.name }))))
      .catch(() => { /* non-critical: only the create form's picker needs it */ });
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const confirmAction = async (note: string) => {
    if (!loanAction) return;
    setLoanActLoading(true);
    setActionError('');
    try {
      if (loanAction.action === 'approve') await approveLoanWithNotes(loanAction.id, note);
      else await rejectLoan(loanAction.id, note);
      setToast({ type: 'success', msg: `Advance ${loanAction.action === 'approve' ? 'approved' : 'rejected'}.` });
      setLoanAction(null);
      load();
    } catch (err: unknown) {
      setActionError(getErrorMessage(err, 'Action failed.'));
    } finally {
      setLoanActLoading(false);
    }
  };

  const saveLoan = async (data: Record<string, unknown>) => {
    setLoanSaving(true);
    setSaveError('');
    try {
      if (loanModal?.loan) {
        await updateLoan(loanModal.loan.id, data as Parameters<typeof updateLoan>[1]);
        setToast({ type: 'success', msg: 'Advance updated.' });
      } else {
        await createLoanAdmin(data as Parameters<typeof createLoanAdmin>[0]);
        setToast({ type: 'success', msg: 'Advance created.' });
      }
      setLoanModal(null);
      load();
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, 'Failed to save advance.'));
    } finally {
      setLoanSaving(false);
    }
  };

  const openModal = (loan?: Loan) => { setSaveError(''); setLoanModal({ loan }); };
  const openActionSheet = (l: Loan, action: 'approve' | 'reject') => { setActionError(''); setLoanAction({ id: l.id, action, name: l.user.name }); };

  const visibleTabs = (['active', 'loans'] as const).filter((t) => (t === 'active' ? canSeeActive : canSeeLoans));
  // Dashboard default is "active"; if that tab is hidden, fall to the visible one.
  const current: Tab = visibleTabs.includes(tab) ? tab : (visibleTabs[0] ?? tab);

  const pendingCount = loans.filter((l) => l.amount > 0 && l.status === 'PENDING').length;
  const filteredLoans = loans.filter((l) => l.amount > 0 && (!loanFilter || l.status === loanFilter));

  const allActive = loans.filter((l) => l.status === 'APPROVED' && l.remainingAmount > 0);
  const term = activeSearch.trim().toLowerCase();
  const activeLoans = (term ? allActive.filter((l) => l.user.name.toLowerCase().includes(term)) : allActive)
    .slice()
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
  const totalLoan = activeLoans.reduce((s, l) => s + l.remainingAmount, 0);
  const totalGiven = activeLoans.reduce((s, l) => s + l.amount, 0);
  const totalPaid = activeLoans.reduce((s, l) => s + (l.amount - l.remainingAmount), 0);

  const exportCsv = async () => {
    const rows: (string | number)[][] = [
      ['Type', 'Employee', 'Total Given', 'Paid Back', 'Still Owes / Amount', 'Monthly Cut', 'Since', 'Notes / Reason'],
      ...activeLoans.map((l) => [
        'Loan', l.user.name, l.amount, l.amount - l.remainingAmount, l.remainingAmount,
        l.monthlyDeductionAmount > 0 ? l.monthlyDeductionAmount : 'TBD',
        l.requestedAt ? fmtDate(l.requestedAt) : '', l.notes || '',
      ]),
    ];
    try {
      if (!(await shareCsv(`finance-active-${new Date().toISOString().slice(0, 10)}.csv`, rows))) setToast({ type: 'error', msg: 'Sharing isn’t available on this device.' });
    } catch (e: unknown) {
      setToast({ type: 'error', msg: e instanceof Error && e.message ? e.message : "Couldn't export CSV. Try again." });
    }
  };

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Finance Approvals' }} />
      {children}
    </ThemedView>
  );

  if (!ADMIN_ROLES.includes(user?.role ?? '')) {
    return shell(
      <View style={[styles.pageMax, { padding: wide ? 24 : 16 }]}>
        <Card style={styles.centerCard}>
          <ThemedText style={styles.emptyText}>You don&apos;t have access to Finance Approvals.</ThemedText>
        </Card>
      </View>,
    );
  }

  // ── Active tab pieces ─────────────────────────────────────────────────────
  const activeCardRow = (l: Loan, i: number) => {
    const paidBack = l.amount - l.remainingAmount;
    const monthsLeft = l.monthlyDeductionAmount > 0 ? Math.ceil(l.remainingAmount / l.monthlyDeductionAmount) : null;
    return { paidBack, monthsLeft, alt: i % 2 !== 0 };
  };

  const activeTable = (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.hscroll}>
      <View style={[styles.table, { minWidth: COLS.reduce((s, c) => s + (c.key === 'edit' && !canEdit ? 0 : c.width), 0) }]}>
        <View style={[styles.tr, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
          {COLS.filter((c) => c.key !== 'edit' || canEdit).map((c, i) => (
            <View key={c.key} style={[styles.td, { flexBasis: c.width, flexGrow: c.width }]}>
              <ThemedText themeColor="textMuted" style={[styles.th, i > 1 && styles.right]}>{c.header}</ThemedText>
            </View>
          ))}
        </View>
        {activeLoans.map((l, i) => {
          const { paidBack, monthsLeft, alt } = activeCardRow(l, i);
          const cell = (key: string, node: ReactNode, right = true) => {
            const c = COLS.find((x) => x.key === key)!;
            return <View key={key} style={[styles.td, { flexBasis: c.width, flexGrow: c.width }, right && styles.alignEnd]}>{node}</View>;
          };
          return (
            <View key={l.id} style={[styles.tr, { borderBottomColor: theme.border }, alt && { backgroundColor: theme.backgroundElement }]}>
              {cell('n', <ThemedText themeColor="textMuted" style={styles.cellText}>{i + 1}</ThemedText>, false)}
              {cell('name', <ThemedText numberOfLines={1} style={[styles.cellText, styles.bold]}>{l.user.name}</ThemedText>, false)}
              {cell('given', <Mono>{fmt(l.amount)}</Mono>)}
              {cell('paid', paidBack > 0 ? <Mono color="#15803d" bold>{fmt(paidBack)}</Mono> : <ThemedText themeColor="textMuted" style={styles.cellText}>—</ThemedText>)}
              {cell('owes', <Mono color="#b45309" bold>{fmt(l.remainingAmount)}</Mono>)}
              {cell('cut', l.monthlyDeductionAmount > 0 ? <Mono>{fmt(l.monthlyDeductionAmount)}</Mono> : <ThemedText style={[styles.cellText, styles.bold, { color: '#dc2626' }]}>TBD</ThemedText>)}
              {cell('left', monthsLeft !== null ? <Mono>{`${monthsLeft} mo`}</Mono> : <ThemedText themeColor="textMuted" style={styles.cellText}>—</ThemedText>)}
              {cell('since', <ThemedText themeColor="textMuted" style={styles.cellText}>{l.requestedAt ? fmtDate(l.requestedAt) : '—'}</ThemedText>)}
              {cell('notes', <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.cellText}>{l.notes || '—'}</ThemedText>, false)}
              {canEdit ? cell('edit', <SmallBtn label="Edit" onPress={() => openModal(l)} />) : null}
            </View>
          );
        })}
        <View style={[styles.tr, styles.totalRow, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}>
          <View style={[styles.td, { flexBasis: COLS[0].width + COLS[1].width, flexGrow: COLS[0].width + COLS[1].width }]}>
            <ThemedText themeColor="textMuted" style={[styles.cellText, styles.bold]}>{`TOTAL (${activeLoans.length} employees)`}</ThemedText>
          </View>
          <View style={[styles.td, styles.alignEnd, { flexBasis: COLS[2].width, flexGrow: COLS[2].width }]}><Mono bold>{fmt(totalGiven)}</Mono></View>
          <View style={[styles.td, styles.alignEnd, { flexBasis: COLS[3].width, flexGrow: COLS[3].width }]}><Mono color="#15803d" bold>{fmt(totalPaid)}</Mono></View>
          <View style={[styles.td, styles.alignEnd, { flexBasis: COLS[4].width, flexGrow: COLS[4].width }]}><Mono color="#b45309" bold>{fmt(totalLoan)}</Mono></View>
          <View style={{ flexBasis: COLS.slice(5).reduce((s, c) => s + (c.key === 'edit' && !canEdit ? 0 : c.width), 0), flexGrow: 1 }} />
        </View>
      </View>
    </ScrollView>
  );

  const renderActiveCard = (l: Loan, i: number) => {
    const { paidBack, monthsLeft } = activeCardRow(l, i);
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText style={[styles.cardName]}>{`${i + 1}. ${l.user.name}`}</ThemedText>
        <KV k="Total Given"><Mono>{fmt(l.amount)}</Mono></KV>
        <KV k="Paid Back">{paidBack > 0 ? <Mono color="#15803d" bold>{fmt(paidBack)}</Mono> : <ThemedText themeColor="textMuted" style={styles.cellText}>—</ThemedText>}</KV>
        <KV k="Still Owes"><Mono color="#b45309" bold>{fmt(l.remainingAmount)}</Mono></KV>
        <KV k="Monthly Cut">{l.monthlyDeductionAmount > 0 ? <Mono>{fmt(l.monthlyDeductionAmount)}</Mono> : <ThemedText style={[styles.cellText, styles.bold, { color: '#dc2626' }]}>TBD</ThemedText>}</KV>
        <KV k="Months Left">{monthsLeft !== null ? <Mono>{`${monthsLeft} mo`}</Mono> : <ThemedText themeColor="textMuted" style={styles.cellText}>—</ThemedText>}</KV>
        <KV k="Since"><ThemedText themeColor="textMuted" style={styles.cellText}>{l.requestedAt ? fmtDate(l.requestedAt) : '—'}</ThemedText></KV>
        <KV k="Notes"><ThemedText themeColor="textMuted" style={styles.cellText}>{l.notes || '—'}</ThemedText></KV>
        {canEdit ? <View style={styles.rowBtns}><SmallBtn label="Edit" onPress={() => openModal(l)} /></View> : null}
      </View>
    );
  };

  const renderLoanCard = (loan: Loan) => {
    const st = LOAN_STATUS[loan.status] ?? LOAN_STATUS.PENDING;
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.loanHead, wide && styles.loanHeadWide]}>
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              <ThemedText style={styles.loanName}>{loan.user?.name}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.small}>{loan.user?.role?.replace(/_/g, ' ')}</ThemedText>
            </View>
            <View style={styles.facts}>
              <ThemedText themeColor="textMuted" style={styles.fact}>Total: <Mono bold>{fmt(loan.amount)}</Mono></ThemedText>
              {loan.status === 'APPROVED' ? (
                <ThemedText themeColor="textMuted" style={styles.fact}>
                  Remaining: <Mono bold color={loan.remainingAmount > 0 ? '#b45309' : '#15803d'}>{fmt(loan.remainingAmount)}</Mono>
                </ThemedText>
              ) : null}
              <ThemedText themeColor="textMuted" style={styles.fact}>
                Monthly: <Mono bold>{loan.monthlyDeductionAmount > 0 ? fmt(loan.monthlyDeductionAmount) : 'TBD'}</Mono>
                {loan.monthlyDeductionPercent > 0 ? ` (${loan.monthlyDeductionPercent.toFixed(1)}%)` : ''}
              </ThemedText>
              <ThemedText themeColor="textMuted" style={styles.fact}>{`Requested: ${fmtDate(loan.requestedAt)}`}</ThemedText>
            </View>
            {loan.notes ? <ThemedText themeColor="textMuted" style={styles.note}>{`📄 ${loan.notes}`}</ThemedText> : null}
            {loan.status === 'REJECTED' && loan.rejectionReason ? <ThemedText style={[styles.note, { color: '#b91c1c' }]}>{`Reason: ${loan.rejectionReason}`}</ThemedText> : null}
            {loan.status === 'APPROVED' && loan.approvedBy ? (
              <ThemedText themeColor="textMuted" style={styles.note}>{`Approved by ${loan.approvedBy.name} on ${fmtDate(loan.approvedAt!)}`}</ThemedText>
            ) : null}
          </View>
          <View style={styles.rowBtns}>
            <View style={[styles.pill, { backgroundColor: st.bg }]}><ThemedText style={[styles.pillText, { color: st.color }]}>{st.label}</ThemedText></View>
            {canEdit ? <SmallBtn label="✎ Edit" onPress={() => openModal(loan)} /> : null}
            {loan.status === 'PENDING' && canApprove ? (
              <>
                <SmallBtn label="Approve" bg="rgba(34,197,94,0.12)" color="#15803d" onPress={() => openActionSheet(loan, 'approve')} />
                <SmallBtn label="Reject" bg="rgba(239,68,68,0.12)" color="#b91c1c" onPress={() => openActionSheet(loan, 'reject')} />
              </>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  // ── Header (everything above the list) ────────────────────────────────────
  const header = (
    <View style={styles.headerWrap}>
      <View style={[styles.headRow, wide && styles.headRowWide]}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Finance Approvals</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Review and approve employee advance requests</ThemedText>
        </View>
        {canEdit ? <Button size="sm" onPress={() => { openModal(); setTab('loans'); }}>+ New Loan</Button> : null}
      </View>

      {toast ? (toast.type === 'success' ? <SuccessBanner message={toast.msg} /> : <ErrorBanner message={toast.msg} />) : null}
      {error ? <ErrorBanner message={error} onRetry={() => { setLoading(true); load(); }} /> : null}

      {visibleTabs.length > 0 ? (
        <View style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}>
          {visibleTabs.map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: current === t }}
              style={[styles.tabBtn, current === t && { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.tabLabel, { color: current === t ? '#ffffff' : theme.textMuted }]}>{t === 'active' ? 'Active' : 'Loans'}</ThemedText>
              {t === 'loans' && pendingCount > 0 ? (
                <View style={styles.tabCount}><ThemedText style={styles.tabCountText}>{pendingCount}</ThemedText></View>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {current === 'active' && visibleTabs.length > 0 && !loading ? (
        <>
          <View style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText themeColor="textMuted" style={styles.statLabel}>ACTIVE ADVANCES</ThemedText>
            <ThemedText style={styles.statValue}>{activeLoans.length}</ThemedText>
            <ThemedText style={[styles.statSub, { color: '#b45309' }]}>{`${fmt(totalLoan)} outstanding`}</ThemedText>
          </View>
          <View style={styles.toolbar}>
            <TextInput
              value={activeSearch}
              onChangeText={setActiveSearch}
              placeholder="Search employee name…"
              placeholderTextColor={theme.textMuted}
              style={[styles.search, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }, wide ? { width: 280 } : styles.flex1]}
            />
            {activeSearch ? <Button variant="outline" size="sm" onPress={() => setActiveSearch('')}>Clear</Button> : null}
            <View style={styles.spacer} />
            <Button variant="outline" size="sm" onPress={exportCsv}>Download CSV</Button>
          </View>
          {activeLoans.length > 0 ? <ThemedText style={styles.h3}>Active Advances</ThemedText> : null}
          {wide && activeLoans.length > 0 ? (
            <View style={[styles.tableWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>{activeTable}</View>
          ) : null}
        </>
      ) : null}

      {current === 'loans' && visibleTabs.length > 0 ? (
        <View style={styles.filters}>
          {FILTERS.map((f) => (
            <Pressable
              key={f || 'all'}
              onPress={() => setLoanFilter(f)}
              accessibilityRole="button"
              style={[styles.chip, loanFilter === f ? { backgroundColor: theme.primary, borderColor: theme.primary } : { borderColor: theme.border }]}>
              <ThemedText style={[styles.chipLabel, { color: loanFilter === f ? '#ffffff' : theme.textMuted }]}>
                {`${f || 'All'}${f === 'PENDING' && pendingCount > 0 ? ` (${pendingCount})` : ''}`}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}

      {permStatus !== 'ready' ? <Skeleton height={64} /> : null}
      {permStatus === 'ready' && visibleTabs.length === 0 ? (
        <Card style={styles.centerCard}><ThemedText style={styles.emptyText}>You don&apos;t have access to any Finance Approvals tab.</ThemedText></Card>
      ) : null}
    </View>
  );

  // FlatList rows: loan cards on the Loans tab, active cards on a phone. On a
  // wide Active tab the table sits in the header (it scrolls sideways).
  const listData: Loan[] = loading || visibleTabs.length === 0 ? [] : current === 'loans' ? filteredLoans : wide ? [] : activeLoans;

  const empty = loading ? (
    <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={wide ? 56 : 120} />)}</View>
  ) : visibleTabs.length === 0 ? null : current === 'loans' ? (
    <Card style={styles.centerCard}>
      <ThemedText themeColor="textMuted" style={styles.emptyText}>{`No ${loanFilter.toLowerCase() || ''} loan requests.`}</ThemedText>
    </Card>
  ) : activeLoans.length === 0 ? (
    <Card style={styles.centerCard}>
      <ThemedText themeColor="textMuted" style={styles.emptyText}>{term ? `No active loans match "${activeSearch}".` : 'No active loans.'}</ThemedText>
    </Card>
  ) : null;

  const footer = !wide && current === 'active' && activeLoans.length > 0 && !loading ? (
    <View style={[styles.card, styles.totalCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText themeColor="textMuted" style={[styles.cellText, styles.bold]}>{`TOTAL (${activeLoans.length} employees)`}</ThemedText>
      <KV k="Total Given"><Mono bold>{fmt(totalGiven)}</Mono></KV>
      <KV k="Paid Back"><Mono color="#15803d" bold>{fmt(totalPaid)}</Mono></KV>
      <KV k="Still Owes"><Mono color="#b45309" bold>{fmt(totalLoan)}</Mono></KV>
    </View>
  ) : null;

  return shell(
    <>
      <FlatList
        data={listData}
        keyExtractor={(l) => l.id}
        renderItem={({ item, index }) => (current === 'loans' ? renderLoanCard(item) : renderActiveCard(item, index))}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        ItemSeparatorComponent={Gap}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.pageMax, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      />
      {loanAction ? (
        <ActionSheet
          action={loanAction.action}
          name={loanAction.name}
          loading={loanActLoading}
          error={actionError}
          onConfirm={confirmAction}
          onCancel={() => setLoanAction(null)}
        />
      ) : null}
      {loanModal !== null ? (
        <LoanSheet
          loan={loanModal.loan}
          employees={employees}
          wide={wide}
          loading={loanSaving}
          error={saveError}
          onSave={saveLoan}
          onCancel={() => setLoanModal(null)}
        />
      ) : null}
    </>,
  );
}

function Gap() {
  return <View style={{ height: 14 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  pageMax: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  headerWrap: { gap: 16, marginBottom: 16 },
  headRow: { gap: 12 },
  headRowWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  small: { fontSize: 12, lineHeight: 16 },
  bold: { fontFamily: FontWeights.bold, fontWeight: '700' },
  mono: { fontFamily: Fonts?.mono, fontSize: 13, lineHeight: 18 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 10, alignSelf: 'flex-start' },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 22, minHeight: 40, borderRadius: 8, justifyContent: 'center' },
  tabLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  tabCount: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  tabCountText: { color: '#ffffff', fontSize: 11, lineHeight: 16, fontFamily: FontWeights.bold },
  stat: { borderWidth: 1, borderRadius: Radii.lg, paddingVertical: 16, paddingHorizontal: 20, gap: 4 },
  statLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  statValue: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold, fontWeight: '800' },
  statSub: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: FontWeights.regular },
  spacer: { flexGrow: 1 },
  h3: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.bold },
  tableWrap: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  hscroll: { flexGrow: 1 },
  table: { flexGrow: 1 },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent' },
  totalRow: { borderBottomWidth: 0, borderTopWidth: 2 },
  td: { paddingHorizontal: 14, paddingVertical: 10, minWidth: 0 },
  alignEnd: { alignItems: 'flex-end' },
  th: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  right: { textAlign: 'right' },
  cellText: { fontSize: 13, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 16, gap: 6 },
  totalCard: { marginTop: 14 },
  cardName: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.bold },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  k: { width: 96, fontSize: 12, lineHeight: 18 },
  v: { flex: 1, minWidth: 0 },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 4 },
  smallBtn: { minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  smallBtnLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  loanHead: { gap: 12 },
  loanHeadWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 },
  loanName: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.bold },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  fact: { fontSize: 13, lineHeight: 20 },
  note: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  pill: { paddingHorizontal: 12, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chipLabel: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  centerCard: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  gap: { gap: 12 },
});
