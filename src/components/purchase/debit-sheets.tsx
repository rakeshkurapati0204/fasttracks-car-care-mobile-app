import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { editDebitNote, getErrorMessage, postDebitNote } from '@/lib/api';
import type { PurchaseDebitNoteRow, PurchaseVoucherItemRow, PurchaseVoucherRow } from '@/types/api';

import { money, suggestRevisionNumber, todayISO } from './helpers';
import { Mono } from './parts';

function ErrorText({ message }: { message: string }) {
  const theme = useTheme();
  return message ? <ThemedText style={[styles.body, { color: theme.danger }]}>{message}</ThemedText> : null;
}

function Total({ value }: { value: number }) {
  return (
    <View style={styles.totalRow}>
      <ThemedText style={styles.totalLabel}>Total credit:</ThemedText>
      <Mono style={styles.totalValue}>{money(value)}</Mono>
    </View>
  );
}

// "Already returned" per item from the ACTIVE debit notes nested on a voucher.
function returnedByItem(voucher: PurchaseVoucherRow, skipId?: string) {
  const map = new Map<string, number>();
  for (const dn of voucher.debitNotesAsSource) {
    if (dn.id === skipId) continue; // this note's own claim is being replaced, not added to
    for (const line of dn.items) {
      map.set(line.purchaseVoucherItemId, (map.get(line.purchaseVoucherItemId) ?? 0) + Number(line.returnedQuantity));
    }
  }
  return map;
}

const GRID_MIN = 440;

// Description 5 · Purchased/Returned 4 · Return qty 3 (the dashboard's grid)
// when roomy, stacked on a phone.
function ReturnItems({
  items, already, returns, setReturns, alreadyWord,
}: {
  items: PurchaseVoucherItemRow[];
  already: Map<string, number>;
  returns: Record<string, string>;
  setReturns: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  alreadyWord: string;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const wide = width >= GRID_MIN;
  return (
    <View style={styles.items} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ThemedText themeColor="textSecondary" style={styles.label}>Items being returned</ThemedText>
      {wide ? (
        <View style={styles.gridRow}>
          <ThemedText themeColor="textMuted" style={[styles.colHead, { flex: 5 }]}>Description</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.colHead, { flex: 4 }]}>Purchased / Returned</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.colHead, { flex: 3 }]}>Return qty</ThemedText>
        </View>
      ) : null}
      {items.map((item) => {
        const done = already.get(item.id) ?? 0;
        const available = Number(item.quantity) - done;
        const info = (
          <ThemedText themeColor="textMuted" style={styles.small}>
            {`${item.quantity} purchased · ${done} ${alreadyWord} · `}
            <ThemedText style={[styles.small, { fontFamily: FontWeights.bold }]}>{`${available} available`}</ThemedText>
          </ThemedText>
        );
        const qty = (
          <Input
            placeholder="0"
            keyboardType="decimal-pad"
            editable={available > 0}
            value={returns[item.id] ?? ''}
            onChangeText={(t) => setReturns((prev) => ({ ...prev, [item.id]: t }))}
          />
        );
        return wide ? (
          <View key={item.id} style={[styles.gridRow, { alignItems: 'center' }]}>
            <ThemedText style={[styles.body, { flex: 5 }]}>{item.description}</ThemedText>
            <View style={{ flex: 4 }}>{info}</View>
            <View style={{ flex: 3 }}>{qty}</View>
          </View>
        ) : (
          <View key={item.id} style={[styles.stack, { borderColor: theme.border }]}>
            <ThemedText style={styles.body}>{item.description}</ThemedText>
            {info}
            {qty}
          </View>
        );
      })}
    </View>
  );
}

function buildReturn(items: PurchaseVoucherItemRow[], returns: Record<string, string>) {
  return items.map((item) => ({ item, qty: Number(returns[item.id] || 0) })).filter(({ qty }) => qty > 0);
}

