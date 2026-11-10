import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createAllocation, createPaymentVoucher, editPaymentVoucher, getErrorMessage } from '@/lib/api';
import type { PaymentVoucherRow } from '@/types/api';

import { money, suggestRevisionNumber, todayISO } from './helpers';
import { Checkbox } from './parts';

type OpenPurchase = { id: string; voucherNumber: string; outstanding: string };
type VoucherType = 'PAYMENT' | 'RECEIPT';

function ErrorText({ message }: { message: string }) {
  const theme = useTheme();
  return message ? <ThemedText style={[styles.body, { color: theme.danger }]}>{message}</ThemedText> : null;
}

function Muted({ children }: { children: string }) {
  return <ThemedText themeColor="textMuted" style={styles.small}>{children}</ThemedText>;
}

// "Payment (we pay them)" / "Receipt (they pay/refund us)" toggle buttons.
function TypeToggle({ value, onChange }: { value: VoucherType; onChange: (v: VoucherType) => void }) {
  return (
    <View style={styles.row}>
      <Button variant={value === 'PAYMENT' ? 'primary' : 'outline'} size="sm" onPress={() => onChange('PAYMENT')}>Payment (we pay them)</Button>
      <Button variant={value === 'RECEIPT' ? 'primary' : 'outline'} size="sm" onPress={() => onChange('RECEIPT')}>Receipt (they pay/refund us)</Button>
    </View>
  );
}

