import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchPayrollDisbursement, getErrorMessage, undoSalaryPayment } from '@/lib/api';
import type { PayrollDisbursementRow } from '@/types/api';

import { formatINR, isWithinPaymentWindow } from './helpers';
import { DisbursePaySheet } from './pay-sheets';

const COLS = [
  { key: 'emp', header: 'Employee', width: 170 },
  { key: 'gross', header: 'Gross Salary', width: 110 },
  { key: 'att', header: 'Attendance Deduction', width: 150 },
  { key: 'adv', header: 'Advance Deduction', width: 130 },
  { key: 'net', header: 'Net Payable', width: 110 },
  { key: 'status', header: 'Status', width: 190 },
  { key: 'action', header: 'Action', width: 80 },
];

function Mono({ children, style }: { children: ReactNode; style?: object }) {
  return <ThemedText style={[styles.mono, style]}>{children}</ThemedText>;
}

// The "Disburse Salaries" view: totals and the per-employee table (cards on a
// phone). `reloadKey` re-fetches after a pull-to-refresh on the page.
export function DisburseView({ month, year, wide, reloadKey }: { month: number; year: number; wide: boolean; reloadKey: number }) {
  const theme = useTheme();
  const [data, setData] = useState<PayrollDisbursementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payModal, setPayModal] = useState<PayrollDisbursementRow | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await fetchPayrollDisbursement(year, month)) || []);
    } catch {
      setData([]);
    }
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change / refresh
    load();
  }, [load, reloadKey]);

  // The bulk table needs Undo too: re-confirming a paid month is rejected, so
  // there is no "Update" path for a correction.
  const handleUndo = (row: PayrollDisbursementRow) => {
    Alert.alert('Undo payment', `Remove salary payment record for ${row.name} this month?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK',
        onPress: async () => {
          setUndoingId(row.userId);
          setError('');
          try {
            await undoSalaryPayment({ userId: row.userId, month, year });
            await load();
          } catch (e: unknown) {
            // e.g. a later loan repayment blocks the undo; the server says why.
            setError(getErrorMessage(e, 'Failed to undo the payment.'));
          } finally {
            setUndoingId(null);
          }
        },
      },
    ]);
  };

  const totalNet = data.reduce((s, r) => s + r.netPayable, 0);
  const totalPaid = data.filter((r) => r.payment).reduce((s, r) => s + (r.payment?.amount || 0), 0);
  const unpaidRows = data.filter((r) => !r.payment);
  const unpaid = unpaidRows.length;

  const copyUnpaid = async () => {
    await Clipboard.setStringAsync(unpaidRows.map((r, i) => `${i + 1}. ${r.name} - ${formatINR(r.netPayable)}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const cards = [
    { label: 'Total Net Payable', value: formatINR(totalNet), color: theme.text },
    { label: 'Total Disbursed', value: formatINR(totalPaid), color: '#16a34a' },
    { label: 'Yet to Pay', value: `${unpaid} employee${unpaid !== 1 ? 's' : ''}`, color: unpaid > 0 ? '#dc2626' : '#16a34a' },
  ];

  // What was actually recorded replaces the scheduled forecast once paid.
  // grossSalary != null is a safe "has a stored breakdown" check: the five
  // figures are written together; older payments fall back to the forecast.
  const figures = (row: PayrollDisbursementRow) => {
    const paid = !!row.payment;
    const has = paid && row.payment!.grossSalary != null;
    return {
      paid,
      gross: has ? row.payment!.grossSalary! : row.grossSalary,
      att: has ? (row.payment!.attendanceDeduction ?? 0) : row.attendanceDeduction,
      adv: has ? (row.payment!.advanceDeduction || 0) + (row.payment!.loanDeduction || 0) : row.advanceDeduction + row.loanDeduction,
      net: has ? row.payment!.netPayable! : row.netPayable,
    };
  };

  const attEl = (v: number) => <Mono style={{ color: v > 0 ? '#dc2626' : theme.textMuted }}>{v > 0 ? `-${formatINR(v)}` : '₹0'}</Mono>;
  const advEl = (v: number) => <Mono style={{ color: v > 0 ? '#dc2626' : theme.textMuted }}>{v > 0 ? `−${formatINR(v)}` : '—'}</Mono>;

  const statusEl = (row: PayrollDisbursementRow) =>
    row.payment ? (
      <View>
        <View style={styles.statusLine}>
          <View style={[styles.pill, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
            <ThemedText style={[styles.pillText, { color: '#16a34a' }]}>✓ PAID</ThemedText>
          </View>
          <Pressable onPress={() => handleUndo(row)} disabled={undoingId === row.userId} accessibilityRole="button" hitSlop={8} style={styles.undo}>
            <ThemedText style={[styles.undoText, { color: theme.danger }]}>{undoingId === row.userId ? 'Undoing…' : 'Undo'}</ThemedText>
          </Pressable>
        </View>
        <ThemedText themeColor="textMuted" style={styles.tiny}>
          {`${formatINR(row.payment.amount)} · ${row.payment.mode} · ${new Date(row.payment.paidAt).toLocaleDateString('en-IN')}`}
          {row.payment.paidAt && !isWithinPaymentWindow(new Date(row.payment.paidAt), month, year) ? <ThemedText style={[styles.tiny, { color: '#f97316' }]}>{' ⚠'}</ThemedText> : null}
        </ThemedText>
      </View>
    ) : (
      <View style={[styles.pill, { backgroundColor: 'rgba(239,68,68,0.1)', alignSelf: 'flex-start' }]}>
        <ThemedText style={[styles.pillText, { color: '#dc2626' }]}>UNPAID</ThemedText>
      </View>
    );

  const actionEl = (row: PayrollDisbursementRow, paid: boolean) => (
    <Pressable
      onPress={() => setPayModal(row)}
      accessibilityRole="button"
      style={[styles.actionBtn, paid ? { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 } : { backgroundColor: theme.primary }]}>
      <ThemedText style={[styles.actionText, { color: paid ? theme.text : '#ffffff' }]}>{paid ? 'View' : 'Pay'}</ThemedText>
    </Pressable>
  );

  return (
    <View>
      <View style={[styles.cards, !wide && styles.cardsPhone]}>
        {cards.map((c) => (
          <View key={c.label} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.flex1]}>
            <View style={styles.cardHead}>
              <ThemedText themeColor="textMuted" style={styles.cardLabel}>{c.label}</ThemedText>
              {c.label === 'Yet to Pay' && unpaid > 0 ? (
                <Pressable onPress={copyUnpaid} accessibilityRole="button" accessibilityLabel="Copy who's-still-unpaid list" hitSlop={8}>
                  <ThemedText style={[styles.copy, { color: theme.primary }]}>{copied ? 'Copied' : 'Copy'}</ThemedText>
                </Pressable>
              ) : null}
            </View>
            <ThemedText style={[styles.cardValue, { color: c.color }]}>{c.value}</ThemedText>
          </View>
        ))}
      </View>

      {error ? <View style={styles.mb}><ErrorBanner message={error} /></View> : null}

      {loading ? (
        <View style={styles.gap}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={wide ? 48 : 150} />)}</View>
      ) : wide ? (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.hscroll}>
          <View style={[styles.table, { minWidth: COLS.reduce((s, c) => s + c.width, 0) }]}>
            <View style={[styles.tr, styles.thRow, { borderBottomColor: theme.border }]}>
              {COLS.map((c) => (
                <View key={c.key} style={[styles.td, { flexBasis: c.width, flexGrow: c.width }]}>
                  <ThemedText themeColor="textMuted" style={styles.th}>{c.header}</ThemedText>
                </View>
              ))}
            </View>
            {data.map((row) => {
              const f = figures(row);
              const w = (k: string) => { const c = COLS.find((x) => x.key === k)!; return { flexBasis: c.width, flexGrow: c.width }; };
              return (
                <View key={row.userId} style={[styles.tr, { borderBottomColor: theme.border }, f.paid && { backgroundColor: 'rgba(34,197,94,0.04)' }]}>
                  <View style={[styles.td, w('emp')]}>
                    <ThemedText style={styles.name}>{row.name}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.tiny}>{`${row.role}${row.branch ? ` · ${row.branch}` : ''}`}</ThemedText>
                  </View>
                  <View style={[styles.td, w('gross')]}><Mono>{formatINR(f.gross)}</Mono></View>
                  <View style={[styles.td, w('att')]}>{attEl(f.att || 0)}</View>
                  <View style={[styles.td, w('adv')]}>{advEl(f.adv)}</View>
                  <View style={[styles.td, w('net')]}><Mono style={styles.bold}>{formatINR(f.net)}</Mono></View>
                  <View style={[styles.td, w('status')]}>{statusEl(row)}</View>
                  <View style={[styles.td, w('action')]}>{actionEl(row, f.paid)}</View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.gap}>
          {data.map((row) => {
            const f = figures(row);
            const kv = (k: string, v: ReactNode) => (
              <View style={styles.kv}>
                <ThemedText themeColor="textMuted" style={styles.k}>{k}</ThemedText>
                <View style={styles.v}>{v}</View>
              </View>
            );
            return (
              <View
                key={row.userId}
                style={[styles.rowCard, { backgroundColor: f.paid ? 'rgba(34,197,94,0.04)' : theme.surface, borderColor: theme.border }]}>
                <ThemedText style={styles.name}>{row.name}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.tiny}>{`${row.role}${row.branch ? ` · ${row.branch}` : ''}`}</ThemedText>
                {kv('Gross Salary', <Mono>{formatINR(f.gross)}</Mono>)}
                {kv('Attendance Deduction', attEl(f.att || 0))}
                {kv('Advance Deduction', advEl(f.adv))}
                {kv('Net Payable', <Mono style={styles.bold}>{formatINR(f.net)}</Mono>)}
                {kv('Status', statusEl(row))}
                <View style={styles.actionRow}>{actionEl(row, f.paid)}</View>
              </View>
            );
          })}
          {data.length === 0 ? <ThemedText themeColor="textMuted" style={styles.empty}>No employees to disburse.</ThemedText> : null}
        </View>
      )}

      {payModal ? (
        <DisbursePaySheet
          row={payModal}
          month={month}
          year={year}
          onClose={() => setPayModal(null)}
          onSaved={() => { setPayModal(null); load(); }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  mono: { fontFamily: Fonts?.mono, fontSize: 13, lineHeight: 18 },
  bold: { fontWeight: '700' },
  name: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  tiny: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  mb: { marginBottom: 12 },
  gap: { gap: 12 },
  cards: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  cardsPhone: { flexDirection: 'column' },
  card: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardLabel: { fontSize: 11, lineHeight: 16 },
  cardValue: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold, fontWeight: '700' },
  copy: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  hscroll: { flexGrow: 1 },
  table: { flexGrow: 1 },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  thRow: { borderBottomWidth: 2 },
  td: { paddingHorizontal: 12, paddingVertical: 10, minWidth: 0 },
  th: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  pillText: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.bold },
  undo: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 6, opacity: 0.8 },
  undoText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold },
  actionBtn: { minHeight: 36, paddingHorizontal: 14, borderRadius: 6, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  actionText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  rowCard: { borderWidth: 1, borderRadius: Radii.lg, padding: 14, gap: 6 },
  kv: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  k: { width: 128, fontSize: 12, lineHeight: 18 },
  v: { flex: 1, minWidth: 0 },
  actionRow: { paddingTop: 6 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 32 },
});
