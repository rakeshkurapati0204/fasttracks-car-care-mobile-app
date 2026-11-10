import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fmtDate } from '@/components/applications/application-format';
import { getAvatarColor, getInitials } from '@/components/employees/employee-format';
import {
  CANDIDATE_METRIC_COPY, LETTER_TYPE_BADGE, LETTER_TYPE_LABELS, MILESTONE_LABELS, STAT_AMBER, STAT_INDIGO, STAT_RED, STAT_SKY,
  waitingLabel, type OverviewTarget,
} from '@/components/onboarding/onboarding-format';
import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner, OverviewStat, OverviewStatSkeleton } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchAllLetters, fetchCandidateOverviewCounts, fetchCandidateOverviewList, fetchCheckInOverviewCounts, fetchLettersCount,
  fetchOnboardingOverview, fetchProbationCheckIns, getErrorMessage,
} from '@/lib/api';
import type {
  CandidateOverviewCounts, CandidateOverviewListItem, CandidateOverviewMetric, IssuedLetterSummary, OnboardingEmployee,
  OnboardingOverviewItem, ProbationCheckIn,
} from '@/types/api';

const WIDE_MIN = 560;

type Drill = 'employees' | CandidateOverviewMetric | 'onboardingProgress' | 'lettersIssued' | 'checkinsUpcoming' | 'checkinsOverdue' | null;

type Props = {
  employees: OnboardingEmployee[];
  onOpen: (target: OverviewTarget) => void;
  onViewDetails: (userId: string) => void;
  /** Bumped by the page's pull-to-refresh. */
  refreshKey: number;
};

// Same nine cards, colours and hints as the dashboard's OverviewTab. Each card
// opens a bottom sheet listing the records behind its number.
export function OverviewTab({ employees, onOpen, onViewDetails, refreshKey }: Props) {
  const [width, setWidth] = useState(0);
  const [drill, setDrill] = useState<Drill>(null);
  const [onboardingCount, setOnboardingCount] = useState<number | null>(null);
  const [lettersCount, setLettersCount] = useState<number | null>(null);
  const [pipeline, setPipeline] = useState<CandidateOverviewCounts | null>(null);
  const [checkIns, setCheckIns] = useState<{ overdue: number; upcoming: number } | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const [ob, letters, cand, chk] = await Promise.allSettled([
      fetchOnboardingOverview(), fetchLettersCount(), fetchCandidateOverviewCounts(), fetchCheckInOverviewCounts(),
    ]);
    // Like the dashboard, a failed count falls back to 0; the banner says so.
    setOnboardingCount(ob.status === 'fulfilled' ? ob.value.length : 0);
    setLettersCount(letters.status === 'fulfilled' ? letters.value : 0);
    setPipeline(cand.status === 'fulfilled' ? cand.value : { inPipeline: 0, pendingVerification: 0, rejectedAwaitingReupload: 0, overdue: 0 });
    setCheckIns(chk.status === 'fulfilled' ? chk.value : { overdue: 0, upcoming: 0 });
    setFailed([ob, letters, cand, chk].some((r) => r.status === 'rejected'));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and on pull-to-refresh
    load();
  }, [load, refreshKey]);

  const cols = width >= WIDE_MIN ? 3 : 2;
  const loading = onboardingCount === null;

  const cards: { label: string; value: number | null; color?: string; hint: string; drill: Drill }[] = [
    { label: 'Active Employees', value: employees.length, hint: 'View employees', drill: 'employees' },
    { label: 'Onboarding In Progress', value: onboardingCount, color: STAT_AMBER, hint: 'View checklists', drill: 'onboardingProgress' },
    { label: 'Letters Issued', value: lettersCount, color: STAT_INDIGO, hint: 'View letters', drill: 'lettersIssued' },
    { label: 'Candidates in Pipeline', value: pipeline?.inPipeline ?? null, color: STAT_SKY, hint: 'View candidates', drill: 'inPipeline' },
    { label: 'Pending HR Verification', value: pipeline?.pendingVerification ?? null, color: STAT_AMBER, hint: 'View candidates', drill: 'pendingVerification' },
    { label: 'Rejected Docs Awaiting Re-upload', value: pipeline?.rejectedAwaitingReupload ?? null, color: STAT_RED, hint: 'View candidates', drill: 'rejectedAwaitingReupload' },
    { label: 'Overdue Onboarding', value: pipeline?.overdue ?? null, color: STAT_RED, hint: 'View candidates', drill: 'overdue' },
    { label: 'Upcoming Check-ins', value: checkIns?.upcoming ?? null, color: STAT_AMBER, hint: 'View check-ins', drill: 'checkinsUpcoming' },
    { label: 'Overdue Check-ins', value: checkIns?.overdue ?? null, color: STAT_RED, hint: 'View check-ins', drill: 'checkinsOverdue' },
  ];

  const rows: (typeof cards)[] = [];
  for (let i = 0; i < cards.length; i += cols) rows.push(cards.slice(i, i + cols));

  const close = () => setDrill(null);
  const go = (t: OverviewTarget) => { setDrill(null); onOpen(t); };

  return (
    <View style={styles.stack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {failed ? <ErrorBanner message="Some counts could not be loaded." onRetry={load} /> : null}
      <View style={styles.grid}>
        {rows.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((c) => (
              <View key={c.label} style={styles.cell}>
                {loading ? (
                  <OverviewStatSkeleton />
                ) : (
                  <Pressable onPress={() => setDrill(c.drill)} accessibilityRole="button" accessibilityLabel={`${c.label}: ${c.value ?? 'unknown'}. ${c.hint}`} style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}>
                    <OverviewStat label={c.label} value={c.value ?? '—'} color={c.color} sub={`${c.hint} →`} />
                  </Pressable>
                )}
              </View>
            ))}
            {Array.from({ length: cols - row.length }).map((_, k) => <View key={`pad-${k}`} style={styles.cell} />)}
          </View>
        ))}
      </View>

      {drill === 'employees' ? <ActiveEmployeesSheet employees={employees} onClose={close} onOpen={go} onViewDetails={(id) => { setDrill(null); onViewDetails(id); }} /> : null}
      {drill === 'onboardingProgress' ? <OnboardingProgressSheet onClose={close} onOpen={go} /> : null}
      {drill === 'lettersIssued' ? <LettersIssuedSheet onClose={close} onOpen={go} /> : null}
      {drill === 'checkinsUpcoming' ? <CheckInsListSheet status="DUE_SOON" onClose={close} onOpen={go} /> : null}
      {drill === 'checkinsOverdue' ? <CheckInsListSheet status="OVERDUE" onClose={close} onOpen={go} /> : null}
      {drill === 'inPipeline' || drill === 'pendingVerification' || drill === 'rejectedAwaitingReupload' || drill === 'overdue' ? (
        <CandidateMetricSheet metric={drill} onClose={close} onOpen={go} />
      ) : null}
    </View>
  );
}

