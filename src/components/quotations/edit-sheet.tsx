import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { DateField } from '@/components/call-tracker/date-field';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { fetchQuotationStaff } from '@/lib/api';
import type { QuotationFull, QuotationStaffOption, QuotationStatus } from '@/types/api';

import { GST_RATES, STATUS_KEYS, STATUS_META, blendedTotals, calcLineAmount, emptyLine, fmt, type QLine } from './helpers';
import { LineItemPicker, Panel, SalespersonField, TotalRow } from './parts';

export interface QuotationFormState {
  customerName: string; customerPhone: string; customerEmail: string; customerAddress: string; customerGSTIN: string;
  vehicleNumber: string; vehicleBrand: string; vehicleModel: string; vehicleYear: string; vehicleColour: string;
  gstRate: number; lineItems: QLine[]; status: QuotationStatus; validUntil: string; notes: string; termsConditions: string;
  salespersonId: string | null;
}

// Preserves inventoryItemId / sku / erpItemId on load: PUT /quotations/:id deletes and recreates the
// lines, so dropping them here would silently null them on the next save.
export function formFromQuotation(full: QuotationFull): QuotationFormState {
  return {
    customerName: full.customerName || '',
    customerPhone: full.customerPhone || '',
    customerEmail: full.customerEmail || '',
    customerAddress: full.customerAddress || '',
    customerGSTIN: full.customerGSTIN || '',
    vehicleNumber: full.vehicleNumber || '',
    vehicleBrand: full.vehicleBrand || '',
    vehicleModel: full.vehicleModel || '',
    vehicleYear: full.vehicleYear != null ? String(full.vehicleYear) : '',
    vehicleColour: full.vehicleColour || '',
    gstRate: full.gstRate ?? 18,
    lineItems: full.lineItems && full.lineItems.length > 0
      ? full.lineItems.map((li) => ({
          id: li.id, description: li.description, hsnSacCode: li.hsnSacCode || '998714',
          quantity: Number(li.quantity) || 1, unitPrice: Number(li.unitPrice) || 0,
          discountAmount: Number(li.discountAmount ?? li.discountPct) || 0,
          discountMode: (li.discountMode === 'FIXED' ? 'FIXED' : 'PERCENT') as 'PERCENT' | 'FIXED',
          inventoryItemId: li.inventoryItemId || undefined, sku: li.sku || undefined, erpItemId: li.erpItemId || undefined,
        }))
      : [emptyLine()],
    status: full.status,
    validUntil: full.validUntil ? full.validUntil.slice(0, 10) : '',
    notes: full.notes || '',
    termsConditions: full.termsConditions || '',
    salespersonId: full.salesperson?.id || null,
  };
}

/** The dashboard handleSave payload: validation, trimming and the line shape are identical. */
export function buildEditPayload(form: QuotationFormState): { error: string } | { payload: Record<string, unknown> } {
  if (!form.customerName.trim()) return { error: 'Customer name is required.' };
  const validItems = form.lineItems.filter((li) => li.description.trim());
  if (validItems.length === 0) return { error: 'At least one line item needs a description.' };
  const rawGst = Number(form.gstRate);
  const gstRate = Number.isFinite(rawGst) ? rawGst : 18;
  return {
    payload: {
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim() || undefined,
      customerEmail: form.customerEmail.trim() || undefined,
      customerAddress: form.customerAddress.trim() || undefined,
      customerGSTIN: form.customerGSTIN.trim() || undefined,
      vehicleNumber: form.vehicleNumber.trim() || undefined,
      vehicleBrand: form.vehicleBrand.trim() || undefined,
      vehicleModel: form.vehicleModel.trim() || undefined,
      vehicleYear: form.vehicleYear.trim() || undefined,
      vehicleColour: form.vehicleColour.trim() || undefined,
      gstRate,
      status: form.status,
      validUntil: form.validUntil || undefined,
      notes: form.notes.trim() || undefined,
      termsConditions: form.termsConditions.trim() || undefined,
      salespersonId: form.salespersonId || null,
      lineItems: validItems.map((li) => ({
        description: li.description.trim(),
        hsnSacCode: li.hsnSacCode?.trim() || undefined,
        quantity: Number(li.quantity) || 1,
        unitPrice: Number(li.unitPrice) || 0,
        discountAmount: Number(li.discountAmount) || 0,
        discountMode: li.discountMode || 'PERCENT',
        inventoryItemId: li.inventoryItemId || undefined,
        sku: li.sku || undefined,
        erpItemId: li.erpItemId || undefined,
        amount: calcLineAmount(li),
      })),
    },
  };
}

