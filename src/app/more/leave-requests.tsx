import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { decideLeaveRequest, fetchLeaveRequests, markNotificationsRead, submitLeaveRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { LeaveRequest } from '@/types/api';

// Approval authority: the dashboard's LEAVE_APPROVER_ROLES, byte for byte the
// backend's set (PUT /leave-requests/:id is requireHROrOwner). Distinct from
// attendance's broader manager list, which can't approve leave.
const LEAVE_APPROVER_ROLES = ['OWNER', 'STORE_MANAGER', 'HR'];
const LEAVE_NOTIFICATION_TYPES = ['LEAVE_REQUEST'];
const WIDE_MIN = 560;

type Tab = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
const TABS: { key: Tab; label: string }[] = [
  { key: 'PENDING', label: 'Pending' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: 'ALL', label: 'All' },
];

const LEAVE_TYPE_OPTIONS = [
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'EMERGENCY', label: 'Emergency' },
];
const DAY_TYPE_OPTIONS = [
  { value: 'FULL', label: 'Full Day' },
  { value: 'HALF', label: 'Half Day' },
];

const STATUS_BADGE: Record<string, { variant: 'warning' | 'success' | 'danger'; label: string }> = {
  PENDING: { variant: 'warning', label: 'Pending' },
  APPROVED: { variant: 'success', label: 'Approved' },
  REJECTED: { variant: 'danger', label: 'Rejected' },
};

// Inclusive day count: a single-day request (start === end) is 1 day. Half Day
// applies to every date in the range, so it is just the day count halved.
function dayCount(start: string, end: string, isHalfDay?: boolean): number {
  if (!start || !end) return 0;
  const s = new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime();
  const e = new Date(`${end.slice(0, 10)}T00:00:00Z`).getTime();
  const days = Math.round((e - s) / 86400000) + 1;
  if (days <= 0) return 0;
  return isHalfDay ? days * 0.5 : days;
}

// The dashboard's formatDate / formatDateTime (IST).
const formatDate = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const formatDateTime = (d: string) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

// The backend's real validation messages come back as { error }.
const errorMessage = (e: unknown, fallback: string) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;
const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

const typeLabel = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();

type Toast = { ok: boolean; text: string };

