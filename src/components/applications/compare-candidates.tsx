import { Ionicons } from '@expo/vector-icons';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fmtDate, scoreVariant, STATUS_BADGE_VARIANT, STATUS_LABELS } from '@/components/applications/application-format';
import { isDegradedScreening } from '@/components/applications/scoring';
import { findCoverageWarning } from '@/components/applications/scorecard-panel';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCandidateComparisonFull, getErrorMessage } from '@/lib/api';
import type { AiFullScorecard, AiScreeningResult, CompareCandidateFull } from '@/types/api';

type SortKey = 'name' | 'screening' | 'interview' | 'assignment';

const COL = { name: 150, status: 120, screening: 130, interview: 190, assignment: 170 } as const;

const screeningScoreOf = (r: AiScreeningResult | null) => (r && !isDegradedScreening(r) ? r.fitScore : null);

// One score cell: "Not yet completed", a score badge, the ARIA "answered n of
// m" caption, the coverage warning and the completion date.
function ScoreCell({ score, completedAt, label, notEnoughData, caption, coverageWarning }: {
  score: number | null; completedAt: string | null; label: string; notEnoughData?: boolean; caption?: string;
  coverageWarning?: { name: string; weightage: number; coveragePct: number } | null;
}) {
  const theme = useTheme();
  if (score === null) return <ThemedText themeColor="textMuted" style={[styles.small, styles.italic]}>Not yet completed</ThemedText>;
  return (
    <View style={styles.tight}>
      {notEnoughData ? <Badge size="sm" variant="warning">Not enough data</Badge> : <Badge size="sm" variant={scoreVariant(score)}>{label}: {score}</Badge>}
      {caption ? <ThemedText themeColor="textMuted" style={styles.tiny}>{caption}</ThemedText> : null}
      {coverageWarning ? (
        <>
          <ThemedText style={[styles.tiny, { color: theme.danger }]}>Key competency not answered: {coverageWarning.name} ({coverageWarning.weightage}%)</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.tiny}>Answered competencies cover {coverageWarning.coveragePct}% of total weight.</ThemedText>
        </>
      ) : null}
      <ThemedText themeColor="textMuted" style={styles.tiny}>{fmtDate(completedAt)}</ThemedText>
    </View>
  );
}