// Dashboard QuotationFormModal (Edit): customer, vehicle, salesperson, line items, GST rate + valid
// until, live totals on a single blended GST rate, status, notes, terms.
export function QuotationEditSheet({ quotation, form, setForm, saving, error, wide, onClose, onSave }: {
  quotation: QuotationFull; form: QuotationFormState; setForm: React.Dispatch<React.SetStateAction<QuotationFormState>>;
  saving: boolean; error: string; wide: boolean; onClose: () => void; onSave: () => void;
}) {
  const [staff, setStaff] = useState<QuotationStaffOption[]>([]);
  useEffect(() => {
    let live = true;
    fetchQuotationStaff().then((s) => { if (live) setStaff(s); }).catch(() => { /* selector just shows empty — not fatal */ });
    return () => { live = false; };
  }, []);

  const set = <K extends keyof QuotationFormState>(k: K) => (v: QuotationFormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const totals = blendedTotals(form.lineItems, form.gstRate);
  const pair = (a: React.ReactNode, b: React.ReactNode) => <View style={styles.row}><View style={styles.flex1}>{a}</View><View style={styles.flex1}>{b}</View></View>;

  return (
    <Sheet visible fullHeight onClose={onClose} locked={saving} title={`Edit Quotation ${quotation.quotationNumber}`} footer={
      <View style={styles.footer}>
        <View style={styles.flex1}><Button variant="outline" onPress={onClose} disabled={saving} fullWidth>Cancel</Button></View>
        <View style={styles.flex1}><Button onPress={onSave} loading={saving} fullWidth>{saving ? 'Saving…' : 'Save Changes'}</Button></View>
      </View>
    }>
      {error ? <ThemedText themeColor="danger" style={styles.err}>{error}</ThemedText> : null}

      {pair(
        <Input label="Customer Name *" value={form.customerName} onChangeText={set('customerName')} />,
        <Input label="Phone" value={form.customerPhone} onChangeText={set('customerPhone')} keyboardType="phone-pad" />,
      )}
      {pair(
        <Input label="Email" value={form.customerEmail} onChangeText={set('customerEmail')} keyboardType="email-address" autoCapitalize="none" />,
        <Input label="GSTIN" value={form.customerGSTIN} onChangeText={set('customerGSTIN')} autoCapitalize="characters" />,
      )}
      <Input label="Address" value={form.customerAddress} onChangeText={set('customerAddress')} />

      {wide ? (
        <View style={styles.row}>
          <View style={styles.flex1}><Input label="Vehicle No." value={form.vehicleNumber} onChangeText={set('vehicleNumber')} autoCapitalize="characters" /></View>
          <View style={styles.flex1}><Input label="Brand" value={form.vehicleBrand} onChangeText={set('vehicleBrand')} /></View>
          <View style={styles.flex1}><Input label="Model" value={form.vehicleModel} onChangeText={set('vehicleModel')} /></View>
          <View style={styles.flex1}><Input label="Colour" value={form.vehicleColour} onChangeText={set('vehicleColour')} /></View>
        </View>
      ) : (
        <>
          <Input label="Vehicle No." value={form.vehicleNumber} onChangeText={set('vehicleNumber')} autoCapitalize="characters" />
          {pair(
            <Input label="Brand" value={form.vehicleBrand} onChangeText={set('vehicleBrand')} />,
            <Input label="Model" value={form.vehicleModel} onChangeText={set('vehicleModel')} />,
          )}
          <Input label="Colour" value={form.vehicleColour} onChangeText={set('vehicleColour')} />
        </>
      )}

      <SalespersonField staff={staff} value={form.salespersonId} onChange={set('salespersonId')} />

      <View>
        <ThemedText themeColor="textSecondary" style={styles.label}>Line Items</ThemedText>
        <LineItemPicker items={form.lineItems} onChange={set('lineItems')} wide={wide} />
      </View>

      {pair(
        <Select label="GST Rate" value={String(form.gstRate)} onChange={(v) => set('gstRate')(parseFloat(v))} options={GST_RATES.map((r) => ({ value: String(r), label: `${r}%` }))} />,
        <DateField label="Valid Until" value={form.validUntil} onChange={set('validUntil')} />,
      )}

      <Panel>
        <TotalRow label="Subtotal" value={`₹${fmt(totals.subtotal)}`} />
        <TotalRow label="CGST" value={`₹${fmt(totals.cgst)}`} />
        <TotalRow label="SGST" value={`₹${fmt(totals.sgst)}`} />
        <TotalRow label="Grand Total" value={`₹${fmt(totals.grandTotal)}`} bold top />
      </Panel>

      <Select label="Status" value={form.status} onChange={(v) => set('status')(v as QuotationStatus)} options={STATUS_KEYS.map((k) => ({ value: k, label: STATUS_META[k].label }))} />
      <Input label="Notes" value={form.notes} onChangeText={set('notes')} multiline />
      <Input label="Terms & Conditions" value={form.termsConditions} onChangeText={set('termsConditions')} multiline />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: 12 },
  footer: { flexDirection: 'row', gap: 8, flex: 1 },
  label: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  err: { fontSize: 13 },
});
