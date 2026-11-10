import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmployeeConfigureTab } from '@/components/employees/employee-configure-tab';
import { EmployeePardonTab } from '@/components/employees/employee-pardon-tab';
import { EmployeeScansTab } from '@/components/employees/employee-scans-tab';
import { EmployeeTasksTab } from '@/components/employees/employee-tasks-tab';
import { EmployeeTimesheetTab } from '@/components/employees/employee-timesheet-tab';
import { EmployeeOverviewTab, type OverviewStats } from '@/components/employees/employee-overview-tab';
import { getAvatarColor, getInitials } from '@/components/employees/employee-format';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchEmployeeAnalytics, fetchEmployeePayroll, fetchEmployeePerformanceChart, fetchEmployeePunches } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useContentWidth } from '@/lib/drawer-context';
import type { EmployeeCardItem, EmployeePerformancePoint, EmployeePunch, PayrollResult } from '@/types/api';

type TabKey = 'overview' | 'pardon' | 'scans' | 'tasks' | 'timesheet' | 'configure';

type Props = {
  employee: EmployeeCardItem;
  /** OWNER, or a STORE_MANAGER looking at someone who is neither OWNER nor STORE_MANAGER. */
  canEdit: boolean;
  initialTab?: string;
  onClose: () => void;
};

// Same visibility as the dashboard's panel: Documents buttons for these roles only.
const DOCUMENT_ROLES = ['OWNER', 'HR', 'STORE_MANAGER', 'ACCOUNTING'];

// Dashboard EmployeeDetailPanel: header, tab bar and (this pass) the Overview tab.
// Phone: full screen. Wide: a right-hand panel with the screen dimmed behind it.
export function EmployeeDetailPanel({ employee, canEdit, initialTab, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user: viewer } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const wide = useContentWidth() >= 560;
  const canSeeDocuments = DOCUMENT_ROLES.includes(viewer?.role ?? '');

  const [tab, setTab] = useState<TabKey>(initialTab === 'timesheet' && canEdit ? 'timesheet' : 'overview');

  // ── Overview data (the same four calls, each allowed to fail on its own) ──
  const [now] = useState(() => new Date());
  const todayDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [performance, setPerformance] = useState<EmployeePerformancePoint[]>([]);
  const [payroll, setPayroll] = useState<PayrollResult | null>(null);
  const [punches, setPunches] = useState<EmployeePunch[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes, prRes, punRes] = await Promise.allSettled([
        fetchEmployeeAnalytics(employee.id),
        fetchEmployeePerformanceChart(employee.id),
        fetchEmployeePayroll(employee.id, now.getMonth() + 1, now.getFullYear()),
        fetchEmployeePunches(employee.id, todayDate),
      ]);
      if (sRes.status === 'fulfilled') {
        const raw = sRes.value;
        // The API's nested shape, flattened like the dashboard does.
        setStats({
          totalJobs: raw?.jobs?.thisMonth ?? 0,
          totalRevenue: raw?.financial?.revenueGenerated ?? 0,
          conversionRate: raw?.performance?.conversionRate ?? 0,
          avgDealSize: raw?.financial?.averageDealSize ?? 0,
          walkOutRate: raw?.performance?.walkOutRate ?? 0,
          topService: raw?.performance?.mostCommonService ?? 'N/A',
          attendance: {
            present: raw?.attendance?.present ?? 0,
            late: raw?.attendance?.late ?? 0,
            absent: raw?.attendance?.absent ?? 0,
            halfDay: raw?.attendance?.halfDay ?? 0,
          },
        });
      }
      if (pRes.status === 'fulfilled') setPerformance(pRes.value);
      if (prRes.status === 'fulfilled') setPayroll(prRes.value ?? null);
      if (punRes.status === 'fulfilled') setPunches(punRes.value);
    } finally {
      setLoading(false);
    }
  }, [employee.id, now, todayDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open
    loadOverview();
  }, [loadOverview]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'pardon', label: 'Pardon' },
    { key: 'scans', label: 'Scans' },
    ...(canEdit ? [{ key: 'tasks' as const, label: 'Tasks' }, { key: 'timesheet' as const, label: 'Timesheet' }, { key: 'configure' as const, label: 'Configure' }] : []),
  ];

  const panelWidth = wide ? Math.min(480, windowWidth) : windowWidth;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        {wide ? <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" /> : null}
        <View
          style={[
            styles.panel,
            { width: panelWidth, backgroundColor: theme.backgroundElement, borderLeftColor: theme.border, paddingTop: insets.top, paddingBottom: insets.bottom },
          ]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <View style={styles.who}>
              <View style={[styles.avatar, { backgroundColor: getAvatarColor(employee.name) }]}>
                <ThemedText style={styles.avatarText}>{getInitials(employee.name)}</ThemedText>
              </View>
              <View style={styles.flex1}>
                <ThemedText style={styles.name} numberOfLines={1}>{employee.name}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.sub} numberOfLines={1}>@{employee.username} · {employee.role.replace(/_/g, ' ')}</ThemedText>
              </View>
            </View>
            <View style={styles.headerActions}>
              {canSeeDocuments ? (
                <>
                  <Button size="sm" variant="secondary" onPress={() => { onClose(); router.push('/more/onboarding' as never); }}>Employee Details</Button>
                  <Button size="sm" variant="secondary" onPress={() => { onClose(); router.push('/more/employee-documents' as never); }}>Documents</Button>
                </>
              ) : null}
              <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}>
                <Ionicons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>
          </View>

          {/* Tab bar */}
          <View style={styles.tabsWrap}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabs, { backgroundColor: theme.surface }]} style={[styles.tabsScroll, { backgroundColor: theme.surface }]}>
              {tabs.map((t) => {
                const active = tab === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [styles.tab, active && { backgroundColor: theme.primary }, pressed && !active && { opacity: 0.6 }]}>
                    <ThemedText style={[styles.tabText, { color: active ? '#fff' : theme.textMuted }]}>{t.label}</ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Content — Pardon owns its scroll area so its "Pardon N Days" footer stays pinned below it. */}
          {tab === 'pardon' ? (
            <EmployeePardonTab employeeId={employee.id} now={now} onPardoned={loadOverview} bottomInset={0} />
          ) : (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {tab === 'overview' ? (
              <EmployeeOverviewTab
                employee={employee}
                canEdit={canEdit}
                loading={loading}
                stats={stats}
                performance={performance}
                payroll={payroll}
                punches={punches}
                todayDate={todayDate}
                now={now}
                onReload={loadOverview}
                wide={wide}
              />
            ) : tab === 'timesheet' && canEdit ? (
              <EmployeeTimesheetTab employeeId={employee.id} employeeName={employee.name} />
            ) : tab === 'scans' ? (
              <EmployeeScansTab employeeId={employee.id} now={now} />
            ) : tab === 'tasks' && canEdit ? (
              <EmployeeTasksTab employee={employee} canEdit={canEdit} />
            ) : tab === 'configure' && canEdit ? (
              <EmployeeConfigureTab employee={employee} now={now} canEdit={canEdit} onReload={loadOverview} />
            ) : null}
          </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)' },
  panel: { borderLeftWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  name: { fontSize: 16, lineHeight: 20, fontFamily: FontWeights.bold },
  sub: { fontSize: 12, lineHeight: 16 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tabsWrap: { paddingHorizontal: 20, paddingTop: 12 },
  tabsScroll: { borderRadius: Radii.md, flexGrow: 0 },
  tabs: { padding: 4, gap: 4, borderRadius: Radii.md },
  tab: { minHeight: 36, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm },
  tabText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  content: { padding: 20, paddingTop: 16 },
});
