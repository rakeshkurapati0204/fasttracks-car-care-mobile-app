import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLoanRepayments, fetchMyLoans, fetchSalaryPayments, getErrorMessage, requestLoan } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { LoanOrAdvance, LoanRepayment, RepaymentMode, SalaryPaymentRecord } from '@/types/api';

// Self-view only. GET /loans scopes to the requester's own userId server-side;
// "Advance" is the same /loans feature the dashboard's My Finance calls.
const WIDE_MIN = 560;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const REPAYMENT_MODE_LABEL: Record<string, string> = {
  MONTHLY_N: 'Monthly, over N months',
  LUMP_NEXT_MONTH: 'Lump sum, next month',
  TBD: 'TBD (no auto-deduction)',
  CUSTOM: 'Custom per-month',
};
const MODE_OPTIONS = (Object.keys(REPAYMENT_MODE_LABEL) as RepaymentMode[]).map((m) => ({ value: m, label: REPAYMENT_MODE_LABEL[m] }));

// The dashboard's status pill colours.
const LOAN_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Pending' },
  APPROVED: { bg: 'rgba(34,197,94,0.12)', color: '#15803d', label: 'Approved' },
  REJECTED: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', label: 'Rejected' },
  COMPLETED: { bg: 'rgba(99,102,241,0.12)', color: '#4338ca', label: 'Completed' },
};

// ₹45,000: Indian grouping, no decimals.
function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

type Tab = 'salary' | 'loans';

