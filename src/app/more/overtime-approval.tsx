import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ActualHoursSheet, DashedButton, fmt, fmtDate, Toast } from '@/components/overtime/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { Fonts, FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { approveOvertime, fetchEmployees, fetchOvertimeRequests, getErrorMessage, rejectOvertime, setOvertimeActualHours } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import type { EmployeeListItem, PendingOvertimeRequest } from '@/types/api';

const WIDE_MIN = 560;

// Two gates, as on the dashboard. VIEW: OWNER / STORE_MANAGER or the per-employee
// `overtime_approval` tab permission. ACT (approve / reject / actual hours): the
// backend's requireManagerOrOwner list. Those lists differ in the dashboard
// itself, so both are kept as they are. The list endpoint also returns only
// the caller's own requests for roles other than OWNER / STORE_MANAGER.
const ACT_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'];

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Founder', STORE_MANAGER: 'Store Manager', SALES: 'Sales',
  TECHNICIAN: 'Technician', TECH_TEAM: 'Tech Team', SOCIAL_MEDIA: 'Social Media',
  STAFF: 'Staff', INVENTORY_MANAGER: 'Inventory Manager', ACCOUNTING: 'Accounting',
};

type TabKey = 'pending' | 'approved' | 'rejected';

function fmtTs(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function RejectSheet({
  userName, date, processing, onCancel, onConfirm,
}: { userName: string; date: string; processing: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet
      visible
      onClose={onCancel}
      locked={processing}
      title="Reject Overtime Request"
      footer={
        <>
          <Button variant="outline" onPress={onCancel} style={styles.flex1}>Cancel</Button>
          <Pressable
            onPress={() => onConfirm(reason)}
            disabled={processing}
            accessibilityRole="button"
            style={[styles.confirmReject, processing && { opacity: 0.7 }]}>
            <ThemedText style={styles.confirmRejectLabel}>{processing ? 'Rejecting…' : 'Confirm Reject'}</ThemedText>
          </Pressable>
        </>
      }>
      <ThemedText themeColor="textMuted" style={styles.body}>{`Rejecting ${userName}'s request for ${fmtDate(date)}.`}</ThemedText>
      <Input label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="Provide a reason for rejection..." multiline />
    </Sheet>
  );
}

export default function OvertimeApprovalScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { status: permStatus, hasTab } = usePermissions();
  const isManager = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER' || (permStatus === 'ready' && hasTab('overtime_approval'));
  const canAct = ACT_ROLES.includes(user?.role ?? '');

  const [width, setWidth] = useState(0);
  const [allRequests, setAllRequests] = useState<PendingOvertimeRequest[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('pending');
  const [filterUser, setFilterUser] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const [rejectModal, setRejectModal] = useState<{ id: string; userName: string; date: string } | null>(null);
  const [actualModal, setActualModal] = useState<{ id: string; date: string } | null>(null);
  const [actualLoading, setActualLoading] = useState(false);

  const wide = width >= WIDE_MIN;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [reqs, emps] = await Promise.all([fetchOvertimeRequests(), fetchEmployees()]);
      setAllRequests(reqs);
      setEmployees(emps.filter((e) => e.isActive));
    } catch {
      setLoadError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    if (isManager) load();
  }, [isManager, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleApprove = async (id: string) => {
    setProcessing(id);
    try {
      await approveOvertime(id);
      setToast({ type: 'success', msg: 'Request approved.' });
      load();
    } catch (err: unknown) {
      setToast({ type: 'error', msg: getErrorMessage(err, 'Failed to approve.') });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectModal) return;
    setProcessing(rejectModal.id);
    try {
      await rejectOvertime(rejectModal.id, reason.trim() || undefined);
      setToast({ type: 'success', msg: 'Request rejected.' });
      setRejectModal(null);
      load();
    } catch (err: unknown) {
      setToast({ type: 'error', msg: getErrorMessage(err, 'Failed to reject.') });
    } finally {
      setProcessing(null);
    }
  };

  const handleActual = async (hours: number) => {
    if (!actualModal) return;
    setActualLoading(true);
    try {
      await setOvertimeActualHours(actualModal.id, hours);
      setToast({ type: 'success', msg: 'Actual hours saved. Overtime pay calculated.' });
      setActualModal(null);
      load();
    } catch (err: unknown) {
      setToast({ type: 'error', msg: getErrorMessage(err, 'Failed to update.') });
    } finally {
      setActualLoading(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Overtime Approvals' }} />
      {children}
    </ThemedView>
  );

  if (!isManager) {
    return shell(
      <View style={styles.restricted}>
        <Ionicons name="lock-closed-outline" size={40} color={theme.textMuted} />
        <ThemedText themeColor="textMuted" style={styles.restrictedText}>Access restricted to managers.</ThemedText>
      </View>,
    );
  }

  const filtered = allRequests.filter((r) => {
    if (filterUser && r.user.id !== filterUser) return false;
    return r.status === activeTab.toUpperCase();
  });
  const pendingCount = allRequests.filter((r) => r.status === 'PENDING').length;
  const urgentPending = allRequests.filter((r) => r.status === 'PENDING' && r.isUrgent).length;

  const header = (
    <View style={styles.headerWrap}>
      <Toast toast={toast} />

      <View>
        <ThemedText style={styles.h1}>Overtime Approvals</ThemedText>
        <View style={styles.subRow}>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Review and approve overtime requests from your team.</ThemedText>
          {pendingCount > 0 ? (
            <View style={[styles.chip, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
              <ThemedText style={[styles.chipText, { color: '#b45309' }]}>{`${pendingCount} pending`}</ThemedText>
            </View>
          ) : null}
          {urgentPending > 0 ? (
            <View style={[styles.chip, styles.chipRow, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
              <Ionicons name="warning-outline" size={14} color="#b91c1c" />
              <ThemedText style={[styles.chipText, { color: '#b91c1c' }]}>{`${urgentPending} urgent`}</ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      {loadError ? <ErrorBanner message={loadError} onRetry={() => { setLoading(true); load(); }} /> : null}

      <View style={[styles.filters, wide && styles.filtersWide]}>
        <View style={[styles.tabs, { backgroundColor: theme.surface }]}>
          {(['pending', 'approved', 'rejected'] as TabKey[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
              style={[styles.tab, activeTab === tab && { backgroundColor: theme.primary }]}>
              <ThemedText style={[styles.tabLabel, { color: activeTab === tab ? '#ffffff' : theme.textMuted }]}>
                {`${tab.charAt(0).toUpperCase()}${tab.slice(1)}${tab === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}`}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        <View style={wide ? { width: 220 } : styles.flex1Full}>
          <Select
            value={filterUser}
            onChange={setFilterUser}
            options={[{ value: '', label: 'All employees' }, ...employees.map((e) => ({ value: e.id, label: e.name }))]}
          />
        </View>
      </View>
    </View>
  );

  const renderItem = ({ item: req }: { item: PendingOvertimeRequest }) => {
    const emp = req.user;
    const urgent = req.isUrgent && req.status === 'PENDING';
    const busy = processing === req.id;
    const actions = (
      <View style={[styles.actions, wide && styles.actionsWide]}>
        {req.status === 'PENDING' && canAct ? (
          <>
            <Pressable
              onPress={() => handleApprove(req.id)}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.approve, busy && { opacity: 0.6 }]}>
              <ThemedText style={styles.approveLabel}>{busy ? '…' : 'Approve'}</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => setRejectModal({ id: req.id, userName: emp?.name ?? '', date: req.date })}
              disabled={!!processing}
              accessibilityRole="button"
              style={styles.reject}>
              <ThemedText style={styles.rejectLabel}>Reject</ThemedText>
            </Pressable>
          </>
        ) : null}
        {req.status === 'APPROVED' && canAct && req.actualHours == null ? (
          <DashedButton label="+ Actual hrs" onPress={() => setActualModal({ id: req.id, date: req.date })} />
        ) : null}
        {req.status === 'APPROVED' ? (
          <View style={[styles.pill, { backgroundColor: 'rgba(34,197,94,0.12)' }]}><ThemedText style={[styles.pillText, { color: '#15803d' }]}>Approved</ThemedText></View>
        ) : null}
        {req.status === 'REJECTED' ? (
          <View style={[styles.pill, { backgroundColor: 'rgba(239,68,68,0.12)' }]}><ThemedText style={[styles.pillText, { color: '#b91c1c' }]}>Rejected</ThemedText></View>
        ) : null}
      </View>
    );

    return (
      <View
        style={[
          styles.card,
          { backgroundColor: urgent ? 'rgba(239,68,68,0.04)' : theme.surface, borderColor: urgent ? '#fca5a5' : theme.border },
        ]}>
        <View style={[styles.cardBody, wide && styles.cardBodyWide]}>
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              <ThemedText style={styles.name}>{emp?.name ?? '—'}</ThemedText>
              <View style={[styles.rolePill, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText themeColor="textMuted" style={styles.roleText}>{emp?.role ? (ROLE_LABELS[emp.role] ?? emp.role) : '—'}</ThemedText>
              </View>
              {urgent ? (
                <View style={[styles.urgentBadge, styles.chipRow]}>
                  <Ionicons name="warning-outline" size={12} color="#ef4444" />
                  <ThemedText style={styles.urgentText}>URGENT</ThemedText>
                </View>
              ) : null}
            </View>
            <ThemedText style={styles.date}>{fmtDate(req.date)}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>{req.reason}</ThemedText>
            <View style={styles.hours}>
              <ThemedText themeColor="textMuted" style={styles.small}><ThemedText style={styles.hoursNum}>{`${req.requestedHours}h`}</ThemedText>{' requested'}</ThemedText>
              {req.actualHours != null ? (
                <ThemedText themeColor="textMuted" style={styles.small}><ThemedText style={[styles.hoursNum, { color: '#22c55e' }]}>{`${req.actualHours}h`}</ThemedText>{' actual'}</ThemedText>
              ) : null}
              {req.overtimePay != null ? <ThemedText style={styles.pay}>{fmt(req.overtimePay)}</ThemedText> : null}
            </View>
            {req.status === 'REJECTED' && req.rejectionReason ? (
              <View style={styles.rejection}><ThemedText style={[styles.small, { color: '#b91c1c' }]}>{`Rejection reason: ${req.rejectionReason}`}</ThemedText></View>
            ) : null}
            <ThemedText themeColor="textMuted" style={styles.stamp}>
              {`Requested ${fmtTs(req.createdAt)}${req.approvedAt ? ` · Processed ${fmtTs(req.approvedAt)}` : ''}`}
            </ThemedText>
          </View>
          {actions}
        </View>
      </View>
    );
  };

  const empty = loading ? (
    <View style={styles.gap}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={96} />)}</View>
  ) : loadError ? null : (
    <View style={styles.restricted}>
      <Ionicons
        name={activeTab === 'pending' ? 'checkmark-circle-outline' : activeTab === 'approved' ? 'clipboard-outline' : 'close-circle-outline'}
        size={40}
        color={theme.textMuted}
      />
      <ThemedText themeColor="textMuted" style={styles.restrictedText}>{`No ${activeTab} requests.`}</ThemedText>
    </View>
  );

  return shell(
    <>
      <FlatList
        data={loading ? [] : filtered}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Sep}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      />
      {rejectModal ? (
        <RejectSheet
          userName={rejectModal.userName}
          date={rejectModal.date}
          processing={!!processing}
          onCancel={() => setRejectModal(null)}
          onConfirm={handleReject}
        />
      ) : null}
      {actualModal ? (
        <ActualHoursSheet
          title="Enter Actual Hours"
          message={`Actual overtime hours for ${fmtDate(actualModal.date)}.`}
          saving={actualLoading}
          onCancel={() => setActualModal(null)}
          onSave={handleActual}
        />
      ) : null}
    </>,
  );
}

function Sep() {
  return <View style={{ height: 12 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  flex1Full: { flexGrow: 1, minWidth: 160 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  content: { width: '100%', maxWidth: 1100, alignSelf: 'center' },
  headerWrap: { gap: 24, marginBottom: 20 },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold, fontWeight: '900' },
  subRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 6, marginTop: 4 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  filters: { gap: 12 },
  filtersWide: { flexDirection: 'row', alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, alignSelf: 'flex-start' },
  tab: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  restricted: { alignItems: 'center', gap: 12, paddingVertical: 64, paddingHorizontal: 16 },
  restrictedText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, textAlign: 'center' },
  gap: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16 },
  cardBody: { gap: 12 },
  cardBodyWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  name: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.bold },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  roleText: { fontSize: 10, lineHeight: 14 },
  urgentBadge: { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  urgentText: { color: '#ef4444', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  date: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  hours: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2, paddingTop: 2 },
  hoursNum: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  pay: { fontSize: 12, lineHeight: 18, fontFamily: Fonts?.mono, fontWeight: '700', color: '#22c55e' },
  rejection: { backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 8, marginTop: 6 },
  stamp: { fontSize: 10, lineHeight: 14, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionsWide: { flexDirection: 'column', flexShrink: 0, alignItems: 'stretch' },
  approve: { minHeight: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#22c55e', alignItems: 'center', justifyContent: 'center' },
  approveLabel: { color: '#ffffff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  reject: { minHeight: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: '#fca5a5', alignItems: 'center', justifyContent: 'center' },
  rejectLabel: { color: '#ef4444', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignItems: 'center' },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  confirmReject: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' },
  confirmRejectLabel: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
});
