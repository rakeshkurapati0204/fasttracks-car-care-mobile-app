import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights, Fonts, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { assignReceiptBarcode, getErrorMessage, updateInventoryReceipt } from '@/lib/api';
import type { InventoryListItem, InventoryListReceipt } from '@/types/api';

import { fmtC, fmtD, STATUS_CFG, verifyState } from './constants';
import { Pill } from './parts';

export type ProductActions = {
  canWrite: boolean;
  onAddStock: (i: InventoryListItem) => void;
  onEdit: (i: InventoryListItem) => void;
  onDelete: (i: InventoryListItem) => void;
  onImages: (i: InventoryListItem) => void;
  onHistory: (i: InventoryListItem) => void;
  onReconcile: (i: InventoryListItem) => void;
  onBarcode: (barcode: string, label: string, storeLocation?: string) => void;
  canSelect: boolean;
  selectedItems: Set<string>;
  selectedReceipts: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleReceipt: (id: string) => void;
  onChanged: () => void;
  notify: (type: 'success' | 'error', msg: string) => void;
};

// Table column weights (Product, Category, Selling Price, Incentive, Stock, Status, Verified, Actions).
const COLS = [2.3, 1.2, 1, 0.9, 0.9, 1.1, 1, 1.9];
const HEADERS = ['Product', 'Category', 'Selling Price', 'Incentive', 'Stock', 'Status', 'Verified', 'Actions'];

function Check({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label}>
      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? theme.primary : theme.textMuted} />
    </Pressable>
  );
}

