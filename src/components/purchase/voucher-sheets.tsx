import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createPurchaseVoucher, editPurchaseVoucher, getErrorMessage } from '@/lib/api';
import type { PurchaseVoucherRow } from '@/types/api';

import { money, suggestRevisionNumber, todayISO } from './helpers';
import { LinkButton, Mono } from './parts';

// Qty/rate are kept as text so a field can actually go blank while typing
// (the dashboard shows '' rather than 0 for the same reason).
type Line = { description: string; quantity: string; rate: string };
const newLine = (): Line => ({ description: '', quantity: '1', rate: '' });
const num = (s: string) => Number(s) || 0;
const lineTotal = (items: Line[]) => items.reduce((s, it) => s + num(it.quantity) * num(it.rate), 0);

// Untouched blank rows are dropped, but a row the user did fill in must be
// complete and positive, so a typo can't silently vanish from the voucher.
function validateLines(items: Line[], verb: 'posting' | 'saving'): { error: string } | { lines: Line[] } {
  const touched = items.filter((it) => it.description.trim() || num(it.rate) !== 0);
  if (touched.some((it) => !it.description.trim() || num(it.rate) <= 0)) {
    return { error: `Every item needs a description and a positive rate — fix or remove the incomplete row before ${verb}.` };
  }
  if (!touched.length) return { error: 'Add at least one item with a description and rate.' };
  return { lines: touched };
}

const toPayloadItems = (lines: Line[]) =>
  lines.map((it) => ({ description: it.description.trim(), quantity: num(it.quantity), rate: num(it.rate), amount: num(it.quantity) * num(it.rate) }));

function ErrorText({ message }: { message: string }) {
  const theme = useTheme();
  return message ? <ThemedText style={[styles.body, { color: theme.danger }]}>{message}</ThemedText> : null;
}

// The dashboard's 12-column grid (Description 6 · Qty 2 · Rate 3 · ✕ 1) when
// the sheet is roomy, stacked fields on a phone.
const GRID_MIN = 440;

function LineItems({ items, setItems }: { items: Line[]; setItems: (fn: (prev: Line[]) => Line[]) => void }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const wide = width >= GRID_MIN;
  const update = (i: number, patch: Partial<Line>) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <View style={styles.items} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ThemedText themeColor="textSecondary" style={styles.label}>Items</ThemedText>
      {wide ? (
        <View style={styles.gridRow}>
          <ThemedText themeColor="textMuted" style={[styles.colHead, { flex: 6 }]}>Description</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.colHead, { flex: 2 }]}>Qty</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.colHead, { flex: 3 }]}>Rate (₹)</ThemedText>
          <View style={{ flex: 1 }} />
        </View>
      ) : null}
      {items.map((it, i) =>
        wide ? (
          <View key={i} style={styles.gridRow}>
            <View style={{ flex: 6 }}><Input placeholder="Description" value={it.description} onChangeText={(t) => update(i, { description: t })} /></View>
            <View style={{ flex: 2 }}><Input placeholder="Qty" keyboardType="decimal-pad" value={it.quantity} onChangeText={(t) => update(i, { quantity: t })} /></View>
            <View style={{ flex: 3 }}><Input placeholder="₹ Rate" keyboardType="decimal-pad" value={it.rate} onChangeText={(t) => update(i, { rate: t })} /></View>
            <Pressable onPress={() => remove(i)} accessibilityRole="button" accessibilityLabel="Remove item" style={[styles.remove, { flex: 1 }]}>
              <ThemedText style={{ color: theme.danger }}>✕</ThemedText>
            </Pressable>
          </View>
        ) : (
          <View key={i} style={[styles.stack, { borderColor: theme.border }]}>
            <Input label="Description" placeholder="Description" value={it.description} onChangeText={(t) => update(i, { description: t })} />
            <View style={styles.gridRow}>
              <View style={{ flex: 1 }}><Input label="Qty" placeholder="Qty" keyboardType="decimal-pad" value={it.quantity} onChangeText={(t) => update(i, { quantity: t })} /></View>
              <View style={{ flex: 1 }}><Input label="Rate (₹)" placeholder="₹ Rate" keyboardType="decimal-pad" value={it.rate} onChangeText={(t) => update(i, { rate: t })} /></View>
              <Pressable onPress={() => remove(i)} accessibilityRole="button" accessibilityLabel="Remove item" style={styles.removeStacked}>
                <ThemedText style={{ color: theme.danger }}>✕</ThemedText>
              </Pressable>
            </View>
          </View>
        ),
      )}
      <LinkButton onPress={() => setItems((prev) => [...prev, newLine()])}>+ Add item</LinkButton>
    </View>
  );
}

function Total({ value }: { value: number }) {
  return (
    <View style={styles.totalRow}>
      <ThemedText style={styles.totalLabel}>Total:</ThemedText>
      <Mono style={styles.totalValue}>{money(value)}</Mono>
    </View>
  );
}

