import { Children, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Loan } from '@/types/api';

export type RepaymentMode = 'MONTHLY_N' | 'LUMP_NEXT_MONTH' | 'TBD' | 'CUSTOM';
type ScheduleRow = { month: number; year: number; plannedAmount: number };

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ₹10,000: Indian grouping, no decimals (the dashboard's Intl INR format).
export function fmt(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

// Month/year sequence + even split, mirroring the backend's buildEvenSchedule()
// (paise-integer math, last month absorbs the remainder).
function nextMonthFrom(base: Date): { month: number; year: number } {
  const m = base.getMonth() + 2;
  return m > 12 ? { month: m - 12, year: base.getFullYear() + 1 } : { month: m, year: base.getFullYear() };
}
function buildEvenSplitPreview(amount: number, tenureMonths: number): ScheduleRow[] {
  const amountPaise = Math.round(amount * 100);
  const perMonthPaise = Math.floor(amountPaise / tenureMonths);
  const entries: ScheduleRow[] = [];
  let { month, year } = nextMonthFrom(new Date());
  let running = 0;
  for (let i = 0; i < tenureMonths; i++) {
    const isLast = i === tenureMonths - 1;
    const planPaise = isLast ? amountPaise - running : perMonthPaise;
    entries.push({ month, year, plannedAmount: planPaise / 100 });
    running += planPaise;
    const next = nextMonthFrom(new Date(year, month - 1, 1));
    month = next.month;
    year = next.year;
  }
  return entries;
}

// The dashboard's two-column grid inside the modal; one column on a phone.
function Grid({ cols, children }: { cols: number; children: ReactNode }) {
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((item, c) => <View key={c} style={styles.cell}>{item}</View>)}
          {Array.from({ length: cols - row.length }).map((_, k) => <View key={`p${k}`} style={styles.cell} />)}
        </View>
      ))}
    </View>
  );
}

function Notice({ tone, children }: { tone: 'blue' | 'amber'; children: string }) {
  const bg = tone === 'blue' ? 'rgba(59,130,246,0.08)' : 'rgba(245,158,11,0.12)';
  const fg = tone === 'blue' ? '#2563eb' : '#b45309';
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <ThemedText style={[styles.noticeText, { color: fg }]}>{children}</ThemedText>
    </View>
  );
}