// ── Sheet plumbing ───────────────────────────────────────────────────────────

// Loads a list when its sheet opens; the sheet is mounted only while open.
function useSheetData<T>(fetcher: () => Promise<T>, failMessage: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setData(await fetcher()); } catch (err: unknown) { setError(getErrorMessage(err, failMessage)); }
  }, [fetcher, failMessage]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    load();
  }, [load]);
  return { data, error, load };
}

function ListSheet({ title, onClose, loading, error, onRetry, empty, isEmpty, children }: {
  title: string; onClose: () => void; loading: boolean; error: string | null; onRetry: () => void; empty: string; isEmpty: boolean; children: ReactNode;
}) {
  return (
    <Sheet visible onClose={onClose} title={title} footer={<Button style={styles.flex1} variant="secondary" onPress={onClose}>Close</Button>}>
      {error ? <ErrorBanner message={error} onRetry={onRetry} /> : null}
      {loading && !error ? <><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></> : null}
      {!loading && !error && isEmpty ? <ThemedText themeColor="textMuted" style={styles.body}>{empty}</ThemedText> : null}
      {!loading && !error && !isEmpty ? children : null}
    </Sheet>
  );
}

function Row({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.rowMain}>{children}</View>
      {action}
    </View>
  );
}

const Muted = ({ children, color }: { children: ReactNode; color?: string }) => (
  <ThemedText themeColor="textMuted" style={[styles.small, color ? { color } : null]}>{children}</ThemedText>
);

// ── Active Employees ─────────────────────────────────────────────────────────
const GO_TO = [
  { value: 'employment', label: 'Employment & Role' },
  { value: 'prejoining', label: 'Pre-Joining Terms' },
  { value: 'letters', label: 'Letters' },
  { value: 'documents', label: 'Documents' },
  { value: 'onboarding', label: 'Onboarding Checklist' },
  { value: 'verification', label: 'Verification' },
  { value: 'checkins', label: 'Check-ins' },
];