export default function LeaveRequestsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isApprover = !!user && LEAVE_APPROVER_ROLES.includes(user.role);

  const [width, setWidth] = useState(0);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [approveTarget, setApproveTarget] = useState<LeaveRequest | null>(null);
  const [approving, setApproving] = useState(false);
  // Default PENDING. For approvers this is the shared queue; for everyone else
  // it is their own pending requests (status layers onto what the backend's
  // role split already grants).
  const [tab, setTab] = useState<Tab>('PENDING');
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((text: string, ok: boolean) => {
    setToast({ ok, text });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setRequests(await fetchLeaveRequests(tab));
    } catch {
      setLoadError(true);
      showToast("Couldn't load leave requests. Check your connection and try again.", false);
    } finally {
      setLoading(false);
    }
  }, [tab, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / tab change
    load();
  }, [load]);

  // Visiting the queue clears the Leave Request notification badge.
  useEffect(() => {
    if (!isApprover) return;
    markNotificationsRead(LEAVE_NOTIFICATION_TYPES).catch(() => {});
  }, [isApprover]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // An approve failure is the atomic-claim race (someone already decided it):
  // nothing to retry, so the dialog closes and the list reloads.
  const handleApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      await decideLeaveRequest(approveTarget.id, 'APPROVED');
      showToast('Leave request approved.', true);
    } catch (e: unknown) {
      showToast(errorMessage(e, 'Failed to approve request.'), false);
    } finally {
      setApproving(false);
      setApproveTarget(null);
      load();
    }
  };

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;

  const header = (
    <View style={styles.headerStack}>
      <View style={styles.titleRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Leave Requests</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>{isApprover ? 'Review and act on leave requests' : 'Apply for leave and track your requests'}</ThemedText>
        </View>
        <Button size="sm" onPress={() => setApplyOpen(true)}>+ Apply for Leave</Button>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, { borderColor: theme.border, backgroundColor: active ? theme.primary : theme.surface }]}>
              <ThemedText style={[styles.tabText, { color: active ? '#fff' : theme.textMuted }]}>{t.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {toast ? (toast.ok ? <SuccessBanner message={toast.text} /> : <ErrorBanner message={toast.text} />) : null}
      {loadError && !loading ? <ErrorBanner message="Couldn't load leave requests. Check your connection and try again." onRetry={load} /> : null}
    </View>
  );

  const empty = loading ? (
    <View style={styles.list}><Skeleton height={96} /><Skeleton height={96} /><Skeleton height={96} /><Skeleton height={96} /></View>
  ) : loadError ? null : (
    <Card padding="lg">
      <ThemedText style={[styles.emptyText]}>{tab === 'ALL' ? 'No leave requests yet.' : `No ${tab.toLowerCase()} leave requests.`}</ThemedText>
    </Card>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Leave Requests' }} />
      <FlatList
        data={loading ? [] : requests}
        keyExtractor={(r) => r.id}
        renderItem={({ item: r }) => {
          const days = dayCount(r.startDate, r.endDate, r.isHalfDay);
          const s = STATUS_BADGE[r.status] ?? STATUS_BADGE.PENDING;
          return (
            <Card padding="md">
              <View style={[styles.cardTop, !wide && styles.cardTopPhone]}>
                <View style={styles.flex1}>
                  <View style={styles.badges}>
                    {isApprover ? <ThemedText style={styles.name}>{r.user.name}</ThemedText> : null}
                    <Badge variant="secondary" size="sm">{typeLabel(r.leaveType)}</Badge>
                    <Badge variant={s.variant} size="sm">{s.label}</Badge>
                  </View>
                  <ThemedText style={styles.dates}>
                    {`${formatDate(r.startDate)} – ${formatDate(r.endDate)}`}
                    <ThemedText themeColor="textMuted" style={styles.dates}>{` · ${days} day${days === 1 ? '' : 's'}`}</ThemedText>
                    {r.isHalfDay ? '  ' : ''}
                  </ThemedText>
                  {r.isHalfDay ? <View style={styles.halfBadge}><Badge variant="secondary" size="sm">Half Day</Badge></View> : null}
                  <ThemedText themeColor="textMuted" style={styles.meta}>{r.reason}</ThemedText>
                  {r.status !== 'PENDING' ? (
                    <ThemedText themeColor="textMuted" style={styles.meta}>
                      {`${r.status === 'APPROVED' ? 'Approved' : 'Rejected'} by ${r.approvedBy?.name ?? '—'}${r.respondedAt ? ` on ${formatDateTime(r.respondedAt)}` : ''}${r.status === 'REJECTED' && r.rejectionReason ? ` — ${r.rejectionReason}` : ''}`}
                    </ThemedText>
                  ) : null}
                  {!isApprover && r.status === 'PENDING' ? <ThemedText themeColor="textMuted" style={styles.meta}>{`Submitted ${formatDateTime(r.createdAt)}`}</ThemedText> : null}
                </View>
                {isApprover && r.status === 'PENDING' ? (
                  <View style={styles.actions}>
                    <Button size="sm" variant="outline" onPress={() => setRejectTarget(r)}>Reject</Button>
                    <Button size="sm" onPress={() => setApproveTarget(r)}>Approve</Button>
                  </View>
                ) : null}
              </View>
            </Card>
          );
        }}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        windowSize={7}
        contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + 40, width: '100%', maxWidth: 768, alignSelf: 'center' }}
      />

      {applyOpen ? (
        <ApplyLeaveSheet
          onClose={() => setApplyOpen(false)}
          onSubmitted={() => { setApplyOpen(false); showToast('Leave request submitted.', true); load(); }}
        />
      ) : null}

      {rejectTarget ? (
        <RejectSheet
          request={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={(message) => { setRejectTarget(null); if (message) showToast(message.text, message.ok); load(); }}
        />
      ) : null}

      {/* Approve confirmation: prevents an accidental tap. */}
      <Sheet
        visible={!!approveTarget}
        onClose={() => setApproveTarget(null)}
        locked={approving}
        title="Approve Leave Request"
        footer={
          <>
            <Button style={styles.flex1} variant="outline" disabled={approving} onPress={() => setApproveTarget(null)}>Cancel</Button>
            <Button style={styles.flex1} loading={approving} onPress={handleApprove}>Approve</Button>
          </>
        }>
        {approveTarget ? (
          <ThemedText style={styles.body}>
            {'Approve '}<ThemedText style={[styles.body, styles.bold]}>{approveTarget.user.name}</ThemedText>
            {`'s ${approveTarget.leaveType.toLowerCase()} leave (${formatDate(approveTarget.startDate)} – ${formatDate(approveTarget.endDate)})?`}
          </ThemedText>
        ) : null}
      </Sheet>
    </ThemedView>
  );
}

