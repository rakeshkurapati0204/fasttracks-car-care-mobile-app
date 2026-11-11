import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/overview/parts';
import { EmployeePayrollRow } from '@/components/payroll/employee-row';
import { formatINR, formatPaymentWindow, getPaymentWindow, MONTH_NAMES } from '@/components/payroll/helpers';
import { DisburseView } from '@/components/payroll/disburse-view';
import { EditSalarySheet, SetSalarySheet } from '@/components/payroll/salary-sheets';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCompanyPayroll, fetchPayrollExportDataUri, fetchSalaryPaymentsWithBreakdown, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import type { CompanyPayrollSummary, PayrollResult, SalaryPaymentWithBreakdown } from '@/types/api';

const WIDE_MIN = 560;

function StatCard({ label, value, color, big, outlined, wide, width }: {
  label: string; value: string; color: string; big?: boolean; outlined?: boolean; wide: boolean; width?: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.stat,
        { backgroundColor: theme.surface, borderColor: outlined ? theme.primary : theme.border, borderWidth: outlined ? 2 : 1 },
        wide ? styles.flex1 : { width },
      ]}>
      <ThemedText style={[styles.statLabel, { color: outlined ? theme.primary : theme.textMuted }, outlined && styles.semi]}>{label}</ThemedText>
      <ThemedText style={[styles.mono, big ? styles.statBig : styles.statNum, { color }]}>{value}</ThemedText>
    </View>
  );
}