function overReturnError(touched: { item: PurchaseVoucherItemRow; qty: number }[], already: Map<string, number>) {
  for (const { item, qty } of touched) {
    const available = Number(item.quantity) - (already.get(item.id) ?? 0);
    if (qty > available) return `Cannot return ${qty} of "${item.description}" — only ${available} available (of ${item.quantity} purchased).`;
  }
  return '';
}

const toItems = (touched: { item: PurchaseVoucherItemRow; qty: number }[]) =>
  touched.map(({ item, qty }) => ({ purchaseVoucherItemId: item.id, returnedQuantity: qty, amount: qty * Number(item.rate) }));

// ─── Debit Note ──────────────────────────────────────────────────────────────
export function DebitNoteSheet({
  sourceVoucher, replacementOptions, onClose, onDone,
}: { sourceVoucher: PurchaseVoucherRow; replacementOptions: PurchaseVoucherRow[]; onClose: () => void; onDone: () => void }) {
  const [voucherNumber, setVoucherNumber] = useState('');
  const [voucherDate, setVoucherDate] = useState(todayISO());
  const [narration, setNarration] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [returns, setReturns] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const already = returnedByItem(sourceVoucher);
  const total = buildReturn(sourceVoucher.items, returns).reduce((s, { item, qty }) => s + qty * Number(item.rate), 0);

  const submit = async () => {
    setError('');
    if (!voucherNumber.trim()) { setError('Enter a voucher number.'); return; }
    const touched = buildReturn(sourceVoucher.items, returns);
    if (!touched.length) { setError('Enter a quantity for at least one returned item.'); return; }
    const over = overReturnError(touched, already);
    if (over) { setError(over); return; }
    setSaving(true);
    try {
      await postDebitNote({
        purchaseVoucherId: sourceVoucher.id,
        replacementPurchaseVoucherId: replacementId || undefined,
        voucherNumber: voucherNumber.trim(),
        voucherDate,
        narration: narration.trim() || undefined,
        items: toItems(touched),
      });
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to post debit note.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Debit Note — against ${sourceVoucher.voucherNumber}`}
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Post Debit Note</Button>
        </>
      }>
      <Input label="Voucher #" required value={voucherNumber} onChangeText={setVoucherNumber} placeholder="e.g. DN-001" autoCapitalize="characters" />
      <DateField label="Date *" value={voucherDate} onChange={setVoucherDate} />
      <ReturnItems items={sourceVoucher.items} already={already} returns={returns} setReturns={setReturns} alreadyWord="returned so far" />
      <View style={styles.gap4}>
        <Select
          label="Apply credit to a replacement purchase (optional)"
          value={replacementId}
          onChange={setReplacementId}
          options={[
            { value: '', label: "Don't link — credit stays on this bill" },
            ...replacementOptions.map((pv) => ({ value: pv.id, label: `${pv.voucherNumber} (${money(pv.totalAmount)})` })),
          ]}
        />
        <ThemedText themeColor="textMuted" style={styles.small}>
          Leave unlinked and the credit reduces this bill&apos;s own outstanding. Link a replacement and the credit reduces that bill&apos;s
          outstanding instead — this bill&apos;s own figure won&apos;t change.
        </ThemedText>
      </View>
      <Input label="Narration (optional)" value={narration} onChangeText={setNarration} multiline />
      <Total value={total} />
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Edit Debit Note ─────────────────────────────────────────────────────────
export function EditDebitNoteSheet({
  debitNote, sourceVoucherOptions, existingVoucherNumbers, onClose, onDone,
}: {
  debitNote: PurchaseDebitNoteRow;
  sourceVoucherOptions: PurchaseVoucherRow[];
  existingVoucherNumbers: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [sourceVoucherId, setSourceVoucherId] = useState(debitNote.purchaseVoucherId);
  const [voucherNumber, setVoucherNumber] = useState(() => suggestRevisionNumber(debitNote.voucherNumber, existingVoucherNumbers));
  const [voucherDate, setVoucherDate] = useState(debitNote.voucherDate.slice(0, 10));
  const [narration, setNarration] = useState(debitNote.narration ?? '');
  const [replacementId, setReplacementId] = useState(debitNote.replacementPurchaseVoucherId ?? '');
  const [returns, setReturns] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const line of debitNote.items) initial[line.purchaseVoucherItemId] = String(Number(line.returnedQuantity));
    return initial;
  });
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const source = sourceVoucherOptions.find((pv) => pv.id === sourceVoucherId);
  const already = source ? returnedByItem(source, debitNote.id) : new Map<string, number>();
  const touched = source ? buildReturn(source.items, returns) : [];
  const total = touched.reduce((s, { item, qty }) => s + qty * Number(item.rate), 0);

  const itemsUnchanged = () => {
    if (touched.length !== debitNote.items.length) return false;
    const current = new Map(debitNote.items.map((it) => [it.purchaseVoucherItemId, it]));
    return touched.every(({ item, qty }) => {
      const m = current.get(item.id);
      return m && Number(m.returnedQuantity) === qty;
    });
  };

  const isFinancialChange =
    sourceVoucherId !== debitNote.purchaseVoucherId ||
    (replacementId || '') !== (debitNote.replacementPurchaseVoucherId ?? '') ||
    voucherDate !== debitNote.voucherDate.slice(0, 10) ||
    !itemsUnchanged();

  const changeSource = (id: string) => {
    setSourceVoucherId(id);
    setReturns({}); // the old quantities belong to a different voucher's items
  };

  const submit = async () => {
    setError('');
    if (!source) { setError('Pick a source purchase voucher.'); return; }
    if (!touched.length) { setError('Enter a quantity for at least one returned item.'); return; }
    const over = overReturnError(touched, already);
    if (over) { setError(over); return; }
    if (isFinancialChange && !editReason.trim()) { setError('An edit reason is required when a financial detail changes.'); return; }
    setSaving(true);
    try {
      await editDebitNote(debitNote.id, {
        editReason: editReason.trim() || 'Narration update',
        purchaseVoucherId: sourceVoucherId,
        replacementPurchaseVoucherId: replacementId || undefined,
        voucherNumber: voucherNumber.trim() || undefined,
        voucherDate,
        narration: narration.trim() || undefined,
        items: toItems(touched),
      });
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update debit note.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Edit Debit Note — ${debitNote.voucherNumber}`}
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Save Changes</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        Changing anything besides the narration reverses this debit note and posts a corrected one in its place — the original stays in history,
        marked as superseded. A narration-only change updates in place instead.
      </ThemedText>
      <Select
        label="Source purchase voucher"
        value={sourceVoucherId}
        onChange={changeSource}
        options={sourceVoucherOptions.map((pv) => ({ value: pv.id, label: `${pv.voucherNumber} (${money(pv.totalAmount)})` }))}
      />
      <Input label="Voucher #" required value={voucherNumber} onChangeText={setVoucherNumber} autoCapitalize="characters" />
      <DateField label="Date *" value={voucherDate} onChange={setVoucherDate} />
      {source ? <ReturnItems items={source.items} already={already} returns={returns} setReturns={setReturns} alreadyWord="returned elsewhere" /> : null}
      <Select
        label="Apply credit to a replacement purchase (optional)"
        value={replacementId}
        onChange={setReplacementId}
        options={[
          { value: '', label: "Don't link — credit stays on the source bill" },
          ...sourceVoucherOptions.filter((pv) => pv.id !== sourceVoucherId).map((pv) => ({ value: pv.id, label: `${pv.voucherNumber} (${money(pv.totalAmount)})` })),
        ]}
      />
      <Input label="Narration (optional)" value={narration} onChangeText={setNarration} multiline />
      <Total value={total} />
      {isFinancialChange ? <Input label="Edit reason" required value={editReason} onChangeText={setEditReason} multiline /> : null}
      <ErrorText message={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium },
  items: { gap: 8 },
  gridRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  colHead: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  stack: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  gap4: { gap: 4 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  totalValue: { fontWeight: '700' },
});
