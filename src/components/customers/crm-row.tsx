import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { InvStatusBadge } from '@/components/customers/badges';
import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fmtDate, fmtINR, SOURCE_LABELS } from '@/lib/customers-format';
import type { CrmCustomerRow } from '@/types/api';

type Props = {
  customer: CrmCustomerRow;
  wide: boolean;
  onView: (customer: CrmCustomerRow) => void;
  /** Owner only. */
  onDelete?: (customer: CrmCustomerRow) => void;
};

// Column widths of the wide table; the header in the screen uses the same.
export const CRM_COLUMNS = { phone: 120, vehicles: 170, lastVisit: 110, status: 100, total: 80 } as const;

// Dashboard CRMRow: phone shows the compact two-line row, wide the table row.
function CrmRowBase({ customer, wide, onView, onDelete }: Props) {
  const theme = useTheme();
  const latest = customer.crmInvoices[0];
  const vehicles = customer.vehicles.filter((v) => v.isActive);
  const lastVisit = latest?.createdAt ?? null;
  const vehicleLabel = (v: (typeof vehicles)[number]) => [v.make, v.model].filter(Boolean).join(' ');
  const first = vehicles[0];

  return (
    <Pressable
      onPress={() => onView(customer)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${customer.name}`}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <View style={styles.flex1}>
        <View style={styles.nameRow}>
          <ThemedText style={styles.name}>{customer.name}</ThemedText>
          {customer.isRegular ? (
            <Badge size="sm" variant="success">Regular</Badge>
          ) : customer.source ? (
            <Badge size="sm" variant="secondary">{SOURCE_LABELS[customer.source] ?? customer.source}</Badge>
          ) : null}
        </View>
        {!wide && (
          <ThemedText themeColor="textMuted" style={styles.small}>
            {customer.phone}
            {first ? ` · ${first.vehicleNumber}${vehicleLabel(first) ? ' ' + vehicleLabel(first) : ''}` : ''}
            {lastVisit ? ` · Last visit: ${fmtDate(lastVisit)}` : ''}
          </ThemedText>
        )}
      </View>

      {wide && (
        <>
          <ThemedText themeColor="textMuted" style={[styles.cell, { width: CRM_COLUMNS.phone }]}>{customer.phone}</ThemedText>
          <View style={[styles.vehicles, { width: CRM_COLUMNS.vehicles }]}>
            {vehicles.slice(0, 2).map((v) => (
              <View key={v.id} style={[styles.vehicle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <ThemedText style={styles.vehicleNumber}>{v.vehicleNumber}</ThemedText>
                {vehicleLabel(v) ? <ThemedText themeColor="textMuted" style={styles.vehicleModel}>{vehicleLabel(v)}</ThemedText> : null}
              </View>
            ))}
            {vehicles.length > 2 ? <ThemedText themeColor="textMuted" style={styles.small}>+{vehicles.length - 2}</ThemedText> : null}
            {vehicles.length === 0 ? <ThemedText themeColor="textMuted" style={styles.cell}>—</ThemedText> : null}
          </View>
          <ThemedText themeColor="textMuted" style={[styles.small, { width: CRM_COLUMNS.lastVisit }]}>{lastVisit ? `Last visit: ${fmtDate(lastVisit)}` : '—'}</ThemedText>
          <View style={{ width: CRM_COLUMNS.status }}>
            {latest ? <InvStatusBadge status={latest.status} /> : <Badge size="sm" variant="secondary">No Invoice</Badge>}
          </View>
          <ThemedText style={[styles.total, { width: CRM_COLUMNS.total }]}>{fmtINR(customer.totalSpent ?? 0)}</ThemedText>
        </>
      )}

      {!wide && latest ? <InvStatusBadge status={latest.status} /> : null}

      {onDelete ? (
        <Pressable onPress={() => onDelete(customer)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${customer.name}`} style={({ pressed }) => [styles.delete, pressed && { opacity: 0.6 }]}>
          <Ionicons name="trash-outline" size={18} color={theme.danger} />
        </Pressable>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={styles.arrow} />
    </Pressable>
  );
}

// Memoised: the list passes stable callbacks.
export const CrmRow = memo(CrmRowBase);

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  small: { fontSize: 12, lineHeight: 18 },
  cell: { fontSize: 14, lineHeight: 20 },
  vehicles: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'flex-start' },
  vehicle: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.sm, borderWidth: 1 },
  vehicleNumber: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  vehicleModel: { fontSize: 10, lineHeight: 12 },
  total: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, textAlign: 'right' },
  delete: { padding: 6 },
  arrow: { opacity: 0.5 },
});
