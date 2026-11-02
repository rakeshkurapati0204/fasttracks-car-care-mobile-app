import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { FormGrid } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  confirmReceiptArrival, deleteDraftReceipt, fetchItemsOut, getErrorMessage, logItemOut, lookupInventoryBarcode, updateInventoryReceipt,
} from '@/lib/api';
import type { BarcodeLookup, DraftReceipt, InventoryListItem, ItemOutLog } from '@/types/api';

import { csvCell, shareCsv } from './csv';
import { CATEGORIES, fmtC, fmtD, IO_REASONS, ITEM_OUT_STATUS_CFG, todayYmd, UNIT_OPTIONS } from './constants';
import { Field, InlineError, Pill } from './parts';

type Notify = (type: 'success' | 'error', msg: string) => void;

// ─── Drafts ─────────────────────────────────────────────────────────────────
const AMBER_BG = '#fef3c7';
const AMBER_TX = '#92400e';

export function DraftsTab({ drafts, loading, canConfirm, canDelete, wide, notify, onChanged }: {
  drafts: DraftReceipt[]; loading: boolean; canConfirm: boolean; canDelete: boolean; wide: boolean; notify: Notify; onChanged: () => void;
}) {
  const theme = useTheme();
  const [confirming, setConfirming] = useState<DraftReceipt | null>(null);
  const [deleting, setDeleting] = useState<DraftReceipt | null>(null);

  if (loading) return <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={96} />)}</View>;
  if (drafts.length === 0) {
    return (
      <Card>
        <View style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>No draft orders</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.small}>Stock receipts without a confirmed arrival date appear here</ThemedText>
        </View>
      </Card>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <View style={styles.gap}>
      {drafts.map((r) => {
        const est = r.estimatedArrivalDate ? new Date(r.estimatedArrivalDate) : null;
        const daysUntil = est ? Math.round((est.getTime() - today.getTime()) / 86400000) : null;
        const overdue = daysUntil !== null && daysUntil < 0;
        const totalCost = r.costPerUnit ? r.quantityReceived * r.costPerUnit : null;
        const unit = r.item?.unit || 'pcs';
        return (
          <View key={r.id} style={[styles.draft, { backgroundColor: theme.surface, borderColor: overdue ? '#f87171' : theme.border }, wide && styles.draftWide]}>
            <View style={styles.flex1}>
              <View style={styles.badgeRow}>
                <ThemedText style={styles.draftName}>{r.item?.product || r.barcode || 'Unknown Product'}</ThemedText>
                <Pill label="DRAFT" bg={AMBER_BG} color={AMBER_TX} strong />
                {overdue ? <Pill label={`OVERDUE ${Math.abs(daysUntil!)}d`} bg="#fee2e2" color="#991b1b" strong /> : null}
                {!overdue && daysUntil !== null && daysUntil <= 3 ? <Pill label={`Due in ${daysUntil}d`} bg={AMBER_BG} color={AMBER_TX} /> : null}
              </View>
              <View style={styles.facts}>
                <Fact label="Qty" value={`${r.quantityReceived} ${unit}`} />
                {r.sellerName ? <Fact label="Seller" value={r.sellerName} /> : null}
                {r.orderDate ? <Fact label="Ordered" value={fmtD(r.orderDate)} /> : null}
                {est ? <Fact label="Est. Arrival" value={fmtD(r.estimatedArrivalDate)} color={overdue ? '#dc2626' : undefined} /> : null}
                {totalCost ? <Fact label="Est. Cost" value={fmtC(totalCost)} /> : null}
                {r.item?.category ? <ThemedText themeColor="textMuted" style={styles.small}>{r.item.category}</ThemedText> : null}
              </View>
            </View>
            <View style={[styles.draftActions, wide && { flexDirection: 'column' }]}>
              {canConfirm ? <Button size="sm" onPress={() => setConfirming(r)}>Confirm Arrival</Button> : null}
              {canDelete ? <Button size="sm" variant="danger" onPress={() => setDeleting(r)}>Delete</Button> : null}
            </View>
          </View>
        );
      })}
      {confirming ? (
        <ConfirmArrivalSheet receipt={confirming} onClose={() => setConfirming(null)} notify={notify} onDone={() => { setConfirming(null); onChanged(); }} />
      ) : null}
      {deleting ? <DeleteDraftSheet receipt={deleting} onClose={() => setDeleting(null)} notify={notify} onDone={() => { setDeleting(null); onChanged(); }} /> : null}
    </View>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <ThemedText themeColor="textMuted" style={styles.fact}>
      {`${label}: `}
      <ThemedText style={[styles.factValue, color ? { color } : null]}>{value}</ThemedText>
    </ThemedText>
  );
}

