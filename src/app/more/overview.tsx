import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttendanceChart } from '@/components/overview/attendance-chart';
import { DailyBreakdown } from '@/components/overview/daily-breakdown';
import { DateChip } from '@/components/overview/date-chip';
import { CompactListCard, ErrorBanner, LinkText, OverviewFrame, OverviewStat, OverviewStatSkeleton, SectionLabel, StatGrid, StatusBadge, useIsTablet } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Input, ListRow, Skeleton, SkeletonList } from '@/components/ui';
import { FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchCustomerStats,
  fetchDailyReport,
  fetchDashboardOverview,
  fetchMyStaffRemarks,
  fetchOnLeave,
  getErrorMessage,
  replyToRemark,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDate, formatINR, istToday, longDate, shortDate } from '@/lib/overview-format';
import type { CustomerStatsReport, DailyReport, DashboardOverview, MyRemark, OnLeaveEntry, RemarkReply } from '@/types/api';

// Mirrors the dashboard's own Overview page
// (fasttracks-dashboard/frontend/src/app/(dashboard)/dashboard/page.tsx):
// OWNER gets OwnerDashboard (GET /dashboard/overview, /reports/daily,
// /reports/customer-stats); every other role gets the Welcome view. Same role
// checks as the dashboard file.
const LEAVE_APPROVER_ROLES = ['OWNER', 'STORE_MANAGER', 'HR'];
const INDIGO = '#6366f1';

const REMARK_CATEGORY_LABELS: Record<string, string> = {
  ATTENDANCE: 'Attendance',
  PUNCTUALITY: 'Punctuality',
  SALES: 'Sales',
  CUSTOMER_HANDLING: 'Customer Handling',
  BEHAVIOUR: 'Behaviour',
  TEAMWORK: 'Teamwork',
  INITIATIVE: 'Initiative',
  OTHER: 'Other',
};

export default function OverviewScreen() {
  const { user } = useAuth();
  if (user?.role === 'OWNER') return <OwnerOverviewScreen />;
  return <WelcomeScreen />;
}

// ─── On Leave (OWNER, STORE_MANAGER, HR only — renders nothing otherwise) ────

function OnLeaveWidget() {
  const { user } = useAuth();
  const isApprover = !!user && LEAVE_APPROVER_ROLES.includes(user.role);
  const [entries, setEntries] = useState<OnLeaveEntry[] | null>(null);

  useEffect(() => {
    if (!isApprover) return;
    fetchOnLeave()
      .then((res) => setEntries(res ?? []))
      .catch(() => setEntries([]));
  }, [isApprover]);

  if (!isApprover) return null;

  const today = (entries ?? []).filter((e) => e.isToday);
  const upcoming = (entries ?? []).filter((e) => !e.isToday);

  const dateLabel = (e: OnLeaveEntry) => {
    const s = formatDate(e.startDate);
    const en = formatDate(e.endDate);
    return s === en ? s : `${s} – ${en}`;
  };

  const row = (e: OnLeaveEntry, last: boolean) => (
    <ListRow
      key={e.id}
      title={e.user.name}
      subtitle={`${e.leaveType.toLowerCase()}${e.isHalfDay ? ' · Half Day' : ''}`}
      right={dateLabel(e)}
      divider={!last}
    />
  );

  return (
    <Card divided title="On Leave">
      {entries === null ? (
        <SkeletonList items={2} />
      ) : entries.length === 0 ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.centerText}>No one on leave right now.</ThemedText>
      ) : (
        <View>
          {today.map((e, i) => row(e, i === today.length - 1 && upcoming.length === 0))}
          {upcoming.length > 0 && <SectionLabel>Upcoming</SectionLabel>}
          {upcoming.map((e, i) => row(e, i === upcoming.length - 1))}
        </View>
      )}
    </Card>
  );
}

// ─── My Remarks (own VISIBLE_TO_EMPLOYEE remarks; nothing when there are none) ─

