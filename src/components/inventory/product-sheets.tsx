import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { FormGrid } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createInventoryItem, createInventoryReceiptFull, getErrorMessage, saveInventoryItemEdits } from '@/lib/api';
import type { InventoryListItem } from '@/types/api';

import {
  buildReceiptBody, calcLogistics, CATEGORIES, compatValue, defaultLogistics, fmtC, fmtC2, STATUS_CFG, todayYmd, UNIT_OPTIONS, WARRANTY_OPTIONS,
  type CarEntry, type LogisticsState,
} from './constants';
import { BarcodePreview } from './barcode';
import { ItemImageManager } from './images';
import { CompatibilityField, LogisticsForm } from './logistics-form';
import { Field, InlineError, SectionDivider, StepIndicator, SummaryField, Toggle } from './parts';

type Notify = (type: 'success' | 'error', msg: string) => void;

const opts = (list: string[]) => list.map((v) => ({ value: v, label: v }));

// ─── Add Product wizard (3 steps) ───────────────────────────────────────────
export function AddProductWizard({ onClose, onSaved, notify }: { onClose: () => void; onSaved: () => void; notify: Notify }) {
  const theme = useTheme();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [stockMode, setStockMode] = useState<'new_purchase' | 'existing_stock'>('new_purchase');
  const [t1, setT1] = useState({ product: '', category: CATEGORIES[0], sellingPrice: '', incentiveValue: '', unit: 'pcs', warranty: 'No Warranty', notes: '' });
  const [compatMode, setCompatMode] = useState<'UNIVERSAL' | 'SPECIFIC'>('UNIVERSAL');
  const [cars, setCars] = useState<CarEntry[]>([]);
  const [t2, setT2] = useState<LogisticsState>(defaultLogistics);
  const mrpNum = parseFloat(t1.sellingPrice) || 0;
  const calc = calcLogistics(t2, mrpNum);
  const set1 = (k: keyof typeof t1) => (v: string) => { setError(''); setT1((f) => ({ ...f, [k]: v })); };
  const compat = compatValue(compatMode, cars);

  const next1 = () => {
    if (!t1.product.trim()) { setError('Product name is required'); return; }
    setError('');
    setStep(2);
  };
  const next2 = () => {
    if (!t2.quantityReceived || parseFloat(t2.quantityReceived) <= 0) { setError('Quantity received is required'); return; }
    // A receipt is being created here, so a rate must be chosen (0% Exempt is a deliberate choice).
    if (t2.gstPercent === '') { setError('Select a GST rate (or 0% Exempt) before continuing'); return; }
    setError('');
    setStep(3);
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    let created = false;
    try {
      const item = await createInventoryItem({
        product: t1.product.trim(),
        category: t1.category,
        sellingPrice: t1.sellingPrice ? mrpNum : undefined,
        incentiveValue: t1.incentiveValue ? parseFloat(t1.incentiveValue) : undefined,
        unit: t1.unit,
        compatibility: compat,
        warranty: t1.warranty,
        notes: t1.notes || undefined,
      });
      created = true;
      if (item?.id && parseFloat(t2.quantityReceived) > 0) {
        const existing = stockMode === 'existing_stock';
        await createInventoryReceiptFull(item.id, buildReceiptBody(t2, calc, mrpNum, {
          orderDate: existing ? undefined : t2.orderDate || undefined,
          receiptDate: existing ? t2.dateAdded || todayYmd() : undefined,
        }));
      }
      notify('success', 'Product added successfully!');
      onSaved();
      onClose();
    } catch (e: unknown) {
      const msg = getErrorMessage(e, 'Something went wrong');
      if (created) { onSaved(); notify('error', `Product was added, but its stock receipt failed: ${msg}`); onClose(); }
      else setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const footer = step === 1 ? (
    <>
      <Button variant="ghost" onPress={onClose} style={styles.flex1}>Cancel</Button>
      <Button onPress={next1} style={styles.flex2}>Next: Logistics & Payment →</Button>
    </>
  ) : step === 2 ? (
    <>
      <Button variant="ghost" onPress={() => { setError(''); setStep(1); }} style={styles.flex1}>← Back</Button>
      <Button onPress={next2} style={styles.flex2}>Review Summary →</Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onPress={() => { setError(''); setStep(2); }} disabled={saving} style={styles.flex1}>← Edit</Button>
      <Button onPress={submit} loading={saving} style={styles.flex2}>{saving ? 'Adding Product…' : '✓ Add Product'}</Button>
    </>
  );

  const existing = stockMode === 'existing_stock';

  return (
    <Sheet visible fullHeight onClose={onClose} locked={saving} title="Add New Product" footer={footer}>
      <Toggle
        options={[{ value: 'new_purchase', label: 'New Purchase' }, { value: 'existing_stock', label: 'Existing Stock' }]}
        value={stockMode}
        onChange={setStockMode}
      />
      <ThemedText themeColor="textMuted" style={styles.small}>
        {existing ? 'Stock already in store — enters as received immediately' : 'Ordering from a supplier — tracks order/arrival flow'}
      </ThemedText>
      <StepIndicator step={step} steps={['Item Details', 'Logistics & Payment', 'Summary']} />
      {error ? <InlineError message={error} /> : null}

      {step === 1 ? (
        <View style={styles.form}>
          <Field label="Product Name *"><Input value={t1.product} onChangeText={set1('product')} placeholder="e.g. 3M Sun Film Dark" autoFocus /></Field>
          <Field label="Category *"><Select value={t1.category} onChange={set1('category')} options={opts(CATEGORIES)} /></Field>
          <FormGrid>
            <Field label="Selling Price (₹)"><Input value={t1.sellingPrice} onChangeText={set1('sellingPrice')} placeholder="0.00" keyboardType="decimal-pad" /></Field>
            <Field label="Incentive Value (₹)"><Input value={t1.incentiveValue} onChangeText={set1('incentiveValue')} placeholder="0.00" keyboardType="decimal-pad" /></Field>
            <Field label="Unit"><Select value={t1.unit} onChange={set1('unit')} options={opts(UNIT_OPTIONS)} /></Field>
          </FormGrid>
          <Field label="Compatibility"><CompatibilityField mode={compatMode} cars={cars} onModeChange={setCompatMode} onCarsChange={setCars} /></Field>
          <Field label="Warranty"><Select value={t1.warranty} onChange={set1('warranty')} options={opts(WARRANTY_OPTIONS)} /></Field>
          <Field label="Notes (optional)"><Input value={t1.notes} onChangeText={set1('notes')} placeholder="Any additional product notes" multiline /></Field>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={styles.form}>
          <View style={[styles.banner, { backgroundColor: theme.surface }]}>
            <ThemedText themeColor="textSecondary" style={styles.bannerText}>
              {existing ? 'Existing stock entry for ' : 'Initial stock receipt for '}
              <ThemedText style={styles.bold}>{t1.product}</ThemedText>
            </ThemedText>
          </View>
          <LogisticsForm l={t2} setL={setT2} mrpNum={mrpNum} stockMode={stockMode} />
        </View>
      ) : null}

      {step === 3 ? (
        <View style={styles.form}>
          <ThemedText style={[styles.groupTitle, { color: theme.primary }]}>ITEM DETAILS</ThemedText>
          <View style={[styles.summary, { backgroundColor: theme.surface }]}>
            <SummaryField label="Product Name" value={t1.product} />
            <SummaryField label="Category" value={t1.category} />
            <SummaryField label="Selling Price" value={t1.sellingPrice ? fmtC(mrpNum) : '—'} />
            <SummaryField label="Unit" value={t1.unit} />
            <SummaryField label="Warranty" value={t1.warranty} />
            <SummaryField label="Compatibility" value={compat} span />
            {t1.notes ? <SummaryField label="Notes" value={t1.notes} span /> : null}
          </View>

          <ThemedText style={[styles.groupTitle, { color: theme.primary }]}>INITIAL STOCK RECEIPT</ThemedText>
          <View style={[styles.summary, { backgroundColor: theme.surface }]}>
            <SummaryField label="Batch Barcode" value={t2.barcode || '—'} mono />
            <SummaryField label="Seller" value={t2.sellerName || '—'} />
            <SummaryField label="Seller City" value={t2.sellerCity || '—'} />
            <SummaryField label="Order Placed To" value={t2.orderPlacedTo || '—'} />
            <SummaryField label="Contact" value={t2.contactPhone || '—'} />
            <SummaryField label="Qty Received" value={`${t2.quantityReceived} ${t1.unit}`} />
            <SummaryField label="Dealer Price" value={t2.dealerPrice ? fmtC(calc.dealerPrice) : '—'} />
            {calc.costPerUnit > 0 ? <SummaryField label="Landed Cost (₹/unit)" value={fmtC2(calc.costPerUnit)} highlight /> : null}
            {mrpNum > 0 && calc.costPerUnit > 0 ? <SummaryField label="Margin / Unit (calc)" value={`${fmtC2(calc.marginPerUnit)} (${calc.marginPct}%)`} highlight /> : null}
            {t2.gstPercent !== '' ? <SummaryField label="GST" value={`${t2.gstPercent}%`} /> : null}
            <SummaryField label="Payment Terms" value={t2.paymentTerms} />
            {existing ? <SummaryField label="Date Added" value={t2.dateAdded || '—'} /> : t2.orderDate ? <SummaryField label="Order Date" value={t2.orderDate} /> : null}
            {t2.eta ? <SummaryField label="ETA" value={t2.eta} /> : null}
            {t2.storeLocation ? <SummaryField label="Store Location" value={t2.storeLocation} span /> : null}
            {t2.billUrl ? <SummaryField label="GST Bill" value={t2.billFileName || 'Attached'} span /> : null}
          </View>
          {t2.barcode ? <BarcodePreview value={t2.barcode} /> : null}
          {calc.qty > 0 && calc.costPerUnit > 0 ? (
            <View style={[styles.totals, { backgroundColor: withAlpha(theme.primary, 0.08) }]}>
              <ThemedText style={styles.totalText}>Total stock cost: <ThemedText style={styles.bold}>{fmtC2(calc.qty * calc.costPerUnit)}</ThemedText></ThemedText>
              {mrpNum > 0 ? <ThemedText style={styles.totalText}>Total selling value: <ThemedText style={styles.bold}>{fmtC2(calc.qty * mrpNum)}</ThemedText></ThemedText> : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

// ─── Edit Product ───────────────────────────────────────────────────────────
export function EditProductSheet({ item, onClose, onSaved, notify }: { item: InventoryListItem; onClose: () => void; onSaved: () => void; notify: Notify }) {
  const [form, setForm] = useState({
    product: item.product || '',
    category: item.category || CATEGORIES[0],
    sellingPrice: item.sellingPrice?.toString() || '',
    incentiveValue: item.incentiveValue?.toString() || '',
    unit: item.unit || 'pcs',
    compatibility: item.compatibility || '',
    warranty: item.warranty || 'No Warranty',
    notes: item.notes || '',
    status: item.status || 'ACTIVE',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [images, setImages] = useState<string[]>(item.imageUrls || []);
  const set = (k: keyof typeof form) => (v: string) => { setError(''); setForm((f) => ({ ...f, [k]: v })); };

  const save = async () => {
    setError('');
    const missing: string[] = [];
    if (!form.product.trim()) missing.push('Product');
    if (!form.category) missing.push('Category');
    if (!form.unit) missing.push('Unit');
    if (!form.status) missing.push('Status');
    if (missing.length > 0) { setError(`Required fields missing: ${missing.join(', ')}`); return; }
    setSaving(true);
    try {
      await saveInventoryItemEdits(item.id, {
        product: form.product.trim(),
        category: form.category,
        sellingPrice: form.sellingPrice ? parseFloat(form.sellingPrice) : undefined,
        incentiveValue: form.incentiveValue ? parseFloat(form.incentiveValue) : undefined,
        unit: form.unit,
        compatibility: form.compatibility || undefined,
        warranty: form.warranty || undefined,
        notes: form.notes || undefined,
        status: form.status,
      });
      notify('success', 'Product updated');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      fullHeight
      onClose={onClose}
      locked={saving}
      title="Edit Product"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Save Changes'}</Button>
        </>
      }>
      <ItemImageManager itemId={item.id} images={images} onChange={(urls) => { setImages(urls); onSaved(); }} />
      <SectionDivider title="Product Details" />
      <Field label="Product Name *"><Input value={form.product} onChangeText={set('product')} /></Field>
      <Field label="Category *"><Select value={form.category} onChange={set('category')} options={opts(CATEGORIES)} /></Field>
      <FormGrid>
        <Field label="Selling Price (₹)"><Input value={form.sellingPrice} onChangeText={set('sellingPrice')} placeholder="0.00" keyboardType="decimal-pad" /></Field>
        <Field label="Incentive Value (₹)"><Input value={form.incentiveValue} onChangeText={set('incentiveValue')} placeholder="0.00" keyboardType="decimal-pad" /></Field>
        <Field label="Unit *"><Select value={form.unit} onChange={set('unit')} options={opts(UNIT_OPTIONS)} /></Field>
      </FormGrid>
      <FormGrid>
        <Field label="Warranty"><Select value={form.warranty} onChange={set('warranty')} options={opts(WARRANTY_OPTIONS)} /></Field>
        <Field label="Status *">
          <Select value={form.status} onChange={set('status')} options={Object.entries(STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))} />
        </Field>
      </FormGrid>
      <Field label="Compatibility"><Input value={form.compatibility} onChangeText={set('compatibility')} placeholder="e.g. Universal / Maruti Swift 2023-24" /></Field>
      <Field label="Notes"><Input value={form.notes} onChangeText={set('notes')} placeholder="Optional product notes" multiline /></Field>
      {error ? <InlineError message={error} /> : null}
    </Sheet>
  );
}

// ─── Add Stock ──────────────────────────────────────────────────────────────
export function AddStockSheet({ item, onClose, onSaved, notify }: { item: InventoryListItem; onClose: () => void; onSaved: () => void; notify: Notify }) {
  const theme = useTheme();
  const [l, setL] = useState<LogisticsState>(defaultLogistics);
  const [receiptDate, setReceiptDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mrpNum = item.sellingPrice || 0;
  const calc = calcLogistics(l, mrpNum);

  const save = async () => {
    if (!l.quantityReceived || parseFloat(l.quantityReceived) <= 0) { setError('Quantity is required'); return; }
    // Blocking, not defaulting: a skipped rate must not silently invoice at 0%.
    if (l.gstPercent === '') { setError('Select a GST rate (or 0% Exempt) before adding stock'); return; }
    setSaving(true);
    setError('');
    try {
      await createInventoryReceiptFull(item.id, buildReceiptBody(l, calc, mrpNum, {
        orderDate: l.orderDate || undefined,
        receiptDate: receiptDate || undefined,
      }, l.forceNew !== false));
      notify('success', 'Stock receipt added');
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      fullHeight
      onClose={onClose}
      locked={saving}
      title={`Add Stock — ${item.product}`}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Add Stock'}</Button>
        </>
      }>
      <View style={[styles.banner, { backgroundColor: theme.surface }]}>
        <ThemedText themeColor="textSecondary" style={styles.bannerText}>
          Current stock: <ThemedText style={styles.bold}>{`${item.totalStock ?? 0} ${item.unit}`}</ThemedText>
          {mrpNum > 0 ? <ThemedText themeColor="textSecondary" style={styles.bannerText}>{'   Selling Price: '}<ThemedText style={styles.bold}>{fmtC(mrpNum)}</ThemedText></ThemedText> : null}
        </ThemedText>
      </View>
      <LogisticsForm l={l} setL={setL} mrpNum={mrpNum} itemId={item.id} />
      <Field label="Receipt Date (if already received)"><DateField label="Receipt Date" value={receiptDate} onChange={setReceiptDate} compact /></Field>
      {error ? <InlineError message={error} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  flex2: { flex: 2, minWidth: 0 },
  form: { gap: 14 },
  small: { fontSize: 12, lineHeight: 16 },
  bold: { fontFamily: FontWeights.bold, fontSize: 13, lineHeight: 18 },
  banner: { padding: 10, borderRadius: Radii.sm },
  bannerText: { fontSize: 13, lineHeight: 18 },
  groupTitle: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  summary: { borderRadius: 10, padding: 14, flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 10 },
  totals: { borderRadius: Radii.sm, padding: 12, gap: 4 },
  totalText: { fontSize: 14, lineHeight: 20 },
});
