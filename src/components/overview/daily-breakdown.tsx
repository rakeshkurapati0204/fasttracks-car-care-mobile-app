import { StyleSheet, View } from 'react-native';

import { OverviewStat, StatGrid, StatusBadge } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Card, ListRow } from '@/components/ui';
import { FontWeights, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatINR, JOB_STATUS_LABELS } from '@/lib/overview-format';
import type { DailyReport } from '@/types/api';

const INDIGO = '#6366f1';

// Dashboard DailyBreakdown (GET /reports/daily). Rows are not tappable: the
// dashboard links them to filtered invoice/customer pages the app screens
// don't take filters for.
export function DailyBreakdown({ data }: { data: DailyReport }) {
  const theme = useTheme();
  const invoices = data.invoices.list;

  return (
    <View style={styles.wrap}>
      <StatGrid>
        <OverviewStat compact label="Revenue Collected" value={formatINR(data.revenue.collected)} color={theme.success} sub="payments received (paidAt)" />
        <OverviewStat compact label="Invoiced" value={formatINR(data.revenue.invoiced)} sub="new invoices total" />
        <OverviewStat compact label="Invoice Count" value={data.revenue.invoiceCount} sub="invoices created" />
        <OverviewStat compact label="Job Cards" value={data.jobs.total} color={INDIGO} sub="new jobs that day" />
      </StatGrid>

      {data.jobs.total > 0 && (
        <Card padding="none" style={styles.statusCard} title="Jobs by Status" titleVariant="label" headerStyle={styles.statusTitle}>
          <View style={styles.statusWrap}>
            {Object.entries(data.jobs.byStatus).map(([st, cnt]) => {
              const s = JOB_STATUS_LABELS[st] ?? { label: st, color: '#6b7280' };
              return (
                <View key={st} style={styles.statusItem}>
                  <View style={[styles.dot, { backgroundColor: s.color }]} />
                  <ThemedText style={styles.statusCount}>{cnt}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.statusLabel}>{s.label}</ThemedText>
                </View>
              );
            })}
          </View>
          <ThemedText themeColor="textMuted" style={styles.statusLabel}>
            🆕 {data.customers.new} new · 🔄 {data.customers.returning} returning
          </ThemedText>
        </Card>
      )}

      {data.employees.length > 0 && (
        <Card divided title="Employee Breakdown">
          {data.employees.map((emp, i) => (
            <ListRow
              key={emp.name}
              title={`${emp.name}${emp.employeeId ? ` (${emp.employeeId})` : ''}`}
              subtitle={`${emp.jobs} jobs · ${formatINR(emp.invoicedTotal)} invoiced`}
              right={<ThemedText style={[styles.collected, { color: theme.success }]}>{formatINR(emp.collectedTotal)}</ThemedText>}
              rightSubtitle="collected"
              divider={i < data.employees.length - 1}
            />
          ))}
        </Card>
      )}

      {invoices.length > 0 && (
        <Card divided title="Invoices That Day">
          {invoices.slice(0, 10).map((inv, i, arr) => (
            <ListRow
              key={inv.id}
              title={inv.customerName}
              titleAccessory={<StatusBadge status={inv.status} />}
              subtitle={`${inv.invoiceNumber}${inv.vehicleNumber ? ` · ${inv.vehicleNumber}` : ''}${inv.createdBy ? ` · By ${inv.createdBy}` : ''}`}
              right={formatINR(inv.grandTotal)}
              rightSubtitle={inv.balanceDue > 0 ? `Due ${formatINR(inv.balanceDue)}` : undefined}
              rightSubtitleColor="danger"
              divider={i < arr.length - 1}
            />
          ))}
          {invoices.length > 10 && (
            <ThemedText themeColor="textMuted" style={styles.more}>
              +{invoices.length - 10} more — open Invoices for the full list
            </ThemedText>
          )}
        </Card>
      )}

      {data.jobs.total === 0 && data.invoices.count === 0 && (
        <ThemedText type="small" themeColor="textMuted" style={styles.empty}>No jobs or invoices found for this date.</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  // Dashboard: padding 14px 18px.
  statusCard: { paddingVertical: 14, paddingHorizontal: 18 },
  statusTitle: { marginBottom: 12 },
  statusWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: Spacing.two },
  statusItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusCount: { fontSize: 14, fontFamily: FontWeights.semiBold },
  statusLabel: { fontSize: 12, lineHeight: 18 },
  collected: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  more: { textAlign: 'center', fontSize: 12, paddingVertical: Spacing.two },
  empty: { textAlign: 'center', paddingVertical: Spacing.five },
});