function Breakdown({ title, scorecard }: { title: string; scorecard: AiFullScorecard }) {
  const theme = useTheme();
  return (
    <View style={styles.list}>
      <ThemedText themeColor="textMuted" style={styles.heading}>{title.toUpperCase()}</ThemedText>
      {scorecard.competencyScores.map((s) => (
        <View key={s.competencyId} style={styles.scoreRow}>
          <ThemedText style={[styles.small, styles.flex1]}>{s.name} <ThemedText themeColor="textMuted" style={styles.small}>({s.weightage}%)</ThemedText></ThemedText>
          {s.covered === false ? (
            <ThemedText themeColor="textMuted" style={styles.small}>Not covered</ThemedText>
          ) : s.answered === false ? (
            <ThemedText themeColor="textMuted" style={styles.small}>Not answered</ThemedText>
          ) : (
            <View style={styles.bar}>
              <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, s.score))}%`, backgroundColor: theme.primary }]} /></View>
              <ThemedText themeColor="textSecondary" style={styles.small}>{s.score}</ThemedText>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

type Props = { initialRole: string; roles: string[]; onClose: () => void };

// Dashboard CompareCandidatesModal: pick a role, compare its active
// candidates across screening / interview / assignment, sortable, with a
// per-competency breakdown. Scores are only comparable within one role.
export function CompareCandidates({ initialRole, roles, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [role, setRole] = useState(initialRole);
  const [candidates, setCandidates] = useState<CompareCandidateFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('interview');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!role.trim()) { setCandidates([]); return; }
    setLoading(true);
    setError('');
    try {
      setCandidates(await fetchCandidateComparisonFull(role.trim()));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load comparison.'));
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on role change
    load();
  }, [load]);

  const scoreOf = (c: CompareCandidateFull, key: SortKey): number | null => {
    if (key === 'screening') return screeningScoreOf(c.aiScreeningResult);
    if (key === 'interview') {
      const sc = c.aiInterviewScorecard;
      // ARIA "Not enough data" sorts like an incomplete interview, never like a real 0.
      if (!sc || sc.answeredCount === 0) return null;
      return sc.weightedOverallScore;
    }
    if (key === 'assignment') return c.aiAssignmentScorecard?.weightedOverallScore ?? null;
    return null;
  };

  // Nulls always sort last, whichever direction.
  const sorted = [...candidates].sort((a, b) => {
    if (sortKey === 'name') return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    const av = scoreOf(a, sortKey);
    const bv = scoreOf(b, sortKey);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const head = (label: string, key: SortKey, width: number) => (
    <Pressable onPress={() => toggleSort(key)} accessibilityRole="button" style={{ width }}>
      <ThemedText style={[styles.heading, { color: sortKey === key ? theme.primary : theme.textMuted }]}>{label.toUpperCase()}{sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</ThemedText>
    </Pressable>
  );

  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedText style={styles.title}>Compare Candidates</ThemedText>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
            <Ionicons name="close" size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <Select label="Role" placeholder="Select a role…" options={roles.map((r) => ({ value: r, label: r }))} value={role} onChange={setRole} />
          <ThemedText themeColor="textMuted" style={styles.small}>
            Scores are comparable only within the same role — competency templates (and every weighted score) are role-specific.
          </ThemedText>

          {error ? <View style={[styles.errorBox, { backgroundColor: 'rgba(224,104,104,0.1)' }]}><ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText></View> : null}

          {!role ? (
            <ThemedText themeColor="textMuted" style={styles.body}>Choose a role above to compare its candidates.</ThemedText>
          ) : loading ? (
            <ThemedText themeColor="textMuted" style={styles.body}>Loading…</ThemedText>
          ) : candidates.length === 0 ? (
            <ThemedText themeColor="textMuted" style={styles.body}>No active (non-rejected, non-converted) candidates for this role.</ThemedText>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={[styles.tr, { borderBottomColor: theme.border }]}>
                  {head('Candidate', 'name', COL.name)}
                  <View style={{ width: COL.status }}><ThemedText themeColor="textMuted" style={styles.heading}>STATUS</ThemedText></View>
                  {head('Screening', 'screening', COL.screening)}
                  {head('Interview', 'interview', COL.interview)}
                  {head('Assignment', 'assignment', COL.assignment)}
                </View>
                {sorted.map((c) => {
                  const showInterview = !!expanded[`${c.id}-interview`] && !!c.aiInterviewScorecard;
                  const showAssignment = !!expanded[`${c.id}-assignment`] && !!c.aiAssignmentScorecard;
                  const isc = c.aiInterviewScorecard;
                  const notEnough = isc?.answeredCount === 0;
                  const caption = typeof isc?.answeredCount === 'number' && typeof isc?.totalCompetencies === 'number' ? `Answered ${isc.answeredCount} of ${isc.totalCompetencies}` : undefined;
                  const latest = c.interviewInvites[0];
                  const violationCount = (latest?.proctoringEvents ?? []).filter((e) => e.type === 'VIOLATION').length;
                  const terminated = latest?.terminationReason === 'proctoring: 3 violations';
                  const violationBadge = latest?.engine === 'ARIA' && (terminated || violationCount > 0) ? (terminated ? 'Terminated' : `${violationCount} screen violation${violationCount > 1 ? 's' : ''}`) : null;
                  return (
                    <Fragment key={c.id}>
                      <View style={[styles.tr, styles.trTop, { borderBottomColor: theme.border }]}>
                        <ThemedText style={[styles.body, styles.medium, { width: COL.name }]}>{c.name}</ThemedText>
                        <View style={{ width: COL.status }}><Badge size="sm" variant={STATUS_BADGE_VARIANT[c.status]}>{STATUS_LABELS[c.status]}</Badge></View>
                        <View style={{ width: COL.screening }}>
                          <ScoreCell score={screeningScoreOf(c.aiScreeningResult)} completedAt={c.aiScreenedAt} label="Fit" />
                        </View>
                        <View style={{ width: COL.interview, gap: 4 }}>
                          <ScoreCell
                            score={isc?.weightedOverallScore ?? null}
                            completedAt={c.aiInterviewCompletedAt}
                            label="Overall"
                            notEnoughData={notEnough}
                            caption={caption}
                            coverageWarning={isc ? findCoverageWarning(isc) : null}
                          />
                          {violationBadge ? <Badge size="sm" variant="danger">{violationBadge}</Badge> : null}
                          {isc ? (
                            <Pressable onPress={() => toggle(`${c.id}-interview`)} hitSlop={8}>
                              <ThemedText themeColor="textMuted" style={[styles.small, styles.underline]}>{expanded[`${c.id}-interview`] ? 'Hide breakdown' : 'Show breakdown'}</ThemedText>
                            </Pressable>
                          ) : null}
                        </View>
                        <View style={{ width: COL.assignment, gap: 4 }}>
                          <ScoreCell
                            score={c.aiAssignmentScorecard?.weightedOverallScore ?? null}
                            completedAt={c.aiAssignmentCompletedAt}
                            label="Overall"
                            coverageWarning={c.aiAssignmentScorecard ? findCoverageWarning(c.aiAssignmentScorecard) : null}
                          />
                          {c.aiAssignmentScorecard ? (
                            <Pressable onPress={() => toggle(`${c.id}-assignment`)} hitSlop={8}>
                              <ThemedText themeColor="textMuted" style={[styles.small, styles.underline]}>{expanded[`${c.id}-assignment`] ? 'Hide breakdown' : 'Show breakdown'}</ThemedText>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                      {showInterview || showAssignment ? (
                        <View style={[styles.breakdown, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
                          {showInterview && c.aiInterviewScorecard ? <Breakdown title="Interview breakdown" scorecard={c.aiInterviewScorecard} /> : null}
                          {showAssignment && c.aiAssignmentScorecard ? <Breakdown title="Assignment breakdown" scorecard={c.aiAssignmentScorecard} /> : null}
                        </View>
                      ) : null}
                    </Fragment>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <View style={styles.end}><Button size="sm" variant="secondary" onPress={onClose}>Close</Button></View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, minHeight: 56, borderBottomWidth: 1 },
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 16 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 10, lineHeight: 14 },
  body: { fontSize: 14, lineHeight: 20 },
  medium: { fontFamily: FontWeights.medium },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  heading: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.8 },
  tight: { gap: 2 },
  list: { gap: 6 },
  errorBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  trTop: { alignItems: 'flex-start' },
  breakdown: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, minWidth: 760 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 280 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 130 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  end: { alignItems: 'flex-end' },
});