// ─── New Payment / Receipt Voucher ──────────────────────────────────────────
export function NewPaymentVoucherSheet({
  ledgerId, purchaseVouchers, onClose, onDone,
}: { ledgerId: string; purchaseVouchers: OpenPurchase[]; onClose: () => void; onDone: () => void }) {
  const [voucherType, setVoucherType] = useState<VoucherType>('PAYMENT');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [voucherDate, setVoucherDate] = useState(todayISO());
  const [totalAmount, setTotalAmount] = useState('');
  const [narration, setNarration] = useState('');
  const [allocateToId, setAllocateToId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openPurchases = purchaseVouchers.filter((pv) => Number(pv.outstanding) > 0);

  const submit = async () => {
    setError('');
    if (!voucherNumber.trim()) { setError('Enter a voucher number.'); return; }
    const amount = Number(totalAmount);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    if (!voucherDate) { setError('Enter a voucher date.'); return; }
    setSaving(true);
    try {
      await createPaymentVoucher({
        ledgerId,
        voucherType,
        voucherNumber: voucherNumber.trim(),
        voucherDate,
        totalAmount: amount,
        narration: narration.trim() || undefined,
        allocations: voucherType === 'PAYMENT' && allocateToId ? [{ purchaseVoucherId: allocateToId, amount }] : undefined,
      });
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to post voucher.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="New Payment / Receipt Voucher"
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Post Voucher</Button>
        </>
      }>
      <TypeToggle value={voucherType} onChange={setVoucherType} />
      <Input label="Voucher #" required value={voucherNumber} onChangeText={setVoucherNumber} placeholder="e.g. PAY-001" autoCapitalize="characters" />
      <DateField label="Date *" value={voucherDate} onChange={setVoucherDate} />
      <Input label="Amount" required keyboardType="decimal-pad" value={totalAmount} onChangeText={setTotalAmount} />
      {voucherType === 'PAYMENT' ? (
        <View style={styles.gap4}>
          <Select
            label="Allocate against a purchase (optional)"
            value={allocateToId}
            onChange={setAllocateToId}
            options={[
              { value: '', label: "Don't allocate now — leave as advance" },
              ...openPurchases.map((pv) => ({ value: pv.id, label: `${pv.voucherNumber} (outstanding ${money(pv.outstanding)})` })),
            ]}
          />
          <Muted>Leave unselected to record this as an advance instead.</Muted>
        </View>
      ) : null}
      <Input label="Narration (optional)" value={narration} onChangeText={setNarration} multiline />
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Edit Payment Voucher ───────────────────────────────────────────────────
// Cancel-and-repost under the hood. `allocations` is only sent when the user
// opts in to replacing the set (undefined = keep, [] = clear: two different
// instructions, so it can't be inferred by diffing values).
export function EditPaymentVoucherSheet({
  voucher, ledgers, purchaseVouchers, existingVoucherNumbers, onClose, onDone,
}: {
  voucher: PaymentVoucherRow;
  ledgers: { id: string; name: string }[];
  purchaseVouchers: OpenPurchase[];
  existingVoucherNumbers: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [ledgerId, setLedgerId] = useState(voucher.ledgerId);
  const [voucherType, setVoucherType] = useState<VoucherType>(voucher.voucherType as VoucherType);
  const [voucherNumber, setVoucherNumber] = useState(() => suggestRevisionNumber(voucher.voucherNumber, existingVoucherNumbers));
  const [voucherDate, setVoucherDate] = useState(voucher.voucherDate.slice(0, 10));
  const [totalAmount, setTotalAmount] = useState(String(Number(voucher.totalAmount)));
  const [bankAccountId, setBankAccountId] = useState(voucher.bankAccountId ?? '');
  const [narration, setNarration] = useState(voucher.narration ?? '');
  const [editReason, setEditReason] = useState('');
  const [changeAllocation, setChangeAllocation] = useState(false);
  const [allocateToId, setAllocateToId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const openPurchases = purchaseVouchers.filter((pv) => Number(pv.outstanding) > 0);
  const isFinancialChange =
    ledgerId !== voucher.ledgerId ||
    voucherType !== voucher.voucherType ||
    voucherDate !== voucher.voucherDate.slice(0, 10) ||
    Number(totalAmount) !== Number(voucher.totalAmount) ||
    (bankAccountId.trim() || '') !== (voucher.bankAccountId ?? '') ||
    changeAllocation;

  const submit = async () => {
    setError('');
    const amount = Number(totalAmount);
    if (!amount || amount <= 0) { setError('Enter a valid amount.'); return; }
    if (isFinancialChange && !editReason.trim()) { setError('An edit reason is required when a financial detail changes.'); return; }
    setSaving(true);
    try {
      await editPaymentVoucher(voucher.id, {
        editReason: editReason.trim() || 'Narration update',
        ledgerId,
        voucherType,
        voucherNumber: voucherNumber.trim() || undefined,
        voucherDate,
        totalAmount: amount,
        bankAccountId: bankAccountId.trim() || undefined,
        narration: narration.trim() || undefined,
        allocations: changeAllocation ? (allocateToId ? [{ purchaseVoucherId: allocateToId, amount }] : []) : undefined,
      });
      onDone();
    } catch (e: unknown) {
      // Stays open on failure so nothing typed is lost.
      setError(getErrorMessage(e, 'Failed to update voucher.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Edit Payment Voucher — ${voucher.voucherNumber}`}
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Save Changes</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        Changing anything besides the narration reverses this voucher and posts a corrected one in its place — the original stays in history,
        marked as superseded. A narration-only change updates in place instead.
      </ThemedText>
      <Select label="Party" value={ledgerId} onChange={setLedgerId} options={ledgers.map((l) => ({ value: l.id, label: l.name }))} />
      <TypeToggle value={voucherType} onChange={setVoucherType} />
      <Input
        label="Voucher #"
        required
        value={voucherNumber}
        onChangeText={setVoucherNumber}
        autoCapitalize="characters"
        hint={isFinancialChange ? 'Auto-suggested — edit freely if you want a different number.' : undefined}
      />
      <DateField label="Date *" value={voucherDate} onChange={setVoucherDate} />
      <Input label="Amount" required keyboardType="decimal-pad" value={totalAmount} onChangeText={setTotalAmount} />
      <Input label="Bank Account ID (optional)" value={bankAccountId} onChangeText={setBankAccountId} autoCapitalize="none" />
      <View style={styles.gap4}>
        <ThemedText style={styles.heading}>Allocations</ThemedText>
        {voucher.allocations.length === 0 ? (
          <Muted>Currently unallocated (a spendable advance).</Muted>
        ) : (
          voucher.allocations.map((a) => <Muted key={a.id}>{`${a.purchaseVoucher.voucherNumber}: ${money(a.amountAllocated)}`}</Muted>)
        )}
        <Checkbox label="Replace the allocation set above" checked={changeAllocation} onChange={setChangeAllocation} />
        {changeAllocation && voucherType === 'PAYMENT' ? (
          <Select
            label="New allocation (optional)"
            value={allocateToId}
            onChange={setAllocateToId}
            options={[
              { value: '', label: "Don't allocate — leave as advance" },
              ...openPurchases.map((pv) => ({ value: pv.id, label: `${pv.voucherNumber} (outstanding ${money(pv.outstanding)})` })),
            ]}
          />
        ) : null}
        {!changeAllocation ? <Muted>Left unchecked, the current allocation set above is kept exactly as-is on the corrected voucher.</Muted> : null}
      </View>
      <Input label="Narration (optional)" value={narration} onChangeText={setNarration} multiline />
      {isFinancialChange ? <Input label="Edit reason" required value={editReason} onChangeText={setEditReason} multiline /> : null}
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Allocate an existing advance against a purchase voucher ────────────────
export function AllocateAdvanceSheet({
  purchaseVoucherId, outstanding, availablePayments, onClose, onDone,
}: {
  purchaseVoucherId: string;
  outstanding: string;
  availablePayments: { id: string; voucherNumber: string; available: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [paymentVoucherId, setPaymentVoucherId] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selected = availablePayments.find((p) => p.id === paymentVoucherId);

  const pick = (id: string) => {
    setPaymentVoucherId(id);
    const p = availablePayments.find((x) => x.id === id);
    if (p) {
      // Default to the smaller of the two ceilings.
      const suggested = Math.min(Number(p.available), Number(outstanding));
      setAmount(suggested > 0 ? String(suggested) : '');
    }
  };

  const submit = async () => {
    setError('');
    const amt = Number(amount);
    if (!paymentVoucherId) { setError('Pick an advance to allocate from.'); return; }
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    setSaving(true);
    try {
      await createAllocation({ paymentVoucherId, purchaseVoucherId, amount: amt });
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to allocate.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="Allocate an Advance Against This Purchase"
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Allocate</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>{`Outstanding on this bill: ${money(outstanding)}`}</ThemedText>
      {availablePayments.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.body}>No unallocated advances on this ledger right now.</ThemedText>
      ) : (
        <>
          <Select
            label="Advance to spend"
            placeholder="Choose an unallocated advance…"
            value={paymentVoucherId}
            onChange={pick}
            options={availablePayments.map((p) => ({ value: p.id, label: `${p.voucherNumber} (${money(p.available)} unallocated)` }))}
          />
          <View style={styles.gap4}>
            <Input label="Amount to allocate" required keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
            {selected ? <Muted>{`Up to ${money(Math.min(Number(selected.available), Number(outstanding)))}`}</Muted> : null}
          </View>
        </>
      )}
      <ErrorText message={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  heading: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap4: { gap: 4 },
});