export function TableHeader({ canSelect, allSelected, onToggleAll }: { canSelect: boolean; allSelected: boolean; onToggleAll: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.thRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.chev}>{canSelect ? <Check on={allSelected} onPress={onToggleAll} label="Select all" /> : null}</View>
      <View style={styles.chev} />
      {HEADERS.map((h, i) => (
        <View key={h} style={{ flex: COLS[i], paddingHorizontal: 6 }}>
          <ThemedText themeColor="textMuted" style={[styles.th, i === 7 && { textAlign: 'right' }]}>{h.toUpperCase()}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function VerifiedPill({ at }: { at?: string | null }) {
  const s = verifyState(at);
  if (s === 'unverified') return <Pill label="Unverified" bg="rgba(107,114,128,0.15)" color="#6b7280" />;
  if (s === 'verified') return <Pill label="✓ Verified" bg={STATUS_CFG.ACTIVE.bg} color={STATUS_CFG.ACTIVE.text} />;
  return <Pill label="Verify Soon" bg={STATUS_CFG.OUT_OF_STOCK.bg} color={STATUS_CFG.OUT_OF_STOCK.text} />;
}

function Thumb({ item, size, onPress }: { item: InventoryListItem; size: number; onPress: () => void }) {
  const theme = useTheme();
  const has = !!item.imageUrls?.length;
  return has ? (
    <Pressable onPress={onPress} accessibilityRole="imagebutton" accessibilityLabel="View photos">
      <Image source={{ uri: item.imageUrls![0] }} style={{ width: size, height: size, borderRadius: 6, borderWidth: 1, borderColor: theme.border }} />
    </Pressable>
  ) : (
    <View style={{ width: size, height: size, borderRadius: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.border }} />
  );
}

function NameBlock({ item, onImages }: { item: InventoryListItem; onImages: () => void }) {
  const theme = useTheme();
  const receipts = item.receipts ?? [];
  const locs = Array.from(new Set(receipts.map((r) => r.storeLocation).filter(Boolean))) as string[];
  const has = !!item.imageUrls?.length;
  return (
    <View style={styles.flex1}>
      <ThemedText onPress={has ? onImages : undefined} style={styles.name}>{item.product}</ThemedText>
      {item.warranty && item.warranty !== 'No Warranty' ? <ThemedText themeColor="textMuted" style={styles.sub}>{`${item.warranty} warranty`}</ThemedText> : null}
      {receipts.length > 0 ? <ThemedText themeColor="textMuted" style={styles.sub}>{`${receipts.length} batch${receipts.length > 1 ? 'es' : ''}`}</ThemedText> : null}
      {item.storeLocation ? (
        <ThemedText style={[styles.sub, { color: theme.primary, fontFamily: FontWeights.semiBold }]}>{item.storeLocation}</ThemedText>
      ) : locs.length > 0 ? (
        <ThemedText themeColor="textMuted" style={styles.sub}>{locs.join(', ')}</ThemedText>
      ) : null}
    </View>
  );
}

function RowButtons({ item, a }: { item: InventoryListItem; a: ProductActions }) {
  return (
    <View style={styles.btns}>
      {a.canWrite ? <Button size="sm" onPress={() => a.onAddStock(item)}>+ Stock</Button> : null}
      {a.canWrite ? <Button size="sm" variant="outline" onPress={() => a.onReconcile(item)}>Reconcile</Button> : null}
      <Button size="sm" variant="outline" onPress={() => a.onHistory(item)}>History</Button>
      {a.canWrite ? <Button size="sm" variant="outline" onPress={() => a.onEdit(item)}>Edit</Button> : null}
      {a.canWrite ? <Button size="sm" variant="danger" onPress={() => a.onDelete(item)}>Del</Button> : null}
    </View>
  );
}

// ─── Wide: table row ────────────────────────────────────────────────────────
export function ProductTableRow({ item, a, last }: { item: InventoryListItem; a: ProductActions; last: boolean }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const receipts = item.receipts ?? [];
  const s = STATUS_CFG[item.effectiveStatus] ?? STATUS_CFG.ACTIVE;
  return (
    <View style={[styles.rowWrap, { borderColor: theme.border, backgroundColor: open ? withAlpha(theme.primary, 0.04) : theme.backgroundElement }, last && styles.rowLast]}>
      <View style={styles.tr}>
        <View style={styles.chev}>{a.canSelect ? <Check on={a.selectedItems.has(item.id)} onPress={() => a.onToggleItem(item.id)} label="Select product" /> : null}</View>
        <Pressable onPress={() => setOpen((o) => !o)} disabled={receipts.length === 0} style={styles.chev} accessibilityRole="button" accessibilityLabel="Toggle batches">
          {receipts.length > 0 ? <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={theme.textMuted} /> : null}
        </Pressable>
        <View style={[styles.cell, { flex: COLS[0], flexDirection: 'row', gap: 8, alignItems: 'flex-start' }]}>
          <Thumb item={item} size={32} onPress={() => a.onImages(item)} />
          <NameBlock item={item} onImages={() => a.onImages(item)} />
        </View>
        <View style={[styles.cell, { flex: COLS[1] }]}><ThemedText style={styles.td}>{item.category}</ThemedText></View>
        <View style={[styles.cell, { flex: COLS[2] }]}><ThemedText style={[styles.td, styles.mono]}>{fmtC(item.sellingPrice)}</ThemedText></View>
        <View style={[styles.cell, { flex: COLS[3] }]}>
          {item.incentiveValue ? <ThemedText style={[styles.td, styles.mono]}>{fmtC(item.incentiveValue)}</ThemedText> : <ThemedText themeColor="textMuted" style={styles.td}>—</ThemedText>}
        </View>
        <View style={[styles.cell, { flex: COLS[4] }]}>
          <ThemedText style={styles.td}>
            <ThemedText style={{ fontFamily: FontWeights.semiBold, fontSize: 14 }}>{String(item.totalStock ?? 0)}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.unit}>{` ${item.unit}`}</ThemedText>
          </ThemedText>
        </View>
        <View style={[styles.cell, { flex: COLS[5] }]}><Pill label={s.label} bg={s.bg} color={s.text} strong /></View>
        <View style={[styles.cell, { flex: COLS[6] }]}><VerifiedPill at={item.lastVerifiedAt} /></View>
        <View style={[styles.cell, { flex: COLS[7], alignItems: 'flex-end' }]}><RowButtons item={item} a={a} /></View>
      </View>
      {open ? <Batches item={item} receipts={receipts} a={a} /> : null}
    </View>
  );
}

// ─── Phone: product card ────────────────────────────────────────────────────
export function ProductCard({ item, a }: { item: InventoryListItem; a: ProductActions }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const receipts = item.receipts ?? [];
  const s = STATUS_CFG[item.effectiveStatus] ?? STATUS_CFG.ACTIVE;
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.cardHead}>
        {a.canSelect ? <Check on={a.selectedItems.has(item.id)} onPress={() => a.onToggleItem(item.id)} label="Select product" /> : null}
        <Thumb item={item} size={40} onPress={() => a.onImages(item)} />
        <NameBlock item={item} onImages={() => a.onImages(item)} />
        <Pill label={s.label} bg={s.bg} color={s.text} strong />
      </View>
      <View style={styles.facts}>
        <Fact label="Category" value={item.category} />
        <Fact label="Selling Price" value={fmtC(item.sellingPrice)} mono />
        <Fact label="Incentive" value={item.incentiveValue ? fmtC(item.incentiveValue) : '—'} mono />
        <Fact label="Stock" value={`${item.totalStock ?? 0} ${item.unit}`} bold />
        <View style={styles.fact}>
          <ThemedText themeColor="textMuted" style={styles.factLabel}>VERIFIED</ThemedText>
          <VerifiedPill at={item.lastVerifiedAt} />
        </View>
      </View>
      <View style={styles.cardFoot}>
        <RowButtons item={item} a={a} />
        {receipts.length > 0 ? (
          <Pressable onPress={() => setOpen((o) => !o)} style={styles.toggle} accessibilityRole="button">
            <ThemedText style={[styles.sub, { color: theme.primary }]}>{open ? 'Hide batches' : `Show ${receipts.length} batch${receipts.length > 1 ? 'es' : ''}`}</ThemedText>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={theme.primary} />
          </Pressable>
        ) : null}
      </View>
      {open ? <Batches item={item} receipts={receipts} a={a} /> : null}
    </View>
  );
}

function Fact({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <View style={styles.fact}>
      <ThemedText themeColor="textMuted" style={styles.factLabel}>{label.toUpperCase()}</ThemedText>
      <ThemedText style={[styles.factValue, mono && styles.mono, bold && { fontFamily: FontWeights.bold }]}>{value}</ThemedText>
    </View>
  );
}

// ─── Expanded batches ───────────────────────────────────────────────────────
function Batches({ item, receipts, a }: { item: InventoryListItem; receipts: InventoryListReceipt[]; a: ProductActions }) {
  const theme = useTheme();
  if (receipts.length === 0) {
    return (
      <View style={[styles.batch, { borderLeftColor: theme.primary }]}>
        <ThemedText themeColor="textMuted" style={[styles.sub, { fontStyle: 'italic' }]}>No stock receipts yet — add stock to create the first batch.</ThemedText>
      </View>
    );
  }
  return (
    <View style={styles.batches}>
      {receipts.map((r) => <BatchBlock key={r.id} item={item} r={r} a={a} />)}
    </View>
  );
}

function BatchBlock({ item, r, a }: { item: InventoryListItem; r: InventoryListReceipt; a: ProductActions }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [loc, setLoc] = useState(r.storeLocation || '');
  const [busy, setBusy] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [now] = useState(() => Date.now());

  const saveLoc = async () => {
    setBusy(true);
    try {
      await updateInventoryReceipt(r.id, { storeLocation: loc.trim() || null });
      setEditing(false);
      a.onChanged();
    } catch (e: unknown) {
      a.notify('error', getErrorMessage(e, 'Could not save this location.'));
    } finally {
      setBusy(false);
    }
  };

  const genBarcode = async () => {
    setBarcodeBusy(true);
    try {
      await assignReceiptBarcode(r.id);
      a.onChanged();
    } catch {
      a.notify('error', 'Failed to generate barcode');
    } finally {
      setBarcodeBusy(false);
    }
  };

  const mrp = r.mrpAtReceipt || item.sellingPrice || 0;
  const cost = r.costPerUnit || 0;
  const belowCost = mrp > 0 && cost > 0 && mrp < cost;
  const rec = r.lastReconciliation;
  const days = rec ? Math.floor((now - new Date(rec.reconciledAt).getTime()) / 86400000) : 0;
  const daysLabel = days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;

  return (
    <View style={[styles.batch, { borderLeftColor: theme.primary, backgroundColor: 'rgba(0,0,0,0.02)' }]}>
      <View style={styles.batchTop}>
        {a.canSelect && r.barcode ? <Check on={a.selectedReceipts.has(r.id)} onPress={() => a.onToggleReceipt(r.id)} label="Select for bulk print" /> : null}
        <View style={styles.flex1}>
          <ThemedText style={[styles.barcode, { color: r.barcode ? theme.primary : theme.textMuted }]}>{r.barcode || 'No barcode'}</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.sub}>{fmtD(r.orderDate || r.createdAt)}</ThemedText>
          {rec ? <ThemedText themeColor="textMuted" style={styles.tiny}>{`Reconciled ${daysLabel}${rec.user?.name ? ` by ${rec.user.name}` : ''}`}</ThemedText> : null}
        </View>
        <View style={styles.batchPills}>
          {r.receiptDate ? <Pill label="Received" bg={STATUS_CFG.ACTIVE.bg} color={STATUS_CFG.ACTIVE.text} strong /> : <Pill label="Draft" bg="#fef3c7" color="#92400e" strong />}
          {belowCost ? <Pill label="Below cost" bg="rgba(239,68,68,0.15)" color="#dc2626" strong /> : null}
          {r.barcode ? (
            <Button size="sm" variant="outline" onPress={() => a.onBarcode(r.barcode!, item.product, r.storeLocation || undefined)}>Print</Button>
          ) : a.canWrite ? (
            <Button size="sm" variant="outline" onPress={genBarcode} loading={barcodeBusy}>+ Barcode</Button>
          ) : null}
        </View>
      </View>

      <View style={styles.batchFacts}>
        <Fact label="Seller" value={r.sellerName || '—'} />
        <Fact label="Cost / unit" value={r.costPerUnit ? fmtC(r.costPerUnit) : '—'} mono />
        <Fact label="Remaining" value={`${r.remainingQty != null ? r.remainingQty : r.quantityReceived} / ${r.quantityReceived} rcvd`} bold />
      </View>

      {editing ? (
        <View style={styles.locEdit}>
          <View style={styles.flex1}><Input value={loc} onChangeText={setLoc} placeholder="e.g. Room A - Rack 3" autoFocus onSubmitEditing={saveLoc} /></View>
          <Button size="sm" onPress={saveLoc} loading={busy}>✓</Button>
          <Button size="sm" variant="outline" onPress={() => { setEditing(false); setLoc(r.storeLocation || ''); }}>✕</Button>
        </View>
      ) : (
        <View style={styles.locRow}>
          <ThemedText themeColor="textMuted" style={[styles.sub, !r.storeLocation && { fontStyle: 'italic' }]}>{r.storeLocation || 'No location'}</ThemedText>
          {a.canWrite ? (
            <Pressable onPress={() => setEditing(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit store location">
              <Ionicons name="create-outline" size={14} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  mono: { fontFamily: Fonts?.mono },
  thRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderWidth: 1, borderTopLeftRadius: Radii.md, borderTopRightRadius: Radii.md },
  th: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  chev: { width: 28, alignItems: 'center', justifyContent: 'center' },
  rowWrap: { borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1 },
  rowLast: { borderBottomLeftRadius: Radii.md, borderBottomRightRadius: Radii.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10 },
  cell: { paddingHorizontal: 6, minWidth: 0 },
  td: { fontSize: 13, lineHeight: 18 },
  unit: { fontSize: 12, lineHeight: 16 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  sub: { fontSize: 11, lineHeight: 16 },
  tiny: { fontSize: 10, lineHeight: 14 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
  card: { borderWidth: 1, borderRadius: Radii.md, padding: 14, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 8 },
  fact: { minWidth: 90, gap: 2 },
  factLabel: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 0.4 },
  factValue: { fontSize: 13, lineHeight: 18 },
  cardFoot: { gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  batches: { paddingBottom: 8, paddingHorizontal: 8, gap: 6 },
  batch: { borderLeftWidth: 3, padding: 10, gap: 8, borderRadius: 4 },
  batchTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  batchPills: { alignItems: 'flex-end', gap: 6 },
  barcode: { fontFamily: Fonts?.mono, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  batchFacts: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 6 },
  locEdit: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
