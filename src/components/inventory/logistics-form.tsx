import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { FormGrid } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { checkSellerMatch, fetchNextBatchBarcode, getErrorMessage, uploadInventoryBill } from '@/lib/api';
import { pickFromCamera, validatePickedFile, type PickedFile } from '@/lib/upload';
import type { SellerMatch } from '@/types/api';

import {
  BILL_RULES, calcLogistics, carLabel, fmtC, GST_SLABS, PAYMENT_TERMS,
  type CarEntry, type LogisticsState,
} from './constants';
import { BarcodePreview } from './barcode';
import { Field, SectionDivider, Toggle } from './parts';

// ─── Bill upload (PDF / JPG / PNG, 20 MB) ───────────────────────────────────
export function BillUpload({ billUrl, billFileName, onUploaded, onRemove }: {
  billUrl: string; billFileName: string; onUploaded: (url: string, name: string) => void; onRemove: () => void;
}) {
  const theme = useTheme();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const send = async (file: PickedFile) => {
    const invalid = validatePickedFile(file, BILL_RULES);
    if (invalid) { setError(invalid); return; }
    setUploading(true);
    setError('');
    try {
      const res = await uploadInventoryBill(file, { onProgress: () => {}, signal: new AbortController().signal });
      onUploaded(res.billUrl, file.name);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const pickDocument = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: BILL_RULES.allowedMimeTypes, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await send({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size });
  };

  const pickCamera = async () => {
    const f = await pickFromCamera();
    if (f) await send(f);
  };

  if (billUrl) {
    return (
      <View style={[styles.billRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="document-attach-outline" size={18} color={theme.textSecondary} />
        <ThemedText numberOfLines={1} style={styles.billName}>{billFileName || 'Bill attached'}</ThemedText>
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove bill">
          <Ionicons name="close" size={20} color={theme.danger} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <Button variant="outline" size="sm" onPress={pickDocument} loading={uploading} style={styles.flex1}>Upload Bill (PDF / JPG / PNG)</Button>
        <Button variant="outline" size="sm" onPress={pickCamera} disabled={uploading}>Camera</Button>
      </View>
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
    </View>
  );
}

// ─── Compatibility (Universal / Specific cars) ──────────────────────────────
export function CompatibilityField({ mode, cars, onModeChange, onCarsChange }: {
  mode: 'UNIVERSAL' | 'SPECIFIC'; cars: CarEntry[]; onModeChange: (m: 'UNIVERSAL' | 'SPECIFIC') => void; onCarsChange: (c: CarEntry[]) => void;
}) {
  const theme = useTheme();
  const blank: CarEntry = { make: '', model: '', yearFrom: '', yearTo: '' };
  const [draft, setDraft] = useState<CarEntry>(blank);
  const add = () => {
    if (!draft.make.trim() && !draft.model.trim()) return;
    onCarsChange([...cars, { ...draft }]);
    setDraft(blank);
  };
  return (
    <View style={styles.gap}>
      <Toggle options={[{ value: 'UNIVERSAL', label: 'Universal' }, { value: 'SPECIFIC', label: 'Specific Cars' }]} value={mode} onChange={onModeChange} />
      {mode === 'SPECIFIC' ? (
        <View style={styles.gap}>
          {cars.length > 0 ? (
            <View style={styles.chips}>
              {cars.map((c, i) => (
                <View key={i} style={[styles.chip, { backgroundColor: withAlpha(theme.primary, 0.1), borderColor: withAlpha(theme.primary, 0.3) }]}>
                  <ThemedText style={[styles.chipText, { color: theme.primary }]}>{carLabel(c)}</ThemedText>
                  <Pressable onPress={() => onCarsChange(cars.filter((_, idx) => idx !== i))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove car">
                    <Ionicons name="close" size={14} color={theme.textMuted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <View style={[styles.carBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <FormGrid>
              <Input value={draft.make} onChangeText={(v) => setDraft((d) => ({ ...d, make: v }))} placeholder="Make (e.g. Maruti)" />
              <Input value={draft.model} onChangeText={(v) => setDraft((d) => ({ ...d, model: v }))} placeholder="Model (e.g. Swift)" />
            </FormGrid>
            <FormGrid cols={3}>
              <Input value={draft.yearFrom} onChangeText={(v) => setDraft((d) => ({ ...d, yearFrom: v }))} placeholder="Year From" keyboardType="number-pad" />
              <Input value={draft.yearTo} onChangeText={(v) => setDraft((d) => ({ ...d, yearTo: v }))} placeholder="Year To" keyboardType="number-pad" />
              <Button size="sm" onPress={add}>+ Add</Button>
            </FormGrid>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Logistics & Payment (wizard step 2 and Add Stock) ──────────────────────
export function LogisticsForm({ l, setL, mrpNum, itemId, stockMode }: {
  l: LogisticsState; setL: Dispatch<SetStateAction<LogisticsState>>; mrpNum: number; itemId?: string; stockMode?: 'new_purchase' | 'existing_stock';
}) {
  const theme = useTheme();
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [sellerMatch, setSellerMatch] = useState<SellerMatch | null>(null);
  const calc = calcLogistics(l, mrpNum);
  const set = (k: keyof LogisticsState) => (v: string) => setL((p) => ({ ...p, [k]: v }));

  const fetchBarcode = async () => {
    setBarcodeLoading(true);
    try {
      const r = await fetchNextBatchBarcode();
      if (r?.barcode) setL((p) => ({ ...p, barcode: r.barcode }));
    } catch { /* the field stays editable */ } finally {
      setBarcodeLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the next batch barcode on open
    if (!l.barcode) fetchBarcode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A batch from the same seller can be reused; checked 600ms after typing stops.
  useEffect(() => {
    if (!itemId || !l.sellerName.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the match when the seller is empty
      setSellerMatch(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const m = await checkSellerMatch(itemId, l.sellerName.trim());
        if (m) { setSellerMatch(m); setL((p) => ({ ...p, forceNew: false })); }
        else { setSellerMatch(null); setL((p) => ({ ...p, forceNew: true })); }
      } catch { setSellerMatch(null); }
    }, 600);
    return () => clearTimeout(timer);
  }, [l.sellerName, itemId, setL]);

  const ext = stockMode === 'existing_stock';

  return (
    <View style={styles.form}>
      <SectionDivider title="Barcode (receipt-level)" />
      <Field label="Batch Barcode" hint="Each stock receipt gets its own unique barcode for shelf tracking and billing scan.">
        <View style={styles.row}>
          <View style={styles.flex1}>
            <Input
              value={barcodeLoading ? 'Loading…' : l.barcode}
              onChangeText={set('barcode')}
              placeholder="FT000001"
              editable={!barcodeLoading}
              autoCapitalize="characters"
            />
          </View>
          <Button variant="outline" size="sm" onPress={fetchBarcode} disabled={barcodeLoading}>↻</Button>
        </View>
        <BarcodePreview value={l.barcode} />
      </Field>

      <SectionDivider title="Seller" />
      <FormGrid>
        <Field label="Seller Name"><Input value={l.sellerName} onChangeText={set('sellerName')} placeholder="e.g. ABC Distributors" /></Field>
        <Field label="Seller City"><Input value={l.sellerCity} onChangeText={set('sellerCity')} placeholder="e.g. Mumbai" /></Field>
        <Field label="Order Placed To"><Input value={l.orderPlacedTo} onChangeText={set('orderPlacedTo')} placeholder="Contact name" /></Field>
        <Field label="Contact Phone"><Input value={l.contactPhone} onChangeText={set('contactPhone')} placeholder="+91 99999 00000" keyboardType="phone-pad" /></Field>
      </FormGrid>
      {sellerMatch ? (
        <View style={[styles.match, {
          backgroundColor: l.forceNew ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
          borderColor: l.forceNew ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)',
        }]}>
          <ThemedText style={[styles.matchTitle, { color: l.forceNew ? '#d97706' : '#16a34a' }]}>
            {l.forceNew ? 'Existing batch found (creating new)' : `✓ Existing batch from ${sellerMatch.sellerName} — barcode ${sellerMatch.barcode} will be reused`}
          </ThemedText>
          <Pressable onPress={() => setL((p) => ({ ...p, forceNew: !p.forceNew }))} accessibilityRole="checkbox" accessibilityState={{ checked: l.forceNew }} style={styles.check}>
            <Ionicons name={l.forceNew ? 'checkbox' : 'square-outline'} size={20} color={theme.primary} />
            <ThemedText themeColor="textSecondary" style={styles.small}>Force new batch (create separate receipt)</ThemedText>
          </Pressable>
        </View>
      ) : null}

      <SectionDivider title="Stock & Pricing" />
      <FormGrid>
        <Field label="Qty Received *"><Input value={l.quantityReceived} onChangeText={set('quantityReceived')} placeholder="0" keyboardType="decimal-pad" /></Field>
        <Field label="Dealer Price (₹ / unit)"><Input value={l.dealerPrice} onChangeText={set('dealerPrice')} placeholder="0.00" keyboardType="decimal-pad" /></Field>
      </FormGrid>

      <SectionDivider title="Logistics" />
      <FormGrid>
        <Field label="Logistics Partner 1"><Input value={l.logisticsPartner1} onChangeText={set('logisticsPartner1')} placeholder="e.g. DTDC" /></Field>
        <Field label="Charge 1 (₹)"><Input value={l.logisticsCharge1} onChangeText={set('logisticsCharge1')} placeholder="0" keyboardType="decimal-pad" /></Field>
        <Field label="Logistics Partner 2"><Input value={l.logisticsPartner2} onChangeText={set('logisticsPartner2')} placeholder="e.g. Porter" /></Field>
        <Field label="Charge 2 (₹)"><Input value={l.logisticsCharge2} onChangeText={set('logisticsCharge2')} placeholder="0" keyboardType="decimal-pad" /></Field>
      </FormGrid>

      <SectionDivider title="GST" />
      <Field label="GST % *">
        <Select placeholder="Select GST rate…" value={l.gstPercent} onChange={set('gstPercent')} options={GST_SLABS} />
      </Field>
      <Field label="GST Bill / Invoice">
        <BillUpload
          billUrl={l.billUrl}
          billFileName={l.billFileName}
          onUploaded={(url, name) => setL((p) => ({ ...p, billUrl: url, billFileName: name }))}
          onRemove={() => setL((p) => ({ ...p, billUrl: '', billFileName: '' }))}
        />
      </Field>

      <SectionDivider title={ext ? 'Date' : 'Payment & Dates'} />
      {!ext ? (
        <Field label="Payment Terms">
          <Select value={l.paymentTerms} onChange={set('paymentTerms')} options={PAYMENT_TERMS.map((t) => ({ value: t, label: t }))} />
        </Field>
      ) : null}
      {ext ? (
        <Field label="Date Added" hint="When was this stock physically acquired / entered into the store?">
          <DateField label="Date Added" value={l.dateAdded} onChange={set('dateAdded')} compact />
        </Field>
      ) : (
        <FormGrid>
          <Field label="Order Date"><DateField label="Order Date" value={l.orderDate} onChange={set('orderDate')} compact /></Field>
          <Field label="ETA / Expected Delivery"><DateField label="ETA" value={l.eta} onChange={set('eta')} compact /></Field>
        </FormGrid>
      )}

      <SectionDivider title="Store Location" />
      <Field label="Store Location" hint="Where this batch will be physically stored — e.g. Room A - Rack 3, Front Shelf">
        <Input value={l.storeLocation} onChangeText={set('storeLocation')} placeholder="e.g. Room A - Rack 3, Front Shelf" />
      </Field>

      {calc.costPerUnit > 0 || calc.qty > 0 ? (
        <View style={[styles.cost, { backgroundColor: withAlpha(theme.primary, 0.06), borderColor: withAlpha(theme.primary, 0.15) }]}>
          <ThemedText style={[styles.costTitle, { color: theme.primary }]}>LIVE COST BREAKDOWN</ThemedText>
          <View style={styles.costGrid}>
            {calc.qty > 0 ? <CostCell label="Qty" value={String(calc.qty)} /> : null}
            {calc.dealerPrice > 0 ? <CostCell label="Dealer Price" value={fmtC(calc.dealerPrice)} /> : null}
            {calc.totalLogistics > 0 ? <CostCell label="Total Logistics" value={fmtC(calc.totalLogistics)} /> : null}
            {calc.costPerUnit > 0 ? <CostCell label="Landed Cost" value={`₹${calc.costPerUnit.toFixed(2)}`} color={theme.primary} bg={withAlpha(theme.primary, 0.1)} strong /> : null}
            {mrpNum > 0 && calc.costPerUnit > 0 ? (
              <CostCell
                label="Margin"
                value={`${calc.marginPct}%`}
                color={calc.marginPerUnit > 0 ? '#16a34a' : '#dc2626'}
                bg={calc.marginPerUnit > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}
                strong
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function CostCell({ label, value, color, bg, strong }: { label: string; value: string; color?: string; bg?: string; strong?: boolean }) {
  return (
    <View style={[styles.costCell, bg ? { backgroundColor: bg } : null]}>
      <ThemedText themeColor="textMuted" style={[styles.costLabel, color ? { color } : null]}>{label}</ThemedText>
      <ThemedText style={[styles.costValue, strong && { fontWeight: '800' }, color ? { color } : null]}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 10 },
  form: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  small: { fontSize: 12, lineHeight: 16 },
  billRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: Radii.sm, borderWidth: 1 },
  billName: { flex: 1, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingVertical: 4, paddingLeft: 12, paddingRight: 8 },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  carBox: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 8 },
  match: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 8 },
  matchTitle: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  cost: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 10 },
  costTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  costGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  costCell: { minWidth: 110, flexGrow: 1, alignItems: 'center', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  costLabel: { fontSize: 12, lineHeight: 16 },
  costValue: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
});