function RemarkReplies({ remark, onPosted }: { remark: MyRemark; onPosted: (reply: RemarkReply) => void }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      onPosted(await replyToRemark(remark.id, body));
      setDraft('');
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not send the reply.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.replies}>
      {remark.replies.map((r) => (
        <View key={r.id}>
          <ThemedText type="small" themeColor="textMuted">{r.author.name} · {formatDate(r.createdAt)}</ThemedText>
          <ThemedText type="small">{r.body}</ThemedText>
        </View>
      ))}
      <Input value={draft} onChangeText={setDraft} placeholder="Write a reply…" multiline error={error ?? undefined} />
      <Button size="sm" onPress={send} loading={sending} disabled={!draft.trim()}>Send</Button>
    </View>
  );
}

function MyRemarksSection() {
  const theme = useTheme();
  const [remarks, setRemarks] = useState<MyRemark[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyStaffRemarks()
      .then((res) => setRemarks(res ?? []))
      .catch(() => setRemarks([]))
      .finally(() => setLoading(false));
  }, []);

  const appendReply = (remarkId: string, reply: RemarkReply) => {
    setRemarks((rs) => rs.map((r) => (r.id === remarkId ? { ...r, replies: [...r.replies, reply] } : r)));
  };

  if (loading || remarks.length === 0) return null;

  return (
    <View style={styles.stack}>
      <SectionLabel>My Remarks</SectionLabel>
      {remarks.map((r) => (
        <Card key={r.id} padding="md">
          <View style={styles.badgeRow}>
            <Badge variant={r.rating === 'POSITIVE' ? 'success' : 'danger'} size="sm">{r.rating === 'POSITIVE' ? 'Positive' : 'Negative'}</Badge>
            <Badge variant="secondary" size="sm">{REMARK_CATEGORY_LABELS[r.category] ?? r.category}</Badge>
          </View>
          <ThemedText type="small">{r.note}</ThemedText>
          <ThemedText type="small" themeColor="textMuted" style={styles.remarkDate}>{formatDate(r.createdAt)}</ThemedText>
          <View style={[styles.remarkFooter, { borderTopColor: theme.border }]}>
            <RemarkReplies remark={r} onPosted={(reply) => appendReply(r.id, reply)} />
          </View>
        </Card>
      ))}
    </View>
  );
}

// ─── Non-owner view ──────────────────────────────────────────────────────────

