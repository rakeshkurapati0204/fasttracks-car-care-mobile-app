import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createLedger, createPurchaseVoucher, fetchLedgers, fetchPurchaseOrders, getErrorMessage, postPaidTransporterVoucher } from '@/lib/api';
import type { AccountingLedger, PurchaseOrder } from '@/types/api';

import { money, todayISO } from './helpers';
import { LinkButton } from './parts';

// Paid now books the expense AND settles it atomically; Pay later is a plain
// purchase voucher on the transporter's own ledger (shows up as payable).
export function TransporterSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const theme = useTheme();
  const [transporters, setTransporters] = useState<AccountingLedger[]>([]);
  const [loadingTransporters, setLoadingTransporters] = useState(true);
  const [ledgerId, setLedgerId] = useState('');

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);

  const [status, setStatus] = useState<'PAID' | 'UNPAID'>('PAID');
  // Pre-filled, still editable: TRP-YYYYMMDD-HHmm.
  const [voucherNumber, setVoucherNumber] = useState(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `TRP-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  });
  const [voucherDate, setVoucherDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [showPoPicker, setShowPoPicker] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchLedgers(false, 'TRANSPORTER')
      .then((r) => { if (!cancelled) setTransporters(r); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingTransporters(false); });
    fetchPurchaseOrders()
      .then((r) => { if (!cancelled) setPurchaseOrders(r ?? []); })
      .catch(() => { /* the purchase link is optional */ });
    return () => { cancelled = true; };
  }, []);

  const createTransporter = async () => {
    if (!newName.trim()) { setError('Enter a transporter name.'); return; }
    setCreating(true);
    setError('');
    try {
      const created = await createLedger({ name: newName.trim(), phone: newPhone.trim() || undefined, partyType: 'TRANSPORTER' });
      setTransporters((prev) => [...prev, created]);
      setLedgerId(created.id);
      setShowNew(false);
      setNewName('');
      setNewPhone('');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create transporter.'));
    } finally {
      setCreating(false);
    }
  };

  const buildNarration = () => {
    const parts: string[] = [];
    if (referenceNumber.trim()) parts.push(`LR/Ref: ${referenceNumber.trim()}`);
    if (notes.trim()) parts.push(notes.trim());
    return parts.length ? parts.join(' — ') : undefined;
  };

  const submit = async () => {
    setError('');
    if (!ledgerId) { setError('Select or add a transporter.'); return; }
    if (!voucherNumber.trim()) { setError('Enter a voucher number.'); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount.'); return; }
    if (!voucherDate) { setError('Enter a voucher date.'); return; }
    const items = [{ description: 'Freight / transport charges', quantity: 1, rate: amt, amount: amt }];
    setSaving(true);
    try {
      if (status === 'PAID') {
        await postPaidTransporterVoucher({
          ledgerId,
          purchaseVoucherNumber: voucherNumber.trim(),
          paymentVoucherNumber: voucherNumber.trim(),
          voucherDate,
          narration: buildNarration(),
          items,
        });
      } else {
        await createPurchaseVoucher({
          ledgerId,
          voucherNumber: voucherNumber.trim(),
          voucherDate,
          narration: buildNarration(),
          purchaseOrderId: purchaseOrderId || undefined,
          items,
        });
      }
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to record transporter voucher.'));
    } finally {
      setSaving(false);
    }
  };

  // Most recent first: a PO has no link to a transporter, so recency is the
  // only useful ordering.
  const poOptions = [
    { value: '', label: 'No purchase link' },
    ...[...purchaseOrders]
      .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
      .map((po) => ({ value: po.id, label: `PO ${String(po.id).slice(-6).toUpperCase()} — ${po.supplier?.name ?? 'Unknown supplier'} (${money(po.totalAmount)})` })),
  ];

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="Transporter Payment"
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>{status === 'PAID' ? 'Record Payment' : 'Record Payable'}</Button>
        </>
      }>
      <View style={styles.gap4}>
        <ThemedText themeColor="textSecondary" style={styles.label}>Payment status</ThemedText>
        <View style={styles.row}>
          <Button variant={status === 'PAID' ? 'primary' : 'outline'} size="sm" onPress={() => setStatus('PAID')}>Paid now</Button>
          <Button variant={status === 'UNPAID' ? 'primary' : 'outline'} size="sm" onPress={() => setStatus('UNPAID')}>Pay later</Button>
        </View>
      </View>

      <View style={styles.gap4}>
        {!showNew ? (
          <>
            <Select
              label="Transporter"
              required
              options={transporters.map((t) => ({ value: t.id, label: t.name }))}
              value={ledgerId}
              onChange={setLedgerId}
              placeholder={loadingTransporters ? 'Loading…' : 'Select transporter'}
            />
            <LinkButton onPress={() => setShowNew(true)}>+ New transporter</LinkButton>
          </>
        ) : (
          <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Input placeholder="Transporter name" value={newName} onChangeText={setNewName} />
            <Input placeholder="Phone (optional)" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
            <View style={styles.row}>
              <Button size="sm" loading={creating} onPress={createTransporter}>Add</Button>
              <Button size="sm" variant="outline" onPress={() => setShowNew(false)}>Cancel</Button>
            </View>
          </View>
        )}
      </View>

      <Input label="Voucher #" required value={voucherNumber} onChangeText={setVoucherNumber} placeholder="e.g. TRP-001" autoCapitalize="characters" />
      <DateField label="Date *" value={voucherDate} onChange={setVoucherDate} />
      <Input label="Amount" required keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <Input label="LR / Reference number (optional)" value={referenceNumber} onChangeText={setReferenceNumber} placeholder="e.g. LR-48213" />

      {status === 'UNPAID' ? (
        !showPoPicker ? (
          <LinkButton onPress={() => setShowPoPicker(true)}>+ Optional: link to a purchase order</LinkButton>
        ) : (
          <View style={styles.gap4}>
            <Select label="Related purchase (optional)" options={poOptions} value={purchaseOrderId} onChange={setPurchaseOrderId} />
            <ThemedText themeColor="textMuted" style={styles.small}>
              Reference only — records which purchase this freight relates to. Does not change how this posts to the books.
            </ThemedText>
          </View>
        )
      ) : null}

      <Input label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      {error ? <ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gap4: { gap: 4 },
  box: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 8 },
});
