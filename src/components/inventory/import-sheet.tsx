import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as XLSX from 'xlsx';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Fonts, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchNextBatchBarcode, getErrorMessage, importInventoryRows } from '@/lib/api';
import type { InventoryListItem, InventoryListReceipt } from '@/types/api';

import { CATEGORIES, GST_SLABS } from './constants';
import { InlineError, Pill } from './parts';

type ImportAction = 'new_product' | 'add_stock' | 'merge_seller' | 'error';

interface ImportPreviewRow {
  _rowNum: number;
  _skip: boolean;
  _error?: string;
  _action: ImportAction;
  itemName: string; category: string; mrp: number; unit: string; dealerPrice: number;
  sellerName: string; sellerCity?: string; quantity: number; barcode: string;
  existingItemId?: string; existingReceiptId?: string;
  lp1?: string; lc1: number; lp2: string; lc2: number; gstPercent: number;
  paymentTerms?: string; warranty?: string; compatibility?: string; notes?: string; costPerUnit?: number;
}

const ACTION_CFG: Record<ImportAction, { label: string; bg: string; color: string }> = {
  new_product: { label: 'New Product', bg: 'rgba(99,102,241,0.15)', color: '#6366f1' },
  add_stock: { label: 'Add Stock', bg: 'rgba(34,197,94,0.15)', color: '#16a34a' },
  merge_seller: { label: 'Reuse Barcode', bg: 'rgba(245,158,11,0.15)', color: '#d97706' },
  error: { label: 'Error', bg: 'rgba(239,68,68,0.15)', color: '#dc2626' },
};

// The dashboard's template, written with the same `xlsx` package and handed to the share sheet.
export async function downloadTemplate() {
  const headers = [
    'Item Name', 'Category', 'MRP', 'Unit', 'Dealer Price', 'Seller Name', 'Seller City',
    'Quantity', 'Logistics Partner 1', 'Logistics Charges 1', 'Logistics Partner 2',
    'Logistics Charges 2', 'GST %', 'Payment Terms', 'Warranty', 'Compatibility', 'Notes',
  ];
  const sample = [
    '3M PPF Roll', 'PPFs', 1500, 'pcs', 1200, 'XYZ Distributors', 'Mumbai',
    10, 'DTDC', 500, 'Porter', 200, 18, 'Cash on Delivery', '1 Year', 'Universal', 'Premium quality PPF film',
  ];
  const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
  ws['!cols'] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const uri = `${FileSystem.cacheDirectory}inventory-import-template.xlsx`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', dialogTitle: 'inventory-import-template.xlsx' });
}

const getCol = (raw: Record<string, unknown>, keys: string[]): string => {
  for (const k of Object.keys(raw)) {
    if (keys.some((key) => k.toLowerCase().trim() === key.toLowerCase().trim())) return String(raw[k] ?? '').trim();
  }
  return '';
};

