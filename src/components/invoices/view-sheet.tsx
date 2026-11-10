import { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { Panel, TotalRow } from '@/components/quotations/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights, Fonts, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchInvoicePaymentHistory } from '@/lib/api';
import type { InvoiceFull, InvoicePaymentHistoryRow } from '@/types/api';

import { PRINT_LOCK_TEXT, STATUS_META, buildInvoiceText, canPrint, fmtDate, fmtINR, paymentLabel } from './helpers';

// Dashboard InvoiceViewModal: number / status / date, customer and vehicle, services, service charges,
// totals (discount, CGST, SGST, service charges, grand total, payment mode / split breakdown, paid, balance,
// settled), payment history, the Collect Payment panel, and Print / Collect / Waybill / Email / WhatsApp / Edit / Close.
export function InvoiceViewSheet({ invoice: inv, isAdmin, canRecordPayment, startWithPayment, busy, wide, onClose, onEdit, onRecordPayment, onWaybill, onEmail, onWhatsApp }: {
  invoice: InvoiceFull; isAdmin: boolean; canRecordPayment: boolean; startWithPayment?: boolean; busy: boolean; wide: boolean;
  onClose: () => void; onEdit: () => void; onRecordPayment: (amount: number, method: string) => void;
  onWaybill: () => void; onEmail: () => void; onWhatsApp: () => void;
}) {
  const theme = useTheme();
  const st = STATUS_META[inv.status] ?? STATUS_META.DRAFT;
  const [showPay, setShowPay] = useState(!!startWithPayment);
  const outstanding = Math.max(0, (inv.grandTotal || 0) - (inv.paidAmount || 0));
  const [payAmount, setPayAmount] = useState(outstanding > 0 ? outstanding.toFixed(0) : '');
  const [payMethod, setPayMethod] = useState('CASH');
  const [history, setHistory] = useState<InvoicePaymentHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let live = true;
    fetchInvoicePaymentHistory(inv.id).then((r) => { if (live) setHistory(r); }).catch(() => { if (live) setHistory([]); }).finally(() => { if (live) setHistoryLoading(false); });
    return () => { live = false; };
  }, [inv.id, inv.paidAmount]);

  const overallDisc = inv.overallDiscountMode === 'PERCENT' ? (inv.subtotal || 0) * ((Number(inv.overallDiscountAmount) || 0) / 100) : (Number(inv.overallDiscountAmount) || 0);
  const legacyDisc = !overallDisc && Number(inv.discountAmount) > 0 ? Number(inv.discountAmount) : 0;
  const discLabel = inv.overallDiscountMode === 'PERCENT' && Number(inv.overallDiscountAmount) > 0 ? `Discount (${inv.overallDiscountAmount}%)` : 'Discount';
  const scTotal = (inv.serviceCharges ?? []).reduce((s, sc) => s + (sc.amount || 0), 0);
  const gstHalf = inv.displayGstPercent != null ? ` (${inv.displayGstPercent / 2}%)` : '';

  const print = async () => {
    if (!canPrint(inv.status)) { Alert.alert('Invoice Not Yet Paid', PRINT_LOCK_TEXT(inv.status)); return; }
    try { await Share.share({ message: buildInvoiceText(inv, history), title: `Invoice ${inv.invoiceNumber}` }); } catch { /* share sheet dismissed */ }
  };

  const section = (title: string) => <ThemedText themeColor="textMuted" style={styles.eyebrow}>{title}</ThemedText>;
  const vehicle = [inv.vehicleBrand, inv.vehicleModel, inv.vehicleYear].filter(Boolean).join(' ');

  return (
    <Sheet visible fullHeight onClose={onClose} locked={busy} title={inv.invoiceNumber} footer={
      <View style={styles.flex1}><Button variant="outline" onPress={onClose} disabled={busy} fullWidth>Close</Button></View>
    }>
      <View style={styles.badges}>
        <View style={[styles.pill, { backgroundColor: st.bg }]}><ThemedText style={[styles.pillText, { color: st.color }]}>{st.label}</ThemedText></View>
        <ThemedText themeColor="textMuted" style={styles.small}>{fmtDate(inv.createdAt)}</ThemedText>
        {inv.isPaid ? <View style={[styles.pill, { backgroundColor: 'rgba(34,197,94,0.15)' }]}><ThemedText style={[styles.pillText, { color: '#15803d' }]}>✓ Paid</ThemedText></View> : null}
        {inv.waybillNo ? <ThemedText themeColor="textMuted" style={[styles.small, { fontFamily: Fonts?.mono }]}>WB: {inv.waybillNo}</ThemedText> : null}
      </View>

      <View style={[styles.two, wide && styles.twoWide]}>
        <View style={styles.flex1}>
          {section('Customer')}
          <ThemedText style={styles.strong}>{inv.customerName || '—'}</ThemedText>
          {inv.customerPhone ? <ThemedText themeColor="textSecondary" style={styles.body}>{inv.customerPhone}</ThemedText> : null}
          {inv.customerEmail ? <ThemedText themeColor="textSecondary" style={styles.body}>{inv.customerEmail}</ThemedText> : null}
          {inv.customerAddress ? <ThemedText themeColor="textMuted" style={styles.small}>{inv.customerAddress}</ThemedText> : null}
          {inv.customerGstin ? <ThemedText themeColor="textMuted" style={[styles.small, { fontFamily: Fonts?.mono }]}>GSTIN: {inv.customerGstin}</ThemedText> : null}
        </View>
        <View style={styles.flex1}>
          {section('Vehicle')}
          {inv.vehicleNumber ? (
            <>
              <ThemedText style={[styles.strong, { fontFamily: Fonts?.mono }]}>{inv.vehicleNumber}</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.body}>{vehicle}</ThemedText>
              {inv.vehicleColour ? <ThemedText themeColor="textMuted" style={styles.small}>{inv.vehicleColour}</ThemedText> : null}
            </>
          ) : <ThemedText themeColor="textMuted" style={styles.body}>—</ThemedText>}
        </View>
      </View>

      {inv.lineItems && inv.lineItems.length > 0 ? (
        <View>
          {section('Services / Items')}
          <View style={[styles.table, { borderColor: theme.border }]}>
            <View style={[styles.tr, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cDesc]}>Description</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cQty]}>Qty</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cPrice]}>Price</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cAmt]}>Amount</ThemedText>
            </View>
            {inv.lineItems.map((li, i) => (
              <View key={i} style={[styles.tr, { borderBottomColor: theme.border }]}>
                <ThemedText style={[styles.td, styles.cDesc]}>{li.description}</ThemedText>
                <ThemedText themeColor="textSecondary" style={[styles.td, styles.cQty]}>{li.quantity}</ThemedText>
                <ThemedText themeColor="textSecondary" style={[styles.td, styles.cPrice]}>{fmtINR(li.unitPrice)}</ThemedText>
                <ThemedText style={[styles.td, styles.cAmt, styles.semi]}>{fmtINR(li.amount)}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {(inv.serviceCharges ?? []).length > 0 ? (
        <View>
          {section('Service Charges')}
          <View style={[styles.table, { borderColor: theme.border }]}>
            {(inv.serviceCharges ?? []).map((sc, i) => (
              <View key={i} style={[styles.tr, { borderBottomColor: theme.border }]}>
                <ThemedText style={[styles.td, styles.cDesc]}>{sc.description}</ThemedText>
                <ThemedText style={[styles.td, styles.cAmt, styles.semi]}>{fmtINR(sc.amount)}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <Panel>
        <TotalRow label="Subtotal" value={fmtINR(inv.subtotal)} />
        {overallDisc > 0 ? <TotalRow label={discLabel} value={`−${fmtINR(overallDisc)}`} color="#b45309" /> : null}
        {legacyDisc > 0 ? <TotalRow label="Discount" value={`−${fmtINR(legacyDisc)}`} color="#b45309" /> : null}
        {inv.cgst > 0 ? <TotalRow label={`CGST${gstHalf}`} value={fmtINR(inv.cgst)} /> : null}
        {inv.sgst > 0 ? <TotalRow label={`SGST${gstHalf}`} value={fmtINR(inv.sgst)} /> : null}
        {scTotal > 0 ? <TotalRow label="Service Charges" value={fmtINR(scTotal)} /> : null}
        <TotalRow label="Grand Total" value={fmtINR(inv.grandTotal)} bold top />
        {inv.paymentMode ? (
          <View style={[styles.payBlock, { borderTopColor: theme.border }]}>
            {inv.paymentMode === 'SPLIT' ? (
              <>
                <TotalRow label="Payment" value="Split Payment" color={theme.primary} />
                {Array.isArray(inv.splitPayments) ? inv.splitPayments.map((sp, i) => <TotalRow key={i} label={`↳ ${sp.label || paymentLabel(sp.mode)}`} value={fmtINR(Number(sp.amount))} />) : null}
              </>
            ) : <TotalRow label="Payment Mode" value={paymentLabel(inv.paymentMode)} />}
          </View>
        ) : null}
        <TotalRow label="Total Paid" value={fmtINR(inv.paidAmount)} color={inv.paidAmount >= inv.grandTotal ? '#15803d' : undefined} />
        {inv.balanceDue > 0 && inv.status !== 'CANCELLED' ? <TotalRow label="Balance Due" value={fmtINR(inv.balanceDue)} color="#b91c1c" /> : null}
        {inv.paidAt ? <TotalRow label="Settled" value={new Date(inv.paidAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })} /> : null}
      </Panel>

      {historyLoading ? (
        <ThemedText themeColor="textMuted" style={styles.small}>Loading payment history…</ThemedText>
      ) : history.length > 0 ? (
        <View>
          {section('Payment History')}
          <View style={[styles.table, { borderColor: theme.border }]}>
            <View style={[styles.tr, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cDate]}>Date</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cAmt]}>Amount</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cDesc]}>Method</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.cBy]}>By</ThemedText>
            </View>
            {history.map((p, i) => {
              const adv = p._type === 'advance';
              return (
                <View key={i} style={[styles.tr, { borderBottomColor: theme.border, backgroundColor: adv ? 'rgba(99,102,241,0.04)' : undefined }]}>
                  <ThemedText themeColor="textSecondary" style={[styles.td, styles.cDate]}>
                    {new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}{adv ? ' ADV' : ''}
                  </ThemedText>
                  <ThemedText style={[styles.td, styles.cAmt, styles.semi]}>₹{Number(p.amount).toFixed(0)}</ThemedText>
                  <View style={styles.cDesc}>
                    <ThemedText themeColor="textSecondary" style={styles.td}>{paymentLabel(p.paymentMode)}</ThemedText>
                    {p.notes ? <ThemedText themeColor="textMuted" style={styles.tiny}>{p.notes}</ThemedText> : null}
                  </View>
                  <ThemedText themeColor="textMuted" style={[styles.td, styles.cBy]}>{p.confirmedBy?.name || (adv ? 'Advance' : '—')}</ThemedText>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {showPay && canRecordPayment ? (
        <View style={[styles.collect, { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.3)' }]}>
          <ThemedText style={[styles.strong, { color: '#15803d' }]}>Collect Payment</ThemedText>
          <ThemedText style={[styles.small, { color: '#b45309' }]}>Outstanding: <ThemedText style={[styles.small, styles.semi, { color: '#b45309' }]}>₹{outstanding.toFixed(0)}</ThemedText></ThemedText>
          <Input label="Amount (₹)" value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder="Enter amount" />
          <View>
            <ThemedText themeColor="textSecondary" style={styles.label}>Payment Method</ThemedText>
            <View style={styles.methods}>
              {[{ val: 'CASH', label: 'Cash' }, { val: 'UPI', label: 'UPI' }, { val: 'CARD', label: 'Card' }].map(({ val, label }) => (
                <Button key={val} size="sm" variant={payMethod === val ? 'primary' : 'outline'} onPress={() => setPayMethod(val)} style={payMethod === val ? { backgroundColor: '#15803d' } : undefined}>{label}</Button>
              ))}
            </View>
          </View>
          <View style={styles.methods}>
            <Button size="sm" loading={busy} style={{ backgroundColor: '#15803d' }} onPress={() => {
              const amt = parseFloat(payAmount);
              if (!amt || amt <= 0) return;
              onRecordPayment(amt, payMethod);
              setShowPay(false);
            }}>✓ Collect Payment</Button>
            <Button size="sm" variant="outline" onPress={() => setShowPay(false)}>Cancel</Button>
          </View>
        </View>
      ) : null}

      <View style={[styles.actions, { borderTopColor: theme.border }]}>
        <Button size="sm" variant="outline" icon="print-outline" onPress={print} disabled={busy}>Print</Button>
        {canRecordPayment && inv.status !== 'PAID' && inv.status !== 'CANCELLED' && !showPay ? (
          <Button size="sm" variant="outline" onPress={() => setShowPay(true)} disabled={busy}>{inv.status === 'PARTIAL' ? '+ Record Payment' : '✓ Collect Payment'}</Button>
        ) : null}
        {isAdmin ? <Button size="sm" variant="outline" icon="cube-outline" onPress={onWaybill} disabled={busy}>Waybill</Button> : null}
        {inv.customerEmail ? <Button size="sm" variant="outline" icon="mail-outline" onPress={onEmail} disabled={busy}>{inv.emailSent ? 'Email (Sent)' : 'Email'}</Button> : null}
        {inv.customerPhone ? <Button size="sm" variant="outline" onPress={onWhatsApp} disabled={busy}>{inv.whatsappSent ? 'WhatsApp (Sent)' : 'WhatsApp'}</Button> : null}
        {isAdmin ? <Button size="sm" variant="outline" icon="create-outline" onPress={onEdit} disabled={busy}>Edit</Button> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  two: { gap: 16 },
  twoWide: { flexDirection: 'row' },
  eyebrow: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  strong: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  tiny: { fontSize: 10, lineHeight: 14 },
  semi: { fontFamily: FontWeights.semiBold },
  table: { borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  th: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  td: { fontSize: 12, lineHeight: 16 },
  cDesc: { flex: 1, minWidth: 0 },
  cQty: { width: 34, textAlign: 'right' },
  cPrice: { width: 76, textAlign: 'right' },
  cAmt: { width: 76, textAlign: 'right' },
  cDate: { width: 76 },
  cBy: { width: 70 },
  payBlock: { borderTopWidth: 1, paddingTop: 4, marginTop: 4 },
  collect: { borderWidth: 1, borderRadius: Radii.md, padding: 16, gap: 12 },
  label: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium, marginBottom: 4 },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, paddingTop: 12 },
});