function ActiveEmployeesSheet({ employees, onClose, onOpen, onViewDetails }: {
  employees: OnboardingEmployee[]; onClose: () => void; onOpen: (t: OverviewTarget) => void; onViewDetails: (id: string) => void;
}) {
  const theme = useTheme();
  const sorted = [...employees].sort((a, b) => a.name.localeCompare(b.name));
  const open = (id: string, tab: string) => {
    if (tab === 'verification') onOpen({ tab: 'verification' });
    else if (tab === 'checkins') onOpen({ tab: 'checkins', checkInFilter: 'ALL', userId: id });
    else if (tab === 'letters' || tab === 'prejoining' || tab === 'onboarding') onOpen({ tab, userId: id });
    else if (tab === 'employment' || tab === 'documents') onOpen({ tab, userId: id });
  };
  return (
    <Sheet visible onClose={onClose} title={`Active Employees (${employees.length})`} footer={<Button style={styles.flex1} variant="secondary" onPress={onClose}>Close</Button>}>
      {sorted.length === 0 ? <ThemedText themeColor="textMuted" style={styles.body}>No active employees.</ThemedText> : null}
      {sorted.map((e) => (
        <View key={e.id} style={[styles.row, styles.rowCol, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <View style={styles.person}>
            <View style={[styles.avatar, { backgroundColor: getAvatarColor(e.name) }]}><ThemedText style={styles.initials}>{getInitials(e.name)}</ThemedText></View>
            <View style={styles.rowMain}>
              <ThemedText style={styles.name} numberOfLines={1}>{e.name}{e.employeeId ? ` (${e.employeeId})` : ''}</ThemedText>
              <Muted>{[e.designation, e.role].filter(Boolean).join(' · ')}</Muted>
            </View>
          </View>
          <View style={styles.actions}>
            <Button size="sm" onPress={() => onViewDetails(e.id)}>View details</Button>
            <View style={styles.flex1}>
              <Select compact placeholder="Go to…" options={GO_TO} value="" onChange={(v) => open(e.id, v)} />
            </View>
          </View>
        </View>
      ))}
    </Sheet>
  );
}

// ── Candidates behind the four pipeline cards ────────────────────────────────
function CandidateMetricSheet({ metric, onClose, onOpen }: { metric: CandidateOverviewMetric; onClose: () => void; onOpen: (t: OverviewTarget) => void }) {
  const theme = useTheme();
  const copy = CANDIDATE_METRIC_COPY[metric];
  const fetcher = useCallback(() => fetchCandidateOverviewList(metric), [metric]);
  const { data, error, load } = useSheetData<CandidateOverviewListItem[]>(fetcher, 'Could not load candidates.');
  return (
    <ListSheet title={copy.title} onClose={onClose} loading={data === null} error={error} onRetry={load} empty={copy.empty} isEmpty={!data || data.length === 0}>
      {(data ?? []).map((c) => (
        <Row key={c.id} action={<Button size="sm" variant="secondary" onPress={() => onOpen(copy.goTo === 'verification' ? { tab: 'verification' } : { tab: 'documents', userId: c.id })}>{copy.action}</Button>}>
          <View style={styles.nameLine}>
            <ThemedText style={[styles.name, styles.flexShrink]} numberOfLines={1}>{c.name}</ThemedText>
            <Badge size="sm" variant={c.onboardingStatus === 'HR_REVIEW' ? 'success' : 'primary'}>{c.onboardingStatus.replace('_', ' ')}</Badge>
          </View>
          <Muted color={metric === 'overdue' ? theme.danger : undefined}>{waitingLabel(c.daysWaiting, c.waitingOn)}</Muted>
          {c.rejectedDocuments.length > 0 ? <Muted color={theme.danger}>{`Rejected: ${c.rejectedDocuments.join(', ')}`}</Muted> : null}
          {c.personalEmail || c.personalPhone ? <Muted>{[c.personalEmail, c.personalPhone].filter(Boolean).join(' · ')}</Muted> : null}
        </Row>
      ))}
    </ListSheet>
  );
}

// ── Onboarding In Progress ───────────────────────────────────────────────────
function OnboardingProgressSheet({ onClose, onOpen }: { onClose: () => void; onOpen: (t: OverviewTarget) => void }) {
  const { data, error, load } = useSheetData<OnboardingOverviewItem[]>(fetchOnboardingOverview, 'Could not load onboarding checklists.');
  return (
    <ListSheet title={`Onboarding In Progress${data ? ` (${data.length})` : ''}`} onClose={onClose} loading={data === null} error={error} onRetry={load} empty="No onboarding checklists in progress." isEmpty={!data || data.length === 0}>
      {(data ?? []).map((c) => {
        const pct = c.totalTasks ? Math.round((c.completedTasks / c.totalTasks) * 100) : 0;
        return (
          <Row key={c.id} action={<Button size="sm" variant="secondary" onPress={() => onOpen({ tab: 'onboarding', userId: c.userId })}>Onboarding Checklist</Button>}>
            <ThemedText style={styles.name} numberOfLines={1}>{c.user.name}{c.user.employeeId ? ` (${c.user.employeeId})` : ''}</ThemedText>
            <Muted>{`${c.completedTasks}/${c.totalTasks} tasks (${pct}%) · started ${fmtDate(c.createdAt)}`}</Muted>
          </Row>
        );
      })}
    </ListSheet>
  );
}

// ── Letters Issued ───────────────────────────────────────────────────────────
function LettersIssuedSheet({ onClose, onOpen }: { onClose: () => void; onOpen: (t: OverviewTarget) => void }) {
  const { data, error, load } = useSheetData<IssuedLetterSummary[]>(fetchAllLetters, 'Could not load letters.');
  return (
    <ListSheet title={`Letters Issued${data ? ` (${data.length})` : ''}`} onClose={onClose} loading={data === null} error={error} onRetry={load} empty="No letters issued yet." isEmpty={!data || data.length === 0}>
      {(data ?? []).map((l) => (
        <Row key={l.id} action={<Button size="sm" variant="secondary" onPress={() => onOpen({ tab: 'letters', userId: l.userId })}>Letters</Button>}>
          <View style={styles.nameLine}>
            <ThemedText style={[styles.name, styles.flexShrink]} numberOfLines={1}>{l.user.name}{l.user.employeeId ? ` (${l.user.employeeId})` : ''}</ThemedText>
            <Badge size="sm" variant={LETTER_TYPE_BADGE[l.type]}>{LETTER_TYPE_LABELS[l.type]}</Badge>
          </View>
          <Muted>{`Issued ${fmtDate(l.issuedAt)} by ${l.issuedBy.name}`}</Muted>
        </Row>
      ))}
    </ListSheet>
  );
}

// ── Upcoming / Overdue Check-ins ─────────────────────────────────────────────
function CheckInsListSheet({ status, onClose, onOpen }: { status: 'DUE_SOON' | 'OVERDUE'; onClose: () => void; onOpen: (t: OverviewTarget) => void }) {
  const fetcher = useCallback(async () => (await fetchProbationCheckIns()).filter((c) => c.status === status), [status]);
  const { data, error, load } = useSheetData<ProbationCheckIn[]>(fetcher, 'Could not load check-ins.');
  const overdue = status === 'OVERDUE';
  return (
    <ListSheet title={overdue ? 'Overdue Check-ins' : 'Upcoming Check-ins'} onClose={onClose} loading={data === null} error={error} onRetry={load} empty={overdue ? 'No overdue check-ins.' : 'No check-ins due soon.'} isEmpty={!data || data.length === 0}>
      {(data ?? []).map((r) => (
        <Row key={`${r.userId}-${r.milestone}`} action={<Button size="sm" variant="secondary" onPress={() => onOpen({ tab: 'checkins', checkInFilter: status, userId: r.userId, milestone: r.milestone })}>Check-ins</Button>}>
          <View style={styles.nameLine}>
            <ThemedText style={[styles.name, styles.flexShrink]} numberOfLines={1}>{r.employee.name}{r.employee.employeeId ? ` (${r.employee.employeeId})` : ''}</ThemedText>
            <Badge size="sm" variant="warning">{MILESTONE_LABELS[r.milestone]}</Badge>
          </View>
          <Muted>{`Due ${fmtDate(r.dueDate)}${r.reportingManager ? ` · Manager: ${r.reportingManager.name}` : ''}`}</Muted>
        </Row>
      ))}
    </ListSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1 },
  flex1: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: 12, borderWidth: 1, borderRadius: Radii.md },
  rowCol: { flexDirection: 'column', alignItems: 'stretch' },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