// ─── New Purchase Voucher ───────────────────────────────────────────────────
export function NewPurchaseVoucherSheet({ ledgerId, onClose, onDone }: { ledgerId: string; onClose: () => void; onDone: () => void }) {
  const [voucherNumber, setVoucherNumber] = useState('');
  const [voucherDate, setVoucherDate] = useState(todayISO());
  const [narration, setNarration] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [items, setItems] = useState<Line[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!voucherNumber.trim()) { setError('Enter a voucher number.'); return; }
    if (!voucherDate) { setError('Enter a voucher date.'); return; }
    const v = validateLines(items, 'posting');
    if ('error' in v) { setError(v.error); return; }
    setSaving(true);
    try {
      await createPurchaseVoucher({
        ledgerId,
        voucherNumber: voucherNumber.trim(),
        voucherDate,
        narration: narration.trim() || undefined,
        transporterName: transporterName.trim() || undefined,
        items: toPayloadItems(v.lines),
      });
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to post purchase voucher.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="New Purchase Voucher"
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Post Voucher</Button>
        </>
      }>
      <Input label="Voucher #" required value={voucherNumber} onChangeText={setVoucherNumber} placeholder="e.g. PV-001" autoCapitalize="characters" />
      <DateField label="Voucher Date *" value={voucherDate} onChange={setVoucherDate} />
      <LineItems items={items} setItems={setItems} />
      <Input
        label={'Transporter (optional — who physically carried the goods, e.g. "Bajrang Transport")'}
        value={transporterName}
        onChangeText={setTransporterName}
        placeholder="Transporter name"
      />
      <Input label="Narration (optional)" value={narration} onChangeText={setNarration} multiline />
      <Total value={lineTotal(items)} />
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Edit Purchase Voucher ──────────────────────────────────────────────────
export function EditPurchaseVoucherSheet({
  voucher, existingVoucherNumbers, onClose, onDone,
}: { voucher: PurchaseVoucherRow; existingVoucherNumbers: string[]; onClose: () => void; onDone: () => void }) {
  const [voucherNumber, setVoucherNumber] = useState(() => suggestRevisionNumber(voucher.voucherNumber, existingVoucherNumbers));
  const [voucherDate, setVoucherDate] = useState(voucher.voucherDate.slice(0, 10));
  const [narration, setNarration] = useState(voucher.narration ?? '');
  const [transporterName, setTransporterName] = useState(voucher.transporterName ?? '');
  const [items, setItems] = useState<Line[]>(() =>
    voucher.items.map((it) => ({ description: it.description, quantity: String(Number(it.quantity)), rate: String(Number(it.rate)) })),
  );
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Mirrors the backend's canonicalItems check: order-independent, so
  // re-arranging identical rows isn't a "financial" change.
  const canonical = (list: { description: string; quantity: number; rate: number; amount: number }[]) =>
    list.map((it) => `${it.description.trim()}|${it.quantity.toFixed(2)}|${it.rate.toFixed(2)}|${it.amount.toFixed(2)}`).sort();
  const original = canonical(voucher.items.map((it) => ({ description: it.description, quantity: Number(it.quantity), rate: Number(it.rate), amount: Number(it.amount) })));
  const current = canonical(items.map((it) => ({ description: it.description, quantity: num(it.quantity), rate: num(it.rate), amount: num(it.quantity) * num(it.rate) })));
  const itemsUnchanged = JSON.stringify(original) === JSON.stringify(current);

  const isFinancialChange =
    voucherDate !== voucher.voucherDate.slice(0, 10) ||
    (transporterName.trim() || '') !== (voucher.transporterName ?? '') ||
    !itemsUnchanged;

  const submit = async () => {
    setError('');
    const v = validateLines(items, 'saving');
    if ('error' in v) { setError(v.error); return; }
    if (isFinancialChange && !editReason.trim()) { setError('An edit reason is required when a financial detail changes.'); return; }
    setSaving(true);
    try {
      await editPurchaseVoucher(voucher.id, {
        editReason: editReason.trim() || 'Narration update',
        voucherNumber: voucherNumber.trim() || undefined,
        voucherDate,
        narration: narration.trim() || undefined,
        transporterName: transporterName.trim() || undefined,
        items: toPayloadItems(v.lines),
      });
      onDone();
    } catch (e: unknown) {
      // Stays open on failure (an allocation that no longer fits the new
      // total, or an active source debit note) so nothing typed is lost.
      setError(getErrorMessage(e, 'Failed to update purchase voucher.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Edit Purchase Voucher — ${voucher.voucherNumber}`}
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Save Changes</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        Changing anything besides the narration reverses this voucher and posts a corrected one in its place — the original stays in history,
        marked as superseded. A narration-only change updates in place instead. An active debit note raised against this voucher (as its
        source) blocks any other change until it&apos;s cancelled.
      </ThemedText>
      <Input
        label="Voucher #"
        required
        value={voucherNumber}
        onChangeText={setVoucherNumber}
        autoCapitalize="characters"
        hint={isFinancialChange ? 'Auto-suggested — edit freely if you want a different number.' : undefined}
      />
      <DateField label="Voucher Date *" value={voucherDate} onChange={setVoucherDate} />
      <LineItems items={items} setItems={setItems} />
      <Input
        label={'Transporter (optional — who physically carried the goods, e.g. "Bajrang Transport")'}
        value={transporterName}
        onChangeText={setTransporterName}
        placeholder="Transporter name"
      />
      <Input label="Narration (optional)" value={narration} onChangeText={setNarration} multiline />
      <Total value={lineTotal(items)} />
      {isFinancialChange ? <Input label="Edit reason" required value={editReason} onChangeText={setEditReason} multiline /> : null}
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Cancel ──────────────────────────────────────────────────────────────────
export function CancelSheet({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    if (!reason.trim()) { setError('A cancellation reason is required.'); return; }
    setSaving(true);
    try {
      await onConfirm(reason.trim());
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to cancel.'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Cancel ${label}`}
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Back</Button>
          <Button variant="danger" loading={saving} onPress={confirm}>Confirm Cancel</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        This posts a reversing entry — it does not delete the original. This cannot be undone.
      </ThemedText>
      <Input label="Reason" required value={reason} onChangeText={setReason} multiline />
      <ErrorText message={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium },
  items: { gap: 8 },
  gridRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  colHead: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  remove: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  removeStacked: { minHeight: 44, width: 32, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  stack: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  totalLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  totalValue: { fontWeight: '700' },
});
