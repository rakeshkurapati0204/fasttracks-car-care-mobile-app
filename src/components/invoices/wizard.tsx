import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { LineItemPicker, NumField, Panel, SalespersonField } from '@/components/quotations/parts';
import { Step1, StepIndicator, Totals, initialState, type WizardState } from '@/components/quotations/wizard';
import { cartTotals, fmt, type QLine } from '@/components/quotations/helpers';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createInvoiceRaw, fetchInvoiceFull, fetchQuotationStaff, getErrorMessage, notifyInvoice, payInvoice, updateInvoiceRaw } from '@/lib/api';
import type { InvoiceFull, QuotationStaffOption } from '@/types/api';

import { fmtINR } from './helpers';

// Dashboard New Invoice wizard (invoices/new/page.tsx): Customer & Vehicle → Items → Payment → Send Invoice.
// Customer & Vehicle and the item totals are the same screens / math as the quotation wizard (the dashboard
// built that wizard from this one), so they are shared; the invoice-only parts are the payment step, the send
// step and resuming an open invoice (DRAFT → items, ISSUED / PARTIAL → payment or edit).
const MEMORY_KEY = 'invoice';
const STEPS = ['Customer & Vehicle', 'Items', 'Payment', 'Send Invoice'];
const PRINT_URL = (id: string) => `https://dashboard.fasttrackscarcare.in/dashboard/invoices/${id}/print`;

interface Flow {
  step: 1 | 2 | 3 | 4;
  invoiceId: string | null;
  existingPaid: number;
  existingBalance: number;
  method: 'UPI' | 'CASH';
  received: string;
  paymentDone: boolean;
  invoiceNumber: string;
  finalGrand: number;
  finalBalance: number;
  paidNow: number;
  sendWhatsapp: boolean;
  sendEmail: boolean;
  notified: boolean;
  skipSend: boolean;
}

function flowFor(resume?: { invoice: InvoiceFull; step: 1 | 2 | 3 }): Flow {
  const inv = resume?.invoice;
  return {
    step: resume?.step ?? 1, invoiceId: inv?.id ?? null,
    existingPaid: Number(inv?.paidAmount) || 0, existingBalance: Number(inv?.balanceDue) || 0,
    method: 'CASH', received: '', paymentDone: false, invoiceNumber: inv?.invoiceNumber ?? '', finalGrand: 0, finalBalance: 0, paidNow: 0,
    sendWhatsapp: !!inv?.customerPhone, sendEmail: !!inv?.customerEmail, notified: false, skipSend: false,
  };
}

function stateFor(userId: string, resume?: { invoice: InvoiceFull }): WizardState {
  const base = initialState(userId || null, MEMORY_KEY);
  const inv = resume?.invoice;
  if (!inv) return base;
  return {
    ...base,
    customerName: inv.customerName ?? '', customerPhone: inv.customerPhone ?? '', customerEmail: inv.customerEmail ?? '', customerAddress: inv.customerAddress ?? '',
    vehicleRegNo: inv.vehicleNumber ?? '', vehicleMake: inv.vehicleBrand ?? '', vehicleModel: inv.vehicleModel ?? '',
    salespersonId: inv.salesperson?.id ?? base.salespersonId,
  };
}

