import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fmtDateTime, scoreVariant } from '@/components/applications/application-format';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { downloadAnswerRecording, downloadInterviewRecording, getErrorMessage } from '@/lib/api';
import type { AiFullScorecard, AiInterviewInviteFull, AriaProctoringEvent, AriaTranscriptTurn, ApplicationRowData } from '@/types/api';

const TIME_OPTS = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' } as const;

// Second-precision time of day, only for Aria's proctoring / transcript rows.
function fmtTimeWithSeconds(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', TIME_OPTS);
}

function fmtGap(fromIso: string, toIso?: string): string {
  if (!toIso) return 'did not return before the next event';
  const secs = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000));
  return secs < 60 ? `away ${secs}s` : `away ${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// Dashboard findCoverageWarning: flags a never-answered competency that is
// >= 25% of the weight or the single heaviest one.
export function findCoverageWarning(scorecard: Pick<AiFullScorecard, 'competencyScores'>) {
  const scores = scorecard.competencyScores;
  if (!scores || scores.length === 0) return null;
  const totalWeight = scores.reduce((sum, c) => sum + c.weightage, 0);
  if (totalWeight <= 0) return null;
  const isAnswered = (c: { covered?: boolean; answered?: boolean }) => c.covered !== false && c.answered !== false;
  const notAnswered = scores.filter((c) => !isAnswered(c));
  if (notAnswered.length === 0) return null;
  const topWeight = Math.max(...scores.map((c) => c.weightage));
  const qualifying = notAnswered.filter((c) => c.weightage >= 25 || c.weightage === topWeight);
  if (qualifying.length === 0) return null;
  const worst = qualifying.reduce((a, b) => (b.weightage > a.weightage ? b : a));
  const answeredWeight = scores.filter(isAnswered).reduce((sum, c) => sum + c.weightage, 0);
  return { name: worst.name, weightage: worst.weightage, coveragePct: Math.round((answeredWeight / totalWeight) * 100) };
}

export function CoverageWarning({ scorecard, small }: { scorecard: Pick<AiFullScorecard, 'competencyScores'>; small?: boolean }) {
  const theme = useTheme();
  const warning = findCoverageWarning(scorecard);
  if (!warning) return null;
  const size = small ? styles.tiny : styles.small;
  return (
    <View style={styles.tight}>
      <ThemedText style={[size, { color: theme.danger }]}>Key competency not answered: {warning.name} ({warning.weightage}%)</ThemedText>
      <ThemedText themeColor="textMuted" style={size}>Answered competencies cover {warning.coveragePct}% of total weight.</ThemedText>
    </View>
  );
}

// "View details ▾" / "Hide details ▴".
export function CollapseToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} hitSlop={8} accessibilityRole="button" accessibilityState={{ expanded }}>
      <ThemedText themeColor="textMuted" style={[styles.small, styles.underline, styles.medium]}>{expanded ? 'Hide details ▴' : 'View details ▾'}</ThemedText>
    </Pressable>
  );
}

// Shared by the latest attempt and each "Previous attempts" entry.
export function CompetencyScoreList({ scorecard }: { scorecard: Pick<AiFullScorecard, 'competencyScores'> }) {
  const theme = useTheme();
  return (
    <View style={styles.list}>
      {scorecard.competencyScores.map((c) => (
        <View key={c.competencyId} style={styles.scoreRow}>
          <ThemedText style={[styles.small, styles.flex1]}>
            {c.name} <ThemedText themeColor="textMuted" style={styles.small}>({c.weightage}% weight)</ThemedText>
          </ThemedText>
          {c.covered === false ? (
            <ThemedText themeColor="textMuted" style={styles.small}>Not covered</ThemedText>
          ) : c.answered === false ? (
            <ThemedText themeColor="textMuted" style={styles.small}>Not answered</ThemedText>
          ) : (
            <View style={styles.barWrap}>
              <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, c.score))}%`, backgroundColor: theme.primary }]} />
              </View>
              <ThemedText themeColor="textSecondary" style={styles.small}>{c.score}</ThemedText>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function Box({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <ThemedText themeColor="textSecondary" style={[styles.small, styles.semibold]}>
        {title}
        {note ? <ThemedText themeColor="textMuted" style={[styles.small, styles.regular]}> — {note}</ThemedText> : null}
      </ThemedText>
      {children}
    </View>
  );
}

