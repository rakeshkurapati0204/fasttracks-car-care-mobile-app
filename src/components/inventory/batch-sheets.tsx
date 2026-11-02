import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { FormGrid } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Fonts, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchInventoryReceipt, fetchReconciliationHistory, getErrorMessage, reconcileStockReceipt, saveInventoryReceiptEdits } from '@/lib/api';
import type { InventoryListItem, InventoryListReceipt, ReconcileReason, ReconciliationRecord, StockReceipt } from '@/types/api';

import { fmtD, GST_SLABS, STATUS_CFG } from './constants';
import { Field, InlineError, Pill, SectionDivider } from './parts';

type Notify = (type: 'success' | 'error', msg: string) => void;

const fmtC2 = (n?: number | null) => (n != null ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—');

// ─── Edit Batch ─────────────────────────────────────────────────────────────
const BATCH_PAYMENT_TERMS = ['Cash on Delivery', 'Advance Payment', 'Net 15', 'Net 30', 'Credit'];

function buildForm(d: StockReceipt & { eta?: string | null }) {
  return {
    sellerName: d.sellerName || '',
    sellerCity: d.sellerCity || '',
    orderPlacedTo: d.orderPlacedTo || '',
    sellerContact: d.sellerContact || '',
    quantityReceived: d.quantityReceived != null ? String(d.quantityReceived) : '',
    dealerPrice: d.dealerPrice != null ? String(d.dealerPrice) : '',
    logisticsPartner: d.logisticsPartner || '',
    logisticsCharge: d.logisticsCharge != null ? String(d.logisticsCharge) : '',
    logisticsPartner2: d.logisticsPartner2 || '',
    logisticsCharge2: d.logisticsCharge2 != null ? String(d.logisticsCharge2) : '',
    gstPercent: d.gstPercent != null ? String(d.gstPercent) : '',
    paymentTerms: d.paymentTerms || '',
    orderDate: d.orderDate ? d.orderDate.split('T')[0] : '',
    eta: d.eta ? d.eta.split('T')[0] : '',
    storeLocation: d.storeLocation || '',
    notes: d.notes || '',
  };
}

export function EditBatchSheet({ batch, onClose, onSaved }: { batch: InventoryListReceipt; onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();
  const [form, setForm] = useState(() => buildForm(batch));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Fresh data on open, so a stale list row never overwrites newer edits.
  useEffect(() => {
    let live = true;
    fetchInventoryReceipt(batch.id)
      .then((d) => { if (live && d) setForm(buildForm(d)); })
      .catch(() => { /* keep the list row's values */ })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [batch.id]);

  const save = async () => {
    if (saving) return;
    const missing: string[] = [];
    if (!form.sellerName) missing.push('Seller Name');
    if (!form.sellerContact) missing.push('Contact Phone');
    if (form.quantityReceived === '') missing.push('Qty Received');
    if (!form.logisticsPartner) missing.push('Logistics Partner 1');
    if (!form.orderDate) missing.push('Order Date');
    if (!form.storeLocation) missing.push('Store Location');
    if (form.gstPercent === '') missing.push('GST %');
    if (missing.length) { setError(`Required: ${missing.join(', ')}`); return; }
    setSaving(true);
    setError('');
    try {
      const dp = Number(form.dealerPrice) || 0;
      const qty = Number(form.quantityReceived) || 0;
      const lc1 = Number(form.logisticsCharge) || 0;
      const lc2 = Number(form.logisticsCharge2) || 0;
      const gst = Number(form.gstPercent) || 0;
      const lpu = qty > 0 ? (lc1 + lc2) / qty : 0;
      await saveInventoryReceiptEdits(batch.id, {
        sellerName: form.sellerName,
        sellerCity: form.sellerCity,
        orderPlacedTo: form.orderPlacedTo,
        sellerContact: form.sellerContact,
        quantityReceived: Number(form.quantityReceived),
        dealerPrice: form.dealerPrice !== '' ? Number(form.dealerPrice) : null,
        costPerUnit: Math.round((dp + lpu + (dp * gst) / 100) * 100) / 100,
        logisticsPartner: form.logisticsPartner,
        logisticsCharge: lc1,
        logisticsPartner2: form.logisticsPartner2,
        logisticsCharge2: lc2,
        gstPercent: gst,
        paymentTerms: form.paymentTerms,
        orderDate: form.orderDate,
        eta: form.eta || null,
        storeLocation: form.storeLocation,
        notes: form.notes,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const dp = Number(form.dealerPrice) || 0;
  const qty = Number(form.quantityReceived) || 0;
  const lc = (Number(form.logisticsCharge) || 0) + (Number(form.logisticsCharge2) || 0);
  const landed = dp + (qty > 0 ? lc / qty : 0) + (dp * (Number(form.gstPercent) || 0)) / 100;
  const payOpts = [...(form.paymentTerms && !BATCH_PAYMENT_TERMS.includes(form.paymentTerms) ? [form.paymentTerms] : []), ...BATCH_PAYMENT_TERMS];

  return (
    <Sheet
      visible
      fullHeight
      onClose={onClose}
      locked={saving}
      title="Edit Batch"
      subtitle={`Barcode: ${batch.barcode ?? '—'}`}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving...' : 'Save Batch'}</Button>
        </>
      }>
      {loading ? <ThemedText themeColor="textMuted" style={[styles.small, styles.center]}>Loading latest batch data…</ThemedText> : null}
      {error ? <InlineError message={error} /> : null}

      <SectionDivider title="Seller" />
      <FormGrid>
        <Field label="Seller Name *"><Input value={form.sellerName} onChangeText={set('sellerName')} placeholder="e.g. ABC Distributors" /></Field>
        <Field label="Seller City"><Input value={form.sellerCity} onChangeText={set('sellerCity')} placeholder="e.g. Mumbai" /></Field>
        <Field label="Order Placed To"><Input value={form.orderPlacedTo} onChangeText={set('orderPlacedTo')} placeholder="Contact name" /></Field>
        <Field label="Contact Phone *"><Input value={form.sellerContact} onChangeText={set('sellerContact')} placeholder="+91 99999 00000" keyboardType="phone-pad" /></Field>
      </FormGrid>

      <SectionDivider title="Stock & Pricing" />
      <FormGrid>
        <Field label="Qty Received *"><Input value={form.quantityReceived} onChangeText={set('quantityReceived')} keyboardType="decimal-pad" /></Field>
        <Field label="Dealer Price (₹/unit) *"><Input value={form.dealerPrice} onChangeText={set('dealerPrice')} keyboardType="decimal-pad" /></Field>
      </FormGrid>

      <SectionDivider title="Logistics" />
      <FormGrid>
        <Field label="Logistics Partner 1 *"><Input value={form.logisticsPartner} onChangeText={set('logisticsPartner')} placeholder="e.g. DTDC" /></Field>
        <Field label="Charge 1 (₹)"><Input value={form.logisticsCharge} onChangeText={set('logisticsCharge')} keyboardType="decimal-pad" /></Field>
        <Field label="Logistics Partner 2"><Input value={form.logisticsPartner2} onChangeText={set('logisticsPartner2')} placeholder="e.g. Porter" /></Field>
        <Field label="Charge 2 (₹)"><Input value={form.logisticsCharge2} onChangeText={set('logisticsCharge2')} keyboardType="decimal-pad" /></Field>
      </FormGrid>

      <SectionDivider title="GST" />
      <Field label="GST % *"><Select placeholder="Select GST rate…" value={form.gstPercent} onChange={set('gstPercent')} options={GST_SLABS} /></Field>

      {dp > 0 || lc > 0 ? (
        landed > 0 ? (
          <View style={[styles.landed, { backgroundColor: withAlpha(theme.primary, 0.06), borderColor: withAlpha(theme.primary, 0.15) }]}>
            <ThemedText style={[styles.landedText, { color: theme.primary }]}>
              {'Landed Cost (₹/unit): '}
              <ThemedText style={[styles.landedText, { color: theme.primary, fontFamily: FontWeights.bold }]}>{`₹${landed.toFixed(2)}`}</ThemedText>
            </ThemedText>
            <ThemedText themeColor="textMuted" style={styles.tiny}>(Dealer Price + Logistics/unit + GST)</ThemedText>
          </View>
        ) : null
      ) : null}

      <SectionDivider title="Payment & Dates" />
      <FormGrid>
        <Field label="Payment Terms *">
          <Select placeholder="Select..." value={form.paymentTerms} onChange={set('paymentTerms')} options={payOpts.map((t) => ({ value: t, label: t }))} />
        </Field>
        <Field label="Order Date *"><DateField label="Order Date" value={form.orderDate} onChange={set('orderDate')} compact /></Field>
        <Field label="ETA / Expected Delivery"><DateField label="ETA" value={form.eta} onChange={set('eta')} compact /></Field>
      </FormGrid>

      <SectionDivider title="Store" />
      <Field label="Store Location *"><Input value={form.storeLocation} onChangeText={set('storeLocation')} placeholder="e.g. Room A - Rack 3, Front Shelf" /></Field>
      <Field label="Notes"><Input value={form.notes} onChangeText={set('notes')} placeholder="Optional notes" /></Field>
    </Sheet>
  );
}

// ─── Stock History ──────────────────────────────────────────────────────────
export function HistorySheet({ item, canWrite, onClose, onRefresh }: { item: InventoryListItem; canWrite: boolean; onClose: () => void; onRefresh: () => void }) {
  const theme = useTheme();
  const receipts = item.receipts || [];
  const total = receipts.reduce((s, r) => s + r.quantityReceived, 0);
  const [editing, setEditing] = useState<InventoryListReceipt | null>(null);

  return (
    <Sheet visible fullHeight onClose={onClose} title={`Stock History — ${item.product}`} footer={<Button variant="ghost" onPress={onClose} style={styles.flex1}>Close</Button>}>
      <ThemedText themeColor="textSecondary" style={styles.small}>
        {'Total received: '}
        <ThemedText style={[styles.small, { fontFamily: FontWeights.bold }]}>{`${total} ${item.unit}`}</ThemedText>
        {` across ${receipts.length} receipt(s)`}
      </ThemedText>
      {receipts.length === 0 ? (
        <ThemedText themeColor="textMuted" style={[styles.body, styles.center]}>No stock receipts yet.</ThemedText>
      ) : (
        receipts.map((r) => (
          <View key={r.id} style={[styles.hCard, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <View style={styles.rowBetween}>
              <View style={styles.flex1}>
                <ThemedText style={styles.mono}>{r.barcode || '—'}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.tiny}>{fmtD(r.orderDate || r.createdAt)}</ThemedText>
              </View>
              {r.receiptDate
                ? <Pill label={fmtD(r.receiptDate)} bg={STATUS_CFG.ACTIVE.bg} color={STATUS_CFG.ACTIVE.text} strong />
                : <Pill label="Incoming" bg={STATUS_CFG.OUT_OF_STOCK.bg} color={STATUS_CFG.OUT_OF_STOCK.text} strong />}
            </View>
            <View style={styles.facts}>
              <HFact label="Qty" value={`${r.quantityReceived} ${item.unit}`} />
              <HFact label="Remaining" value={r.remainingQty != null ? String(r.remainingQty) : '—'} />
              <HFact label="Dealer Price" value={fmtC2(r.dealerPrice)} />
              <HFact label="Landed Cost" value={fmtC2(r.costPerUnit)} />
              <HFact label="Seller" value={r.sellerName || '—'} />
            </View>
            {canWrite ? <View style={styles.start}><Button size="sm" variant="outline" onPress={() => setEditing(r)}>Edit</Button></View> : null}
          </View>
        ))
      )}
      {editing ? <EditBatchSheet batch={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onRefresh(); }} /> : null}
    </Sheet>
  );
}

function HFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <ThemedText themeColor="textMuted" style={styles.factLabel}>{label.toUpperCase()}</ThemedText>
      <ThemedText style={styles.factValue}>{value}</ThemedText>
    </View>
  );
}

// ─── Reconcile ──────────────────────────────────────────────────────────────
const REASONS: { value: ReconcileReason; label: string }[] = [
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'THEFT_LOSS', label: 'Theft / Loss' },
  { value: 'COUNTING_ERROR', label: 'Counting Error' },
  { value: 'FOUND_EXTRA', label: 'Found Extra Stock' },
  { value: 'OTHER', label: 'Other' },
];
const fmtDiff = (d: number) => (d > 0 ? `+${d} (stock addition)` : d < 0 ? `${d} (loss)` : '0 (no change)');

export function ReconcileSheet({ item, onClose, onSaved, notify }: { item: InventoryListItem; onClose: () => void; onSaved: () => void; notify: Notify }) {
  const theme = useTheme();
  const receipts = (item.receipts || []).filter((r) => r.remainingQty != null || r.quantityReceived != null);
  const [receiptId, setReceiptId] = useState(receipts.length === 1 ? receipts[0].id : '');
  const [count, setCount] = useState('');
  const [reason, setReason] = useState<ReconcileReason>('COUNTING_ERROR');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ReconciliationRecord[] | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const receipt = receipts.find((r) => r.id === receiptId) || null;
  const systemQty = receipt ? (receipt.remainingQty ?? receipt.quantityReceived) : null;
  const diff = count !== '' && systemQty != null ? parseInt(count, 10) - systemQty : null;
  const diffColor = diff === null ? undefined : diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#6b7280';

  const loadHistory = async (id: string) => {
    setHistLoading(true);
    try { setHistory(await fetchReconciliationHistory(id)); } catch { setHistory([]); }
    setHistLoading(false);
  };

  const pickReceipt = (id: string) => { setReceiptId(id); setCount(''); setHistory(null); setShowHistory(false); };

  const save = async () => {
    if (!receiptId) { setError('Select a stock receipt'); return; }
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 0) { setError('Enter a valid physical count'); return; }
    if (!reason) { setError('Select a reason'); return; }
    setSaving(true);
    setError('');
    try {
      await reconcileStockReceipt(receiptId, n, reason, notes.trim() || undefined);
      notify('success', 'Stock reconciled');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Save failed'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      fullHeight
      onClose={onClose}
      locked={saving}
      title={`Reconcile Stock — ${item.product}`}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          {receipt ? <Button onPress={save} loading={saving} disabled={!count} style={styles.flex2}>{saving ? 'Saving…' : 'Save Reconciliation'}</Button> : null}
        </>
      }>
      {error ? <InlineError message={error} /> : null}
      {receipts.length === 0 ? (
        <ThemedText themeColor="textMuted" style={[styles.body, styles.center]}>No active stock receipts found for this product.</ThemedText>
      ) : (
        <>
          {receipts.length > 1 ? (
            <Field label="Select Batch / Receipt">
              <Select
                placeholder="— Choose a batch —"
                value={receiptId}
                onChange={pickReceipt}
                options={receipts.map((r) => ({ value: r.id, label: `${r.barcode || r.id.slice(-8)} — ${r.sellerName || 'Unknown seller'} — ${r.remainingQty ?? r.quantityReceived} ${item.unit} remaining` }))}
              />
            </Field>
          ) : null}

          {receipt ? (
            <View style={[styles.sysBox, { backgroundColor: theme.surface }]}>
              <View style={styles.rowBetween}>
                <ThemedText style={[styles.body, styles.flex1]}>
                  {receipt.barcode ? <ThemedText style={[styles.body, { fontFamily: Fonts?.mono, fontWeight: '700', color: theme.primary }]}>{`${receipt.barcode}  `}</ThemedText> : null}
                  {'System qty: '}
                  <ThemedText style={[styles.body, { fontFamily: FontWeights.bold }]}>{`${systemQty} ${item.unit}`}</ThemedText>
                  {receipt.sellerName ? <ThemedText themeColor="textMuted" style={styles.small}>{`  from ${receipt.sellerName}`}</ThemedText> : null}
                </ThemedText>
                <Pressable onPress={() => { setShowHistory((s) => !s); if (!showHistory) loadHistory(receiptId); }} accessibilityRole="button" hitSlop={8}>
                  <ThemedText style={[styles.small, { color: theme.primary, textDecorationLine: 'underline' }]}>{showHistory ? 'Hide History' : 'View History'}</ThemedText>
                </Pressable>
              </View>
              {item.lastVerifiedAt ? (
                <ThemedText themeColor="textMuted" style={styles.tiny}>
                  {`Last product check: ${fmtD(item.lastVerifiedAt)}${item.lastVerifiedCount != null ? ` — counted ${item.lastVerifiedCount} ${item.unit}` : ''}`}
                </ThemedText>
              ) : null}
            </View>
          ) : null}

          {showHistory && receipt ? (
            <View style={[styles.histBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={styles.histTitle}>RECONCILIATION HISTORY</ThemedText>
              {histLoading ? (
                <ActivityIndicator style={styles.pad} color={theme.primary} />
              ) : !history || history.length === 0 ? (
                <ThemedText themeColor="textMuted" style={[styles.small, styles.center, styles.pad]}>No reconciliations recorded yet.</ThemedText>
              ) : (
                history.map((h) => (
                  <View key={h.id} style={[styles.histRow, { borderTopColor: theme.border }]}>
                    <View style={styles.rowBetween}>
                      <ThemedText style={[styles.small, { fontFamily: FontWeights.bold, color: h.difference > 0 ? '#16a34a' : h.difference < 0 ? '#dc2626' : '#6b7280', flex: 1 }]}>
                        {`${h.previousQty} → ${h.newQty} (${fmtDiff(h.difference)})`}
                      </ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.tiny}>{fmtD(h.reconciledAt)}</ThemedText>
                    </View>
                    <ThemedText themeColor="textMuted" style={styles.tiny}>
                      {`${REASONS.find((r) => r.value === h.reason)?.label || h.reason}${h.user?.name ? ` · by ${h.user.name}` : ''}${h.notes ? ` · ${h.notes}` : ''}`}
                    </ThemedText>
                  </View>
                ))
              )}
            </View>
          ) : null}

          {receipt ? (
            <>
              <Field label="Actual Physical Count *">
                <Input value={count} onChangeText={(v) => setCount(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder={`e.g. ${systemQty ?? 0}`} />
              </Field>
              {diff !== null ? (
                <View style={[styles.diff, { backgroundColor: diff >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }]}>
                  <ThemedText style={[styles.body, { color: diffColor, fontFamily: FontWeights.semiBold }]}>{`Difference: ${fmtDiff(diff)}`}</ThemedText>
                </View>
              ) : null}
              <Field label="Reason *"><Select value={reason} onChange={(v) => setReason(v as ReconcileReason)} options={REASONS} /></Field>
              <Field label="Notes (optional)"><Input value={notes} onChangeText={setNotes} multiline placeholder="Any additional details about the discrepancy…" /></Field>
            </>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  flex2: { flex: 2, minWidth: 0 },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 15 },
  body: { fontSize: 14, lineHeight: 20 },
  center: { textAlign: 'center' },
  pad: { padding: 16 },
  start: { alignItems: 'flex-start' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  landed: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 2 },
  landedText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  hCard: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 10 },
  mono: { fontFamily: Fonts?.mono, fontSize: 12, lineHeight: 16 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 8 },
  fact: { minWidth: 80, gap: 2 },
  factLabel: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 0.4 },
  factValue: { fontSize: 13, lineHeight: 18 },
  sysBox: { padding: 12, borderRadius: Radii.sm, gap: 4 },
  histBox: { borderWidth: 1, borderRadius: Radii.sm, overflow: 'hidden' },
  histTitle: { padding: 10, fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  histRow: { padding: 10, borderTopWidth: 1, gap: 2 },
  diff: { padding: 10, borderRadius: Radii.sm },
});