function ConfirmArrivalSheet({ receipt, onClose, onDone, notify }: { receipt: DraftReceipt; onClose: () => void; onDone: () => void; notify: Notify }) {
  const theme = useTheme();
  const [qty, setQty] = useState(String(receipt.quantityReceived));
  const [date, setDate] = useState(todayYmd());
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const unit = receipt.item?.unit || 'pcs';
  const mismatch = qty !== '' && Number(qty) !== receipt.quantityReceived;

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      await confirmReceiptArrival(receipt.id, { quantityReceived: Number(qty), receiptDate: date, notes });
      // The confirm route ignores storeLocation, so it is saved on the receipt right after.
      if (location.trim()) await updateInventoryReceipt(receipt.id, { storeLocation: location.trim() }).catch(() => notify('error', 'Arrival confirmed, but the store location could not be saved.'));
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to confirm arrival'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="Confirm Arrival"
      subtitle={receipt.item?.product || receipt.barcode || ''}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          <Button onPress={confirm} loading={saving} disabled={!qty || !date} style={styles.flex1}>{saving ? 'Saving…' : 'Confirm Arrival'}</Button>
        </>
      }>
      {error ? <InlineError message={error} /> : null}
      <Field label="Actual Quantity Received">
        <Input value={qty} onChangeText={setQty} keyboardType="number-pad" />
        {mismatch ? (
          <View style={[styles.note, { backgroundColor: AMBER_BG }]}>
            <ThemedText style={[styles.noteText, { color: AMBER_TX }]}>
              {`Ordered ${receipt.quantityReceived} ${unit}, receiving ${qty} — discrepancy note will be added automatically.`}
            </ThemedText>
          </View>
        ) : null}
      </Field>
      <Field label="Receipt Date"><DateField label="Receipt Date" value={date} onChange={setDate} compact /></Field>
      <Field label="Notes (optional)"><Input value={notes} onChangeText={setNotes} multiline placeholder="Delivery condition, invoice number, etc." /></Field>
      <Field label="Store Location (optional)"><Input value={location} onChangeText={setLocation} placeholder="e.g. Room A - Rack 3, Front Shelf" /></Field>
      <View style={{ height: 1, backgroundColor: theme.border }} />
    </Sheet>
  );
}

function DeleteDraftSheet({ receipt, onClose, onDone, notify }: { receipt: DraftReceipt; onClose: () => void; onDone: () => void; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = receipt.item?.product || receipt.barcode;
  const del = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteDraftReceipt(receipt.id);
      notify('success', 'Draft deleted');
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to delete draft'));
      setBusy(false);
    }
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      locked={busy}
      title="Delete Draft"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={busy} style={styles.flex1}>Cancel</Button>
          <Button variant="danger" onPress={del} loading={busy} style={styles.flex1}>{busy ? 'Deleting…' : 'Yes, Delete'}</Button>
        </>
      }>
      {error ? <InlineError message={error} /> : null}
      <ThemedText themeColor="textMuted" style={styles.body}>
        {`Are you sure you want to delete the draft order for ${name}? This cannot be undone.`}
      </ThemedText>
    </Sheet>
  );
}

// ─── Items Out ──────────────────────────────────────────────────────────────
const STATUS_FILTER = Object.entries(ITEM_OUT_STATUS_CFG).map(([value, v]) => ({ value, label: v.label }));
const ALL = '__all';

