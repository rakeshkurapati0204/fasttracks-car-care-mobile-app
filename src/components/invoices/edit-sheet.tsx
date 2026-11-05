import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { NumField, Panel } from '@/components/quotations/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchQuotationItems } from '@/lib/api';
import type { InvoiceFull, QuotationItemSearchResult } from '@/types/api';

import { GST_RATES, STATUS_META, calcEditLine, fmtINR } from './helpers';

// Dashboard InvoiceFormModal (Edit — the only path the dashboard list uses): customer, vehicle, status,
// notes, line items with an MRP / base-price toggle and a GST rate, an overall discount, service charges
// (no GST) and live totals. Saves with PUT /invoices/:id and the dashboard's own payload.
interface EditLine { inventoryItemId?: string; description: string; hsnSac: string; qty: number; unitPrice: number; discountPct: number; discountAmount?: number; discountMode?: 'PERCENT' | 'FIXED' }
interface ServiceCharge { description: string; amount: number }

export interface InvoiceFormState {
  customerType: 'INDIVIDUAL' | 'BUSINESS';
  customerName: string; customerPhone: string; customerEmail: string; customerAddress: string; customerGstin: string;
  vehicleNumber: string; vehicleBrand: string; vehicleModel: string; vehicleYear: string; vehicleColour: string; vehicleFuel: string;
  gstRate: number; mrpMode: boolean; overallDiscountAmount: string; overallDiscountMode: 'PERCENT' | 'FIXED';
  lineItems: EditLine[]; serviceCharges: ServiceCharge[];
  status: string; paymentMode: string; paymentMethod: string; paymentRef: string; paymentModeOther: string; paidAmount: string; notes: string;
}

export function formFromInvoice(inv: InvoiceFull): InvoiceFormState {
  return {
    customerType: 'INDIVIDUAL',
    customerName: inv.customerName ?? '', customerPhone: inv.customerPhone ?? '', customerEmail: inv.customerEmail ?? '',
    customerAddress: inv.customerAddress ?? '', customerGstin: inv.customerGstin ?? '',
    vehicleNumber: inv.vehicleNumber ?? '', vehicleBrand: inv.vehicleBrand ?? '', vehicleModel: inv.vehicleModel ?? '',
    vehicleYear: inv.vehicleYear != null ? String(inv.vehicleYear) : '', vehicleColour: inv.vehicleColour ?? '', vehicleFuel: inv.vehicleFuel ?? '',
    gstRate: inv.gstRate ?? 18,
    mrpMode: false, // existing invoices use base price
    overallDiscountAmount: String(inv.overallDiscountAmount ?? 0),
    overallDiscountMode: inv.overallDiscountMode ?? 'PERCENT',
    // Backend names (quantity, hsnSacCode) differ from the form's (qty, hsnSac).
    lineItems: (inv.lineItems ?? []).map((li) => ({
      inventoryItemId: li.erpItemId ?? undefined, description: li.description, hsnSac: li.hsnSacCode ?? '',
      qty: Number(li.quantity) || 1, unitPrice: Number(li.unitPrice) || 0, discountPct: Number(li.discountPct) || 0,
      discountAmount: li.discountAmount, discountMode: li.discountMode,
    })),
    serviceCharges: inv.serviceCharges ?? [],
    status: inv.status, paymentMode: inv.paymentMode ?? 'CASH', paymentMethod: inv.paymentMethod ?? 'CASH', paymentRef: inv.paymentRef ?? '',
    paymentModeOther: '', paidAmount: String(inv.paidAmount ?? 0), notes: inv.notes ?? '',
  };
}

