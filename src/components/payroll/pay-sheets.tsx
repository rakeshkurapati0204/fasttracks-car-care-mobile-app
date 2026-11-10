import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { Checkbox } from '@/components/purchase/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createPayrollDisbursement, getErrorMessage } from '@/lib/api';
import type { PayrollDisbursementRow, PayrollResult } from '@/types/api';

import { formatINR, formatPaymentWindow, isWithinPaymentWindow, MONTH_NAMES } from './helpers';

const LOAN_MODE_LABELS: Record<string, string> = {
  MONTHLY_N: 'Monthly plan',
  CUSTOM: 'Custom plan',
  LUMP_NEXT_MONTH: 'Lump sum',
  TBD: 'TBD',
};

const MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'Cheque' },
];

function Mono({ children, style }: { children: ReactNode; style?: object }) {
  return <ThemedText style={[styles.mono, style]}>{children}</ThemedText>;
}

function Row({ left, right, leftColor, rightColor, bold }: { left: string; right: ReactNode; leftColor?: string; rightColor?: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText style={[styles.small, bold && styles.bold, { color: leftColor, flex: 1 }]}>{left}</ThemedText>
      <ThemedText style={[styles.small, bold && styles.bold, { color: rightColor }]}>{right}</ThemedText>
    </View>
  );
}

