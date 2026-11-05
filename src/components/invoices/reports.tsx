import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { shareCsv } from '@/components/purchase/helpers';
import { Panel } from '@/components/quotations/parts';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchInvoiceReport } from '@/lib/api';
import { toYmd } from '@/lib/overview-format';
import type { InvoiceReport } from '@/types/api';

import { STATUS_META, fmtDate, fmtINR, paymentLabel } from './helpers';

// Dashboard Reports tab: period pills (daily … custom), reference date or from / to, Generate Report,
// four summary cards, Export CSV (same file name and columns as the server's CSV) and the invoice list.
type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-annual' | 'custom';
const PERIODS: Period[] = ['daily', 'weekly', 'monthly', 'quarterly', 'half-annual', 'custom'];
const periodLabel = (p: Period) => (p === 'half-annual' ? 'Half-Annual' : p.charAt(0).toUpperCase() + p.slice(1));

export function InvoiceReports({ wide, onError }: { wide: boolean; onError: (msg: string) => void }) {
  const theme = useTheme();
  const [period, setPeriod] = useState<Period>('monthly');
  const [date, setDate] = useState(() => toYmd(new Date()));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<InvoiceReport | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true); setData(null);
    try {
      const params: Record<string, string> = { period };
      if (period === 'custom') { params.from = from; params.to = to; } else params.date = date;
      setData(await fetchInvoiceReport(params));
    } catch { onError('Failed to generate report.'); }
    finally { setLoading(false); }
  };

  const exportCsv = async () => {
    if (!data) return;
    const headers = ['Invoice Number', 'Status', 'Customer Name', 'Customer Phone', 'Customer Email', 'Vehicle Number', 'Vehicle Brand', 'Vehicle Model', 'Subtotal', 'CGST', 'SGST', 'Grand Total', 'Paid Amount', 'Balance Due', 'Payment Mode', 'Created At'];
    const rows = data.invoices.map((i) => [i.invoiceNumber, i.status, i.customerName ?? '', i.customerPhone ?? '', i.customerEmail ?? '', i.vehicleNumber ?? '', i.vehicleBrand ?? '', i.vehicleModel ?? '', String(i.subtotal ?? 0), String(i.cgst ?? 0), String(i.sgst ?? 0), String(i.grandTotal ?? 0), String(i.paidAmount ?? 0), String(i.balanceDue ?? 0), i.paymentMode ?? '', i.createdAt ?? '']);
    try { await shareCsv(`invoice-report-${period}.csv`, [headers, ...rows]); } catch { onError('Could not export the report.'); }
  };

  const cards = data ? [
    { label: 'Total Invoices', value: String(data.totalInvoices) },
    { label: 'Total Billed', value: fmtINR(data.totalBilled) },
    { label: 'Total Collected', value: fmtINR(data.totalCollected) },
    { label: 'Total Outstanding', value: fmtINR(data.totalOutstanding) },
  ] : [];

  return (
    <View style={styles.gap}>
      <Panel>
        <View style={styles.gap}>
          <ThemedText style={styles.h}>Report Period</ThemedText>
          <View style={styles.pills}>
            {PERIODS.map((p) => (
              <Pressable key={p} onPress={() => setPeriod(p)} accessibilityRole="button" style={[styles.pill, { backgroundColor: period === p ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText style={[styles.pillText, { color: period === p ? '#fff' : theme.textMuted }]}>{periodLabel(p)}</ThemedText>
              </Pressable>
            ))}
          </View>
          <View style={[styles.dates, wide && styles.datesWide]}>
            {period === 'custom' ? (
              <>
                <View style={styles.flex1}><DateField label="From" value={from} onChange={setFrom} /></View>
                <View style={styles.flex1}><DateField label="To" value={to} onChange={setTo} /></View>
              </>
            ) : (
              <View style={styles.flex1}><DateField label={period === 'daily' ? 'Date' : 'Reference Date'} value={date} onChange={setDate} /></View>
            )}
            <Button onPress={generate} loading={loading}>{loading ? 'Generating…' : 'Generate Report'}</Button>
          </View>
        </View>
      </Panel>

      {data && !loading ? (
        <View style={styles.gap}>
          <View style={styles.cards}>
            {cards.map((c) => (
              <View key={c.label} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.cardWide]}>
                <ThemedText themeColor="textMuted" style={styles.small}>{c.label}</ThemedText>
                <ThemedText style={styles.cardValue}>{c.value}</ThemedText>
              </View>
            ))}
          </View>
          <View style={styles.row}>
            <Button variant="outline" onPress={exportCsv} style={{ borderColor: 'rgba(34,197,94,0.3)' }}>Export CSV</Button>
          </View>
          <View style={[styles.box, { borderColor: theme.border }]}>
            <View style={[styles.boxHead, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
              <ThemedText style={styles.h}>Invoices ({data.invoices.length})</ThemedText>
            </View>
            {data.invoices.map((inv) => {
              const st = STATUS_META[inv.status] ?? STATUS_META.DRAFT;
              return (
                <View key={inv.id} style={[styles.invRow, { borderBottomColor: theme.border }]}>
                  <View style={styles.flex1}>
                    <ThemedText style={[styles.num, { color: theme.primary }]}>{inv.invoiceNumber}</ThemedText>
                    <ThemedText style={styles.p}>{inv.customerName || '—'}</ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.small}>{fmtDate(inv.createdAt)} · {inv.vehicleNumber || '—'} · {inv.paymentMode === 'SPLIT' ? `Split (${Array.isArray(inv.splitPayments) ? inv.splitPayments.length : '—'})` : paymentLabel(inv.paymentMode)}</ThemedText>
                  </View>
                  <View style={styles.right}>
                    <ThemedText style={[styles.small, styles.semi]}>{fmtINR(inv.grandTotal)}</ThemedText>
                    <View style={[styles.badge, { backgroundColor: st.bg }]}><ThemedText style={[styles.badgeText, { color: st.color }]}>{st.label}</ThemedText></View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 16 },
  row: { flexDirection: 'row', gap: 8 },
  h: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.sm, borderWidth: 1 },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  dates: { gap: 12 },
  datesWide: { flexDirection: 'row', alignItems: 'flex-end' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: Radii.lg, padding: 16, gap: 4 },
  cardWide: { flexBasis: '22%' },
  cardValue: { fontSize: 18, lineHeight: 26, fontFamily: FontWeights.bold },
  small: { fontSize: 12, lineHeight: 16 },
  p: { fontSize: 14, lineHeight: 20 },
  semi: { fontFamily: FontWeights.semiBold },
  box: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  boxHead: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  invRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  num: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  right: { alignItems: 'flex-end', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold },
});
