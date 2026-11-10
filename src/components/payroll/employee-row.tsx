import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage, undoSalaryPayment } from '@/lib/api';
import type { PayrollResult, SalaryPaymentWithBreakdown } from '@/types/api';

import { AttendanceGrid } from './attendance-grid';
import { formatINR, isWithinPaymentWindow } from './helpers';
import { MarkPaidSheet } from './pay-sheets';

function Mono({ children, style }: { children: ReactNode; style?: object }) {
  return <ThemedText style={[styles.mono, style]}>{children}</ThemedText>;
}

function Line({ label, value, color, small, labelColor }: { label: string; value: ReactNode; color?: string; small?: boolean; labelColor?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.line}>
      <ThemedText style={[small ? styles.smallText : styles.body, { color: labelColor ?? color ?? theme.textSecondary, flex: 1 }]}>{label}</ThemedText>
      <ThemedText style={[small ? styles.smallText : styles.body, { color: color ?? theme.text }]}>{value}</ThemedText>
    </View>
  );
}

export function EmployeePayrollRow({
  result, wide, month, year, payment, canPay, canEditSalary, onSetSalary, onEditSalary, onPaymentChange, onRefresh,
}: {
  result: PayrollResult;
  wide: boolean;
  month: number;
  year: number;
  payment: SalaryPaymentWithBreakdown | null;
  canPay: boolean;
  canEditSalary: boolean;
  onPaymentChange: () => void;
  onSetSalary: (r: PayrollResult) => void;
  onEditSalary: (r: PayrollResult) => void;
  onRefresh: () => void;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState('');

  const handleUndo = () => {
    Alert.alert('Undo payment', 'Remove salary payment record for this month?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK',
        onPress: async () => {
          setUndoing(true);
          setUndoError('');
          try {
            await undoSalaryPayment({ userId: result.userId!, month, year });
            onPaymentChange();
          } catch (e: unknown) {
            // e.g. a later loan repayment blocks the undo; the server says why.
            setUndoError(getErrorMessage(e, 'Failed to undo the payment.'));
          } finally {
            setUndoing(false);
          }
        },
      },
    ]);
  };

  // Gross-vs-net gap for display: totalDeductions only tracks attendance / loan
  // / advance deductions and ignores a manual override, so the shown amount is
  // derived straight from gross vs net.
  const displayDeduction = Math.max(0, result.monthlySalary - result.netSalary);
  const displayDeductionPct = result.monthlySalary > 0 ? Math.round((displayDeduction / result.monthlySalary) * 100) : 0;

  // Once paid, prefer the recorded breakdown over the live scheduled forecast.
  // Payments from before the breakdown existed have grossSalary null and fall
  // back to the live figures.
  const hasBreakdown = !!payment && payment.grossSalary != null;
  const displayGross = hasBreakdown ? payment!.grossSalary! : result.monthlySalary;
  const liveAdvance = result.totalAdvanceDeduction ?? 0;
  const displayAdvance = hasBreakdown ? (payment!.advanceDeduction || 0) + (payment!.loanDeduction || 0) : liveAdvance;
  const displayNet = hasBreakdown ? payment!.netPayable! : result.netSalary;

  // Unconfigured employee (no salary set)
  if (result.isConfigured === false) {
    return (
      <View style={[styles.card, styles.dashed, styles.unset, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.flex1}>
          <ThemedText numberOfLines={1} style={styles.name}>{result.userName}</ThemedText>
          {result.designation ? <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.small}>{result.designation}</ThemedText> : null}
        </View>
        <View style={[styles.pill, { backgroundColor: 'rgba(232,168,40,0.15)' }]}>
          <ThemedText style={[styles.pillText, { color: theme.warning }]}>Salary not set</ThemedText>
        </View>
        {canEditSalary ? (
          <Pressable onPress={() => onSetSalary(result)} accessibilityRole="button" style={[styles.setBtn, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.setBtnText}>+ Set Salary</ThemedText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const presentGroup = result.presentDays + result.lateCount + result.halfDays;
  const absentGroup = result.absentDays + result.leaveDays;
  const lateHalf = [result.lateCount > 0 ? `${result.lateCount}L` : null, result.halfDays > 0 ? `${result.halfDays}H` : null].filter(Boolean).join('+');

  const counts = (
    <View style={styles.counts}>
      <Mono style={{ color: theme.success }}>{`${presentGroup}P`}</Mono>
      {lateHalf ? <Mono style={styles.lateHalf}>{lateHalf}</Mono> : null}
      <Mono style={{ color: theme.danger }}>{`${absentGroup}A`}</Mono>
    </View>
  );

  const money = (
    <View style={wide ? styles.moneyWide : styles.money}>
      <Mono style={styles.net}>{formatINR(result.netSalary)}</Mono>
      <ThemedText themeColor="textMuted" style={styles.small}>{`gross ${formatINR(result.monthlySalary)}`}</ThemedText>
      {displayDeduction > 0 ? <ThemedText style={[styles.small, { color: theme.danger }]}>{`-${formatINR(displayDeduction)} (${displayDeductionPct}%)`}</ThemedText> : null}
    </View>
  );

  const pills = (
    <View style={styles.pills}>
      {liveAdvance > 0 ? (
        <View style={[styles.pill, { backgroundColor: '#dc2626' }]}>
          <ThemedText style={[styles.pillText, { color: '#ffffff' }]}>{`Adv -${formatINR(liveAdvance)}`}</ThemedText>
        </View>
      ) : null}
      {payment ? (
        <View style={[styles.pill, styles.paid]}>
          <Ionicons name="checkmark" size={12} color="#15803d" />
          <ThemedText style={[styles.pillText, { color: '#15803d' }]}>Paid</ThemedText>
        </View>
      ) : null}
      {payment && canPay ? (
        <Pressable onPress={handleUndo} disabled={undoing} accessibilityRole="button" hitSlop={8} style={styles.undo}>
          <ThemedText style={[styles.undoText, { color: theme.danger }]}>{undoing ? 'Undoing…' : 'Undo'}</ThemedText>
        </Pressable>
      ) : null}
      {!payment && canPay ? (
        <Pressable onPress={() => setShowPay(true)} accessibilityRole="button" style={[styles.markBtn, { borderColor: theme.primary }]}>
          <ThemedText style={[styles.markBtnText, { color: theme.primary }]}>Mark Paid</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Pressable onPress={() => setExpanded((e) => !e)} accessibilityRole="button" accessibilityState={{ expanded }} style={styles.summary}>
        {wide ? (
          <View style={styles.summaryRow}>
            <View style={styles.flex1}>
              <ThemedText numberOfLines={1} style={styles.name}>{result.userName}</ThemedText>
              {result.designation ? <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.small}>{result.designation}</ThemedText> : null}
            </View>
            {counts}
            {money}
            {pills}
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
          </View>
        ) : (
          <View style={styles.stack}>
            <View style={styles.summaryRow}>
              <View style={styles.flex1}>
                <ThemedText numberOfLines={1} style={styles.name}>{result.userName}</ThemedText>
                {result.designation ? <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.small}>{result.designation}</ThemedText> : null}
              </View>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.flex1}>{money}</View>
              {counts}
            </View>
            {liveAdvance > 0 || payment || canPay ? pills : null}
          </View>
        )}
      </Pressable>

      {undoError ? <ThemedText style={[styles.small, { color: theme.danger, paddingHorizontal: 20, paddingBottom: 12 }]}>{undoError}</ThemedText> : null}
      {showPay ? (
        <MarkPaidSheet employee={result} month={month} year={year} onClose={() => setShowPay(false)} onSaved={onPaymentChange} />
      ) : null}

      {expanded ? (
        <View style={[styles.expanded, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}>
          <ThemedText themeColor="textMuted" style={[styles.small, { marginTop: 16, marginBottom: 8 }]}>
            {'Cycle: '}
            <ThemedText style={[styles.small, styles.bold]}>{`${result.cycleStart} → ${result.cycleEnd}`}</ThemedText>
            {' · Daily rate: '}
            <ThemedText style={[styles.small, styles.bold]}>{formatINR(result.dailyRate)}</ThemedText>
          </ThemedText>

          <View style={styles.breakdown}>
            <View style={styles.line}>
              <ThemedText themeColor="textSecondary" style={[styles.body, styles.flex1]}>Gross Salary</ThemedText>
              <View style={styles.grossRight}>
                <ThemedText style={styles.body}>{formatINR(displayGross)}</ThemedText>
                {canEditSalary ? (
                  <Pressable onPress={() => onEditSalary(result)} accessibilityRole="button" style={[styles.editBtn, { borderColor: theme.border }]}>
                    <ThemedText style={[styles.editBtnText, { color: theme.primary }]}>Edit</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            </View>
            <Line label={`Earned (${result.payableDays} attendance days)`} value={formatINR(result.earnedSalary ?? result.monthlySalary)} />
            {result.absentDays > 0 ? <Line label={`Absent (${result.absentDays} days — not counted)`} value="—" color={theme.textMuted} /> : null}
            {result.halfDays > 0 ? <Line label={`Half days (${result.halfDays} × 0.5 — in attendance days)`} value="—" color={theme.textMuted} /> : null}
            {result.lateDeduction > 0 ? (
              <Line
                label={`Late penalty (${result.lateFullDays > 0 ? `${result.lateFullDays}d ` : ''}${result.lateHalfDays > 0 ? `${result.lateHalfDays}½d` : ''})`}
                value={`-${formatINR(result.lateDeduction)}`}
                color={theme.danger}
              />
            ) : null}
            {result.carriedLates > 0 && result.carriedLateDeduction > 0 ? (
              <Line
                small
                label={`↳ Carryover lates (prev. month): ${result.carriedLates} lates`}
                value={`-${formatINR(result.carriedLateDeduction)}`}
                color={theme.danger}
              />
            ) : null}
            <View style={[styles.line, styles.ruled, { borderTopColor: theme.border }]}>
              <ThemedText style={[styles.body, styles.medium, styles.flex1]}>Subtotal (after late penalties)</ThemedText>
              <ThemedText style={[styles.body, styles.medium]}>{formatINR(Math.max(0, (result.earnedSalary ?? result.monthlySalary) - (result.lateDeduction ?? 0)))}</ThemedText>
            </View>
            <View style={[styles.line, styles.advance]}>
              <ThemedText style={[styles.body, { color: '#92400e', flex: 1 }]}>Advance Deductions</ThemedText>
              <ThemedText style={[styles.body, { color: '#92400e' }]}>{displayAdvance > 0 ? `-${formatINR(displayAdvance)}` : '—'}</ThemedText>
            </View>
            {!hasBreakdown && result.totalLoanDeduction > 0 ? (
              <Line label="Loan deduction" value={`-${formatINR(result.totalLoanDeduction)}`} color={theme.danger} />
            ) : null}
            <View style={[styles.line, styles.ruled, { borderTopColor: theme.border }]}>
              <ThemedText style={[styles.netLabel, styles.flex1]}>Net Payable</ThemedText>
              <ThemedText style={[styles.netLabel, { color: theme.success }]}>{formatINR(displayNet)}</ThemedText>
            </View>
          </View>

          {/* Two groups: earning days (Present) and non-earning days (Absent) */}
          <View style={styles.twoCol}>
            <View style={[styles.statBox, { backgroundColor: theme.surface }]}>
              <Mono style={[styles.statNum, { color: theme.success }]}>{presentGroup}</Mono>
              <ThemedText style={styles.statLabel}>Present</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.tiny}>
                {[
                  result.presentDays > 0 ? `${result.presentDays} Present` : null,
                  result.lateCount > 0 ? `${result.lateCount} Late` : null,
                  result.halfDays > 0 ? `${result.halfDays} Half Day` : null,
                ].filter(Boolean).join(' · ') || '0 days'}
              </ThemedText>
            </View>
            <View style={[styles.statBox, { backgroundColor: theme.surface }]}>
              <Mono style={[styles.statNum, { color: theme.danger }]}>{absentGroup}</Mono>
              <ThemedText style={styles.statLabel}>Absent</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.tiny}>
                {[
                  result.absentDays > 0 ? `${result.absentDays} Absent` : null,
                  result.leaveDays > 0 ? `${result.leaveDays} Leave` : null,
                ].filter(Boolean).join(' · ') || '0 days'}
              </ThemedText>
            </View>
          </View>

          {result.lateCount > 0 ? (
            <View style={[styles.lateBox, { backgroundColor: theme.surface }]}>
              <ThemedText style={[styles.small, styles.semi, { color: '#92400e', marginBottom: 8 }]}>Late Analysis</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.small}>
                {`${result.lateCount} late(s) this month${result.carriedLates > 0 ? ` + ${result.carriedLates} carried in = ${result.lateCount + result.carriedLates} total` : ''}`}
              </ThemedText>
              <View style={styles.lateLines}>
                {result.lateFullDays > 0 ? <ThemedText style={[styles.small, { color: theme.danger }]}>{`−${result.lateFullDays} full day(s) deducted`}</ThemedText> : null}
                {result.lateHalfDays > 0 ? <ThemedText style={[styles.small, { color: '#f59e0b' }]}>{`−${result.lateHalfDays} half day(s) deducted`}</ThemedText> : null}
                {result.lateFullDays === 0 && result.lateHalfDays === 0 ? <ThemedText themeColor="textMuted" style={styles.small}>No deduction yet</ThemedText> : null}
                {result.lateCarryForward > 0 ? <ThemedText style={[styles.small, { color: '#f59e0b' }]}>{`↪ ${result.lateCarryForward} late(s) carrying to next month`}</ThemedText> : null}
              </View>
            </View>
          ) : null}

          {payment ? (
            <View style={styles.banner}>
              <View style={styles.flex1}>
                <ThemedText style={[styles.small, styles.semi, { color: '#15803d' }]}>{`Salary Paid — ${formatINR(payment.amount)}`}</ThemedText>
                <ThemedText style={[styles.tiny, { color: '#166534', marginTop: 2 }]}>
                  {`via ${payment.mode || 'Cash'} · by ${payment.paidBy?.name} · ${new Date(payment.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                  {payment.paidAt && !isWithinPaymentWindow(new Date(payment.paidAt), month, year) ? <ThemedText style={[styles.small, { color: '#f97316' }]}>{' ⚠'}</ThemedText> : null}
                </ThemedText>
              </View>
              <Ionicons name="checkmark" size={20} color="#15803d" />
            </View>
          ) : null}

          {result.attendanceDetails && result.attendanceDetails.length > 0 && result.userId ? (
            <AttendanceGrid details={result.attendanceDetails} userId={result.userId} month={month} year={year} onRefresh={onRefresh} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  dashed: { borderStyle: 'dashed' },
  unset: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, flexWrap: 'wrap' },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 16 },
  tiny: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20 },
  smallText: { fontSize: 12, lineHeight: 18 },
  bold: { fontFamily: FontWeights.bold, fontWeight: '700' },
  semi: { fontFamily: FontWeights.semiBold },
  medium: { fontFamily: FontWeights.medium },
  mono: { fontFamily: Fonts?.mono, fontSize: 12, lineHeight: 18 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  paid: { backgroundColor: 'rgba(34,197,94,0.15)' },
  undo: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 6, opacity: 0.8 },
  undoText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold },
  markBtn: { minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  markBtnText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  setBtn: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  setBtnText: { color: '#ffffff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  summary: { paddingHorizontal: 20, paddingVertical: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stack: { gap: 10 },
  counts: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lateHalf: { fontSize: 10, color: '#f59e0b', opacity: 0.8 },
  money: { alignItems: 'flex-start' },
  moneyWide: { alignItems: 'flex-end' },
  net: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  pills: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  expanded: { paddingHorizontal: 20, paddingBottom: 20, borderTopWidth: 1 },
  breakdown: { gap: 4, marginTop: 4 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  ruled: { borderTopWidth: 1, paddingTop: 4, marginTop: 4 },
  grossRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editBtn: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderRadius: 4 },
  editBtnText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  advance: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(245,158,11,0.07)' },
  netLabel: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.bold, fontWeight: '700' },
  twoCol: { flexDirection: 'row', gap: 12, marginTop: 12 },
  statBox: { flex: 1, borderRadius: 8, padding: 12 },
  statNum: { fontSize: 20, lineHeight: 28, fontWeight: '700' },
  statLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  lateBox: { marginTop: 12, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  lateLines: { marginTop: 6, gap: 2 },
  banner: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
});