// ⚠ banner when today is outside the payment window.
function WindowNote({ month, year }: { month: number; year: number }) {
  const inWindow = isWithinPaymentWindow(new Date(), month, year);
  return (
    <View style={[styles.note, { backgroundColor: inWindow ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.12)' }]}>
      <ThemedText style={[styles.noteText, { color: inWindow ? '#16a34a' : '#ea580c' }]}>
        {`Payment window: ${formatPaymentWindow(month, year)}${inWindow ? '' : ' · ⚠ Today is outside this window'}`}
      </ThemedText>
    </View>
  );
}

type FormProps = {
  variant: 'mark' | 'disburse';
  userId: string;
  month: number;
  year: number;
  grossSalary: number;
  dailyRate: number;
  loanOutstanding: number;
  loanMonthlyDeduction: number;
  initialAbsentDays: string;
  initialMode?: string;
  initialNote?: string;
  scheduledPlan?: PayrollDisbursementRow['loanScheduledPlan'];
  unpaidIncentive?: number;
  onDone: () => void;
  onClose: () => void;
  // Called with the live "saving" flag so the sheet can lock itself.
  onSaving: (s: boolean) => void;
};

// The shared body of MarkPaidModal (from an employee row) and DisbursePayModal
// (from the bulk table). Both post the same POST /payroll/disbursement body.
// Absent Days is a day count: it's multiplied by the daily rate to get the
// rupee deduction. Advance Deduction is always manual, never auto-filled.
function PayForm(p: FormProps) {
  const theme = useTheme();
  const daysInMonth = new Date(p.year, p.month, 0).getDate();

  const [absentDays, setAbsentDays] = useState(p.initialAbsentDays);
  const [advanceDeduction, setAdvanceDeduction] = useState('');
  const [skipAdvance, setSkipAdvance] = useState(false);
  // Null until the cashier edits it; then it follows net payable.
  const [amountEdit, setAmountEdit] = useState<string | null>(null);
  const [mode, setMode] = useState(p.initialMode || 'CASH');
  const [note, setNote] = useState(p.initialNote || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const absentN = parseFloat(absentDays) || 0;
  const absentError = absentN < 0 ? 'Absent days cannot be negative.' : absentN > daysInMonth ? `Cannot exceed ${daysInMonth} days in this month.` : '';
  const attN = absentN * p.dailyRate;
  const rawAdvN = parseFloat(advanceDeduction) || 0;
  const advN = skipAdvance ? 0 : rawAdvN;
  const advanceError = !skipAdvance && rawAdvN > p.loanOutstanding ? `Cannot exceed the outstanding balance of ${formatINR(p.loanOutstanding)}.` : '';
  const totalDeductions = attN + advN;
  const netPayable = Math.max(0, p.grossSalary - totalDeductions);
  const amountPaid = amountEdit ?? String(Math.round(netPayable));

  const mark = p.variant === 'mark';
  const netGood = netPayable >= 0;
  const netBg = mark ? (netGood ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : 'rgba(99,102,241,0.08)';
  const netBorder = mark ? (netGood ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)') : 'rgba(99,102,241,0.2)';
  const netColor = mark ? (netGood ? '#16a34a' : '#dc2626') : theme.primary;

  const save = async () => {
    if (mark && (!amountPaid || isNaN(Number(amountPaid)))) { setErr('Enter a valid amount.'); return; }
    if (absentError) { setErr(absentError); return; }
    if (advanceError) { setErr(advanceError); return; }
    setSaving(true);
    p.onSaving(true);
    setErr('');
    try {
      await createPayrollDisbursement({
        userId: p.userId,
        month: p.month,
        year: p.year,
        grossSalary: p.grossSalary,
        // Rupees, not the day count: attN is already days × daily rate.
        attendanceDeduction: attN,
        advanceDeduction: advN,
        skipAdvanceDeduction: skipAdvance,
        loanDeduction: 0,
        totalDeductions,
        netPayable,
        amountPaid: parseFloat(amountPaid) || netPayable,
        mode,
        note: note || undefined,
      });
      p.onDone();
    } catch (e: unknown) {
      setErr(getErrorMessage(e, 'Failed to save.'));
      setSaving(false);
      p.onSaving(false);
    }
  };

  const plan = p.scheduledPlan ?? [];

  return (
    <>
      {err ? (
        <View style={styles.errBox}><ThemedText style={[styles.small, { color: '#dc2626' }]}>{err}</ThemedText></View>
      ) : null}

      <WindowNote month={p.month} year={p.year} />

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText themeColor="textMuted" style={styles.cardLabel}>Month</ThemedText>
        <ThemedText style={[styles.small, styles.semi]}>{`${MONTH_NAMES[p.month - 1]} ${p.year}`}</ThemedText>
      </View>

      <View style={[styles.gross, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText themeColor="textMuted" style={styles.small}>Gross Salary</ThemedText>
        <Mono style={[styles.grossAmt, { fontSize: mark ? 18 : 20 }]}>{formatINR(p.grossSalary)}</Mono>
      </View>

      {!mark && (p.unpaidIncentive ?? 0) > 0 ? (
        <View style={[styles.note, { backgroundColor: 'rgba(99,102,241,0.08)' }]}>
          <ThemedText themeColor="textSecondary" style={styles.noteText}>
            {`💡 Unpaid incentive: ${formatINR(p.unpaidIncentive!)} — paid separately, not included in this payment.`}
          </ThemedText>
        </View>
      ) : null}

      <View style={[styles.deductions, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText themeColor="textMuted" style={styles.deductionsTitle}>DEDUCTIONS</ThemedText>
        <View style={styles.gap12}>
          <Input
            label="Absent Days"
            value={absentDays}
            onChangeText={setAbsentDays}
            placeholder="0"
            keyboardType="decimal-pad"
            error={absentError || undefined}
            hint={absentError ? undefined : `${absentN} day${absentN === 1 ? '' : 's'} × ${formatINR(p.dailyRate)} = ${formatINR(attN)}`}
          />

          <View style={styles.gap8}>
            {p.loanOutstanding > 0 ? (
              <View style={[styles.mini, { backgroundColor: theme.backgroundElement }]}>
                <Row left="Outstanding Advance" right={formatINR(p.loanOutstanding)} bold />
                {p.loanMonthlyDeduction > 0 ? <Row left="Suggested monthly" right={formatINR(p.loanMonthlyDeduction)} leftColor={theme.textMuted} rightColor={theme.textMuted} /> : null}
              </View>
            ) : null}
            <View style={skipAdvance && { opacity: 0.5 }}>
              <Input
                label="Advance Deduction (₹)"
                value={advanceDeduction}
                onChangeText={setAdvanceDeduction}
                placeholder="0"
                keyboardType="decimal-pad"
                editable={!skipAdvance}
                error={advanceError || undefined}
                hint={
                  advanceError
                    ? undefined
                    : skipAdvance
                      ? `${formatINR(p.loanOutstanding)} — unchanged, deduction skipped.`
                      : p.loanOutstanding > 0
                        ? `Remaining after this payment: ${formatINR(Math.max(0, p.loanOutstanding - advN))}`
                        : undefined
                }
              />
            </View>
            {p.loanOutstanding > 0 ? <Checkbox label="Skip Advance Deduction This Month" checked={skipAdvance} onChange={setSkipAdvance} /> : null}
          </View>

          {/* Scheduled loans: display only, applied automatically on save. */}
          {plan.length > 0 ? (
            <View style={styles.gap8}>
              {plan.map((entry) => {
                if (entry.mode === 'TBD') {
                  return (
                    <View key={entry.loanId} style={[styles.mini, { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)' }]}>
                      <Row left={LOAN_MODE_LABELS[entry.mode]} right={`Suggested: ${formatINR(entry.suggestedAmount ?? 0)}`} leftColor="#92400e" rightColor="#92400e" bold />
                      <ThemedText style={[styles.small, { color: '#92400e', opacity: 0.85, marginTop: 3 }]}>
                        Not deducted automatically. To collect, set this loan&apos;s repayment plan.
                      </ThemedText>
                    </View>
                  );
                }
                const due = entry.plannedAmount;
                const thisMonth = Math.max(0, due - entry.carriedAmount);
                const capped = entry.cappedAmount < due;
                return (
                  <View key={entry.loanId} style={[styles.mini, { backgroundColor: theme.backgroundElement }]}>
                    <Row left={LOAN_MODE_LABELS[entry.mode]} right={formatINR(entry.cappedAmount)} bold />
                    {entry.mode === 'LUMP_NEXT_MONTH' ? (
                      <Row left="Full amount due" right={formatINR(due)} leftColor={theme.textMuted} rightColor={theme.textMuted} />
                    ) : (
                      <>
                        <Row left="Planned this month" right={formatINR(thisMonth)} leftColor={theme.textMuted} rightColor={theme.textMuted} />
                        {entry.carriedAmount > 0 ? <Row left="Carried from previous" right={formatINR(entry.carriedAmount)} leftColor="#b45309" rightColor="#b45309" /> : null}
                        <Row left="Due" right={formatINR(due)} bold />
                      </>
                    )}
                    <Row
                      left="Being deducted"
                      right={capped ? `${formatINR(entry.cappedAmount)} — capped by available pay` : formatINR(entry.cappedAmount)}
                      leftColor={capped ? '#dc2626' : theme.textMuted}
                      rightColor={capped ? '#dc2626' : theme.textMuted}
                    />
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
            <ThemedText themeColor="textMuted" style={styles.small}>Total Deductions</ThemedText>
            <ThemedText style={[styles.small, styles.bold, { color: totalDeductions > 0 ? '#dc2626' : theme.textMuted }]}>
              {totalDeductions > 0 ? `− ${formatINR(totalDeductions)}` : '—'}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={[styles.net, { backgroundColor: netBg, borderColor: netBorder }]}>
        <ThemedText style={[styles.body, styles.semi]}>Net Payable</ThemedText>
        <Mono style={[styles.netAmt, { color: netColor }]}>{formatINR(netPayable)}</Mono>
      </View>

      <Input
        label={mark ? 'Amount Paid (₹) *' : 'Amount Paid (₹)'}
        value={amountPaid}
        onChangeText={setAmountEdit}
        keyboardType="decimal-pad"
        hint="Override if actual amount differs from net payable"
      />
      <Select label="Payment Mode" value={mode} onChange={setMode} options={MODES} />
      <Input label="Notes (optional)" value={note} onChangeText={setNote} placeholder="e.g. Full salary paid" />

      <View style={styles.btns}>
        <Button variant="outline" size="sm" onPress={p.onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
        <Button size="sm" onPress={save} loading={saving} disabled={saving || !!absentError || !!advanceError} style={styles.flex1}>
          {saving ? 'Saving…' : 'Confirm Payment'}
        </Button>
      </View>
    </>
  );
}

// From an employee row (canPay roles only). Prefilled absent days = absent days
// plus half-days at 0.5, as a starting point the cashier can override.
export function MarkPaidSheet({ employee, month, year, onClose, onSaved }: { employee: PayrollResult; month: number; year: number; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const loanDeductions = employee.loanDeductions ?? [];
  // remainingAfter + amount rebuilds the pre-deduction balance exactly.
  const loanOutstanding = loanDeductions.reduce((s, l) => s + l.remainingAfter + l.amount, 0);
  const loanMonthlyDeduction = loanDeductions.reduce((s, l) => s + l.amount, 0);
  return (
    <Sheet visible onClose={onClose} locked={saving} title={`Confirm Salary Payment — ${employee.userName}`}>
      <PayForm
        variant="mark"
        userId={employee.userId!}
        month={month}
        year={year}
        grossSalary={employee.monthlySalary}
        dailyRate={employee.dailyRate}
        loanOutstanding={loanOutstanding}
        loanMonthlyDeduction={loanMonthlyDeduction}
        initialAbsentDays={String(Math.max(0, (employee.absentDays || 0) + (employee.halfDays || 0) * 0.5))}
        onSaving={setSaving}
        onClose={onClose}
        onDone={() => { onSaved(); onClose(); }}
      />
    </Sheet>
  );
}

// From the bulk Disburse table. A paid row is read-only: re-confirming is
// rejected by the server, so a correction goes through Undo.
export function DisbursePaySheet({ row, month, year, onClose, onSaved }: { row: PayrollDisbursementRow; month: number; year: number; onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();
  const [saving, setSaving] = useState(false);
  const existing = row.payment;
  // GET /disbursement has no daily rate: payrollService's own rule (÷30, or
  // February's real day count) is applied here.
  const divisor = month === 2 ? new Date(year, 2, 0).getDate() : 30;

  return (
    <Sheet visible onClose={onClose} locked={saving} title={`Pay Salary — ${row.name}`}>
      <WindowNote month={month} year={year} />
      <View style={styles.pair}>
        <View style={[styles.cell, { backgroundColor: theme.surface }]}>
          <ThemedText themeColor="textMuted" style={styles.cardLabel}>Employee</ThemedText>
          <ThemedText style={[styles.small, styles.semi]}>{row.name}</ThemedText>
        </View>
        <View style={[styles.cell, { backgroundColor: theme.surface }]}>
          <ThemedText themeColor="textMuted" style={styles.cardLabel}>Month</ThemedText>
          <ThemedText style={[styles.small, styles.semi]}>{`${MONTH_NAMES[month - 1]} ${year}`}</ThemedText>
        </View>
      </View>

      {existing ? (
        <>
          <View style={[styles.note, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
            <ThemedText style={[styles.body, styles.bold, { color: '#15803d' }]}>✓ Already paid</ThemedText>
          </View>
          <View style={[styles.deductions, { backgroundColor: theme.surface, borderColor: theme.border, gap: 8 }]}>
            <Row left="Amount Paid" right={formatINR(existing.amount)} leftColor={theme.textMuted} bold />
            <Row left="Attendance Deduction" right={formatINR(existing.attendanceDeduction || 0)} leftColor={theme.textMuted} />
            <Row left="Advance Deduction" right={existing.advanceSkipped ? 'Skipped' : formatINR(existing.advanceDeduction || 0)} leftColor={theme.textMuted} />
            <View style={[styles.totalRow, { borderTopColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={styles.small}>Mode</ThemedText>
              <ThemedText style={styles.small}>{existing.mode}</ThemedText>
            </View>
            <Row left="Paid" right={`${new Date(existing.paidAt).toLocaleString('en-IN')} by ${existing.paidBy}`} leftColor={theme.textMuted} />
          </View>
          <ThemedText themeColor="textMuted" style={styles.tiny}>To correct this payment, undo it first (Undo button on this row), then re-confirm.</ThemedText>
          <Button variant="outline" size="sm" onPress={onClose} fullWidth>Close</Button>
        </>
      ) : (
        <PayForm
          variant="disburse"
          userId={row.userId}
          month={month}
          year={year}
          grossSalary={row.grossSalary}
          dailyRate={row.grossSalary / divisor}
          loanOutstanding={row.loanOutstanding}
          loanMonthlyDeduction={row.loanMonthlyDeduction}
          // The disbursement response carries no absent-day count to prefill.
          initialAbsentDays="0"
          scheduledPlan={row.loanScheduledPlan}
          unpaidIncentive={row.unpaidIncentiveBalance}
          onSaving={setSaving}
          onClose={onClose}
          onDone={onSaved}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  mono: { fontFamily: Fonts?.mono, fontWeight: '700' },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  bold: { fontFamily: FontWeights.bold, fontWeight: '700' },
  semi: { fontFamily: FontWeights.semiBold },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  note: { padding: 8, borderRadius: 8 },
  noteText: { fontSize: 12, lineHeight: 16 },
  errBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.1)' },
  card: { padding: 12, borderWidth: 1, borderRadius: 8, gap: 2 },
  cardLabel: { fontSize: 11, lineHeight: 16 },
  gross: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  grossAmt: { lineHeight: 28 },
  deductions: { borderWidth: 1, borderRadius: 10, padding: 14 },
  deductionsTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6, marginBottom: 10 },
  mini: { padding: 10, borderRadius: 8, gap: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 6, borderTopWidth: 1 },
  net: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  netAmt: { fontSize: 22, lineHeight: 30, fontWeight: '800' },
  btns: { flexDirection: 'row', gap: 10, paddingTop: 8 },
  pair: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, padding: 12, borderRadius: Radii.sm, gap: 2 },
});
