import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApplicationDetail } from '@/components/applications/application-detail';
import {
  ADMIN_ROLES, applicationInviteShare, candidateInviteShare, onboardingNotStarted, STATUS_LABELS, STATUSES, type ShareLink,
} from '@/components/applications/application-format';
import { ApplicationRow, type StatusEmailState } from '@/components/applications/application-row';
import { ApplicationFormSheet, InviteCandidateSheet, LinkExpirySheet, ShareLinkSheet } from '@/components/applications/application-sheets';
import { CompareCandidates } from '@/components/applications/compare-candidates';
import { HrAssistantButton, HrAssistantPanel, JobDescriptionSheet } from '@/components/applications/ai-assistants';
import { InterviewScheduleSheet, type ScheduleResult } from '@/components/applications/interview-schedule';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Skeleton } from '@/components/ui';
import { FontWeights, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchApplicationRows, fetchEmployees, fetchRoleCoverage, getErrorMessage, sendApplicationStatusEmail, sendInterviewInvite } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useContentWidth } from '@/lib/drawer-context';
import type { ApplicationRowData, ApplicationStatus, RoleCoverage } from '@/types/api';

const normalizeRole = (r: string) => r.trim().toLowerCase().replace(/\s+/g, ' ');

// Dashboard Applications page. Whole /applications router is OWNER /
// STORE_MANAGER / HR / ACCOUNTING (requireHROrOwner).
export default function ApplicationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const allowed = ADMIN_ROLES.includes(user?.role ?? '');

  const contentWidth = useContentWidth();
  const [width, setWidth] = useState(contentWidth);
  const wide = width >= 560;

  const [items, setItems] = useState<ApplicationRowData[] | null>(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | ''>('');
  const [refreshing, setRefreshing] = useState(false);
  const [notStartedCount, setNotStartedCount] = useState(0);
  const [roleCoverage, setRoleCoverage] = useState<RoleCoverage[]>([]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ApplicationRowData | null>(null);
  const [inviting, setInviting] = useState(false);
  const [share, setShare] = useState<ShareLink | null>(null);
  const [expiryFor, setExpiryFor] = useState<ApplicationRowData | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [comparingRole, setComparingRole] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<ApplicationRowData | null>(null);
  const [scheduleResult, setScheduleResult] = useState<ScheduleResult | null>(null);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [jobDescOpen, setJobDescOpen] = useState(false);
  const [hrOpen, setHrOpen] = useState(false);

  // Outcome email for the last Select / Reject: offered, never auto-sent.
  const [statusEmail, setStatusEmail] = useState<StatusEmailState | null>(null);
  const [resendingStatusEmail, setResendingStatusEmail] = useState(false);
  const [statusEmailError, setStatusEmailError] = useState('');

  // "Selected, onboarding not started" reminder, fetched on its own so the
  // count is right whichever status filter is active.
  const loadNotStarted = useCallback(() => {
    fetchApplicationRows('SELECTED')
      .then((rows) => setNotStartedCount(rows.filter(onboardingNotStarted).length))
      .catch(() => setNotStartedCount(0));
  }, []);

  const load = useCallback(async () => {
    setError('');
    loadNotStarted();
    try {
      setItems(await fetchApplicationRows(statusFilter || undefined));
    } catch (err: unknown) {
      setItems((prev) => prev ?? []);
      setError(getErrorMessage(err, 'Could not load applications.'));
    }
  }, [statusFilter, loadNotStarted]);

  useEffect(() => {
    if (!allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    fetchRoleCoverage().then(setRoleCoverage).catch(() => setRoleCoverage([]));
  }, [allowed]);

  // Interviewer picker for Manager Interview scheduling: fetched once, not per row.
  useEffect(() => {
    if (!allowed) return;
    fetchEmployees().then((list) => setEmployees(list.filter((e) => e.isActive).map((e) => ({ id: e.id, name: e.name })))).catch(() => setEmployees([]));
  }, [allowed]);

  const liveRoleNames = useMemo(() => roleCoverage.filter((r) => r.hasLiveTemplate).map((r) => r.roleApplied), [roleCoverage]);
  const liveRoleSet = useMemo(() => new Set(liveRoleNames.map(normalizeRole)), [liveRoleNames]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const matchesFilter = useCallback((a: ApplicationRowData) => !statusFilter || a.status === statusFilter, [statusFilter]);

  // A status change can move a row out of the active filter: drop it then.
  const updateInList = useCallback((updated: ApplicationRowData) => {
    if (updated.status === 'SELECTED') loadNotStarted();
    setItems((prev) => (prev ? prev.map((a) => (a.id === updated.id ? updated : a)).filter((a) => a.id !== updated.id || matchesFilter(a)) : prev));
  }, [loadNotStarted, matchesFilter]);

  // A status change jumps to the new status's tab so HR sees where the
  // candidate landed.
  const handleStatusChanged = useCallback((result: ApplicationRowData & { hasEmail?: boolean }) => {
    const { hasEmail, ...updated } = result;
    if (hasEmail !== undefined && (updated.status === 'SELECTED' || updated.status === 'REJECTED')) {
      setStatusEmail({ applicationId: updated.id, name: updated.name, outcome: updated.status, hasEmail, emailSent: null, sentTo: null });
      setStatusEmailError('');
    }
    if (statusFilter === updated.status) { updateInList(updated); return; }
    if (updated.status === 'SELECTED') loadNotStarted();
    setStatusFilter(updated.status);
  }, [statusFilter, updateInList, loadNotStarted]);

  const sendStatusEmail = useCallback(async () => {
    if (!statusEmail) return;
    setResendingStatusEmail(true);
    setStatusEmailError('');
    try {
      const res = await sendApplicationStatusEmail(statusEmail.applicationId);
      setStatusEmail({ ...statusEmail, ...res, hasEmail: res.hasEmail ?? statusEmail.hasEmail });
    } catch (err: unknown) {
      setStatusEmailError(getErrorMessage(err, 'Failed to resend the email.'));
    } finally {
      setResendingStatusEmail(false);
    }
  }, [statusEmail]);

  const addToList = (created: ApplicationRowData) => {
    if (matchesFilter(created)) setItems((prev) => (prev ? [created, ...prev] : [created]));
  };

  const sendInterviewLink = async (app: ApplicationRowData, hours: number) => {
    try {
      const res = await sendInterviewInvite(app.id, hours);
      setShare(candidateInviteShare('AI Interview', res, app.name));
    } catch (err: unknown) {
      Alert.alert('Could not send the interview invite', getErrorMessage(err, 'Failed to send interview invite.'));
    }
  };

  const openDetail = useCallback((a: ApplicationRowData) => setDetailId(a.id), []);
  const editApplication = useCallback((a: ApplicationRowData) => setEditing(a), []);
  const showShare = useCallback((s: ShareLink) => setShare(s), []);
  const askInterviewInvite = useCallback((a: ApplicationRowData) => {
    // A new link after a submitted interview starts a fresh interview; say so.
    if (a.aiInterviewCompletedAt) {
      Alert.alert('Send a new interview link?', `${a.name} has already submitted an interview. A new link starts a fresh interview; the previous one stays on record.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => setExpiryFor(a) },
      ]);
      return;
    }
    setExpiryFor(a);
  }, []);
  // Opens Onboarding with this candidate already selected.
  // Start Onboarding -> Pre-Joining Terms (the first step); View Candidate -> Documents. Same as the dashboard.
  const goOnboarding = useCallback((a: ApplicationRowData) => router.push({ pathname: '/more/onboarding', params: { tab: onboardingNotStarted(a) ? 'prejoining' : 'documents', userId: a.convertedUserId ?? '' } } as never), [router]);
  const openSchedule = useCallback((a: ApplicationRowData) => setScheduleFor(a), []);
  // The competency template editor lives on the Competencies screen.
  const createTemplate = useCallback((role: string) => router.push({ pathname: '/more/competencies', params: { newRole: role } } as never), [router]);
  const dismissStatusEmail = useCallback(() => setStatusEmail(null), []);

  const renderRow = useCallback(({ item }: { item: ApplicationRowData }) => (
    <View style={[styles.rowSides, wide && { borderColor: theme.border, borderLeftWidth: 1, borderRightWidth: 1 }, !wide && styles.rowCard, !wide && { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <ApplicationRow
        application={item}
        wide={wide}
        activeTab={statusFilter}
        hasLiveTemplate={!item.roleApplied || liveRoleSet.has(normalizeRole(item.roleApplied))}
        statusEmail={statusEmail && statusEmail.applicationId === item.id ? statusEmail : null}
        statusEmailError={statusEmailError}
        resendingStatusEmail={resendingStatusEmail}
        onOpen={openDetail}
        onChanged={updateInList}
        onStatusChanged={handleStatusChanged}
        onCompare={setComparingRole}
        onEdit={editApplication}
        onShare={showShare}
        onInterviewInvite={askInterviewInvite}
        onOnboarding={goOnboarding}
        onSchedule={openSchedule}
        onCreateTemplate={createTemplate}
        onSendStatusEmail={sendStatusEmail}
        onDismissStatusEmail={dismissStatusEmail}
      />
      {wide ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
    </View>
  ), [wide, theme.border, theme.backgroundElement, statusFilter, liveRoleSet, statusEmail, statusEmailError, resendingStatusEmail, openDetail, updateInList, handleStatusChanged, editApplication, showShare, askInterviewInvite, goOnboarding, openSchedule, createTemplate, sendStatusEmail, dismissStatusEmail]);

  if (!allowed) {
    return (
      <ThemedView style={styles.center}>
        <Stack.Screen options={{ title: 'Applications' }} />
        <ThemedText themeColor="textSecondary" style={styles.centerText}>Applications is available to Owner, Store Manager, HR and Accounting roles only.</ThemedText>
      </ThemedView>
    );
  }

  const pad = wide ? Spacing.four : Spacing.three;
  const detail = detailId ? items?.find((a) => a.id === detailId) ?? null : null;

  const header = (
    <View style={styles.headerWrap}>
      <View style={styles.titleRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.title}>Applications</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>
            Raw applicants, before there&apos;s an offer on the table. Selecting one creates a candidate in the Onboarding module.
          </ThemedText>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button size="sm" onPress={() => setCreating(true)}>New Application</Button>
        <Button size="sm" variant="secondary" onPress={() => setInviting(true)}>Invite Candidate</Button>
        <Button size="sm" variant="secondary" onPress={() => setJobDescOpen(true)}>Generate Job Description</Button>
        <Button size="sm" variant="secondary" disabled={!items || items.length === 0} onPress={() => setComparingRole('')}>Compare Candidates</Button>
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {notStartedCount > 0 ? (
        <View style={[styles.banner, { backgroundColor: 'rgba(230,180,60,0.1)', borderColor: 'rgba(230,180,60,0.35)' }]}>
          <ThemedText style={[styles.body, styles.flex1]}>
            <ThemedText style={[styles.body, styles.bold]}>{notStartedCount} selected candidate{notStartedCount > 1 ? 's' : ''}</ThemedText>{' '}
            {notStartedCount > 1 ? 'haven’t' : 'hasn’t'} been moved into onboarding yet — approve their Pre-Joining Terms and send the onboarding link.
          </ThemedText>
          {statusFilter !== 'SELECTED' ? <Button size="sm" variant="secondary" onPress={() => setStatusFilter('SELECTED')}>Show selected</Button> : null}
        </View>
      ) : null}

      <View style={styles.pills}>
        {(['', ...STATUSES] as const).map((s) => {
          const active = statusFilter === s;
          return (
            <Pressable
              key={s || 'all'}
              onPress={() => setStatusFilter(s)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.pill, { borderColor: active ? theme.primary : theme.border }, pressed && { opacity: 0.7 }]}>
              <ThemedText style={[styles.pillText, { color: active ? theme.primary : theme.textMuted }]}>{s === '' ? 'All' : STATUS_LABELS[s]}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {wide && items && items.length > 0 ? (
        <View style={[styles.tableHead, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.headChevron} />
          <ThemedText themeColor="textMuted" style={[styles.th, { flex: 1.4 }]}>APPLICANT</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.th, { flex: 1 }]}>ROLE</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.th, { width: 112 }]}>APPLIED</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.th, { width: 176 }]}>STATUS</ThemedText>
        </View>
      ) : null}
    </View>
  );

  const empty = items === null ? (
    <View style={styles.skeletons}>
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={96} style={styles.skeleton} />)}
    </View>
  ) : (
    <Card padding="lg"><ThemedText themeColor="textMuted" style={styles.body}>No applications yet.</ThemedText></Card>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Applications' }} />
      <FlatList
        style={{ backgroundColor: theme.background }}
        key={wide ? 'wide' : 'phone'}
        data={items ?? []}
        keyExtractor={(a) => a.id}
        renderItem={renderRow}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        windowSize={7}
        contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + Spacing.four }}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={wide ? undefined : Separator}
        ListFooterComponent={wide && items && items.length > 0 ? <View style={[styles.tableEnd, { borderColor: theme.border }]} /> : null}
      />

      {creating ? <ApplicationFormSheet application={null} liveRoleNames={liveRoleNames} onClose={() => setCreating(false)} onSaved={(a) => { addToList(a); setCreating(false); }} /> : null}
      {editing ? <ApplicationFormSheet application={editing} liveRoleNames={liveRoleNames} onClose={() => setEditing(null)} onSaved={(a) => { updateInList(a); setEditing(null); }} /> : null}
      {inviting ? (
        <InviteCandidateSheet
          onClose={() => setInviting(false)}
          onCreated={(result) => {
            addToList(result.application);
            setShare(applicationInviteShare(result, false));
            setInviting(false);
          }}
        />
      ) : null}
      {share ? <ShareLinkSheet share={share} onClose={() => setShare(null)} /> : null}
      {expiryFor ? (
        <LinkExpirySheet
          title="Generate AI Interview Link"
          description={`Choose how long ${expiryFor.name}'s AI interview link stays usable. After that, opening it shows "This link has expired" and you'd send a new one.${expiryFor.aiInterviewQuestions ? ' Generating again replaces the previous link.' : ''}`}
          confirmLabel="Generate link"
          onClose={() => setExpiryFor(null)}
          onConfirm={(hours) => { const app = expiryFor; setExpiryFor(null); sendInterviewLink(app, hours); }}
        />
      ) : null}
      {detail ? (
        <ApplicationDetail
          application={detail}
          onClose={() => setDetailId(null)}
          onChanged={updateInList}
          onOpenScheduleForm={() => setScheduleFor(detail)}
          scheduleResult={scheduleResult}
          onScheduleResult={setScheduleResult}
        />
      ) : null}
      {scheduleFor ? (
        <InterviewScheduleSheet
          application={scheduleFor}
          employees={employees}
          existing={(scheduleFor.interviewSchedules ?? []).find((sc) => sc.status === 'SCHEDULED') ?? null}
          onCancel={() => setScheduleFor(null)}
          onDone={(a, result) => { updateInList(a); setScheduleResult(result); setScheduleFor(null); setDetailId(a.id); }}
        />
      ) : null}
      {comparingRole !== null ? (
        <CompareCandidates
          initialRole={comparingRole}
          roles={Array.from(new Set((items ?? []).map((a) => a.roleApplied).filter((r): r is string => !!r))).sort((x, y) => x.localeCompare(y))}
          onClose={() => { setComparingRole(null); load(); }}
        />
      ) : null}
      {jobDescOpen ? <JobDescriptionSheet onClose={() => setJobDescOpen(false)} /> : null}
      {hrOpen ? <HrAssistantPanel onClose={() => setHrOpen(false)} /> : null}
      {!hrOpen ? <HrAssistantButton onPress={() => setHrOpen(true)} bottom={insets.bottom + 16} /> : null}
    </ThemedView>
  );
}

function Separator() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  centerText: { textAlign: 'center' },
  headerWrap: { gap: Spacing.three, marginBottom: Spacing.three },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: 16, borderWidth: 1, borderRadius: Radii.md },
  body: { fontSize: 14, lineHeight: 20 },
  bold: { fontFamily: FontWeights.semiBold },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 36, paddingHorizontal: 12, borderRadius: Radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderTopLeftRadius: Radii.md, borderTopRightRadius: Radii.md },
  headChevron: { width: 14 },
  th: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.8 },
  rowSides: {},
  rowCard: { borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth },
  sep: { height: Spacing.three },
  tableEnd: { height: 0, borderBottomWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomLeftRadius: Radii.md, borderBottomRightRadius: Radii.md },
  skeletons: { gap: Spacing.three },
  skeleton: { borderRadius: Radii.md },
});