/** The dashboard handleSave payload and validation. */
export function buildInvoicePayload(form: InvoiceFormState): { error: string } | { payload: Record<string, unknown> } {
  if (!form.customerName.trim()) return { error: 'Customer name is required.' };
  if (form.lineItems.length === 0) return { error: 'Add at least one line item.' };
  const validItems = form.lineItems.filter((li) => li.description.trim());
  if (validItems.length === 0) return { error: 'At least one line item needs a description.' };
  const rawGst = Number(form.gstRate);
  const gstRate = Number.isFinite(rawGst) ? rawGst : 18;
  const scTotal = form.serviceCharges.reduce((s, sc) => s + (Number(sc.amount) || 0), 0);
  // MRP mode: each price is MRP → base price before it goes to the backend.
  const items = form.mrpMode
    ? validItems.map((li) => ({ ...li, unitPrice: parseFloat((li.unitPrice / (1 + gstRate / 100)).toFixed(4)) }))
    : validItems;
  const subtotal = items.reduce((s, li) => s + calcEditLine(li.qty, li.unitPrice, li.discountPct), 0);
  const half = gstRate / 2 / 100;
  const cgst = parseFloat((subtotal * half).toFixed(2));
  const sgst = parseFloat((subtotal * half).toFixed(2));
  const grandTotal = parseFloat((subtotal + cgst + sgst + scTotal).toFixed(2));
  const paidAmt = parseFloat(form.paidAmount) || 0;
  return {
    payload: {
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim() || undefined,
      customerEmail: form.customerEmail.trim() || undefined,
      customerAddress: form.customerAddress.trim() || undefined,
      customerGSTIN: form.customerGstin.trim() || undefined,
      vehicleNumber: form.vehicleNumber.trim() || undefined,
      vehicleBrand: form.vehicleBrand.trim() || undefined,
      vehicleModel: form.vehicleModel.trim() || undefined,
      vehicleYear: form.vehicleYear.trim() || undefined,
      vehicleColour: form.vehicleColour.trim() || undefined,
      vehicleFuel: form.vehicleFuel.trim() || undefined,
      gstRate,
      paymentMethod: form.paymentMethod || undefined,
      status: form.status,
      paymentMode: form.paymentMode,
      paymentRef: form.paymentRef.trim() || undefined,
      paymentModeOther: form.paymentMode === 'OTHER' ? form.paymentModeOther.trim() : undefined,
      paidAmount: paidAmt,
      subtotal, cgst, sgst, grandTotal,
      balanceDue: parseFloat((grandTotal - paidAmt).toFixed(2)),
      // Always send notes (even empty) so a cleared note is actually cleared.
      notes: form.notes.trim(),
      serviceCharges: form.serviceCharges.filter((sc) => sc.description.trim() && sc.amount > 0),
      overallDiscountAmount: Number(form.overallDiscountAmount) || 0,
      overallDiscountMode: form.overallDiscountMode,
      lineItems: items.map((li) => ({
        erpItemId: li.inventoryItemId || undefined,
        description: li.description.trim(),
        hsnSacCode: li.hsnSac.trim() || undefined,
        quantity: Number(li.qty) || 1,
        unitPrice: Number(li.unitPrice) || 0,
        discountPct: Number(li.discountPct) || 0,
        discountAmount: Number(li.discountAmount) || Number(li.discountPct) || 0,
        discountMode: li.discountMode || 'PERCENT',
        amount: calcEditLine(li.qty, li.unitPrice, li.discountPct),
      })),
    },
  };
}