// Plays a downloaded clip. expo-audio plays the audio track; video frames
// (camera / screen recordings) are not shown in the app.
export function AudioClip({ uri }: { uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return (
    <View style={styles.clip}>
      <Button size="sm" variant="secondary" icon={status.playing ? 'pause' : 'play'} onPress={() => (status.playing ? player.pause() : player.play())}>
        {status.playing ? 'Pause' : 'Play'}
      </Button>
      <ThemedText themeColor="textMuted" style={styles.small}>{fmt(status.currentTime)} / {fmt(status.duration || 0)}</ThemedText>
    </View>
  );
}

export function AriaTranscriptBlock({ transcript, inProgress, applicationId, inviteId }: { transcript: AriaTranscriptTurn[]; inProgress: boolean; applicationId?: string; inviteId?: string }) {
  const theme = useTheme();
  const [clips, setClips] = useState<Record<number, string>>({});
  const [loadingTurn, setLoadingTurn] = useState<number | null>(null);

  const loadClip = async (turnIndex: number) => {
    if (!applicationId || !inviteId || clips[turnIndex]) return;
    setLoadingTurn(turnIndex);
    try {
      const uri = await downloadAnswerRecording(applicationId, inviteId, turnIndex);
      setClips((p) => ({ ...p, [turnIndex]: uri }));
    } catch {
      /* best-effort: HR can tap play again */
    } finally {
      setLoadingTurn(null);
    }
  };

  return (
    <Box title="Conversation with Aria" note={inProgress ? 'still in progress' : undefined}>
      <View style={styles.list}>
        {transcript.filter((t) => t.kind !== 'intro').map((t, i) => (
          <View key={i}>
            <ThemedText themeColor="textSecondary" style={styles.small}>
              <ThemedText themeColor="textMuted" style={[styles.small, styles.mono]}>{fmtTimeWithSeconds(t.timestamp)}</ThemedText>{' '}
              <ThemedText style={[styles.small, styles.semibold, { color: t.role === 'aria' ? theme.primary : theme.text }]}>{t.role === 'aria' ? 'Aria' : 'Candidate'}:</ThemedText> {t.text}
            </ThemedText>
            <View style={styles.badges}>
              {t.isRepeatRequest ? <Badge size="sm" variant="secondary">Repeat request</Badge> : null}
              {t.isSkip ? <Badge size="sm" variant="warning">Skipped</Badge> : null}
              {t.isEmpty ? <Badge size="sm" variant="secondary">No speech heard</Badge> : null}
              {typeof t.sttConfidence === 'number' && t.sttConfidence < 0.5 ? <Badge size="sm" variant="warning">Low transcription confidence</Badge> : null}
            </View>
            {t.answerAudioBlobName && applicationId && inviteId ? (
              clips[t.turnIndex] ? (
                <AudioClip uri={clips[t.turnIndex]} />
              ) : (
                <Pressable onPress={() => loadClip(t.turnIndex)} disabled={loadingTurn === t.turnIndex} hitSlop={8}>
                  <ThemedText themeColor="primary" style={[styles.small, styles.underline]}>{loadingTurn === t.turnIndex ? 'Loading…' : '▶ Play this answer'}</ThemedText>
                </Pressable>
              )
            ) : null}
          </View>
        ))}
      </View>
    </Box>
  );
}

// Camera+mic and screen recordings for one attempt, loaded on demand (they can be tens of MB).
export function AriaRecordingBlock({ applicationId, invite }: { applicationId: string; invite: AiInterviewInviteFull }) {
  const theme = useTheme();
  const [uris, setUris] = useState<{ camera?: string; screen?: string }>({});
  const [loadingKind, setLoadingKind] = useState<'camera' | 'screen' | null>(null);
  const [error, setError] = useState('');
  if (!invite.cameraRecordingBlobName && !invite.screenRecordingBlobName) return null;

  const load = async (kind: 'camera' | 'screen') => {
    setLoadingKind(kind);
    setError('');
    try {
      const uri = await downloadInterviewRecording(applicationId, invite.id, kind);
      setUris((p) => ({ ...p, [kind]: uri }));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load recording.'));
    } finally {
      setLoadingKind(null);
    }
  };

  return (
    <Box title="Recordings" note="HR only, auto-deleted after 90 days">
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
      <View style={styles.badges}>
        {invite.cameraRecordingBlobName && !uris.camera ? <Button size="sm" variant="secondary" loading={loadingKind === 'camera'} onPress={() => load('camera')}>Load camera + mic recording</Button> : null}
        {invite.screenRecordingBlobName && !uris.screen ? <Button size="sm" variant="secondary" loading={loadingKind === 'screen'} onPress={() => load('screen')}>Load screen recording</Button> : null}
      </View>
      {uris.camera ? <View style={styles.tight}><ThemedText themeColor="textMuted" style={styles.small}>Camera + mic (audio only in the app)</ThemedText><AudioClip uri={uris.camera} /></View> : null}
      {uris.screen ? <View style={styles.tight}><ThemedText themeColor="textMuted" style={styles.small}>Screen recording (audio only in the app)</ThemedText><AudioClip uri={uris.screen} /></View> : null}
    </Box>
  );
}

function ViolationLines({ events }: { events: AriaProctoringEvent[] }) {
  const violations = events.filter((e) => e.type === 'VIOLATION');
  const copyPaste = events.filter((e) => e.type !== 'VIOLATION');
  return (
    <>
      {violations.map((v, i) => (
        <ThemedText key={`v${i}`} themeColor="textSecondary" style={styles.small}>Screen violation at {fmtTimeWithSeconds(v.at)}{v.reason ? ` — ${v.reason.replace(/_/g, ' ')}` : ''}</ThemedText>
      ))}
      {copyPaste.map((c, i) => (
        <ThemedText key={`c${i}`} themeColor="textSecondary" style={styles.small}>{c.type === 'COPY_ATTEMPT' ? 'Copy/cut attempt' : 'Paste attempt'} at {fmtTimeWithSeconds(c.at)}</ThemedText>
      ))}
    </>
  );
}

export function AriaProctoringBlock({ proctoringEvents, terminationReason }: { proctoringEvents: AriaProctoringEvent[]; terminationReason: string | null }) {
  const theme = useTheme();
  const none = proctoringEvents.length === 0;
  if (none && terminationReason !== 'proctoring: 3 violations') return null;
  return (
    <Box title="Integrity signals" note="awareness only; there are innocent reasons for both">
      {terminationReason === 'proctoring: 3 violations' ? <ThemedText style={[styles.small, { color: theme.danger }]}>Interview terminated and auto-submitted after 3 screen violations.</ThemedText> : null}
      <ViolationLines events={proctoringEvents} />
    </Box>
  );
}

function attemptStatusLabel(invite: AiInterviewInviteFull): string {
  if (invite.status === 'PENDING') return 'In progress';
  if (invite.terminationReason === 'proctoring: 3 violations') return 'Terminated (3 violations)';
  if (invite.terminationReason === 'technical issue') return 'Ended — technical issue';
  if (invite.terminationReason === 'candidate exited') return 'Ended by candidate (Exit)';
  if (invite.terminationReason === 'TIME_CAP') return 'Completed (time limit reached)';
  if (invite.status === 'REVOKED') return 'Revoked — never used';
  if (invite.status === 'EXPIRED') return 'Expired — never used';
  return 'Completed';
}

function PreviousAriaAttempts({ invites, applicationId }: { invites: AiInterviewInviteFull[]; applicationId: string }) {
  const theme = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);
  if (invites.length === 0) return null;
  return (
    <View style={styles.list}>
      <ThemedText themeColor="textMuted" style={styles.title}>PREVIOUS ATTEMPTS ({invites.length})</ThemedText>
      {invites.map((inv) => {
        const isOpen = openId === inv.id;
        return (
          <View key={inv.id} style={[styles.attempt, { borderColor: theme.border }]}>
            <Pressable onPress={() => setOpenId(isOpen ? null : inv.id)} accessibilityRole="button" accessibilityState={{ expanded: isOpen }} style={styles.attemptHead}>
              <ThemedText themeColor="textSecondary" style={[styles.small, styles.flex1]}>{fmtDateTime(inv.createdAt)} — {attemptStatusLabel(inv)}</ThemedText>
              {inv.scorecard ? (
                inv.scorecard.answeredCount === 0
                  ? <Badge size="sm" variant="warning">Not enough data</Badge>
                  : <Badge size="sm" variant={scoreVariant(inv.scorecard.weightedOverallScore)}>Overall: {inv.scorecard.weightedOverallScore}</Badge>
              ) : null}
              <ThemedText themeColor="textMuted" style={styles.small}>{isOpen ? 'Hide' : 'Show'}</ThemedText>
            </Pressable>
            {isOpen ? (
              <View style={styles.list}>
                {inv.scorecard ? <CompetencyScoreList scorecard={inv.scorecard} /> : null}
                {inv.transcript?.length ? <AriaTranscriptBlock transcript={inv.transcript} inProgress={inv.status === 'PENDING'} applicationId={applicationId} inviteId={inv.id} /> : null}
                <AriaRecordingBlock applicationId={applicationId} invite={inv} />
                <AriaProctoringBlock proctoringEvents={inv.proctoringEvents ?? []} terminationReason={inv.terminationReason} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const STAGES = {
  INTERVIEW: { title: 'AI Interview Scorecard (advisory only)', inProgress: 'AI Interview in progress', itemNoun: 'a question' },
  ASSESSMENT: { title: 'AI Assignment Scorecard (advisory only)', inProgress: 'Assessment in progress', itemNoun: 'a task' },
} as const;

// AI interview / assignment scorecard + proctoring signals: collapsed by
// default, the header keeps the overall score and any integrity flags visible.
export function ScorecardPanel({ application, stage }: { application: ApplicationRowData; stage: keyof typeof STAGES }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const labels = STAGES[stage];
  const all = stage === 'INTERVIEW' ? (application.interviewInvites ?? []) : [];
  const latest = all[0] ?? null;
  const previous = all.slice(1);
  const isAria = latest?.engine === 'ARIA';
  // ARIA: the attempt's own scorecard wins; the application's is the fallback.
  const scorecard = (stage === 'INTERVIEW' ? (isAria ? (latest?.scorecard ?? application.aiInterviewScorecard) : application.aiInterviewScorecard) : application.aiAssignmentScorecard) ?? null;
  const completedAt = stage === 'INTERVIEW' ? application.aiInterviewCompletedAt : application.aiAssignmentCompletedAt;
  const activity = stage === 'INTERVIEW' ? application.aiInterviewActivity : application.aiAssignmentActivity;
  const items = (stage === 'INTERVIEW' ? application.aiInterviewQuestions : application.aiAssignmentTasks) ?? [];
  const tabSwitches = activity?.tabSwitches ?? [];
  const largePastes = activity?.largePastes ?? [];
  const autoSubmitted = !!activity?.autoSubmitted;
  const proctoring = (isAria ? latest?.proctoringEvents : null) ?? [];
  const violations = proctoring.filter((e) => e.type === 'VIOLATION');
  const copyPaste = proctoring.filter((e) => e.type !== 'VIOLATION');
  const hasSignals = tabSwitches.length > 0 || largePastes.length > 0 || autoSubmitted || violations.length > 0 || copyPaste.length > 0;
  if (!scorecard && !hasSignals && !(isAria && latest?.transcript?.length) && previous.length === 0) return null;

  const itemName = (id: string) => items.find((t) => t.competencyId === id)?.competencyName ?? scorecard?.competencyScores.find((c) => c.competencyId === id)?.name ?? labels.itemNoun;
  const signalSummary = [
    tabSwitches.length && `${tabSwitches.length} tab switch${tabSwitches.length > 1 ? 'es' : ''}`,
    largePastes.length && `${largePastes.length} large paste${largePastes.length > 1 ? 's' : ''}`,
    violations.length && `${violations.length} screen violation${violations.length > 1 ? 's' : ''}`,
    copyPaste.length && `${copyPaste.length} copy/paste attempt${copyPaste.length > 1 ? 's' : ''}`,
  ].filter(Boolean).join(' · ');

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText themeColor="textMuted" style={styles.title}>{(scorecard ? labels.title : labels.inProgress).toUpperCase()}</ThemedText>
      <View style={styles.badges}>
        {scorecard?.flaggedForReview ? <Badge size="sm" variant="danger">Flagged for review</Badge> : null}
        {autoSubmitted ? <Badge size="sm" variant="danger">Auto-submitted</Badge> : null}
        {hasSignals && signalSummary ? <Badge size="sm" variant="warning">⚠ {signalSummary}</Badge> : null}
        {scorecard && scorecard.answeredCount === 0 ? <Badge size="sm" variant="warning">Not enough data</Badge> : null}
        {scorecard && scorecard.answeredCount !== 0 ? <Badge size="sm" variant={scoreVariant(scorecard.weightedOverallScore)}>Overall: {scorecard.weightedOverallScore}</Badge> : null}
      </View>
      {scorecard && typeof scorecard.answeredCount === 'number' && typeof scorecard.totalCompetencies === 'number' ? (
        <ThemedText themeColor="textMuted" style={styles.small}>Answered {scorecard.answeredCount} of {scorecard.totalCompetencies} competencies</ThemedText>
      ) : null}
      {scorecard ? <ThemedText themeColor="textMuted" style={styles.small}>{fmtDateTime(completedAt)} · {scorecard.modelUsed}</ThemedText> : null}
      <CollapseToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      {/* Always visible: an unanswered key competency must be impossible to miss. */}
      {scorecard ? <CoverageWarning scorecard={scorecard} /> : null}
      {expanded ? (
        <View style={styles.list}>
          {scorecard?.flagReason ? <ThemedText style={[styles.small, { color: theme.danger }]}>{scorecard.flagReason}</ThemedText> : null}
          {scorecard ? <CompetencyScoreList scorecard={scorecard} /> : null}
          {isAria && latest?.transcript?.length ? <AriaTranscriptBlock transcript={latest.transcript} inProgress={latest.status === 'PENDING'} applicationId={application.id} inviteId={latest.id} /> : null}
          {isAria && latest ? <AriaRecordingBlock applicationId={application.id} invite={latest} /> : null}
          {hasSignals ? (
            <Box title="Integrity signals" note="awareness only; there are innocent reasons for both">
              {autoSubmitted ? <ThemedText style={[styles.small, { color: theme.danger }]}>Automatically submitted after leaving the tab too many times — not something the candidate chose to click.</ThemedText> : null}
              {latest?.terminationReason === 'proctoring: 3 violations' ? <ThemedText style={[styles.small, { color: theme.danger }]}>Interview terminated and auto-submitted after 3 screen violations.</ThemedText> : null}
              <ViolationLines events={proctoring} />
              {tabSwitches.map((t, i) => <ThemedText key={`t${i}`} themeColor="textSecondary" style={styles.small}>Left the tab at {fmtTimeWithSeconds(t.leftAt)} — {fmtGap(t.leftAt, t.returnedAt)}</ThemedText>)}
              {largePastes.map((p, i) => <ThemedText key={`p${i}`} themeColor="textSecondary" style={styles.small}>Pasted {p.chars.toLocaleString('en-IN')} characters into “{itemName(p.competencyId)}” at {fmtTimeWithSeconds(p.at)}</ThemedText>)}
            </Box>
          ) : null}
          <PreviousAriaAttempts invites={previous} applicationId={application.id} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  panel: { padding: 16, gap: 8, borderRadius: Radii.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.8 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 10, lineHeight: 14 },
  medium: { fontFamily: FontWeights.medium },
  semibold: { fontFamily: FontWeights.semiBold },
  regular: { fontFamily: FontWeights.regular },
  mono: { fontFamily: 'monospace' },
  underline: { textDecorationLine: 'underline' },
  tight: { gap: 2 },
  list: { gap: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  barWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, width: 150 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  box: { padding: 12, gap: 8, borderWidth: 1, borderRadius: Radii.sm },
  clip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  attempt: { padding: 8, gap: 8, borderWidth: 1, borderRadius: Radii.sm },
  attemptHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 36 },
});