async function buildRows(b64: string, items: InventoryListItem[]): Promise<ImportPreviewRow[]> {
  const wb = XLSX.read(b64, { type: 'base64' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  if (rawRows.length === 0) throw new Error('No rows found in file');

  const bc = await fetchNextBatchBarcode().catch(() => null);
  let nextNum = parseInt((bc?.barcode || 'FT000000').replace('FT', ''), 10);

  const nameToItem = new Map<string, InventoryListItem>();
  items.forEach((i) => nameToItem.set(i.product.toLowerCase().trim(), i));
  const receiptMap = new Map<string, InventoryListReceipt>();
  items.forEach((item) => (item.receipts || []).forEach((r) => {
    const key = `${item.id}::${(r.sellerName || '').toLowerCase().trim()}`;
    if (!receiptMap.has(key)) receiptMap.set(key, r);
  }));

  return rawRows.map((raw, idx): ImportPreviewRow => {
    const itemName = getCol(raw, ['item name', 'name', 'product name', 'product', 'item']);
    const catRaw = getCol(raw, ['category', 'cat', 'type']);
    const category = CATEGORIES.find((c) => c.toLowerCase() === catRaw.toLowerCase()) || 'Miscellaneous and Tools';
    const mrp = parseFloat(getCol(raw, ['mrp', 'selling price', 'price', 'mrp (₹)'])) || 0;
    const unit = getCol(raw, ['unit', 'uom', 'unit of measure']) || 'pcs';
    const dealerPrice = parseFloat(getCol(raw, ['dealer price', 'dealer', 'cost', 'purchase price', 'buying price', 'cost price'])) || 0;
    const sellerName = getCol(raw, ['seller name', 'seller', 'supplier', 'vendor', 'distributor']) || 'Unknown';
    const sellerCity = getCol(raw, ['seller city', 'city', 'seller location']);
    const quantity = parseInt(getCol(raw, ['quantity', 'qty', 'stock', 'qty received', 'quantity received']), 10) || 0;
    const lp1 = getCol(raw, ['logistics partner 1', 'logistics 1', 'courier 1', 'courier']);
    const lc1 = parseFloat(getCol(raw, ['logistics charges 1', 'logistics charge 1', 'courier charges 1', 'courier charge'])) || 0;
    const lp2Raw = getCol(raw, ['logistics partner 2', 'logistics 2', 'courier 2']);
    const lc2 = parseFloat(getCol(raw, ['logistics charges 2', 'logistics charge 2', 'courier charges 2'])) || 0;
    const lp2 = lp2Raw || (lc2 > 0 ? 'Porter' : '');
    const gstRaw = parseFloat(getCol(raw, ['gst %', 'gst', 'gst percent', 'gst rate', 'tax %'])) || 18;
    const gstPercent = GST_SLABS.some((s) => Number(s.value) === gstRaw) ? gstRaw : 18;
    const paymentTerms = getCol(raw, ['payment terms', 'payment', 'payment mode']);
    const warranty = getCol(raw, ['warranty', 'guarantee']);
    const compatibility = getCol(raw, ['compatibility', 'compat', 'compatible with']) || 'Universal';
    const notes = getCol(raw, ['notes', 'remarks', 'comments', 'description']);
    const base = { _rowNum: idx + 2, category, mrp, unit, dealerPrice, sellerName, sellerCity, quantity, lp1, lc1, lp2: lp2 || 'Porter', lc2, gstPercent, paymentTerms, warranty, compatibility, notes };

    if (!itemName) return { ...base, _skip: true, _error: 'Missing item name', _action: 'error', itemName: '—', barcode: '' };
    if (mrp <= 0) return { ...base, _skip: true, _error: 'Missing/zero MRP', _action: 'error', itemName, barcode: '' };

    const existingItem = nameToItem.get(itemName.toLowerCase().trim());
    const existingItemId = existingItem?.id;
    let existingReceiptId: string | undefined;
    let barcode: string;
    if (existingItemId) {
      const existingReceipt = receiptMap.get(`${existingItemId}::${sellerName.toLowerCase().trim()}`);
      if (existingReceipt) {
        existingReceiptId = existingReceipt.id;
        barcode = existingReceipt.barcode || `FT${String(++nextNum).padStart(6, '0')}`;
      } else barcode = `FT${String(++nextNum).padStart(6, '0')}`;
    } else barcode = `FT${String(++nextNum).padStart(6, '0')}`;

    const action: ImportAction = existingItemId ? (existingReceiptId ? 'merge_seller' : 'add_stock') : 'new_product';
    const logPerUnit = quantity > 0 ? (lc1 + lc2) / quantity : 0;
    const costPerUnit = dealerPrice > 0 ? dealerPrice + logPerUnit : undefined;
    return { ...base, _skip: false, _error: undefined, _action: action, itemName, barcode, existingItemId, existingReceiptId, costPerUnit };
  });
}

export function ImportSheet({ items, onClose, onImported }: { items: InventoryListItem[]; onClose: () => void; onImported: () => void }) {
  const theme = useTheme();
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
  const [rows, setRows] = useState<ImportPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [summary, setSummary] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [error, setError] = useState('');

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) return;
    setParsing(true);
    setError('');
    try {
      const b64 = await FileSystem.readAsStringAsync(r.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      setRows(await buildRows(b64, items));
      setStep('preview');
    } catch (e: unknown) {
      setError(`Parse error: ${getErrorMessage(e, 'could not read this file')}`);
    } finally {
      setParsing(false);
    }
  };

  const update = (idx: number, changes: Partial<ImportPreviewRow>) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...changes } : r)));

  const valid = rows.filter((r) => !r._skip && r._action !== 'error');
  const errorCount = rows.filter((r) => r._action === 'error').length;

  const doImport = async () => {
    if (valid.length === 0) { setError('No valid rows to import'); return; }
    setImporting(true);
    setError('');
    try {
      setSummary(await importInventoryRows(valid as unknown as Record<string, unknown>[]));
      setStep('done');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Import failed'));
    } finally {
      setImporting(false);
    }
  };

  const templateAction = async () => {
    try { await downloadTemplate(); } catch (e: unknown) { setError(getErrorMessage(e, 'Could not create the template.')); }
  };

  const title = step === 'upload' ? 'Import from Excel' : step === 'preview' ? 'Preview Import' : 'Import Complete';
  const count = (a: ImportAction) => valid.filter((r) => r._action === a).length;

  const footer = step === 'upload' ? (
    <>
      <Button variant="outline" onPress={templateAction} style={styles.flex1}>Download Template</Button>
      <Button variant="ghost" onPress={onClose} style={styles.flex1}>Cancel</Button>
    </>
  ) : step === 'preview' ? (
    <>
      <Button variant="ghost" onPress={() => { setStep('upload'); setError(''); }} disabled={importing} style={styles.flex1}>← Back</Button>
      <Button onPress={doImport} loading={importing} disabled={valid.length === 0} style={styles.flex2}>{importing ? 'Importing…' : `Import ${valid.length} rows`}</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onPress={onClose} style={styles.flex1}>Close</Button>
      <Button onPress={() => { onImported(); onClose(); }} style={styles.flex1}>Refresh Inventory</Button>
    </>
  );

  return (
    <Sheet visible fullHeight onClose={onClose} locked={importing || parsing} title={title} footer={footer}>
      {error ? <InlineError message={error} /> : null}

      {step === 'upload' ? (
        <View style={styles.gap}>
          <ThemedText themeColor="textSecondary" style={styles.body}>
            Upload an .xlsx or .xls file. Products with matching names will have stock added; matching seller entries will be merged.
          </ThemedText>
          <Pressable onPress={pick} disabled={parsing} accessibilityRole="button" style={[styles.drop, { borderColor: theme.border }]}>
            <Ionicons name="cloud-upload-outline" size={34} color={theme.textMuted} />
            <ThemedText style={styles.dropTitle}>{parsing ? 'Reading file…' : 'Tap to choose a file'}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>.xlsx or .xls files</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {step === 'preview' ? (
        <View style={styles.gap}>
          <View style={[styles.strip, { backgroundColor: theme.surface }]}>
            <ThemedText themeColor="textSecondary" style={styles.small}>
              <ThemedText style={styles.bold}>{String(rows.length)}</ThemedText>{' rows · '}
              <ThemedText style={[styles.bold, { color: '#6366f1' }]}>{String(count('new_product'))}</ThemedText>{' new · '}
              <ThemedText style={[styles.bold, { color: '#16a34a' }]}>{String(count('add_stock'))}</ThemedText>{' add stock · '}
              <ThemedText style={[styles.bold, { color: '#d97706' }]}>{String(count('merge_seller'))}</ThemedText>{' reuse barcode · '}
              <ThemedText style={[styles.bold, { color: '#dc2626' }]}>{String(errorCount)}</ThemedText>{' errors'}
            </ThemedText>
          </View>
          {rows.map((row, idx) => {
            const a = ACTION_CFG[row._action];
            const dim = row._skip && row._action !== 'error';
            return (
              <View
                key={idx}
                style={[styles.row, {
                  borderColor: theme.border, opacity: dim ? 0.5 : 1,
                  backgroundColor: row._action === 'error' ? 'rgba(239,68,68,0.05)' : theme.backgroundElement,
                }]}>
                <View style={styles.rowHead}>
                  <ThemedText themeColor="textMuted" style={styles.rowNum}>{`#${row._rowNum}`}</ThemedText>
                  {row._action !== 'error' ? (
                    <Pressable onPress={() => update(idx, { _skip: !row._skip })} accessibilityRole="checkbox" accessibilityState={{ checked: !row._skip }} hitSlop={8}>
                      <Ionicons name={row._skip ? 'square-outline' : 'checkbox'} size={20} color={theme.primary} />
                    </Pressable>
                  ) : null}
                  <ThemedText numberOfLines={2} style={[styles.rowName, styles.flex1]}>{row.itemName}</ThemedText>
                  <Pill label={a.label} bg={a.bg} color={a.color} strong />
                </View>
                {row._action === 'error' ? (
                  <ThemedText style={[styles.small, { color: '#dc2626' }]}>{row._error}</ThemedText>
                ) : (
                  <>
                    <Select compact value={row.category} onChange={(v) => update(idx, { category: v })} disabled={row._skip} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
                    <View style={styles.facts}>
                      <ThemedText style={styles.small}>{`MRP ₹${row.mrp}`}</ThemedText>
                      <ThemedText style={styles.small}>{`${row.quantity} ${row.unit}`}</ThemedText>
                      <ThemedText numberOfLines={1} style={[styles.small, styles.flex1]}>{row.sellerName}</ThemedText>
                      <ThemedText style={[styles.small, { fontFamily: Fonts?.mono }]}>{row.costPerUnit ? `₹${row.costPerUnit.toFixed(2)}/unit` : '—'}</ThemedText>
                    </View>
                    {row._action === 'merge_seller' ? (
                      <ThemedText style={[styles.small, { fontFamily: Fonts?.mono, color: '#d97706' }]}>{`Barcode ${row.barcode}`}</ThemedText>
                    ) : (
                      <Input value={row.barcode} onChangeText={(v) => update(idx, { barcode: v.toUpperCase() })} editable={!row._skip} autoCapitalize="characters" placeholder="Barcode" />
                    )}
                  </>
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      {step === 'done' && summary ? (
        <View style={styles.doneBox}>
          <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
          <ThemedText style={styles.doneTitle}>Import Complete!</ThemedText>
          <View style={styles.stats}>
            <Stat n={summary.created} label="Created / Updated" color="#16a34a" />
            <Stat n={summary.skipped} label="Skipped" color="#d97706" />
            <Stat n={summary.errors} label="Errors" color="#dc2626" />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText style={[styles.statNum, { color }]}>{String(n)}</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.small}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  flex2: { flex: 2, minWidth: 0 },
  gap: { gap: 12 },
  body: { fontSize: 14, lineHeight: 22 },
  small: { fontSize: 12, lineHeight: 16 },
  bold: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  drop: { borderWidth: 2, borderStyle: 'dashed', borderRadius: Radii.md, paddingVertical: 36, alignItems: 'center', gap: 6 },
  dropTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  strip: { padding: 12, borderRadius: Radii.sm },
  row: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 8 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowNum: { fontSize: 11, lineHeight: 16, fontFamily: Fonts?.mono },
  rowName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 14, rowGap: 4 },
  doneBox: { alignItems: 'center', gap: 12, paddingVertical: 20 },
  doneTitle: { fontSize: 18, lineHeight: 26, fontFamily: FontWeights.bold },
  stats: { flexDirection: 'row', gap: 24 },
  stat: { alignItems: 'center' },
  statNum: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
});
