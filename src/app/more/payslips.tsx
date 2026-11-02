import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmployeePickerSheet, MONTH_NAMES, PayslipSheet } from '@/components/payslips/payslip-sheets';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchEmployees } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { EmployeeListItem } from '@/types/api';

const WIDE_MIN = 560;

// PAYSLIP_ADMIN_ROLES (backend payslips.ts): SALARY_ADMIN_ROLES plus HR.
const PAYSLIP_ROLES = ['OWNER', 'STORE_MANAGER', 'CASHIER', 'HR'];

export default function PayslipsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canAccess = PAYSLIP_ROLES.includes(user?.role ?? '');

  const now = new Date();
  const [width, setWidth] = useState(0);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<EmployeeListItem | null>(null);
  const [monthYear, setMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const wide = width >= WIDE_MIN;

  const load = useCallback(async () => {
    try {
      const list = await fetchEmployees();
      setEmployees(list.filter((e) => e.isActive));
    } catch {
      /* the picker just stays empty */
    }
  }, [setEmployees]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    if (canAccess) load();
  }, [canAccess, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shift = (delta: number) =>
    setMonthYear((p) => {
      const m = p.month + delta;
      if (m < 1) return { month: 12, year: p.year - 1 };
      if (m > 12) return { month: 1, year: p.year + 1 };
      return { month: m, year: p.year };
    });

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Payslips' }} />
      {!canAccess ? (
        <View style={[styles.page, { padding: wide ? 24 : 16 }]}>
          <Card style={styles.centerCard}>
            <ThemedText style={styles.emptyText}>You don&apos;t have access to Payslips.</ThemedText>
          </Card>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <ThemedText style={styles.h1}>Payslips</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.subtitle}>
              Pick an employee and month to generate a printable payslip pre-filled from payroll data.
            </ThemedText>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View>
              <ThemedText themeColor="textMuted" style={styles.label}>Employee</ThemedText>
              <Pressable
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                style={[styles.field, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText numberOfLines={1} style={[styles.fieldText, { color: selected ? theme.text : theme.textMuted }]}>
                  {selected ? `${selected.name} — ${selected.role?.replace(/_/g, ' ')}` : 'Select an employee…'}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={theme.textMuted} />
              </Pressable>
            </View>

            <View style={styles.monthRow}>
              <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Previous month" style={[styles.step, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText style={styles.stepText}>‹</ThemedText>
              </Pressable>
              <ThemedText style={styles.month}>{`${MONTH_NAMES[monthYear.month - 1]} ${monthYear.year}`}</ThemedText>
              <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Next month" style={[styles.step, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText style={styles.stepText}>›</ThemedText>
              </Pressable>
            </View>

            <Button onPress={() => setDialogOpen(true)} disabled={!selected} fullWidth>Generate Payslip</Button>
          </View>
        </ScrollView>
      )}

      {pickerOpen ? (
        <EmployeePickerSheet candidates={employees} onClose={() => setPickerOpen(false)} onSelect={(e) => { setSelected(e); setPickerOpen(false); }} />
      ) : null}
      {dialogOpen && selected ? (
        <PayslipSheet employee={selected} month={monthYear.month} year={monthYear.year} onClose={() => setDialogOpen(false)} />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 768, alignSelf: 'center', gap: 24 },
  head: { gap: 2 },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 16, gap: 16 },
  label: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
  field: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8 },
  fieldText: { flex: 1, fontSize: 14, lineHeight: 20 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  step: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8 },
  stepText: { fontSize: 18, lineHeight: 22 },
  month: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  centerCard: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