export function InvoiceEditSheet({ invoice, form, setForm, saving, error, onClose, onSave }: {
  invoice: InvoiceFull; form: InvoiceFormState; setForm: React.Dispatch<React.SetStateAction<InvoiceFormState>>;
  saving: boolean; error: string; onClose: () => void; onSave: () => void;
}) {
  const theme = useTheme();
  const set = <K extends keyof InvoiceFormState>(k: K) => (v: InvoiceFormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const gstRate = Number.isFinite(Number(form.gstRate)) ? Number(form.gstRate) : 18;
  const scTotal = form.serviceCharges.reduce((s, sc) => s + (Number(sc.amount) || 0), 0);

  // Display totals follow the dashboard: MRP mode extracts GST from the price; base mode adds it after the overall discount.
  const lineTotal = form.lineItems.reduce((s, li) => s + calcEditLine(li.qty, li.unitPrice, li.discountPct), 0);
  let subtotal: number; let cgst: number; let sgst: number; let grand: number;
  if (form.mrpMode) {
    const base = gstRate > 0 ? lineTotal / (1 + gstRate / 100) : lineTotal;
    subtotal = base; cgst = (lineTotal - base) / 2; sgst = (lineTotal - base) / 2; grand = lineTotal + scTotal;
  } else {
    const od = Number(form.overallDiscountAmount) || 0;
    const disc = form.overallDiscountMode === 'PERCENT' ? lineTotal * (od / 100) : od;
    subtotal = Math.max(0, lineTotal - disc);
    cgst = subtotal * (gstRate / 2 / 100); sgst = cgst; grand = subtotal + cgst + sgst + scTotal;
  }

  // Inventory search (the dashboard's "Barcode Scanner" box also searches by name; no scanner in the app).
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuotationItemSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState('');
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const search = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { seq.current++; setResults([]); setSearching(false); return; }
    setSearching(true);
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try { const r = await searchQuotationItems(q.trim()); if (mine === seq.current) setResults(r); } catch { if (mine === seq.current) setResults([]); }
      if (mine === seq.current) setSearching(false);
    }, 300);
  };

  const addItem = (item: QuotationItemSearchResult) => {
    const mrp = Number(item.sellingPrice ?? 0);
    const idx = form.lineItems.findIndex((li) => li.inventoryItemId === item.id);
    if (idx >= 0) {
      setForm((f) => ({ ...f, lineItems: f.lineItems.map((li, i) => (i === idx ? { ...li, qty: (li.qty || 1) + 1 } : li)) }));
      setStatus(`✓ +1 qty → ${item.name}`);
    } else {
      setForm((f) => ({ ...f, lineItems: [...f.lineItems.filter((li) => li.description), { inventoryItemId: item.id, description: item.name, hsnSac: '998714', qty: 1, unitPrice: mrp, discountPct: 0 }] }));
      setStatus(`✓ Added: ${item.name}`);
    }
    seq.current++; setQuery(''); setResults([]); setSearching(false);
    setTimeout(() => setStatus(''), 3000);
  };

  const updateItem = (idx: number, patch: Partial<EditLine>) => setForm((f) => ({ ...f, lineItems: f.lineItems.map((li, i) => (i === idx ? { ...li, ...patch } : li)) }));
  const derived = form.status === 'PAID' || form.status === 'PARTIAL' || form.status === 'OVERDUE';
  const pair = (a: React.ReactNode, b: React.ReactNode) => <View style={styles.row}><View style={styles.flex1}>{a}</View><View style={styles.flex1}>{b}</View></View>;
  const biz = form.customerType === 'BUSINESS';

  return (
    <Sheet visible fullHeight onClose={onClose} locked={saving} title={`Edit Invoice — ${invoice.invoiceNumber}`} footer={
      <View style={styles.footer}>
        <View style={styles.flex1}><Button variant="outline" onPress={onClose} disabled={saving} fullWidth>Cancel</Button></View>
        <View style={styles.flex1}><Button onPress={onSave} loading={saving} fullWidth>{saving ? 'Saving…' : 'Save'}</Button></View>
      </View>
    }>
      {error ? <ThemedText themeColor="danger" style={styles.err}>{error}</ThemedText> : null}

      <Panel>
        <View style={styles.gap}>
          <ThemedText style={styles.h}>Customer</ThemedText>
          <View style={[styles.seg, { borderColor: theme.border }]}>
            {([['INDIVIDUAL', 'Individual'], ['BUSINESS', 'Business / Company']] as const).map(([k, label], i) => (
              <Pressable key={k} onPress={() => set('customerType')(k)} accessibilityRole="button" style={[styles.segBtn, { backgroundColor: form.customerType === k ? '#2563eb' : theme.surface }, i > 0 && { borderLeftWidth: 1, borderLeftColor: theme.border }]}>
                <ThemedText style={[styles.segText, { color: form.customerType === k ? '#fff' : theme.text }]}>{label}</ThemedText>
              </Pressable>
            ))}
          </View>
          <Input label={`${biz ? 'Business Name' : 'Customer Name'} *`} value={form.customerName} onChangeText={set('customerName')} placeholder={biz ? 'Business / Company name' : 'Full name'} />
          {pair(
            <Input label={biz ? 'Phone *' : 'Phone'} value={form.customerPhone} onChangeText={set('customerPhone')} placeholder="9XXXXXXXXX" keyboardType="phone-pad" />,
            <Input label="Email (optional)" value={form.customerEmail} onChangeText={set('customerEmail')} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" />,
          )}
          <Input label="Address" value={form.customerAddress} onChangeText={set('customerAddress')} placeholder="Street, City, State" multiline />
          <Input label="GSTIN" value={form.customerGstin} onChangeText={(t) => set('customerGstin')(t.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} autoCapitalize="characters" />
        </View>
      </Panel>

      <Panel>
        <View style={styles.gap}>
          <ThemedText style={styles.h}>Vehicle</ThemedText>
          <Input label="Registration Number" value={form.vehicleNumber} onChangeText={(t) => set('vehicleNumber')(t.toUpperCase())} placeholder="TS09AB1234" autoCapitalize="characters" />
          {pair(<Input label="Brand" value={form.vehicleBrand} onChangeText={set('vehicleBrand')} placeholder="Maruti, Honda…" />, <Input label="Model" value={form.vehicleModel} onChangeText={set('vehicleModel')} placeholder="Swift, City…" />)}
          <View style={styles.row}>
            <View style={styles.flex1}><Input label="Year" value={form.vehicleYear} onChangeText={set('vehicleYear')} placeholder="2020" keyboardType="number-pad" /></View>
            <View style={styles.flex1}><Input label="Colour" value={form.vehicleColour} onChangeText={set('vehicleColour')} placeholder="White, Red…" /></View>
            <View style={styles.flex1}><Input label="Fuel" value={form.vehicleFuel} onChangeText={set('vehicleFuel')} placeholder="Petrol…" /></View>
          </View>
        </View>
      </Panel>

      <Panel>
        <View style={styles.gap}>
          <ThemedText style={styles.h}>Payment</ThemedText>
          {derived ? (
            <View>
              <ThemedText themeColor="textSecondary" style={styles.label}>Status</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.p}>{form.status.charAt(0) + form.status.slice(1).toLowerCase()} — from actual payments, not editable here</ThemedText>
            </View>
          ) : (
            <Select label="Status" value={form.status} onChange={set('status')} options={['DRAFT', 'ISSUED', 'CANCELLED'].map((k) => ({ value: k, label: STATUS_META[k].label }))} />
          )}
        </View>
      </Panel>

      <Input label="Notes / Terms" value={form.notes} onChangeText={set('notes')} placeholder="Additional notes or terms..." multiline />

      <Panel>
        <View style={styles.gap}>
          <ThemedText style={styles.h}>Search items</ThemedText>
          <Input value={query} onChangeText={search} placeholder="Type item name" autoCorrect={false} />
          {searching ? <View style={styles.row}><ActivityIndicator size="small" /><ThemedText themeColor="textMuted" style={styles.small}>Searching…</ThemedText></View> : null}
          {results.map((item) => (
            <Pressable key={item.id} onPress={() => addItem(item)} accessibilityRole="button" style={[styles.result, { borderColor: theme.border }]}>
              <ThemedText style={[styles.flex1, styles.p]} numberOfLines={2}>{item.name}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.small}>{item.quantity ?? ''}{item.unit ? ` ${item.unit}` : ''} · ₹{item.sellingPrice ?? 0}</ThemedText>
            </Pressable>
          ))}
          {!searching && results.length === 0 && query.trim().length >= 2 ? <ThemedText themeColor="textMuted" style={styles.small}>No inventory items match &quot;{query}&quot;</ThemedText> : null}
          {status ? <ThemedText style={[styles.small, { color: status.startsWith('✓') ? '#15803d' : '#b45309' }]}>{status}</ThemedText> : null}
        </View>
      </Panel>

      <Panel>
        <View style={styles.gap}>
          <View style={styles.between}>
            <ThemedText style={styles.h}>Line Items</ThemedText>
            <Button size="sm" onPress={() => setForm((f) => ({ ...f, lineItems: [...f.lineItems, { description: '', hsnSac: '', qty: 1, unitPrice: 0, discountPct: 0 }] }))}>+ Add Item</Button>
          </View>
          <View style={styles.row}>
            <Button size="sm" variant="outline" onPress={() => setForm((f) => ({ ...f, mrpMode: !f.mrpMode }))}>{form.mrpMode ? '₹ MRP (incl. GST)' : '₹ Base Price'}</Button>
            <View style={styles.flex1}><Select compact value={String(form.gstRate)} onChange={(v) => set('gstRate')(Number(v))} options={GST_RATES.map((r) => ({ value: String(r), label: `GST: ${r}%` }))} /></View>
          </View>
          {form.lineItems.map((item, idx) => (
            <View key={idx} style={[styles.line, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={styles.between}>
                <ThemedText themeColor="textMuted" style={styles.small}>Item {idx + 1}</ThemedText>
                <Pressable onPress={() => setForm((f) => ({ ...f, lineItems: f.lineItems.filter((_, i) => i !== idx) }))} hitSlop={8} accessibilityLabel="Remove item"><Ionicons name="trash-outline" size={16} color={theme.danger} /></Pressable>
              </View>
              <Input value={item.description} onChangeText={(t) => updateItem(idx, { description: t })} placeholder="Description *" />
              <View style={styles.row}>
                <View style={styles.flex1}><Input label="HSN/SAC" value={item.hsnSac} onChangeText={(t) => updateItem(idx, { hsnSac: t })} placeholder="998714" /></View>
                <NumField label="Qty" value={item.qty} onChange={(n) => updateItem(idx, { qty: n || 1 })} />
              </View>
              <View style={styles.row}>
                <NumField label={form.mrpMode ? 'MRP' : 'Unit Price'} value={item.unitPrice} onChange={(n) => updateItem(idx, { unitPrice: n })} />
                <NumField label="Disc %" value={item.discountPct} onChange={(n) => updateItem(idx, { discountPct: n })} />
              </View>
              <ThemedText style={[styles.p, styles.semi, styles.right]}>{fmtINR(calcEditLine(item.qty, item.unitPrice, item.discountPct))}</ThemedText>
            </View>
          ))}

          <Panel>
            {form.mrpMode ? <ThemedText style={[styles.small, { color: '#b45309' }]}>MRP mode: GST extracted from price (incl. {gstRate}%)</ThemedText> : null}
            <View style={styles.between}><ThemedText themeColor="textSecondary" style={styles.small}>{form.mrpMode ? 'Base Amount' : 'Subtotal'}</ThemedText><ThemedText style={styles.small}>{fmtINR(subtotal)}</ThemedText></View>
            {!form.mrpMode ? (
              <View style={[styles.between, { marginVertical: 4 }]}>
                <ThemedText themeColor="textSecondary" style={styles.small}>Discount</ThemedText>
                <View style={styles.row}>
                  <NumField width={84} value={Number(form.overallDiscountAmount) || 0} onChange={(n) => set('overallDiscountAmount')(String(n))} placeholder="0" />
                  <Pressable onPress={() => set('overallDiscountMode')(form.overallDiscountMode === 'PERCENT' ? 'FIXED' : 'PERCENT')} accessibilityRole="button" style={[styles.mode, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                    <ThemedText style={styles.p}>{form.overallDiscountMode === 'PERCENT' ? '%' : '₹'}</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}
            <View style={styles.between}><ThemedText themeColor="textSecondary" style={styles.small}>CGST ({gstRate / 2}%)</ThemedText><ThemedText style={styles.small}>{fmtINR(cgst)}</ThemedText></View>
            <View style={styles.between}><ThemedText themeColor="textSecondary" style={styles.small}>SGST ({gstRate / 2}%)</ThemedText><ThemedText style={styles.small}>{fmtINR(sgst)}</ThemedText></View>
            {scTotal > 0 ? <View style={styles.between}><ThemedText themeColor="textSecondary" style={styles.small}>Service Charges</ThemedText><ThemedText style={styles.small}>{fmtINR(scTotal)}</ThemedText></View> : null}
            <View style={[styles.between, styles.grandRow, { borderTopColor: theme.border }]}><ThemedText style={[styles.p, styles.bold]}>Grand Total</ThemedText><ThemedText style={[styles.p, styles.bold]}>{fmtINR(grand)}</ThemedText></View>
          </Panel>
        </View>
      </Panel>

      <Panel>
        <View style={styles.gap}>
          <View style={styles.between}>
            <ThemedText style={styles.h}>Service Charges <ThemedText themeColor="textMuted" style={styles.small}>(no GST)</ThemedText></ThemedText>
            <Button size="sm" onPress={() => setForm((f) => ({ ...f, serviceCharges: [...f.serviceCharges, { description: '', amount: 0 }] }))}>+ Add</Button>
          </View>
          {form.serviceCharges.length === 0 ? <ThemedText themeColor="textMuted" style={styles.small}>No service charges. Click + Add to add one.</ThemedText> : null}
          {form.serviceCharges.map((sc, idx) => (
            <View key={idx} style={styles.row}>
              <View style={styles.flex1}><Input value={sc.description} onChangeText={(t) => setForm((f) => ({ ...f, serviceCharges: f.serviceCharges.map((x, i) => (i === idx ? { ...x, description: t } : x)) }))} placeholder="Service description" /></View>
              <NumField width={96} value={sc.amount} onChange={(n) => setForm((f) => ({ ...f, serviceCharges: f.serviceCharges.map((x, i) => (i === idx ? { ...x, amount: n } : x)) }))} placeholder="0.00" />
              <Pressable onPress={() => setForm((f) => ({ ...f, serviceCharges: f.serviceCharges.filter((_, i) => i !== idx) }))} hitSlop={8} accessibilityLabel="Remove service charge"><Ionicons name="close" size={20} color={theme.danger} /></Pressable>
            </View>
          ))}
        </View>
      </Panel>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  footer: { flexDirection: 'row', gap: 8, flex: 1 },
  h: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  label: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium, marginBottom: 4 },
  p: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  bold: { fontFamily: FontWeights.bold },
  semi: { fontFamily: FontWeights.semiBold },
  right: { textAlign: 'right' },
  err: { fontSize: 13 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: Radii.sm, overflow: 'hidden' },
  segBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segText: { fontSize: 14, fontFamily: FontWeights.medium },
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: Radii.sm },
  line: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 8 },
  mode: { minWidth: 40, height: 44, borderWidth: 1, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  grandRow: { borderTopWidth: 1, paddingTop: 6, marginTop: 4 },
});
