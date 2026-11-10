import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { memo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  fmtDate, onboardingNotStarted, scoreVariant, STATUS_BADGE_VARIANT, STATUS_LABELS, STATUSES, applicationInviteShare,
  type ShareLink,
} from '@/components/applications/application-format';
import { isDegradedScreening } from '@/components/applications/scoring';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Select } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { changeApplicationStatus, downloadApplicationFile, getErrorMessage, resendApplicationInvite, runAiScreening, type ApplicationFileKind } from '@/lib/api';
import type { ApplicationRowData, ApplicationStatus } from '@/types/api';

// Outcome email offered (never auto-sent) after a Select / Reject. emailSent
// null = not sent yet ("Send Email"), then true / false after HR sends it.
export type StatusEmailState = {
  applicationId: string;
  name: string;
  outcome: 'SELECTED' | 'REJECTED';
  hasEmail: boolean;
  emailSent: boolean | null;
  sentTo: string | null;
};

// Column widths of the wide table: Applicant 1.4fr, Role 1fr, Applied 7rem, Status 11rem.
const APPLIED_W = 112;
const STATUS_W = 176;

function confirmAsync(title: string, message: string, confirmText = 'Continue'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

type Props = {
  application: ApplicationRowData;
  wide: boolean;
  /** '' = the "All" tab: the next-step action buttons only show once a stage tab is chosen. */
  activeTab: ApplicationStatus | '';
  hasLiveTemplate: boolean;
  statusEmail: StatusEmailState | null;
  statusEmailError: string;
  resendingStatusEmail: boolean;
  onOpen: (a: ApplicationRowData) => void;
  onChanged: (a: ApplicationRowData) => void;
  onStatusChanged: (a: ApplicationRowData & { hasEmail?: boolean }) => void;
  onCompare: (role: string) => void;
  onEdit: (a: ApplicationRowData) => void;
  onShare: (s: ShareLink) => void;
  onInterviewInvite: (a: ApplicationRowData) => void;
  onOnboarding: (a: ApplicationRowData) => void;
  onSchedule: (a: ApplicationRowData) => void;
  onCreateTemplate: (role: string) => void;
  onSendStatusEmail: () => void;
  onDismissStatusEmail: () => void;
};

// Dashboard ApplicationRow: summary line, status control with score badges,
// next-step actions, and the outcome-email strip. Tapping the row opens the
// candidate details (the dashboard's expanded modal).
function ApplicationRowBase({
  application, wide, activeTab, hasLiveTemplate, statusEmail, statusEmailError, resendingStatusEmail,
  onOpen, onChanged, onStatusChanged, onCompare, onEdit, onShare, onInterviewInvite, onOnboarding, onSchedule, onCreateTemplate, onSendStatusEmail, onDismissStatusEmail,
}: Props) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [screening, setScreening] = useState(false);
  const [screeningError, setScreeningError] = useState('');
  const [sendingAppInvite, setSendingAppInvite] = useState(false);
  const [appInviteError, setAppInviteError] = useState('');
  const [openingFile, setOpeningFile] = useState<ApplicationFileKind | null>(null);

  const converted = !!application.convertedUserId;
  const rejected = application.status === 'REJECTED';
  // Still moving through the pipeline: neither converted nor rejected.
  const inPipeline = !converted && !rejected;
  const stage = inPipeline ? application.status : null;
  const screeningStage = stage === 'APPLIED' || stage === 'AI_SCREENING';

  const screeningResult = application.aiScreeningResult ?? null;
  const screeningDegraded = isDegradedScreening(screeningResult);
  // An ARIA attempt's own scorecard wins; the application's is the fallback.
  const latestInvite = application.interviewInvites?.[0] ?? null;
  const rowInterviewScorecard = (latestInvite?.engine === 'ARIA' ? (latestInvite.scorecard ?? application.aiInterviewScorecard) : application.aiInterviewScorecard) ?? null;
  const activeSchedule = (application.interviewSchedules ?? []).find((s) => s.status === 'SCHEDULED') ?? null;
  const hasPendingInterview = !!application.interviewInvites?.some((i) => i.status === 'PENDING');
  const canScreen = screeningStage && !!application.resumeFilename;
  const screenBlockedReason = !application.roleApplied ? 'Set the role applied for before running AI screening.' : '';

  const changeStatus = async (status: ApplicationStatus) => {
    if (status === application.status) return;
    if (status === 'SELECTED' && !(await confirmAsync(`Select ${application.name}?`, "This creates a candidate record in the Onboarding module and can't be undone from here.", 'Select'))) return;
    if (status === 'REJECTED' && !(await confirmAsync(`Reject ${application.name}?`, 'Any pending application/interview/assignment links stop working. You can reopen the application later if needed.', 'Reject'))) return;
    if (application.status === 'AI_INTERVIEW' && status !== 'REJECTED' && hasPendingInterview && !(await confirmAsync(
      'Interview link still open',
      `${application.name}'s AI interview link is still open (not submitted yet). Moving to ${STATUS_LABELS[status]} closes that link immediately — any unsaved answers are lost. Continue?`,
    ))) return;
    if (rejected && !(await confirmAsync(`Reopen ${application.name}'s application?`, `It moves back to ${STATUS_LABELS[status]}.`, 'Reopen'))) return;
    setBusy(true);
    setError('');
    try {
      const res = await changeApplicationStatus(application.id, status);
      onStatusChanged(res.application);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update status.'));
    } finally {
      setBusy(false);
    }
  };

  // Advisory only: writes the screening result and nothing else, never `status`.
  const runScreening = async () => {
    setScreening(true);
    setScreeningError('');
    try {
      onChanged((await runAiScreening(application.id)) as ApplicationRowData);
    } catch (err: unknown) {
      setScreeningError(getErrorMessage(err, 'Failed to run AI screening.'));
    } finally {
      setScreening(false);
    }
  };

  // Re-sends the candidate's own self-service application invite.
  const resendAppInvite = async () => {
    setSendingAppInvite(true);
    setAppInviteError('');
    try {
      onShare(applicationInviteShare(await resendApplicationInvite(application.id), true));
    } catch (err: unknown) {
      setAppInviteError(getErrorMessage(err, 'Failed to resend invite.'));
    } finally {
      setSendingAppInvite(false);
    }
  };

  const openFile = async (kind: ApplicationFileKind, filename: string | null, mimeType: string | null) => {
    setOpeningFile(kind);
    try {
      const { uri } = await downloadApplicationFile(application.id, kind, filename);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, mimeType ? { mimeType } : undefined);
      else setError('Sharing isn’t available on this device.');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not open this document.'));
    } finally {
      setOpeningFile(null);
    }
  };

  const errors = [error, screeningStage && screeningError, stage === 'APPLIED' && appInviteError].filter(Boolean) as string[];

  const statusControl = (
    <View>
      {inPipeline ? (
        <Select
          compact
          options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          value={application.status}
          onChange={(v) => changeStatus(v as ApplicationStatus)}
          disabled={busy}
        />
      ) : (
        <View style={styles.badges}>
          <Badge size="sm" variant={STATUS_BADGE_VARIANT[application.status]}>{STATUS_LABELS[application.status]}</Badge>
          {onboardingNotStarted(application) ? <Badge size="sm" variant="warning">Onboarding not started</Badge> : null}
        </View>
      )}
      {screeningResult || rowInterviewScorecard || application.aiInterviewCompletedAt || application.aiAssignmentCompletedAt ? (
        <View style={[styles.badges, styles.scoreBadges]}>
          {screeningResult ? (
            <>
              {screeningDegraded
                ? <Badge size="sm" variant="warning">Screening: not scored</Badge>
                : <Badge size="sm" variant={scoreVariant(screeningResult.fitScore)}>Screening: {screeningResult.fitScore}</Badge>}
              {canScreen ? (
                <Button size="sm" variant="secondary" loading={screening} disabled={!!screenBlockedReason} onPress={runScreening}>{screening ? 'Re-running…' : 'Re-run'}</Button>
              ) : null}
            </>
          ) : null}
          {rowInterviewScorecard ? (
            rowInterviewScorecard.answeredCount === 0
              ? <Badge size="sm" variant="warning">Interview: not enough data</Badge>
              : <Badge size="sm" variant={scoreVariant(rowInterviewScorecard.weightedOverallScore)}>Interview: {rowInterviewScorecard.weightedOverallScore}</Badge>
          ) : application.aiInterviewCompletedAt ? <Badge size="sm" variant="success">Interview Submitted</Badge> : null}
          {application.aiAssignmentScorecard
            ? <Badge size="sm" variant={scoreVariant(application.aiAssignmentScorecard.weightedOverallScore)}>Assessment: {application.aiAssignmentScorecard.weightedOverallScore}</Badge>
            : application.aiAssignmentCompletedAt ? <Badge size="sm" variant="success">Assessment Submitted</Badge> : null}
        </View>
      ) : null}
    </View>
  );

  const roleBlock = (
    <View style={wide ? styles.roleCol : undefined}>
      <ThemedText style={[styles.body, { color: application.roleApplied ? theme.text : theme.textMuted }]} numberOfLines={2}>
        {application.roleApplied || 'Awaiting candidate — not set yet'}
      </ThemedText>
      {application.department ? <ThemedText themeColor="textMuted" style={styles.small} numberOfLines={1}>{application.department}</ThemedText> : null}
      {application.roleApplied && !hasLiveTemplate ? (
        <View style={styles.tag}>
          <Badge size="sm" variant="warning">No template</Badge>
          <Pressable onPress={() => onCreateTemplate(application.roleApplied!)} hitSlop={8} accessibilityRole="link">
            <ThemedText themeColor="textMuted" style={[styles.small, styles.link]}>Create template</ThemedText>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const nameBlock = (
    <View style={wide ? styles.nameCol : undefined}>
      <ThemedText style={[styles.name, rejected && styles.strike]} numberOfLines={1}>{application.name}</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.small} numberOfLines={1}>{[application.email, application.phone].filter(Boolean).join(' · ') || '—'}</ThemedText>
    </View>
  );

  return (
    <View style={{ opacity: rejected ? 0.75 : 1 }}>
      <View style={wide ? styles.wideRow : undefined}>
        <Pressable
          onPress={() => onOpen(application)}
          accessibilityRole="button"
          accessibilityLabel={`Open details for ${application.name}`}
          style={({ pressed }) => [styles.summary, wide && styles.summaryWideFlex, pressed && { opacity: 0.7 }]}>
          <Ionicons name="chevron-forward" size={14} color={theme.textMuted} style={styles.chevron} />
          {wide ? (
            <>
              {nameBlock}
              {roleBlock}
              <ThemedText themeColor="textSecondary" style={[styles.body, { width: APPLIED_W }]}>{fmtDate(application.createdAt)}</ThemedText>
            </>
          ) : (
            <View style={styles.phoneStack}>
              {nameBlock}
              {roleBlock}
              <ThemedText themeColor="textSecondary" style={styles.small}>Applied {fmtDate(application.createdAt)}</ThemedText>
            </View>
          )}
        </Pressable>
        <View style={wide ? styles.statusCellWide : styles.statusRow}>{statusControl}</View>
      </View>

      <View style={styles.actions}>
        {activeTab !== '' && stage === 'APPLIED' && application.email ? (
          <Button size="sm" variant="secondary" loading={sendingAppInvite} onPress={resendAppInvite}>{sendingAppInvite ? 'Sending…' : 'Resend Application Invite'}</Button>
        ) : null}
        {activeTab !== '' && canScreen && !screeningResult ? (
          <Button size="sm" variant="secondary" loading={screening} disabled={!!screenBlockedReason} onPress={runScreening}>{screening ? 'Screening…' : 'Run AI Screening'}</Button>
        ) : null}
        {activeTab !== '' && stage === 'AI_INTERVIEW' ? (
          <Button size="sm" variant="secondary" onPress={() => onInterviewInvite(application)}>
            {application.aiInterviewCompletedAt ? 'Send new interview link' : application.aiInterviewQuestions ? 'Resend Interview Invite' : 'Send AI Interview Invite'}
          </Button>
        ) : null}
        {activeTab !== '' && stage === 'MANAGER_INTERVIEW' && !activeSchedule ? <Button size="sm" variant="secondary" onPress={() => onSchedule(application)}>Schedule Interview</Button> : null}
        {activeTab !== '' && stage === 'ASSESSMENT' ? <Button size="sm" variant="secondary" onPress={() => onOpen(application)}>Prepare Assessment Questions</Button> : null}

        {application.resumeFilename ? <Button size="sm" variant="ghost" loading={openingFile === 'resume'} onPress={() => openFile('resume', application.resumeFilename, application.resumeMimeType)}>Résumé</Button> : null}
        {application.aadhaarImageFilename ? <Button size="sm" variant="ghost" loading={openingFile === 'aadhaar-image'} onPress={() => openFile('aadhaar-image', application.aadhaarImageFilename, application.aadhaarImageMimeType)}>Aadhaar Image</Button> : null}
        {application.salarySlipFilename ? (
          <Button size="sm" variant="ghost" loading={openingFile === 'salary-slip'} onPress={() => openFile('salary-slip', application.salarySlipFilename, application.salarySlipMimeType)}>Salary Slip</Button>
        ) : application.fresher === true ? (
          <ThemedText themeColor="textMuted" style={styles.small}>Salary Slip: N/A (fresher)</ThemedText>
        ) : null}

        {inPipeline && application.roleApplied ? <Button size="sm" variant="secondary" onPress={() => onCompare(application.roleApplied!)}>Compare</Button> : null}

        {converted && onboardingNotStarted(application) ? (
          <Button size="sm" onPress={() => onOnboarding(application)}>Start Onboarding</Button>
        ) : converted ? (
          <Button size="sm" variant="secondary" onPress={() => onOnboarding(application)}>View Candidate</Button>
        ) : rejected ? (
          <Button size="sm" variant="secondary" loading={busy} onPress={() => changeStatus('APPLIED')}>{busy ? 'Reopening…' : 'Reopen'}</Button>
        ) : (
          <Button size="sm" variant="secondary" onPress={() => onEdit(application)}>Edit</Button>
        )}
      </View>

      {errors.map((message, i) => (
        <View key={i} style={[styles.strip, { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
          <ThemedText style={[styles.small, { color: theme.danger }]}>{message}</ThemedText>
        </View>
      ))}

      {statusEmail ? (() => {
        const what = statusEmail.outcome === 'SELECTED' ? 'Selection' : 'Rejection';
        const bad = statusEmail.emailSent === false || !statusEmail.hasEmail;
        return (
          <View
            style={[
              styles.strip,
              styles.emailStrip,
              statusEmail.emailSent
                ? { backgroundColor: 'rgba(54,200,126,0.08)' }
                : statusEmail.emailSent === null && statusEmail.hasEmail
                  ? { backgroundColor: theme.surface }
                  : { backgroundColor: 'rgba(230,180,60,0.1)' },
            ]}>
            <ThemedText style={[styles.small, styles.flex1, { color: bad ? theme.warning : theme.text }]}>
              {!statusEmail.hasEmail
                ? `No email on file for ${statusEmail.name}, so a ${what.toLowerCase()} email can't be sent.`
                : statusEmail.emailSent === null
                  ? `Send a ${what.toLowerCase()} email to ${statusEmail.name}?`
                  : statusEmail.emailSent
                    ? `✓ ${what} email sent to ${statusEmail.name} (${statusEmail.sentTo}).`
                    : `${what} email to ${statusEmail.name} couldn't be sent.`}
              {statusEmailError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{` ${statusEmailError}`}</ThemedText> : null}
            </ThemedText>
            {statusEmail.hasEmail && !statusEmail.emailSent ? (
              <Button size="sm" variant={statusEmail.emailSent === null ? 'primary' : 'secondary'} loading={resendingStatusEmail} onPress={onSendStatusEmail}>
                {resendingStatusEmail ? 'Sending…' : statusEmail.emailSent === null ? 'Send Email' : 'Resend email'}
              </Button>
            ) : null}
            <Pressable onPress={onDismissStatusEmail} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss">
              <Ionicons name="close" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
        );
      })() : null}
    </View>
  );
}

// Memoised: the screen passes stable callbacks, so only a changed row re-renders.
export const ApplicationRow = memo(ApplicationRowBase);

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  summaryWideFlex: { flex: 1, minWidth: 0 },
  chevron: { marginTop: 3 },
  wideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingRight: 16 },
  statusCellWide: { width: STATUS_W, paddingTop: 12 },
  phoneStack: { flex: 1, minWidth: 0, gap: 4 },
  nameCol: { flex: 1.4, minWidth: 0 },
  roleCol: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  strike: { textDecorationLine: 'line-through' },
  small: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 20 },
  tag: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  link: { textDecorationLine: 'underline' },
  statusRow: { paddingHorizontal: 16, paddingTop: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  scoreBadges: { marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end', gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  strip: { paddingHorizontal: 16, paddingVertical: 8 },
  emailStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderRadius: Radii.sm },
});