function Gap() {
  return <View style={styles.gap} />;
}

// ── Apply-for-leave sheet ────────────────────────────────────────────────────
function ApplyLeaveSheet({ onClose, onSubmitted }: { onClose: () => void; onSubmitted: () => void }) {
  const theme = useTheme();
  const [leaveType, setLeaveType] = useState('');
  const [dayType, setDayType] = useState<'FULL' | 'HALF'>('FULL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isHalfDay = dayType === 'HALF';
  const days = dayCount(startDate, endDate, isHalfDay);
  // Mirror of the backend's end >= start check, for immediate feedback only; on
  // submit the server's own message overrides it.
  const clientError = startDate && endDate && endDate < startDate ? 'End date cannot be before start date.' : '';

  const submit = async () => {
    setError('');
    if (!leaveType) { setError('Leave type is required.'); return; }
    if (!startDate || !endDate) { setError('Start and end dates are required.'); return; }
    if (!reason.trim()) { setError('A reason is required.'); return; }
    if (clientError) { setError(clientError); return; }
    setSaving(true);
    try {
      await submitLeaveRequest({ leaveType, startDate, endDate, reason: reason.trim(), isHalfDay });
      onSubmitted();
    } catch (e: unknown) {
      setError(errorMessage(e, 'Failed to submit leave request.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="Apply for Leave"
      footer={
        <>
          <Button style={styles.flex1} variant="outline" disabled={saving} onPress={onClose}>Cancel</Button>
          <Button style={styles.flex1} loading={saving} onPress={submit}>Submit</Button>
        </>
      }>
      <Select label="Leave Type" required options={LEAVE_TYPE_OPTIONS} value={leaveType} onChange={setLeaveType} />
      <Select label="Day Type" options={DAY_TYPE_OPTIONS} value={dayType} onChange={(v) => setDayType(v as 'FULL' | 'HALF')} />
      <View style={styles.dateRow}>
        <View style={styles.flex1}><DateField label="Start Date *" value={startDate} onChange={setStartDate} /></View>
        <View style={styles.flex1}><DateField label="End Date *" value={endDate} onChange={setEndDate} /></View>
      </View>
      {days > 0 ? (
        <ThemedText themeColor="textMuted" style={styles.meta}>{`${days} day${days === 1 ? '' : 's'}${isHalfDay ? ' (half day each)' : ''}`}</ThemedText>
      ) : null}
      <Input label="Reason" required value={reason} onChangeText={setReason} multiline numberOfLines={3} />
      {error || clientError ? <ThemedText style={[styles.body, { color: theme.danger }]}>{error || clientError}</ThemedText> : null}
    </Sheet>
  );
}

// ── Reject-with-reason sheet (approver side) ─────────────────────────────────
function RejectSheet({ request, onClose, onDone }: { request: LeaveRequest; onClose: () => void; onDone: (message?: Toast) => void }) {
  const theme = useTheme();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reject = async () => {
    if (!reason.trim()) { setError('A rejection reason is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await decideLeaveRequest(request.id, 'REJECTED', reason.trim());
      onDone({ ok: true, text: 'Leave request rejected.' });
    } catch (e: unknown) {
      // A 409 is the atomic-claim race (already decided): terminal, so close and
      // reload. Anything else is fixable, so show the error and stay open.
      if (statusOf(e) === 409) onDone({ ok: false, text: errorMessage(e, 'This request was already responded to.') });
      else setError(errorMessage(e, 'Failed to reject request.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Reject — ${request.user.name}`}
      footer={
        <>
          <Button style={styles.flex1} variant="outline" disabled={saving} onPress={onClose}>Cancel</Button>
          <Button style={styles.flex1} variant="danger" loading={saving} onPress={reject}>Reject</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>{`${request.leaveType} leave, ${formatDate(request.startDate)} – ${formatDate(request.endDate)}`}</ThemedText>
      <Input label="Reason" required value={reason} onChangeText={setReason} placeholder="Why is this being rejected?" multiline numberOfLines={3} />
      {error ? <ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  headerStack: { gap: 16, marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, minHeight: 36, justifyContent: 'center' },
  tabText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  list: { gap: 8 },
  gap: { height: 8 },
  emptyText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, textAlign: 'center' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTopPhone: { flexDirection: 'column' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  dates: { fontSize: 14, lineHeight: 20 },
  halfBadge: { flexDirection: 'row', marginTop: 4 },
  meta: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  bold: { fontFamily: FontWeights.semiBold },
  dateRow: { flexDirection: 'row', gap: 12 },
});