function ActionCard({ icon, color, title, subtitle, onPress }: { icon: keyof typeof Ionicons.glyphMap; color: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Card padding="lg" onPress={onPress}>
      <View style={styles.actionRow}>
        <View style={[styles.actionIcon, { backgroundColor: withAlpha(color, 0.1) }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        <View style={styles.flex1}>
          <ThemedText style={styles.actionTitle}>{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{subtitle}</ThemedText>
        </View>
      </View>
    </Card>
  );
}

function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();
  const canAddEntry = ['OWNER', 'STORE_MANAGER', 'SALES'].includes(user?.role ?? '');
  const isAccounting = user?.role === 'ACCOUNTING' || user?.role === 'CASHIER';

  return (
    <>
      <Stack.Screen options={{ title: 'Overview' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}>
        <View>
          <ThemedText style={styles.pageTitle}>Welcome, {user?.name?.split(' ')[0]}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Here&apos;s your dashboard for today.</ThemedText>
        </View>

        <StatGrid phoneCols={1} tabletCols={2}>
          {canAddEntry ? (
            <ActionCard icon="add" color={theme.primary} title="New Entry" subtitle="Add customer & job" onPress={() => router.push('/more/new-entry' as never)} />
          ) : null}
          <ActionCard icon="calendar-outline" color={theme.success} title="Attendance" subtitle="Clock in/out & leaves" onPress={() => router.push('/more/attendance' as never)} />
          {isAccounting ? (
            <ActionCard icon="checkmark-circle-outline" color={theme.primary} title="Finance Approvals" subtitle="Advances" onPress={() => router.push('/more/finance-approvals' as never)} />
          ) : null}
          {isAccounting ? (
            <ActionCard icon="cash-outline" color={INDIGO} title="Payroll" subtitle="Monthly salary & deductions" onPress={() => router.push('/more/payroll' as never)} />
          ) : null}
        </StatGrid>

        <OnLeaveWidget />
        <MyRemarksSection />
      </ScrollView>
    </>
  );
}

// ─── OWNER view ──────────────────────────────────────────────────────────────

function QuickActions() {
  const router = useRouter();
  const theme = useTheme();
  // "New Invoice" has no app screen of its own (the dashboard's /invoices/new
  // page; in the app, creating an invoice lives inside the Invoices list), so
  // it stays non-tappable.
  const actions: { label: string; icon: keyof typeof Ionicons.glyphMap; href?: string }[] = [
    { label: 'New Entry', icon: 'add', href: '/more/new-entry' },
    { label: 'New Invoice', icon: 'document-text-outline' },
    { label: 'Attendance', icon: 'calendar-outline', href: '/more/attendance' },
    { label: 'Payroll', icon: 'cash-outline', href: '/more/payroll' },
  ];

  return (
    <Card padding="md" title="Quick Actions">
      <View style={styles.qaGrid}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            disabled={!a.href}
            onPress={() => a.href && router.push(a.href as never)}
            accessibilityRole="button"
            style={[styles.qaItem, { backgroundColor: theme.surface, borderColor: theme.border }, !a.href && styles.qaDisabled]}>
            <Ionicons name={a.icon} size={18} color={theme.primary} />
            <ThemedText style={styles.qaLabel}>{a.label}</ThemedText>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function OwnerOverviewScreen() {
  return (
    <OverviewFrame>
      <OwnerOverviewBody />
    </OverviewFrame>
  );
}

function OwnerOverviewBody() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const isTablet = useIsTablet();
  const todayStr = istToday();

  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dailyData, setDailyData] = useState<DailyReport | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [statsFromDate, setStatsFromDate] = useState(todayStr);
  const [statsToDate, setStatsToDate] = useState(todayStr);
  const [customerStats, setCustomerStats] = useState<CustomerStatsReport | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Only the latest request may write its result (date can change mid-flight).
  const dailyReq = useRef(0);
  const statsReq = useRef(0);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboardOverview());
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to load overview'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDaily = useCallback(async (date: string) => {
    const req = ++dailyReq.current;
    setDailyLoading(true);
    setDailyError(null);
    try {
      const res = await fetchDailyReport(date);
      if (req === dailyReq.current) setDailyData(res);
    } catch (err: any) {
      if (req !== dailyReq.current) return;
      setDailyData(null);
      setDailyError(getErrorMessage(err, 'Failed to load daily breakdown'));
    } finally {
      if (req === dailyReq.current) setDailyLoading(false);
    }
  }, []);

  const loadStats = useCallback(async (from: string, to: string) => {
    const req = ++statsReq.current;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetchCustomerStats(from, to);
      if (req === statsReq.current) setCustomerStats(res);
    } catch (err: any) {
      if (req !== statsReq.current) return;
      setCustomerStats(null);
      setStatsError(getErrorMessage(err, 'Failed to load customer & walkout stats'));
    } finally {
      if (req === statsReq.current) setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on date change
    loadDaily(selectedDate);
  }, [selectedDate, loadDaily]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount (range changes call loadStats directly, like the dashboard)
    loadStats(todayStr, todayStr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStats]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([loadOverview(), loadDaily(selectedDate), loadStats(statsFromDate, statsToDate)]);
    setIsRefreshing(false);
  };

  const dateLabel = selectedDate === todayStr ? 'Today' : shortDate(selectedDate);
  const onTime = (dailyData?.attendance.present ?? data?.attendance.present ?? 0) - (dailyData?.attendance.late ?? data?.attendance.late ?? 0);
  const late = dailyData?.attendance.late ?? data?.attendance.late ?? 0;
  const absent = dailyData?.attendance.absent ?? data?.attendance.absent ?? 0;

  const openJobs = (
    <View style={styles.stack}>
      {loading ? (
        <OverviewStatSkeleton />
      ) : (
        <OverviewStat label="Open Jobs" value={data?.jobs.open ?? 0} color={INDIGO} sub="in progress + ready" />
      )}
      {!loading && data?.jobs.byEmployee && data.jobs.byEmployee.length > 0 && (
        <CompactListCard title="Open Jobs by Employee">
          {data.jobs.byEmployee.map((emp, i, arr) => (
            <View key={emp.id} style={[styles.empRow, i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
              <ThemedText style={styles.empName} numberOfLines={1}>
                {emp.name}
                <ThemedText themeColor="textMuted" style={styles.empRole}>{`  ${emp.role.toLowerCase().replace(/_/g, ' ')}`}</ThemedText>
              </ThemedText>
              <ThemedText style={[styles.count, { color: INDIGO }]}>{emp.count}</ThemedText>
            </View>
          ))}
        </CompactListCard>
      )}
    </View>
  );

  const chart = loading ? (
    <Card padding="md">
      <Skeleton width={128} height={12} />
      <Skeleton height={160} style={styles.chartSkeleton} />
    </Card>
  ) : (
    <AttendanceChart onTime={onTime} late={late} absent={absent} dateLabel={dateLabel} />
  );

  const recentInvoices = (
    <Card divided title="Recent Invoices" action={<LinkText onPress={() => router.push('/more/invoices' as never)}>View all →</LinkText>}>
      {loading ? (
        <SkeletonList items={5} />
      ) : !data || data.recentInvoices.length === 0 ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.centerText}>No invoices yet</ThemedText>
      ) : (
        data.recentInvoices.map((inv, i, arr) => (
          <ListRow
            key={inv.id}
            title={inv.customerName}
            titleAccessory={<StatusBadge status={inv.status} />}
            subtitle={`${inv.invoiceNumber} · ${formatDate(inv.createdAt)}`}
            right={formatINR(inv.grandTotal)}
            rightSubtitle={inv.balanceDue > 0 ? `Due ${formatINR(inv.balanceDue)}` : undefined}
            rightSubtitleColor="danger"
            divider={i < arr.length - 1}
          />
        ))
      )}
    </Card>
  );

  const daily = (
    <>
      {dailyLoading && (
        <Card padding="md">
          <Skeleton width={160} height={12} style={styles.chartSkeleton} />
          <StatGrid>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={48} />)}
          </StatGrid>
        </Card>
      )}
      {!dailyLoading && dailyData && (
        <Card padding="md" titleVariant="label" style={{ backgroundColor: theme.surface }} title={`Daily Breakdown — ${selectedDate === todayStr ? 'Today' : formatDate(`${selectedDate}T12:00:00`)}`}>
          <DailyBreakdown data={dailyData} />
        </Card>
      )}
      {!dailyLoading && !dailyData && dailyError && <ErrorBanner message={dailyError} onRetry={() => loadDaily(selectedDate)} />}
    </>
  );

  const recentJobs = (
    <Card divided title="Recent Job Cards" action={<LinkText onPress={() => router.push('/more/new-entry' as never)}>+ New →</LinkText>}>
      {loading ? (
        <SkeletonList items={3} />
      ) : !data || data.recentJobs.length === 0 ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.centerText}>No job cards yet</ThemedText>
      ) : (
        data.recentJobs.map((job, i, arr) => (
          <ListRow
            key={job.id}
            title={job.vehicleNumber}
            titleAccessory={<StatusBadge status={job.status} />}
            subtitle={`${job.reasonForVisit} · ${formatDate(job.createdAt)}`}
            right={`#${job.jobNumber}`}
            onPress={() => router.push(`/customers/job/${job.id}` as never)}
            divider={i < arr.length - 1}
          />
        ))
      )}
    </Card>
  );

  const statsRangeChanged = statsFromDate !== todayStr || statsToDate !== todayStr;

  return (
    <>
      <Stack.Screen options={{ title: 'Overview' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, { padding: isTablet ? Spacing.four : Spacing.three, paddingBottom: insets.bottom + Spacing.three }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
        {/* Header */}
        <View style={[styles.header, isTablet && styles.headerRow]}>
          <View style={styles.flex1}>
            <ThemedText style={styles.pageTitle}>Overview</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.dateLine}>{longDate(selectedDate)}</ThemedText>
          </View>
          <View style={styles.controls}>
            <DateChip value={selectedDate} max={todayStr} onChange={setSelectedDate} accessibilityLabel="Pick a date" />
            {selectedDate !== todayStr && <Button size="sm" onPress={() => setSelectedDate(todayStr)}>Today</Button>}
            <Pressable
              onPress={() => { loadOverview(); loadDaily(selectedDate); }}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Refresh"
              style={[styles.refresh, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {loading ? <ActivityIndicator size="small" /> : <Ionicons name="refresh" size={18} color={theme.textMuted} />}
            </Pressable>
          </View>
        </View>

        {error && <ErrorBanner message={error} onRetry={loadOverview} />}

        {/* Attendance chart + Open Jobs */}
        <View style={[styles.split, isTablet && styles.splitRow]}>
          <View style={styles.flex1}>{chart}</View>
          <View style={styles.flex1}>{openJobs}</View>
        </View>

        {/* Customer & Walkout Stats */}
        <View style={styles.stack}>
          <View style={styles.headingRow}>
            <SectionLabel>Customer & Walkout Stats</SectionLabel>
          <View style={styles.controls}>
            <ThemedText type="small" themeColor="textMuted">From</ThemedText>
            <DateChip
              value={statsFromDate}
              max={todayStr}
              accessibilityLabel="Stats from date"
              onChange={(v) => { setStatsFromDate(v); if (v <= statsToDate) loadStats(v, statsToDate); }}
            />
            <ThemedText type="small" themeColor="textMuted">to</ThemedText>
            <DateChip
              value={statsToDate}
              max={todayStr}
              accessibilityLabel="Stats to date"
              onChange={(v) => { setStatsToDate(v); if (statsFromDate <= v) loadStats(statsFromDate, v); }}
            />
            {statsRangeChanged && (
              <Button size="sm" onPress={() => { setStatsFromDate(todayStr); setStatsToDate(todayStr); loadStats(todayStr, todayStr); }}>Today</Button>
            )}
          </View>
          </View>
          {statsError && !statsLoading && <ErrorBanner message={statsError} onRetry={() => loadStats(statsFromDate, statsToDate)} />}
          {statsLoading ? (
            <StatGrid>{Array.from({ length: 4 }).map((_, i) => <OverviewStatSkeleton key={i} />)}</StatGrid>
          ) : customerStats ? (
            <StatGrid>
              <OverviewStat
                label="Jobs In"
                value={customerStats.jobs.total}
                color={INDIGO}
                sub={statsFromDate === statsToDate ? 'today' : `${statsFromDate} – ${statsToDate}`}
              />
              <OverviewStat
                label="Customers"
                value={customerStats.customers.total}
                sub={`${customerStats.customers.new} new · ${customerStats.customers.returning} returning`}
              />
              <OverviewStat
                label="Walkouts"
                value={customerStats.walkouts.total}
                color={customerStats.walkouts.total > 0 ? theme.danger : theme.success}
                sub={customerStats.jobs.total > 0 ? `${Math.round((customerStats.walkouts.total / customerStats.jobs.total) * 100)}% of jobs` : 'no jobs'}
              />
              <OverviewStat
                label="Conversions"
                value={customerStats.jobs.total - customerStats.walkouts.total}
                color={theme.success}
                sub={customerStats.jobs.total > 0 ? `${Math.round(((customerStats.jobs.total - customerStats.walkouts.total) / customerStats.jobs.total) * 100)}% rate` : 'no jobs'}
              />
            </StatGrid>
          ) : !statsError ? (
            <ThemedText type="small" themeColor="textMuted" style={styles.centerText}>No data available.</ThemedText>
          ) : null}

          {!statsLoading && customerStats && customerStats.walkouts.byEmployee.length > 0 && (
            <CompactListCard title="Walkouts by Staff">
              {customerStats.walkouts.byEmployee.map((emp, i, arr) => (
                <ListRow
                  key={emp.name}
                  title={`${emp.name}${emp.employeeId ? ` (${emp.employeeId})` : ''}`}
                  subtitle={`${emp.walkouts} walkouts · ${emp.totalJobs} jobs`}
                  right={
                    <ThemedText style={[styles.count, { color: emp.walkoutRate >= 30 ? theme.danger : emp.walkoutRate >= 15 ? theme.warning : theme.success }]}>
                      {emp.walkoutRate}%
                    </ThemedText>
                  }
                  rightSubtitle="rate"
                  divider={i < arr.length - 1}
                />
              ))}
            </CompactListCard>
          )}
          {!statsLoading && customerStats && customerStats.walkouts.total === 0 && customerStats.jobs.total > 0 && (
            <ThemedText type="small" style={[styles.centerText, { color: theme.success }]}>No walkouts in this period</ThemedText>
          )}
        </View>

        {/* Revenue */}
        <View style={styles.stack}>
          <SectionLabel>Revenue</SectionLabel>
          <StatGrid>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <OverviewStatSkeleton key={i} />)
            ) : (
              [
                <OverviewStat key="today" label="Today's Collections" value={formatINR(data?.revenue.todayCollections ?? 0)} color={theme.success} sub="payments received today" />,
                <OverviewStat key="month" label="Month Revenue" value={formatINR(data?.revenue.monthRevenue ?? 0)} sub="this month collected" />,
                <OverviewStat key="out" label="Outstanding" value={formatINR(data?.revenue.outstanding ?? 0)} color={data && data.revenue.outstanding > 0 ? theme.danger : theme.success} sub="balance due on invoices" />,
                <OverviewStat key="count" label="Invoices This Month" value={data?.revenue.monthInvoiceCount ?? 0} sub="invoices raised" />,
              ]
            )}
          </StatGrid>
        </View>

        {/* Recent Invoices | Daily Breakdown, Recent Job Cards, On Leave, Quick Actions */}
        <View style={[styles.split, isTablet && styles.splitRow]}>
          <View style={styles.flex1}>{recentInvoices}</View>
          <View style={[styles.flex1, styles.stack]}>
            {daily}
            {recentJobs}
            <OnLeaveWidget />
            <QuickActions />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.four, width: '100%' },
  flex1: { flex: 1, minWidth: 0 },
  headingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  stack: { gap: 12 },
  split: { gap: Spacing.three },
  splitRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pageTitle: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  header: { gap: Spacing.three },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateLine: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  empRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, paddingVertical: 8 },
  empName: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  empRole: { fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: Spacing.two },
  refresh: { width: 44, height: 44, borderRadius: Radii.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chartSkeleton: { marginVertical: 12 },
  count: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  centerText: { textAlign: 'center', paddingVertical: Spacing.three },
  qaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  qaItem: { width: '48%', flexGrow: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: Radii.sm },
  qaDisabled: { opacity: 0.6 },
  qaLabel: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.medium },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  actionIcon: { width: 44, height: 44, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontFamily: FontWeights.semiBold },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.one },
  remarkDate: { marginTop: 6 },
  remarkFooter: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  replies: { gap: Spacing.two },
});