// ─── Approve / Reject ───────────────────────────────────────────────────────
export function ActionSheet({
  action, name, loading, error, onConfirm, onCancel,
}: {
  action: 'approve' | 'reject'; name: string; loading: boolean; error: string;
  onConfirm: (note: string) => void; onCancel: () => void;
}) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const reject = action === 'reject';
  const blocked = loading || (reject && !note.trim());
  return (
    <Sheet
      visible
      onClose={onCancel}
      locked={loading}
      title={`${reject ? 'Reject' : 'Approve'} Request`}
      footer={
        <>
          <Button variant="outline" onPress={onCancel} style={styles.flex1}>Cancel</Button>
          <Pressable
            onPress={() => onConfirm(note)}
            disabled={blocked}
            accessibilityRole="button"
            style={[styles.confirm, { backgroundColor: reject ? '#b91c1c' : '#15803d' }, blocked && { opacity: 0.6 }]}>
            <ThemedText style={styles.confirmLabel}>{loading ? 'Processing…' : reject ? 'Reject' : 'Approve'}</ThemedText>
          </Pressable>
        </>
      }>
      <ThemedText themeColor="textMuted" style={styles.body}>
        {reject ? 'Rejecting' : 'Approving'} request from <ThemedText style={styles.bold}>{name}</ThemedText>.
      </ThemedText>
      <Input
        label={reject ? 'Rejection reason (required)' : 'Note (optional)'}
        value={note}
        onChangeText={setNote}
        placeholder={reject ? 'Why is this being rejected?' : 'Any notes...'}
        multiline
      />
      {error ? <ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

// ─── Add / Edit advance ─────────────────────────────────────────────────────
export function LoanSheet({
  loan, employees, wide, loading, error, onSave, onCancel,
}: {
  loan?: Loan;
  employees: { id: string; name: string }[];
  wide: boolean;
  loading: boolean;
  error: string;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const isEdit = !!loan;
  const [userId, setUserId] = useState(loan?.user?.id ?? '');
  const [amount, setAmount] = useState(loan ? String(loan.amount) : '');
  const [remaining, setRemaining] = useState(loan ? String(loan.remainingAmount) : '');
  const [monthly, setMonthly] = useState(loan ? String(loan.monthlyDeductionAmount) : '');
  const [notes, setNotes] = useState(loan?.notes ?? '');
  const [status, setStatus] = useState<string>(loan?.status ?? 'APPROVED');

  // Create only: editing a loan's mode/schedule isn't offered on the dashboard.
  const [mode, setMode] = useState<RepaymentMode | ''>('');
  const [tenure, setTenure] = useState('');
  const [customSchedule, setCustomSchedule] = useState<ScheduleRow[]>([]);
  const [scheduleKey, setScheduleKey] = useState('');

  const amountNum = Number(amount) || 0;
  const tenureNum = Number(tenure) || 0;
  const showTenureField = mode === 'MONTHLY_N' || mode === 'CUSTOM';
  const showDerivedMonthly = mode === 'MONTHLY_N' && amountNum > 0 && tenureNum > 0;

  // Seed/reseed the CUSTOM grid only when its inputs change (not per keystroke
  // of a row), so manual overrides aren't wiped mid-edit. Derived during
  // render from a key, so no effect is needed.
  const key = `${mode}|${tenureNum}|${amountNum}`;
  if (key !== scheduleKey) {
    setScheduleKey(key);
    if (mode !== 'CUSTOM' || !amountNum || tenureNum < 1) setCustomSchedule([]);
    else if (customSchedule.length !== tenureNum) setCustomSchedule(buildEvenSplitPreview(amountNum, tenureNum));
  }

  const customTotal = customSchedule.reduce((s, e) => s + e.plannedAmount, 0);
  const customDiff = Math.round((amountNum - customTotal) * 100) / 100;

  const canSaveCreate =
    !!userId && !!amount && !!mode && (!showTenureField || tenureNum >= 1) && (mode === 'CUSTOM' ? customSchedule.length === tenureNum : true);
  const disabled = loading || (isEdit ? !amount : !canSaveCreate);

  const save = () => {
    if (isEdit) {
      if (!amount) return;
      onSave({ amount: Number(amount), remainingAmount: Number(remaining), monthlyDeductionAmount: Number(monthly), notes, status });
      return;
    }
    if (!canSaveCreate) return;
    const data: Record<string, unknown> = { userId, amount: amountNum, notes, repaymentMode: mode };
    if (showTenureField) data.tenureMonths = tenureNum;
    if (mode === 'CUSTOM') data.scheduleEntries = customSchedule.map((e) => e.plannedAmount);
    onSave(data);
  };

  const employeeOptions = [...employees].sort((a, b) => a.name.localeCompare(b.name)).map((e) => ({ value: e.id, label: e.name }));

  return (
    <Sheet
      visible
      onClose={onCancel}
      locked={loading}
      title={isEdit ? `Edit Advance — ${loan!.user.name}` : 'Add New Advance'}
      footer={
        <>
          <Button variant="outline" onPress={onCancel} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} disabled={disabled} loading={loading} style={styles.flex1}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Advance'}
          </Button>
        </>
      }>
      {!isEdit ? (
        <Select label="Employee" required placeholder="Select employee…" options={employeeOptions} value={userId} onChange={setUserId} />
      ) : null}

      <Grid cols={wide ? 2 : 1}>
        <Input
          label="Total Advance Amount (₹)"
          required
          keyboardType="decimal-pad"
          placeholder="e.g. 10000"
          value={amount}
          onChangeText={(t) => { setAmount(t); if (!isEdit) setRemaining(t); }}
        />
        {isEdit ? <Input label="Remaining Amount (₹)" keyboardType="decimal-pad" value={remaining} onChangeText={setRemaining} /> : null}
        {isEdit ? (
          <Input label="Monthly Deduction (₹)" keyboardType="decimal-pad" placeholder="e.g. 2000 (0 = TBD)" value={monthly} onChangeText={setMonthly} />
        ) : (
          <Select
            label="Repayment Mode"
            required
            placeholder="Select mode…"
            value={mode}
            onChange={(v) => setMode(v as RepaymentMode)}
            options={[
              { value: 'MONTHLY_N', label: 'Monthly, over N months' },
              { value: 'LUMP_NEXT_MONTH', label: 'Lump sum, next month' },
              { value: 'TBD', label: 'TBD (no auto-deduction)' },
              { value: 'CUSTOM', label: 'Custom per-month' },
            ]}
          />
        )}
        {isEdit ? (
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'APPROVED', label: 'Approved' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'REJECTED', label: 'Rejected' },
            ]}
          />
        ) : null}
        {!isEdit && showTenureField ? (
          <Input label="Months (N)" required keyboardType="number-pad" placeholder="e.g. 5" value={tenure} onChangeText={setTenure} />
        ) : null}
      </Grid>

      {!isEdit && showDerivedMonthly ? <Notice tone="blue">{`≈ ${fmt(amountNum / tenureNum)}/month for ${tenureNum} months`}</Notice> : null}

      {!isEdit && mode === 'CUSTOM' && customSchedule.length > 0 ? (
        <View style={styles.gap8}>
          <View style={styles.scheduleHead}>
            <ThemedText themeColor="textSecondary" style={styles.label}>Per-Month Schedule (editable)</ThemedText>
            <Pressable onPress={() => setCustomSchedule(buildEvenSplitPreview(amountNum, tenureNum))} accessibilityRole="button" hitSlop={8}>
              <ThemedText style={[styles.reset, { color: theme.primary }]}>Reset to even split</ThemedText>
            </Pressable>
          </View>
          <View style={[styles.schedule, { borderColor: theme.border }]}>
            {customSchedule.map((entry, i) => (
              <View key={i} style={styles.scheduleRow}>
                <ThemedText themeColor="textMuted" style={styles.month}>{`${MONTH_NAMES[entry.month - 1]} ${entry.year}`}</ThemedText>
                <View style={styles.flex1}>
                  <Input
                    keyboardType="decimal-pad"
                    value={String(entry.plannedAmount)}
                    onChangeText={(t) => {
                      const v = Number(t) || 0;
                      setCustomSchedule((prev) => prev.map((row, ri) => (ri === i ? { ...row, plannedAmount: v } : row)));
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
          {Math.abs(customDiff) > 0.004 ? (
            <Notice tone="amber">
              {`Schedule totals ${fmt(customTotal)} but loan is ${fmt(amountNum)} (${customDiff > 0 ? `${fmt(customDiff)} short` : `${fmt(-customDiff)} over`})`}
            </Notice>
          ) : null}
        </View>
      ) : null}

      <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Any notes…" multiline />
      {error ? <ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  bold: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cell: { flex: 1, minWidth: 0 },
  confirm: { flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  confirmLabel: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  notice: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  noticeText: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  gap8: { gap: 8 },
  scheduleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reset: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  schedule: { borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  month: { width: 110, fontSize: 13, lineHeight: 18 },
});