export default function MyFinanceScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();

  const [width, setWidth] = useState(0);
  const [tab, setTab] = useState<Tab>('salary');
  const [refreshing, setRefreshing] = useState(false);

  // Shared message strip (the dashboard's toast, kept visible until the next action).
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Salary payments ───────────────────────────────────────────────────────
  const [salPayments, setSalPayments] = useState<SalaryPaymentRecord[]>([]);
  const [salYear, setSalYear] = useState(new Date().getFullYear());
  const [salLoading, setSalLoading] = useState(false);

  const loadSalary = useCallback(async () => {
    if (!user) return;
    setSalLoading(true);
    try {
      setSalPayments(await fetchSalaryPayments(user.id, salYear));
    } catch {
      // silently skipped, like the dashboard
    } finally {
      setSalLoading(false);
    }
  }, [user, salYear]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on tab / year change
    if (tab === 'salary') loadSalary();
  }, [tab, loadSalary]);

  // ── Advances (loans) ──────────────────────────────────────────────────────
  const [loans, setLoans] = useState<LoanOrAdvance[]>([]);
  const [loansLoading, setLoansLoading] = useState(true);
  // A failed fetch must stay visible until a retry succeeds: left at its last
  // value (empty on first load) it would read as "you genuinely have none".
  const [loansError, setLoansError] = useState(false);
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [repayments, setRepayments] = useState<Record<string, LoanRepayment[]>>({});
  const [loadingRep, setLoadingRep] = useState<string | null>(null);

  const loadLoans = useCallback(async () => {
    setLoansLoading(true);
    setLoansError(false);
    try {
      setLoans(await fetchMyLoans());
    } catch {
      showToast('error', "Couldn't load advances. Check your connection and try again.");
      setLoansError(true);
    } finally {
      setLoansLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    loadLoans();
  }, [loadLoans]);

  const toggleRepayments = async (loanId: string) => {
    if (expandedLoan === loanId) { setExpandedLoan(null); return; }
    setExpandedLoan(loanId);
    if (repayments[loanId]) return;
    setLoadingRep(loanId);
    try {
      const rows = await fetchLoanRepayments(loanId);
      setRepayments((p) => ({ ...p, [loanId]: rows }));
    } catch {
      showToast('error', "Couldn't load repayments. Check your connection and try again.");
    } finally {
      setLoadingRep(null);
    }
  };

  // ── Request Advance sheet ─────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ amount: '', repaymentMode: '' as RepaymentMode | '', tenureMonths: '' });

  const showsTenure = form.repaymentMode === 'MONTHLY_N' || form.repaymentMode === 'CUSTOM';
  const amountNum = parseFloat(form.amount) || 0;
  const tenureNum = parseInt(form.tenureMonths, 10) || 0;
  const monthlyCalc = form.repaymentMode === 'MONTHLY_N' && amountNum > 0 && tenureNum > 0 ? amountNum / tenureNum : null;

  const closeForm = () => { setShowForm(false); setForm({ amount: '', repaymentMode: '', tenureMonths: '' }); setFormError(''); };

  const submitLoan = async () => {
    const amount = parseFloat(form.amount);
    const tenureMonths = parseInt(form.tenureMonths, 10);
    if (!amount || amount <= 0) { setFormError('Enter a valid amount.'); return; }
    if (!form.repaymentMode) { setFormError('Select a repayment mode.'); return; }
    if (showsTenure && (!tenureMonths || tenureMonths < 1)) { setFormError('Enter the number of months.'); return; }
    setSubmitting(true);
    setFormError('');
    try {
      await requestLoan({ amount, repaymentMode: form.repaymentMode, ...(showsTenure ? { tenureMonths } : {}) });
      showToast('success', 'Advance request submitted.');
      closeForm();
      loadLoans();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, 'Failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (tab === 'salary') await loadSalary();
    else await loadLoans();
    setRefreshing(false);
  };

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;
  const thisYear = new Date().getFullYear();

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'My Finance' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { padding: pad, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View>
          <ThemedText style={styles.h1}>My Finance</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Manage your salary advances</ThemedText>
        </View>

        {toast ? (
          <View style={[styles.toast, { backgroundColor: toast.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }]} accessibilityRole="alert">
            <ThemedText style={[styles.toastText, { color: toast.type === 'success' ? '#15803d' : '#b91c1c' }]}>{toast.msg}</ThemedText>
          </View>
        ) : null}

        <View style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}>
          {(['salary', 'loans'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              style={[styles.tab, { backgroundColor: tab === t ? theme.primary : 'transparent' }]}>
              <ThemedText style={[styles.tabText, { color: tab === t ? '#fff' : theme.textMuted }]}>{t === 'salary' ? 'Salary' : 'Loans'}</ThemedText>
            </Pressable>
          ))}
        </View>

        {/* ── SALARY TAB ─────────────────────────────────────────────────── */}
        {tab === 'salary' ? (
          <View style={styles.stack}>
            <View style={styles.yearRow}>
              <Pressable onPress={() => setSalYear((y) => y - 1)} accessibilityRole="button" style={[styles.yearBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText themeColor="textSecondary" style={styles.yearBtnText}>{`‹ ${salYear - 1}`}</ThemedText>
              </Pressable>
              <ThemedText style={styles.year}>{salYear}</ThemedText>
              <Pressable
                onPress={() => setSalYear((y) => y + 1)}
                disabled={salYear >= thisYear}
                accessibilityRole="button"
                style={[styles.yearBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText style={[styles.yearBtnText, { color: salYear >= thisYear ? theme.textMuted : theme.textSecondary }]}>{`${salYear + 1} ›`}</ThemedText>
              </Pressable>
            </View>

            {salLoading ? (
              <Card padding="md"><ThemedText themeColor="textMuted" style={[styles.body, styles.center]}>Loading…</ThemedText></Card>
            ) : (
              <View style={styles.gap10}>
                {MONTH_NAMES.map((mName, idx) => {
                  const mNum = idx + 1;
                  const now2 = new Date();
                  const isFuture = salYear > now2.getFullYear() || (salYear === now2.getFullYear() && mNum > now2.getMonth() + 1);
                  const p = salPayments.find((s) => s.month === mNum);
                  return (
                    <Card key={mNum} padding="sm" style={[styles.monthCard, { opacity: isFuture ? 0.4 : 1 }]}>
                      <View style={styles.flex1}>
                        <ThemedText style={styles.monthName}>{`${mName} ${salYear}`}</ThemedText>
                        {p ? (
                          <ThemedText themeColor="textMuted" style={styles.monthMeta}>
                            {`via ${p.mode || 'Cash'} · confirmed by ${p.paidBy?.name} · ${new Date(p.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`}
                          </ThemedText>
                        ) : null}
                      </View>
                      {p ? (
                        <View style={styles.paid}>
                          <ThemedText style={styles.paidAmount}>{`₹${p.amount.toLocaleString('en-IN')}`}</ThemedText>
                          <View style={styles.received}>
                            <Ionicons name="checkmark" size={12} color="#15803d" />
                            <ThemedText style={styles.receivedText}>Received</ThemedText>
                          </View>
                        </View>
                      ) : isFuture ? (
                        <ThemedText themeColor="textMuted" style={styles.small}>—</ThemedText>
                      ) : (
                        <View style={styles.pending}><ThemedText style={styles.pendingText}>Pending</ThemedText></View>
                      )}
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}

        {/* ── LOANS TAB ──────────────────────────────────────────────────── */}
        {tab === 'loans' ? (
          <View style={styles.stack}>
            <View style={styles.end}>
              <Button onPress={() => { setFormError(''); setShowForm(true); }}>+ Request Advance</Button>
            </View>

            {loansLoading ? (
              <View style={styles.stack}><Skeleton height={96} /><Skeleton height={96} /></View>
            ) : loansError ? (
              <Card padding="lg">
                <View style={styles.errorBox}>
                  <ThemedText style={[styles.body, { color: '#ef4444' }]}>Couldn’t load your advances.</ThemedText>
                  <Button size="sm" onPress={loadLoans}>Retry</Button>
                </View>
              </Card>
            ) : loans.length === 0 ? (
              <Card padding="lg"><ThemedText themeColor="textMuted" style={[styles.body, styles.center]}>No advance requests yet. Click “Request Advance” to get started.</ThemedText></Card>
            ) : (
              <View style={styles.gap14}>
                {loans.map((loan) => {
                  const st = LOAN_STATUS[loan.status] ?? LOAN_STATUS.PENDING;
                  const progress = loan.amount > 0 ? Math.round(((loan.amount - loan.remainingAmount) / loan.amount) * 100) : 0;
                  const isExp = expandedLoan === loan.id;
                  const createdBy = loan.history?.[0]?.changedBy ?? null;
                  const now = new Date();
                  const nextDue = (loan.scheduleEntries ?? []).find((se) => se.year > now.getFullYear() || (se.year === now.getFullYear() && se.month >= now.getMonth() + 1));
                  const rows = repayments[loan.id] ?? [];
                  return (
                    <Card key={loan.id} padding="md">
                      <View style={[styles.loanTop, !wide && styles.loanTopPhone]}>
                        <View style={styles.flex1}>
                          <View style={styles.amountRow}>
                            <ThemedText style={styles.amount}>{fmt(loan.amount)}</ThemedText>
                            <View style={[styles.statusPill, { backgroundColor: st.bg }]}><ThemedText style={[styles.statusText, { color: st.color }]}>{st.label}</ThemedText></View>
                          </View>
                          <View style={styles.facts}>
                            {/* remainingAmount still equals the requested amount for a PENDING or
                                REJECTED loan (nothing disbursed), so it is only shown once approved. */}
                            {loan.status === 'APPROVED' || loan.status === 'COMPLETED' ? (
                              <ThemedText themeColor="textMuted" style={styles.fact}>{'Remaining: '}<ThemedText style={[styles.fact, styles.strong]}>{fmt(loan.remainingAmount)}</ThemedText></ThemedText>
                            ) : null}
                            <ThemedText themeColor="textMuted" style={styles.fact}>
                              {'Monthly: '}<ThemedText style={[styles.fact, styles.strong]}>{fmt(loan.monthlyDeductionAmount)}</ThemedText>{` (${loan.monthlyDeductionPercent}%)`}
                            </ThemedText>
                            <ThemedText themeColor="textMuted" style={styles.fact}>{`Requested: ${fmtDate(loan.requestedAt)}`}</ThemedText>
                          </View>
                          <View style={styles.facts}>
                            {loan.repaymentMode ? (
                              <ThemedText themeColor="textMuted" style={styles.fact}>
                                {`${REPAYMENT_MODE_LABEL[loan.repaymentMode] ?? loan.repaymentMode}${loan.tenureMonths ? ` · ${loan.tenureMonths} months` : ''}`}
                              </ThemedText>
                            ) : null}
                            {createdBy ? (
                              <ThemedText themeColor="textMuted" style={styles.fact}>{'Recorded by '}<ThemedText style={[styles.fact, styles.strong]}>{createdBy.name}</ThemedText>{' on your behalf'}</ThemedText>
                            ) : null}
                          </View>
                          {loan.status === 'APPROVED' && nextDue ? (
                            <ThemedText themeColor="textMuted" style={[styles.fact, styles.gapTop]}>
                              {'Next due: '}<ThemedText style={[styles.fact, styles.strong]}>{fmt(nextDue.plannedAmount)}</ThemedText>{` in ${MONTH_SHORT[nextDue.month - 1]} ${nextDue.year}`}
                            </ThemedText>
                          ) : null}
                          {loan.status === 'APPROVED' ? (
                            <View style={styles.progress}>
                              <View style={styles.progressLabels}>
                                <ThemedText themeColor="textMuted" style={styles.small}>Repayment progress</ThemedText>
                                <ThemedText themeColor="textMuted" style={styles.small}>{`${progress}%`}</ThemedText>
                              </View>
                              <View style={[styles.track, { backgroundColor: theme.border }]}>
                                <View style={[styles.fill, { width: `${progress}%`, backgroundColor: theme.primary }]} />
                              </View>
                            </View>
                          ) : null}
                          {loan.status === 'REJECTED' && loan.rejectionReason ? (
                            <ThemedText style={[styles.fact, styles.gapTop, { color: '#b91c1c' }]}>{`Reason: ${loan.rejectionReason}`}</ThemedText>
                          ) : null}
                        </View>
                        {loan.status === 'APPROVED' ? (
                          <Pressable onPress={() => toggleRepayments(loan.id)} accessibilityRole="button" style={[styles.historyBtn, { borderColor: theme.border }]}>
                            <ThemedText themeColor="textMuted" style={styles.historyText}>{isExp ? 'Hide History' : 'View History'}</ThemedText>
                          </Pressable>
                        ) : null}
                      </View>

                      {isExp ? (
                        <View style={[styles.repayments, { borderTopColor: theme.border }]}>
                          {loadingRep === loan.id ? (
                            <ThemedText themeColor="textMuted" style={styles.body}>Loading…</ThemedText>
                          ) : rows.length === 0 ? (
                            <ThemedText themeColor="textMuted" style={styles.body}>No repayments recorded yet.</ThemedText>
                          ) : (
                            <View>
                              <View style={styles.tr}>
                                <ThemedText themeColor="textMuted" style={[styles.th, styles.colMonth]}>Month</ThemedText>
                                <ThemedText themeColor="textMuted" style={[styles.th, styles.colAmt, styles.rightText]}>Deducted</ThemedText>
                                <ThemedText themeColor="textMuted" style={[styles.th, styles.colAmt, styles.rightText]}>Remaining After</ThemedText>
                              </View>
                              {rows.map((r) => (
                                <View key={r.id} style={[styles.tr, styles.trLine, { borderTopColor: theme.border }]}>
                                  <ThemedText style={[styles.td, styles.colMonth]}>{`${MONTH_SHORT[(r.month - 1) % 12]} ${r.year}`}</ThemedText>
                                  <ThemedText style={[styles.td, styles.mono, styles.colAmt, styles.rightText, { color: '#15803d' }]}>{`-${fmt(r.amountDeducted)}`}</ThemedText>
                                  <ThemedText style={[styles.td, styles.mono, styles.colAmt, styles.rightText]}>{fmt(r.remainingAfter)}</ThemedText>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      ) : null}
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      {showForm ? (
        <Sheet
          visible
          onClose={closeForm}
          locked={submitting}
          title="Request Advance"
          footer={
            <>
              <Button style={styles.flex1} variant="outline" disabled={submitting} onPress={closeForm}>Cancel</Button>
              <Button style={styles.flex1} loading={submitting} onPress={submitLoan}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
            </>
          }>
          {formError ? (
            <View style={[styles.toast, { backgroundColor: 'rgba(239,68,68,0.12)' }]}><ThemedText style={[styles.toastText, { color: '#b91c1c' }]}>{formError}</ThemedText></View>
          ) : null}
          <Input label="Advance Amount (₹)" value={form.amount} onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="e.g. 50000" keyboardType="numeric" />
          <Select label="Repayment Mode" placeholder="Select mode…" options={MODE_OPTIONS} value={form.repaymentMode} onChange={(v) => setForm((f) => ({ ...f, repaymentMode: v as RepaymentMode }))} />
          {showsTenure ? (
            <Input label="Months (N)" value={form.tenureMonths} onChangeText={(v) => setForm((f) => ({ ...f, tenureMonths: v }))} placeholder="e.g. 5" keyboardType="number-pad" />
          ) : null}
          {monthlyCalc !== null ? (
            <View style={styles.calc}><ThemedText style={[styles.calcText, { color: theme.primary }]}>{`≈ Monthly deduction: ${fmt(monthlyCalc)}`}</ThemedText></View>
          ) : null}
          <ThemedText themeColor="textMuted" style={styles.small}>This is a proposal — management can adjust the amount, mode, or months when approving.</ThemedText>
        </Sheet>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { gap: 24, width: '100%', maxWidth: 900, alignSelf: 'center' },
  stack: { gap: 16 },
  gap10: { gap: 10 },
  gap14: { gap: 14 },
  end: { alignItems: 'flex-end' },
  center: { textAlign: 'center' },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  toast: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  toastText: { fontSize: 14, lineHeight: 20 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 10, alignSelf: 'flex-start' },
  tab: { paddingHorizontal: 22, paddingVertical: 8, borderRadius: 8, minHeight: 40, justifyContent: 'center' },
  tabText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  yearBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, minHeight: 40, justifyContent: 'center' },
  yearBtnText: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  year: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  monthCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderRadius: Radii.md },
  monthName: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.bold },
  monthMeta: { fontSize: 12, lineHeight: 16, marginTop: 3 },
  paid: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  paidAmount: { fontSize: 15, lineHeight: 22, fontFamily: Fonts?.mono, fontWeight: '700', color: '#15803d' },
  received: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  receivedText: { color: '#15803d', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  pending: { backgroundColor: 'rgba(232,168,40,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pendingText: { color: '#b45309', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  errorBox: { alignItems: 'center', gap: 12 },
  loanTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  loanTopPhone: { flexDirection: 'column' },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' },
  amount: { fontSize: 18, lineHeight: 24, fontFamily: FontWeights.bold },
  statusPill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 2, marginTop: 4 },
  fact: { fontSize: 13, lineHeight: 18 },
  strong: { fontFamily: FontWeights.semiBold },
  gapTop: { marginTop: 8 },
  progress: { marginTop: 10, gap: 4 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  historyBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  historyText: { fontSize: 13, lineHeight: 18 },
  repayments: { marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  trLine: { borderTopWidth: 1 },
  th: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  td: { fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: Fonts?.mono },
  colMonth: { flex: 1 },
  colAmt: { flex: 1.2 },
  rightText: { textAlign: 'right' },
  calc: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(104,15,26,0.08)' },
  calcText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