export function ItemsOutTab({ canManage, items, wide, notify, onLogged, onCount }: {
  canManage: boolean; items: InventoryListItem[]; wide: boolean; notify: Notify; onLogged: () => void; onCount: (n: number) => void;
}) {
  const theme = useTheme();
  const [logs, setLogs] = useState<ItemOutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [fDate, setFDate] = useState('');
  const [fItem, setFItem] = useState('');
  const [fReason, setFReason] = useState(ALL);
  const [fStatus, setFStatus] = useState(ALL);

  // Log form
  const [date, setDate] = useState(todayYmd());
  const [category, setCategory] = useState('');
  const [itemName, setItemName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('pcs');
  const [reason, setReason] = useState('Sale');
  const [notes, setNotes] = useState('');
  const [looked, setLooked] = useState<BarcodeLookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const rows = await fetchItemsOut({
        date: fDate || undefined,
        item: fItem.trim() || undefined,
        reason: fReason === ALL ? undefined : fReason,
        status: fStatus === ALL ? undefined : fStatus,
      });
      setLogs(rows);
      onCount(rows.length);
    } catch (e: unknown) {
      setLoadError(getErrorMessage(e, 'Could not load the items-out log.'));
    } finally {
      setLoading(false);
    }
  }, [fDate, fItem, fReason, fStatus, onCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open / filter change
    if (canManage) load();
  }, [canManage, load]);

  if (!canManage) {
    return (
      <Card>
        <View style={styles.empty}>
          <ThemedText style={styles.emptyTitle}>Access restricted</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.small}>Items Out is available to Inventory Manager, Owner, and Store Manager.</ThemedText>
        </View>
      </Card>
    );
  }

  const lookup = async () => {
    if (!barcode.trim()) return;
    setLooking(true);
    setLooked(null);
    try {
      const r = await lookupInventoryBarcode(barcode.trim());
      setLooked(r ?? { itemName: 'Not found' });
    } catch {
      setLooked({ itemName: 'Lookup failed' });
    } finally {
      setLooking(false);
    }
  };

  const submit = async () => {
    if (!barcode.trim() && !itemName.trim()) { setFormError('Enter a barcode or item name'); return; }
    const n = parseInt(qty, 10);
    if (isNaN(n) || n <= 0) { setFormError('Enter a valid quantity'); return; }
    setSaving(true);
    setFormError('');
    try {
      const res = await logItemOut({
        quantity: n, reason, unit: unit || undefined, notes: notes || undefined, date,
        ...(barcode.trim() ? { barcode: barcode.trim() } : {}),
        ...(itemName.trim() ? { itemName: itemName.trim() } : {}),
      });
      notify('success', `Item out logged — ${res?.status || 'DEDUCTED'}`);
      setBarcode(''); setItemName(''); setQty('1'); setNotes(''); setLooked(null);
      load();
      onLogged();
    } catch (e: unknown) {
      setFormError(getErrorMessage(e, 'Failed'));
    } finally {
      setSaving(false);
    }
  };

  const suggestions = itemName.trim().length >= 1
    ? items.filter((i) => (!category || i.category === category) && i.product.toLowerCase().includes(itemName.trim().toLowerCase()) && i.product !== itemName).slice(0, 6)
    : [];

  const exportCsv = async () => {
    try {
      const rows = [['Date', 'Item', 'Barcode', 'Qty', 'Unit', 'Reason', 'Notes', 'Status'].join(',')];
      logs.forEach((l) => rows.push([csvCell(fmtD(l.date)), csvCell(l.itemName), l.barcode || '', l.quantity, l.unit || '', l.reason || '', csvCell(l.notes), l.status].join(',')));
      await shareCsv(`items-out-${todayYmd()}.csv`, rows);
    } catch (e: unknown) {
      notify('error', getErrorMessage(e, 'Could not export the log.'));
    }
  };

  const filtered = !!(fDate || fItem || fReason !== ALL || fStatus !== ALL);

  return (
    <View style={styles.gapLg}>
      <Card>
        <View style={styles.gap}>
          <ThemedText style={styles.cardTitle}>Log Item Out</ThemedText>
          {formError ? <InlineError message={formError} /> : null}
          <FormGrid>
            <Field label="Date *"><DateField label="Date" value={date} onChange={setDate} compact /></Field>
            <Field label="Category">
              <Select value={category} onChange={setCategory} placeholder="— Select —" options={[{ value: '', label: '— Select —' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
            </Field>
          </FormGrid>
          <Field label="Item Name *" hint="Type item name or select from list. FIFO deduction applied if no barcode.">
            <Input value={itemName} onChangeText={(v) => { setItemName(v); setLooked(null); }} placeholder="e.g. 3M PPF, Recliner Set…" autoCorrect={false} />
            {suggestions.length > 0 ? (
              <View style={[styles.suggest, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                {suggestions.map((s) => (
                  <ThemedText key={s.id} onPress={() => setItemName(s.product)} style={styles.suggestItem}>{s.product}</ThemedText>
                ))}
              </View>
            ) : null}
          </Field>
          <Field label="Barcode (optional)" hint="Scan to deduct from that specific batch. Leave blank for FIFO by name.">
            <View style={styles.rowGap}>
              <View style={styles.flex1}>
                <Input value={barcode} onChangeText={(v) => { setBarcode(v); setLooked(null); }} placeholder="FT000001 (optional)" autoCapitalize="characters" onSubmitEditing={lookup} />
              </View>
              <Button variant="outline" size="sm" onPress={lookup} loading={looking}>Look up</Button>
            </View>
          </Field>
          {looked ? (
            <View style={[styles.lookup, {
              backgroundColor: looked.receiptId ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              borderColor: looked.receiptId ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
            }]}>
              <ThemedText style={[styles.small, { color: looked.receiptId ? undefined : '#dc2626' }]}>
                {looked.receiptId ? `✓ ${looked.itemName} — ${looked.remainingQty ?? '?'} remaining` : looked.itemName}
              </ThemedText>
            </View>
          ) : null}
          <FormGrid cols={3}>
            <Field label="Quantity *"><Input value={qty} onChangeText={setQty} keyboardType="number-pad" /></Field>
            <Field label="Unit"><Select value={unit} onChange={setUnit} options={UNIT_OPTIONS.map((u) => ({ value: u, label: u }))} /></Field>
            <Field label="Reason"><Select value={reason} onChange={setReason} options={IO_REASONS.map((r) => ({ value: r, label: r }))} /></Field>
          </FormGrid>
          <Field label="Notes (optional)"><Input value={notes} onChangeText={setNotes} placeholder="e.g. Used in job #1234, damaged on delivery…" /></Field>
          <View style={styles.end}>
            <Button onPress={submit} loading={saving} disabled={!barcode.trim() && !itemName.trim()}>{saving ? 'Logging…' : 'Log Out'}</Button>
          </View>
        </View>
      </Card>

      <Card>
        <View style={styles.gap}>
          <FormGrid cols={4}>
            <DateField label="Date" value={fDate} onChange={setFDate} compact />
            <Input value={fItem} onChangeText={setFItem} placeholder="Filter item…" />
            <Select value={fReason} onChange={setFReason} options={[{ value: ALL, label: 'All Reasons' }, ...IO_REASONS.map((r) => ({ value: r, label: r }))]} />
            <Select value={fStatus} onChange={setFStatus} options={[{ value: ALL, label: 'All Statuses' }, ...STATUS_FILTER]} />
          </FormGrid>
          <View style={styles.rowGap}>
            {filtered ? <Button variant="outline" size="sm" onPress={() => { setFDate(''); setFItem(''); setFReason(ALL); setFStatus(ALL); }}>Clear</Button> : null}
            <View style={styles.flex1} />
            <Button variant="outline" size="sm" onPress={exportCsv}>Export CSV</Button>
            <Button variant="outline" size="sm" onPress={load}>Refresh</Button>
          </View>
          {loadError ? <InlineError message={loadError} /> : null}
          {loading ? (
            <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={48} />)}</View>
          ) : logs.length === 0 ? (
            <View style={styles.empty}><ThemedText style={styles.emptyTitle}>No items logged out yet</ThemedText></View>
          ) : wide ? (
            <View style={[styles.table, { borderColor: theme.border }]}>
              <LogRow cells={['Date', 'Item', 'Barcode', 'Qty', 'Unit', 'Reason', 'Notes', 'Status']} head />
              {logs.map((l) => <LogRow key={l.id} log={l} />)}
            </View>
          ) : (
            <View style={styles.gap}>{logs.map((l) => <LogCard key={l.id} log={l} />)}</View>
          )}
        </View>
      </Card>
    </View>
  );
}

const LOG_FLEX = [1.1, 1.6, 1.1, 0.5, 0.6, 1, 1.4, 1.1];

function LogRow({ log, cells, head }: { log?: ItemOutLog; cells?: string[]; head?: boolean }) {
  const theme = useTheme();
  const sc = log ? ITEM_OUT_STATUS_CFG[log.status] || ITEM_OUT_STATUS_CFG.DEDUCTED : null;
  const vals = cells ?? [
    fmtD(log!.date), log!.itemName, log!.barcode || '—', String(log!.quantity), log!.unit || '—', log!.reason || '—', log!.notes || '—', '',
  ];
  return (
    <View style={[styles.tr, { borderBottomColor: theme.border }]}>
      {vals.map((v, i) => (
        <View key={i} style={{ flex: LOG_FLEX[i], paddingHorizontal: 6 }}>
          {i === 7 && sc ? <Pill label={sc.label} bg={sc.bg} color={sc.text} strong /> : (
            <ThemedText
              numberOfLines={i === 6 ? 1 : 2}
              themeColor={head ? 'textMuted' : undefined}
              style={head ? styles.th : [styles.td, i === 1 && { fontFamily: FontWeights.semiBold }, i === 2 && styles.mono]}>
              {head ? v.toUpperCase() : v}
            </ThemedText>
          )}
        </View>
      ))}
    </View>
  );
}

function LogCard({ log }: { log: ItemOutLog }) {
  const theme = useTheme();
  const sc = ITEM_OUT_STATUS_CFG[log.status] || ITEM_OUT_STATUS_CFG.DEDUCTED;
  return (
    <View style={[styles.logCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.rowBetween}>
        <ThemedText style={[styles.td, { fontFamily: FontWeights.semiBold, flex: 1 }]}>{log.itemName}</ThemedText>
        <Pill label={sc.label} bg={sc.bg} color={sc.text} strong />
      </View>
      <ThemedText themeColor="textMuted" style={styles.small}>
        {`${fmtD(log.date)} · ${log.quantity} ${log.unit || ''} · ${log.reason || '—'}${log.barcode ? ` · ${log.barcode}` : ''}`}
      </ThemedText>
      {log.notes ? <ThemedText themeColor="textSecondary" style={styles.small}>{log.notes}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  gapLg: { gap: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 36 },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  cardTitle: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  draft: { borderWidth: 1, borderRadius: Radii.md, padding: 16, gap: 12 },
  draftWide: { flexDirection: 'row', alignItems: 'flex-start' },
  draftName: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 4 },
  fact: { fontSize: 13, lineHeight: 18 },
  factValue: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.bold },
  draftActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { marginTop: 6, padding: 8, borderRadius: 6 },
  noteText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  suggest: { borderWidth: 1, borderRadius: Radii.sm, marginTop: 4, overflow: 'hidden' },
  suggestItem: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, lineHeight: 20 },
  rowGap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  lookup: { borderWidth: 1, borderRadius: Radii.sm, padding: 10 },
  end: { alignItems: 'flex-end' },
  table: { borderWidth: 1, borderRadius: Radii.sm, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  th: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  td: { fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  logCard: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 4 },
});