export function NewInvoiceWizard({ userId, wide, resume, onClose, onViewInvoice }: {
  userId: string; wide: boolean; resume?: { invoice: InvoiceFull; step: 1 | 2 | 3 };
  onClose: () => void; onViewInvoice: (id: string) => void;
}) {
  const theme = useTheme();
  const [state, setState] = useState<WizardState>(() => stateFor(userId, resume));
  const [flow, setFlow] = useState<Flow>(() => flowFor(resume));
  const [staff, setStaff] = useState<QuotationStaffOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));
  const setF = (p: Partial<Flow>) => setFlow((f) => ({ ...f, ...p }));

  useEffect(() => {
    let live = true;
    fetchQuotationStaff().then((s) => { if (live) setStaff(s); }).catch(() => { /* selector just shows empty — not fatal */ });
    return () => { live = false; };
  }, []);

  const totals = cartTotals(state.cartItems, state.serviceCharges, state.overallDiscountAmount, state.overallDiscountMode);
  const amountToCollect = flow.existingBalance > 0 ? flow.existingBalance : totals.grandTotal;
  const received = parseFloat(flow.received) || 0;
  const services = state.serviceCharges.filter((s) => s.label && s.amount > 0);
  const validLines = state.cartItems.filter((li) => li.description.trim());

  const goStep = (s: number) => {
    if (s >= flow.step) return;
    if (flow.step >= 3 && (s === 1 || s === 2) && validLines.length > 0) {
      Alert.alert('Going back will keep your cart. Continue?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'OK', onPress: () => setF({ step: s as 1 | 2 }) }]);
      return;
    }
    setF({ step: s as 1 | 2 | 3 });
  };

  const lineItemsPayload = (key: 'inventoryItemId' | 'erpItemId') => [
    ...validLines.map((item: QLine, i) => ({
      description: item.description, hsnSacCode: item.hsnSacCode || undefined, quantity: item.quantity, unitPrice: item.unitPrice,
      [key]: item.inventoryItemId || undefined, discountAmount: item.discountAmount || 0, discountMode: item.discountMode || 'PERCENT', sortOrder: i,
    })),
    ...services.map((s, i) => ({ description: s.label, quantity: 1, unitPrice: s.amount, sortOrder: validLines.length + i })),
  ];

  // New invoices are only written to the server when payment is taken; a resumed open invoice is updated first.
  const proceed = async () => {
    if (!flow.invoiceId) { setF({ step: 3 }); return; }
    setBusy(true); setError('');
    try {
      await updateInvoiceRaw(flow.invoiceId, {
        lineItems: lineItemsPayload('erpItemId'),
        overallDiscountAmount: state.overallDiscountAmount || 0, overallDiscountMode: state.overallDiscountMode || 'PERCENT',
        manualAmounts: { subtotal: totals.discountedSubtotal, cgst: totals.cgst, sgst: totals.sgst, grandTotal: totals.grandTotal },
        status: 'ISSUED', salespersonId: state.salespersonId || undefined,
      });
      const fresh = await fetchInvoiceFull(flow.invoiceId);
      setF({ step: 3, existingPaid: Number(fresh.paidAmount) || 0, existingBalance: Number(fresh.balanceDue) || 0 });
    } catch (e) { setError(getErrorMessage(e, 'Failed to save items to this invoice.')); }
    finally { setBusy(false); }
  };

  const confirmSalesperson = () => {
    const sp = staff.find((s) => s.id === state.salespersonId);
    if (sp) {
      Alert.alert('Confirm Salesperson', `Salesperson: ${sp.name}${sp.phone ? ` (${sp.phone})` : ''}`, [
        { text: 'Change', style: 'cancel' }, { text: 'Confirm & Proceed →', onPress: proceed },
      ]);
    } else {
      Alert.alert('Confirm Salesperson', "No salesperson set. You can still proceed — this can always be added later, but the printed invoice won't show one.", [
        { text: 'Go Back', style: 'cancel' }, { text: 'Skip & Proceed →', onPress: proceed },
      ]);
    }
  };

  const createInvoiceNow = async (): Promise<string> => {
    const created = await createInvoiceRaw({
      customerName: state.customerName, customerPhone: state.customerPhone, customerEmail: state.customerEmail, customerAddress: state.customerAddress,
      customerGSTIN: state.customerGSTIN || undefined,
      vehicleNumber: state.vehicleRegNo || undefined, vehicleBrand: state.vehicleMake || undefined, vehicleModel: state.vehicleModel || undefined,
      vehicleYear: state.vehicleYear || undefined, vehicleColour: state.vehicleColour || undefined,
      lineItems: lineItemsPayload('inventoryItemId'),
      discountAmount: 0, gstRate: 0,
      overallDiscountAmount: state.overallDiscountAmount || 0, overallDiscountMode: state.overallDiscountMode || 'PERCENT',
      overallDiscAmt: totals.overallDiscAmt,
      manualAmounts: { subtotal: totals.discountedSubtotal, cgst: totals.cgst, sgst: totals.sgst, grandTotal: totals.grandTotal },
      status: 'ISSUED', salespersonId: state.salespersonId || undefined,
    });
    setF({ invoiceId: created.id, invoiceNumber: created.invoiceNumber });
    return created.id;
  };

  const collect = async (method: 'UPI' | 'CASH', amount: number) => {
    setBusy(true); setError('');
    try {
      const id = flow.invoiceId ?? await createInvoiceNow();
      await payInvoice(id, { paymentMethod: method, amount });
      const inv = await fetchInvoiceFull(id);
      const customerHasChannel = !!(state.customerPhone || state.customerEmail);
      setF({
        invoiceId: id, invoiceNumber: inv.invoiceNumber, finalGrand: Number(inv.grandTotal) || 0, finalBalance: Number(inv.balanceDue) || 0,
        paidNow: amount, paymentDone: inv.status === 'PAID', step: 4, skipSend: !customerHasChannel,
        sendWhatsapp: !!state.customerPhone, sendEmail: !!state.customerEmail,
      });
    } catch (e) { setError(getErrorMessage(e, 'Failed to record payment.')); }
    finally { setBusy(false); }
  };

  const send = async () => {
    if (!flow.invoiceId) return;
    const channels = [flow.sendWhatsapp && state.customerPhone ? 'whatsapp' : '', flow.sendEmail && state.customerEmail ? 'email' : ''].filter(Boolean);
    if (channels.length === 0) return;
    setBusy(true);
    // The dashboard does not check the response of this call either.
    try { await notifyInvoice(flow.invoiceId, channels, PRINT_URL(flow.invoiceId)); } catch { /* best-effort, like the dashboard */ }
    setF({ notified: true, skipSend: true });
    setBusy(false);
  };

  const reset = () => {
    // Keeps customer details and discount settings, clears the cart, payment and vehicle (dashboard "New Invoice").
    setState((s) => ({ ...s, cartItems: [], serviceCharges: [], vehicleRegNo: '', vehicleMake: '', vehicleModel: '', vehicleYear: '', vehicleColour: '', vehicleFuelType: '', vehicleFetched: false }));
    setFlow({ ...flowFor(), step: 1, sendWhatsapp: !!state.customerPhone, sendEmail: !!state.customerEmail });
    setError('');
  };

  const card = (children: React.ReactNode) => <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>;
  const tile = (key: 'UPI' | 'CASH', icon: keyof typeof Ionicons.glyphMap, label: string) => (
    <Pressable key={key} onPress={() => setF({ method: key })} accessibilityRole="button" accessibilityState={{ selected: flow.method === key }}
      style={[styles.tile, { borderColor: flow.method === key ? theme.primary : theme.border, backgroundColor: flow.method === key ? 'rgba(104,15,26,0.06)' : theme.backgroundElement }]}>
      <Ionicons name={icon} size={22} color={flow.method === key ? theme.primary : theme.textMuted} />
      <ThemedText style={[styles.tileText, { color: flow.method === key ? theme.primary : theme.text }]}>{label}</ThemedText>
    </Pressable>
  );

  return (
    <View style={styles.gap}>
      <View style={styles.between}>
        <ThemedText style={styles.title}>New Invoice</ThemedText>
        <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button"><ThemedText themeColor="textMuted" style={styles.p}>← All Invoices</ThemedText></Pressable>
      </View>
      <StepIndicator step={flow.step} wide={wide} steps={STEPS} onGoStep={goStep} />

      {card(
        flow.step === 1 ? (
          <Step1 state={state} set={set} wide={wide} memoryKey={MEMORY_KEY} onNext={() => setF({ step: 2 })} />
        ) : flow.step === 2 ? (
          <View style={styles.gap}>
            <LineItemPicker items={state.cartItems} onChange={(items) => set({ cartItems: items })} wide={wide} />

            <View style={styles.gap}>
              <View style={styles.between}>
                <ThemedText themeColor="textSecondary" style={styles.sectionLabel}>Service Charges</ThemedText>
                <Button variant="ghost" size="sm" onPress={() => set({ serviceCharges: [...state.serviceCharges, { id: Date.now().toString(), label: '', amount: 0 }] })}>+ Add</Button>
              </View>
              {state.serviceCharges.map((sc) => (
                <View key={sc.id} style={styles.rowC}>
                  <View style={styles.flex1}><Input value={sc.label} placeholder="e.g. Labour charge" onChangeText={(t) => set({ serviceCharges: state.serviceCharges.map((s) => (s.id === sc.id ? { ...s, label: t } : s)) })} /></View>
                  <NumField value={sc.amount} onChange={(n) => set({ serviceCharges: state.serviceCharges.map((s) => (s.id === sc.id ? { ...s, amount: n } : s)) })} placeholder="0.00" width={110} />
                  <Pressable onPress={() => set({ serviceCharges: state.serviceCharges.filter((s) => s.id !== sc.id) })} hitSlop={10} accessibilityLabel="Remove service charge"><Ionicons name="close" size={20} color={theme.textMuted} /></Pressable>
                </View>
              ))}
            </View>

            <SalespersonField staff={staff} value={state.salespersonId} onChange={(id) => set({ salespersonId: id })} />

            {state.cartItems.length > 0 || services.length > 0 ? (
              <Panel>
                <View style={styles.rowC}>
                  <ThemedText themeColor="textSecondary" style={styles.small}>Overall Discount:</ThemedText>
                  <Pressable onPress={() => set({ overallDiscountMode: state.overallDiscountMode === 'PERCENT' ? 'FIXED' : 'PERCENT', overallDiscountAmount: 0 })} accessibilityRole="button" accessibilityLabel="Toggle discount mode"
                    style={[styles.mode, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <ThemedText themeColor="textMuted" style={styles.p}>{state.overallDiscountMode === 'PERCENT' ? '%' : '₹'}</ThemedText>
                  </Pressable>
                  <NumField value={state.overallDiscountAmount} onChange={(n) => set({ overallDiscountAmount: n })} placeholder="0" width={96} />
                </View>
                {state.overallDiscountAmount > 0 || totals.totalLineDiscounts > 0 ? <ThemedText style={[styles.small, { color: '#16a34a', textAlign: 'right', marginTop: 4 }]}>Saving ₹{fmt(totals.totalLineDiscounts + totals.overallDiscAmt)}</ThemedText> : null}
              </Panel>
            ) : null}

            {state.cartItems.length > 0 || services.length > 0 ? <Totals totals={totals} /> : null}
            {error ? <ThemedText style={[styles.small, { color: '#dc2626' }]}>{error}</ThemedText> : null}

            <View style={styles.between}>
              <Button variant="secondary" onPress={() => setF({ step: 1 })} disabled={busy}>← Back</Button>
              <Button disabled={(validLines.length === 0 && services.length === 0) || busy} loading={busy} onPress={confirmSalesperson}>Proceed to Pay →</Button>
            </View>
          </View>
        ) : flow.step === 3 ? (
          <View style={styles.gap}>
            <View style={styles.center}>
              <ThemedText themeColor="textMuted" style={styles.small}>{flow.existingBalance > 0 ? 'Balance due' : 'Amount to collect'}</ThemedText>
              <ThemedText style={styles.big}>{fmtINR(amountToCollect)}</ThemedText>
              {flow.existingBalance > 0 && flow.existingPaid > 0 ? <ThemedText themeColor="textMuted" style={styles.small}>Grand total: {fmtINR(totals.grandTotal)} · Already paid: {fmtINR(flow.existingPaid)}</ThemedText> : null}
            </View>
            <View style={styles.tiles}>{tile('UPI', 'qr-code-outline', 'UPI / QR')}{tile('CASH', 'cash-outline', 'Cash')}</View>

            {flow.method === 'UPI' ? (
              <Panel>
                <View style={styles.gap}>
                  <ThemedText style={styles.h}>Pay via UPI — {fmtINR(amountToCollect)}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.small}>The customer pays with any UPI app or QR scan. Confirm here once the amount has been received.</ThemedText>
                  <Button loading={busy} onPress={() => collect('UPI', amountToCollect)}>Confirm UPI Payment Received</Button>
                </View>
              </Panel>
            ) : (
              <Panel>
                <View style={styles.gap}>
                  <View style={styles.between}><ThemedText themeColor="textMuted" style={styles.small}>Total Invoice Amount</ThemedText><ThemedText style={styles.h}>{fmtINR(amountToCollect)}</ThemedText></View>
                  <Input label="Amount Received (₹)" value={flow.received} onChangeText={(t) => setF({ received: t })} placeholder="0.00" keyboardType="decimal-pad" />
                  <View style={styles.between}><ThemedText themeColor="textMuted" style={styles.small}>Remaining Balance</ThemedText><ThemedText style={styles.h}>{fmtINR(Math.max(0, amountToCollect - received))}</ThemedText></View>
                  {received > amountToCollect ? <ThemedText style={[styles.small, { color: '#dc2626' }]}>Amount received exceeds the invoice total</ThemedText> : null}
                  <Button loading={busy} disabled={!(received > 0 && received <= amountToCollect) || busy} onPress={() => collect('CASH', received)}>
                    {received > 0 && received < amountToCollect ? 'Record Partial Payment' : 'Confirm Cash Payment'}
                  </Button>
                </View>
              </Panel>
            )}
            {error ? <ThemedText style={[styles.small, { color: '#dc2626' }]}>{error}</ThemedText> : null}
            <View style={styles.between}><Button variant="secondary" onPress={() => setF({ step: 2 })} disabled={busy}>← Back</Button></View>
          </View>
        ) : !flow.skipSend ? (
          <View style={styles.gap}>
            <ThemedText style={styles.h}>Invoice sent?</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.p}>Choose how to notify {state.customerName}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>Invoice #{flow.invoiceNumber}</ThemedText>
            {state.customerPhone ? (
              <View style={styles.between}><ThemedText style={styles.p}>WhatsApp ({state.customerPhone})</ThemedText><Switch value={flow.sendWhatsapp} onValueChange={(v) => setF({ sendWhatsapp: v })} /></View>
            ) : null}
            {state.customerEmail ? (
              <View style={styles.between}><ThemedText style={styles.p}>Email ({state.customerEmail})</ThemedText><Switch value={flow.sendEmail} onValueChange={(v) => setF({ sendEmail: v })} /></View>
            ) : null}
            <View style={styles.rowC}>
              <Button loading={busy} disabled={(!flow.sendWhatsapp || !state.customerPhone) && (!flow.sendEmail || !state.customerEmail)} onPress={send}>Send</Button>
              <Button variant="outline" onPress={() => setF({ skipSend: true })} disabled={busy}>Skip</Button>
            </View>
          </View>
        ) : (
          <View style={[styles.gap, styles.center]}>
            <Ionicons name="checkmark-circle" size={56} color={flow.paymentDone ? '#16a34a' : '#d97706'} />
            <ThemedText style={styles.big}>{flow.paymentDone ? 'Payment Complete!' : 'Partial Payment Recorded'}</ThemedText>
            <ThemedText style={styles.h}>Invoice #{flow.invoiceNumber}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.p}>{fmtINR(flow.method === 'CASH' ? flow.paidNow : flow.finalGrand)} via {flow.method}</ThemedText>
            {!flow.paymentDone ? <ThemedText style={[styles.p, { color: '#d97706' }]}>{fmtINR(flow.finalBalance)} balance remaining</ThemedText> : null}
            <ThemedText themeColor="textMuted" style={styles.p}>{state.customerName}</ThemedText>
            {flow.notified ? <ThemedText style={[styles.small, { color: '#16a34a' }]}>Invoice notification sent</ThemedText> : null}
            <View style={styles.rowC}>
              <Button variant="outline" onPress={() => flow.invoiceId && onViewInvoice(flow.invoiceId)}>View Invoice</Button>
              <Button onPress={reset}>🔄 New Invoice</Button>
            </View>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 16 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowC: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  center: { alignItems: 'center' },
  title: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 16 },
  p: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  h: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  big: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sectionLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  mode: { minWidth: 40, height: 36, borderWidth: 1, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderWidth: 2, borderRadius: Radii.md, paddingVertical: 16, alignItems: 'center', gap: 6 },
  tileText: { fontSize: 14, fontFamily: FontWeights.semiBold },
});