export default function PayrollScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { hasTab } = usePermissions();

  // Dashboard rules. canAccess adds the per-employee `payroll` tab permission;
  // canPay is wider than canEditSalary (which matches the backend's
  // SALARY_ADMIN_ROLES: no ACCOUNTING). The backend returns only the caller's
  // own row to roles outside SALARY_ADMIN_ROLES.
  const role = user?.role ?? '';
  const canAccess = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'].includes(role) || hasTab('payroll');
  const canPay = ['OWNER', 'CASHIER', 'ACCOUNTING', 'STORE_MANAGER'].includes(role);
  const canEditSalary = ['OWNER', 'STORE_MANAGER', 'CASHIER'].includes(role);

  const now = new Date();
  const [width, setWidth] = useState(0);
  const [monthYear, setMonthYear] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [summary, setSummary] = useState<CompanyPayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [payments, setPayments] = useState<Record<string, SalaryPaymentWithBreakdown>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [activeView, setActiveView] = useState<'payroll' | 'disburse'>('payroll');
  const [setSalaryEmp, setSetSalaryEmp] = useState<PayrollResult | null>(null);
  const [editSalaryEmp, setEditSalaryEmp] = useState<PayrollResult | null>(null);

  const wide = width >= WIDE_MIN;
  const { month, year } = monthYear;

  const fetchPayments = useCallback(async () => {
    if (!canPay) return;
    try {
      const rows = await fetchSalaryPaymentsWithBreakdown(month, year);
      setPayments(Object.fromEntries(rows.map((p) => [p.userId, p])));
    } catch {
      /* the Paid status simply doesn't show */
    }
  }, [canPay, month, year]);

  const fetchPayroll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSummary(await fetchCompanyPayroll(month, year));
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Couldn't load payroll data. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change
    if (canAccess) { fetchPayroll(); fetchPayments(); }
  }, [canAccess, fetchPayroll, fetchPayments]);

  const onRefresh = async () => {
    setRefreshing(true);
    setReloadKey((k) => k + 1);
    await Promise.all([fetchPayroll(), fetchPayments()]);
    setRefreshing(false);
  };

  const shift = (delta: number) =>
    setMonthYear((p) => {
      const m = p.month + delta;
      if (m < 1) return { month: 12, year: p.year - 1 };
      if (m > 12) return { month: 1, year: p.year + 1 };
      return { month: m, year: p.year };
    });

  const handleExport = async () => {
    setExporting(true);
    try {
      await Linking.openURL(await fetchPayrollExportDataUri(month, year));
    } catch {
      setError('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Payroll' }} />
      {children}
    </ThemedView>
  );

  if (!canAccess) {
    return shell(
      <View style={[styles.page, { padding: wide ? 24 : 16 }]}>
        <Card style={styles.centerCard}>
          <ThemedText style={styles.emptyTitle}>You don&apos;t have access to Payroll.</ThemedText>
        </Card>
      </View>,
    );
  }

  const s = summary?.summary;
  const today = new Date();
  const { windowStart, windowEnd } = getPaymentWindow(month, year);
  const beforeWindow = today < windowStart;
  const afterWindow = today > windowEnd;
  const inWindow = !beforeWindow && !afterWindow;
  const windowTone = inWindow
    ? { bg: 'rgba(34,197,94,0.12)', fg: '#15803d' }
    : beforeWindow
      ? { bg: 'rgba(234,179,8,0.14)', fg: '#a16207' }
      : { bg: 'rgba(107,114,128,0.14)', fg: '#6b7280' };

  const employees = summary?.employees ?? [];
  const filtered = employees.filter((e) => (e.userName ?? '').toLowerCase().includes(search.toLowerCase()));

  const cardW = Math.max(120, (width - (wide ? 48 : 32) - 16) / 2);
  const statCards = s ? (
    <View style={styles.statRow}>
      <StatCard wide={wide} width={cardW} label="Total Gross Payroll" value={formatINR(s.totalPayroll + s.totalDeductions)} color={theme.primary} />
      <StatCard wide={wide} width={cardW} label="Total Deductions" value={formatINR(s.totalDeductions)} color={theme.danger} />
      <StatCard wide={wide} width={cardW} label="Employees" value={String(s.employeeCount)} color={theme.text} />
      <StatCard wide={wide} width={cardW} label="Avg Attendance" value={`${s.avgAttendance}%`} color={theme.success} />
      <StatCard wide={wide} width={cardW} label="Net Payable" value={formatINR(s.totalPayroll)} color={theme.primary} big outlined />
    </View>
  ) : null;

  const header = (
    <View style={styles.headerWrap}>
      <View style={[styles.headRow, wide && styles.headRowWide]}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Payroll</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>Salary calculation based on biometric attendance</ThemedText>
        </View>
        <View style={styles.headBtns}>
          <Button
            variant="outline"
            size="sm"
            icon="download-outline"
            loading={exporting}
            disabled={!summary || summary.employees.length === 0}
            onPress={handleExport}>
            Export Excel
          </Button>
          <Button size="sm" variant={activeView === 'disburse' ? 'primary' : 'outline'} icon="cash-outline" onPress={() => setActiveView(activeView === 'disburse' ? 'payroll' : 'disburse')}>Disburse Salaries</Button>
        </View>
      </View>

      {/* Month selector */}
      <Card padding="md">
        <View style={[styles.monthRow, !wide && styles.monthRowPhone]}>
          <View style={styles.monthTop}>
            <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Previous month" style={styles.navBtn}>
              <Ionicons name="chevron-back" size={16} color={theme.textSecondary} />
              {wide ? <ThemedText themeColor="textSecondary" style={styles.navText}>Previous</ThemedText> : null}
            </Pressable>
            <ThemedText style={styles.monthTitle}>{`${MONTH_NAMES[month - 1]} ${year}`}</ThemedText>
            {!wide ? (
              <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Next month" style={styles.navBtn}>
                <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.window, { backgroundColor: windowTone.bg }]}>
            <ThemedText style={[styles.windowText, { color: windowTone.fg }]}>
              {`Payment window: ${formatPaymentWindow(month, year)}`}
              {beforeWindow ? <ThemedText style={[styles.windowText, styles.semi, { color: windowTone.fg }]}>{' · Not yet open'}</ThemedText> : null}
              {afterWindow ? <ThemedText style={[styles.windowText, styles.semi, { color: windowTone.fg }]}>{' · Window passed'}</ThemedText> : null}
              {inWindow ? <ThemedText style={[styles.windowText, styles.semi, { color: windowTone.fg }]}>{' · Open now'}</ThemedText> : null}
            </ThemedText>
          </View>
          {wide ? (
            <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Next month" style={styles.navBtn}>
              <ThemedText themeColor="textSecondary" style={styles.navText}>Next</ThemedText>
              <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </Card>

      {loading ? (
        <View style={styles.statRow}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, gap: 8 }, wide ? styles.flex1 : { width: cardW }]}>
              <Skeleton width={80} height={12} />
              <Skeleton width={112} height={28} />
            </View>
          ))}
        </View>
      ) : statCards}

      {error ? <ErrorBanner message={error} onRetry={fetchPayroll} /> : null}

      {activeView === 'payroll' && !loading && summary && summary.employees.length > 0 ? (
        <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Ionicons name="search" size={16} color={theme.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search employee…"
            placeholderTextColor={theme.textMuted}
            style={[styles.searchInput, { color: theme.text }]}
          />
        </View>
      ) : null}
    </View>
  );

  const empty = activeView === 'disburse' ? (
    <DisburseView month={month} year={year} wide={wide} reloadKey={reloadKey} />
  ) : loading ? (
    <View style={styles.gap}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={72} />)}</View>
  ) : summary ? (
    <Card padding="lg" style={styles.centerCard}>
      <ThemedText themeColor="textMuted" style={styles.emptyTitle}>
        {search ? `No employee matching "${search}"` : 'No active employees found.'}
      </ThemedText>
    </Card>
  ) : null;

  return shell(
    <>
      <FlatList
        data={loading || activeView === 'disburse' ? [] : filtered}
        keyExtractor={(e, i) => e.userId ?? String(i)}
        renderItem={({ item }) => (
          <EmployeePayrollRow
            result={item}
            wide={wide}
            month={month}
            year={year}
            payment={item.userId ? (payments[item.userId] ?? null) : null}
            canPay={canPay}
            canEditSalary={canEditSalary}
            onPaymentChange={fetchPayments}
            onSetSalary={setSetSalaryEmp}
            onEditSalary={setEditSalaryEmp}
            onRefresh={fetchPayroll}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Sep}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      />
      {setSalaryEmp ? (
        <SetSalarySheet employee={setSalaryEmp} onClose={() => setSetSalaryEmp(null)} onSaved={() => { setSetSalaryEmp(null); fetchPayroll(); }} />
      ) : null}
      {editSalaryEmp ? (
        <EditSalarySheet employee={editSalaryEmp} onClose={() => setEditSalaryEmp(null)} onSaved={() => { setEditSalaryEmp(null); fetchPayroll(); }} />
      ) : null}
    </>,
  );
}

function Sep() {
  return <View style={{ height: 12 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  semi: { fontFamily: FontWeights.semiBold },
  mono: { fontFamily: Fonts?.mono, fontWeight: '700' },
  headerWrap: { gap: 24, marginBottom: 24 },
  headRow: { gap: 12 },
  headRowWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20 },
  headBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  monthRowPhone: { flexDirection: 'column', alignItems: 'stretch' },
  monthTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8 },
  navText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  monthTitle: { fontSize: 18, lineHeight: 28, fontFamily: FontWeights.bold, textAlign: 'center' },
  window: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, flexShrink: 1 },
  windowText: { fontSize: 13, lineHeight: 18 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  stat: { borderRadius: Radii.lg, padding: 16, justifyContent: 'center' },
  statLabel: { fontSize: 12, lineHeight: 16 },
  statNum: { fontSize: 20, lineHeight: 28, marginTop: 4 },
  statBig: { fontSize: 24, lineHeight: 32, marginTop: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 44, borderWidth: 1, borderRadius: Radii.lg },
  searchInput: { flex: 1, fontSize: 14, lineHeight: 20, paddingVertical: 8, fontFamily: FontWeights.regular },
  centerCard: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  gap: { gap: 12 },
});
