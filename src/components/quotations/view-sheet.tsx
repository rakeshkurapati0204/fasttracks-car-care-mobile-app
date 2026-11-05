import { StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontWeights, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { QuotationFull } from '@/types/api';

import { dmy, fmt } from './helpers';
import { Panel, StatusPill, TotalRow } from './parts';

// Dashboard QuotationViewModal: number + status, customer / phone / vehicle / valid-until, line table
// (Description / Qty / Unit Price / Amount), subtotal / CGST / SGST / grand total, and the buttons:
// Edit, Print, Cancel (admin, not already rejected), Delete (admin), Close.
export function QuotationViewSheet({ quotation: q, isAdmin, busy, error, wide, onClose, onEdit, onPrint, onCancel, onDelete }: {
  quotation: QuotationFull; isAdmin: boolean; busy: boolean; error: string; wide: boolean;
  onClose: () => void; onEdit: () => void; onPrint: () => void; onCancel: () => void; onDelete: () => void;
}) {
  const theme = useTheme();
  const vehicle = `${[q.vehicleBrand, q.vehicleModel].filter(Boolean).join(' ') || '—'}${q.vehicleNumber ? ` (${q.vehicleNumber})` : ''}`;
  const info: [string, string, boolean?][] = [
    ['Customer', q.customerName, true],
    ['Phone', q.customerPhone || '—'],
    ['Vehicle', vehicle],
    ['Valid Until', q.validUntil ? dmy(q.validUntil) : '—'],
  ];

  return (
    <Sheet visible fullHeight onClose={onClose} locked={busy} title={q.quotationNumber} footer={
      <View style={styles.flex1}><Button variant="outline" onPress={onClose} disabled={busy} fullWidth>Close</Button></View>
    }>
      <StatusPill status={q.status} />

      <View style={styles.grid}>
        {info.map(([label, value, strong]) => (
          <View key={label} style={[styles.cell, wide ? styles.cellWide : styles.cellFull]}>
            <ThemedText style={styles.infoText}>
              <ThemedText themeColor="textMuted" style={styles.infoText}>{label}: </ThemedText>
              <ThemedText style={[styles.infoText, strong && styles.bold]}>{value}</ThemedText>
            </ThemedText>
          </View>
        ))}
      </View>

      <View>
        <View style={[styles.tr, { borderBottomColor: theme.border }]}>
          <ThemedText themeColor="textMuted" style={[styles.th, styles.cDesc]}>Description</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.th, styles.cQty]}>Qty</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.th, styles.cPrice]}>Unit Price</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.th, styles.cAmt]}>Amount</ThemedText>
        </View>
        {(q.lineItems || []).map((li, idx) => (
          <View key={idx} style={[styles.tr, { borderBottomColor: theme.border }]}>
            <ThemedText style={[styles.td, styles.cDesc, styles.left]}>{li.description}</ThemedText>
            <ThemedText style={[styles.td, styles.cQty]}>{li.quantity}</ThemedText>
            <ThemedText style={[styles.td, styles.cPrice]}>₹{fmt(li.unitPrice)}</ThemedText>
            <ThemedText style={[styles.td, styles.cAmt]}>₹{fmt(li.amount)}</ThemedText>
          </View>
        ))}
      </View>

      <Panel>
        <TotalRow label="Subtotal" value={`₹${fmt(q.subtotal)}`} />
        <TotalRow label="CGST" value={`₹${fmt(q.cgstAmount)}`} />
        <TotalRow label="SGST" value={`₹${fmt(q.sgstAmount)}`} />
        <TotalRow label="Grand Total" value={`₹${fmt(q.grandTotal)}`} bold top />
      </Panel>

      {error ? <ThemedText themeColor="danger" style={styles.err}>{error}</ThemedText> : null}

      <View style={styles.actions}>
        <Button variant="outline" size="sm" icon="create-outline" onPress={onEdit} disabled={busy}>Edit</Button>
        <Button variant="outline" size="sm" icon="print-outline" onPress={onPrint} disabled={busy}>Print</Button>
        {isAdmin && q.status !== 'REJECTED' ? <Button variant="ghost" size="sm" onPress={onCancel} disabled={busy}>Cancel</Button> : null}
        {isAdmin ? <Button variant="ghost" size="sm" icon="trash-outline" onPress={onDelete} disabled={busy}>Delete</Button> : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  bold: { fontFamily: FontWeights.bold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  cell: { paddingRight: 8 },
  cellFull: { width: '100%' },
  cellWide: { width: '50%' },
  infoText: { fontSize: 14, lineHeight: 20 },
  tr: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderBottomWidth: 1 },
  th: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  td: { fontSize: 13, lineHeight: 18 },
  left: { textAlign: 'left' },
  cDesc: { flex: 1, minWidth: 0, textAlign: 'left' },
  cQty: { width: 36, textAlign: 'right', fontFamily: Fonts?.mono },
  cPrice: { width: 84, textAlign: 'right', fontFamily: Fonts?.mono },
  cAmt: { width: 88, textAlign: 'right', fontFamily: Fonts?.mono },
  err: { fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
