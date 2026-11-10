import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { candidateInviteShare, fmtDateTime, scoreVariant, type ShareLink } from '@/components/applications/application-format';
import { LinkExpirySheet, ShareLinkSheet } from '@/components/applications/application-sheets';
import { AudioClip } from '@/components/applications/scorecard-panel';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { approvePracticalQuestion, deletePracticalQuestion, downloadInterviewRecording, fetchPracticalQuestionsFull, generatePracticalQuestions, getErrorMessage, sendAssessment, updatePracticalQuestion } from '@/lib/api';
import type { ApplicationRowData, PracticalQuestion, PracticalScorecard } from '@/types/api';

function QuestionRow({ question, applicationId, onChanged, onDeleted }: { question: PracticalQuestion; applicationId: string; onChanged: (q: PracticalQuestion) => void; onDeleted: (id: string) => void }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.questionText);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // Already sent to the candidate: immutable from here on (the backend enforces the same).
  const locked = !!question.assessmentInviteId;

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) { setSaveError('Question text cannot be empty.'); return; }
    if (trimmed === question.questionText) { setEditing(false); return; }
    setSaving(true);
    setSaveError('');
    try {
      onChanged(await updatePracticalQuestion(applicationId, question.id, { questionText: trimmed }));
      setEditing(false);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, 'Failed to save question.'));
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    setApproving(true);
    setApproveError('');
    try {
      onChanged(await approvePracticalQuestion(applicationId, question.id));
    } catch (err: unknown) {
      setApproveError(getErrorMessage(err, 'Failed to approve question.'));
    } finally {
      setApproving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await deletePracticalQuestion(applicationId, question.id);
      onDeleted(question.id);
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err, 'Failed to delete question.'));
      setDeleting(false);
    }
  };

  const remove = () => {
    Alert.alert('Delete this practical question?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]);
  };

  return (
    <View style={[styles.question, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      {editing ? (
        <View style={styles.gap}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            editable={!saving}
            autoFocus
            textAlignVertical="top"
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
          <View style={styles.row}>
            <Button size="sm" loading={saving} onPress={saveEdit}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button size="sm" variant="secondary" disabled={saving} onPress={() => { setEditing(false); setDraft(question.questionText); setSaveError(''); }}>Cancel</Button>
          </View>
        </View>
      ) : (
        <>
          {/* Tap to edit; disabled once locked so HR can still read the text. */}
          <Pressable onPress={() => !locked && setEditing(true)} disabled={locked} accessibilityRole="button" accessibilityHint={locked ? 'Already sent to the candidate — can no longer be edited.' : 'Tap to edit'}>
            <ThemedText style={styles.body}>{question.questionText}</ThemedText>
          </Pressable>
          <View style={styles.row}>
            {question.approvedAt ? <Badge size="sm" variant="success">Approved</Badge> : null}
            <Button size="sm" variant="ghost" loading={approving} disabled={locked} onPress={approve}>{question.approvedAt ? '✓ Re-approve' : '✓ Approve'}</Button>
            <Button size="sm" variant="ghost" loading={deleting} disabled={locked} onPress={remove}>Delete</Button>
          </View>
        </>
      )}
      {saveError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{saveError}</ThemedText> : null}
      {approveError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{approveError}</ThemedText> : null}
      {deleteError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{deleteError}</ThemedText> : null}
    </View>
  );
}

// Dashboard PracticalAssessmentPanel: generate questions from the résumé,
// edit / approve / delete each, "Approve All & Send Invite", the scorecard
// and the assessment recording. Only at the ASSESSMENT stage.
export function PracticalAssessmentPanel({ application }: { application: ApplicationRowData }) {
  const theme = useTheme();
  const [questions, setQuestions] = useState<PracticalQuestion[]>([]);
  const [scorecard, setScorecard] = useState<PracticalScorecard | null>(null);
  const [recordings, setRecordings] = useState<{ id: string; createdAt: string; usedAt: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [approvingAll, setApprovingAll] = useState(false);
  const [approveAllError, setApproveAllError] = useState('');
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [share, setShare] = useState<ShareLink | null>(null);
  const [inviteSent, setInviteSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetchPracticalQuestionsFull(application.id);
      setQuestions(res?.questions ?? []);
      setScorecard(res?.scorecard ?? null);
      setRecordings(res?.recordings ?? []);
    } catch (err: unknown) {
      setLoadError(getErrorMessage(err, 'Failed to load practical questions.'));
    } finally {
      setLoading(false);
    }
  }, [application.id]);

  // Only fetches for applications actually at the ASSESSMENT stage.
  useEffect(() => {
    if (application.status !== 'ASSESSMENT') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    load();
  }, [application.status, load]);

  const generate = async () => {
    setGenerating(true);
    setGenerateError('');
    try {
      const res = await generatePracticalQuestions(application.id);
      setQuestions(res.questions ?? []);
    } catch (err: unknown) {
      setGenerateError(getErrorMessage(err, 'Failed to generate practical questions.'));
    } finally {
      setGenerating(false);
    }
  };

  const approveAll = async (hours: number) => {
    setApprovingAll(true);
    setApproveAllError('');
    setInviteSent(false);
    try {
      const res = await sendAssessment(application.id, hours);
      setShare({
        ...candidateInviteShare('Assessment', { inviteLink: res.inviteLink, expiresAt: res.expiresAt, emailSent: res.emailSent, sentTo: res.sentTo, hasEmail: res.hasEmail }, application.name),
        title: 'Practical Assessment Link',
      });
      setInviteSent(true);
      load();
    } catch (err: unknown) {
      setApproveAllError(getErrorMessage(err, 'Failed to send practical assessment invitation.'));
    } finally {
      setApprovingAll(false);
    }
  };

  if (application.status !== 'ASSESSMENT') return null;

  // Unsent drafts (editable) vs questions already tied to a sent invite (read-only).
  const drafts = questions.filter((q) => !q.assessmentInviteId);
  const sent = questions.filter((q) => q.assessmentInviteId);

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText themeColor="textMuted" style={styles.title}>PRACTICAL ASSESSMENT (ASSESSMENT STAGE)</ThemedText>
      <View style={styles.row}>
        <Button size="sm" variant="secondary" loading={generating} onPress={generate}>{generating ? 'Generating…' : 'Generate Questions from Résumé'}</Button>
      </View>
      {generateError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{generateError}</ThemedText> : null}

      {scorecard ? (
        <View style={styles.row}>
          <Badge size="sm" variant={scorecard.flaggedForReview ? 'warning' : scoreVariant(scorecard.overallScore)}>Overall: {scorecard.overallScore}</Badge>
          {scorecard.flaggedForReview && scorecard.flagReason ? <ThemedText themeColor="textMuted" style={styles.small}>{scorecard.flagReason}</ThemedText> : null}
        </View>
      ) : null}

      {recordings.length > 0 ? (
        <View style={[styles.question, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedText themeColor="textSecondary" style={[styles.small, styles.semibold]}>
            Assessment recording <ThemedText themeColor="textMuted" style={styles.small}>— camera + mic, HR only, auto-deleted after 90 days</ThemedText>
          </ThemedText>
          {recordings.map((r) => (
            <View key={r.id} style={styles.gap}>
              <ThemedText themeColor="textMuted" style={styles.small}>Sent {fmtDateTime(r.createdAt)}{r.usedAt ? ` · submitted ${fmtDateTime(r.usedAt)}` : ' · not submitted yet'}</ThemedText>
              <RecordingLoader applicationId={application.id} inviteId={r.id} />
            </View>
          ))}
        </View>
      ) : null}

      {loading ? (
        <ThemedText themeColor="textMuted" style={styles.small}>Loading…</ThemedText>
      ) : loadError ? (
        <ThemedText style={[styles.small, { color: theme.danger }]}>{loadError}</ThemedText>
      ) : questions.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.small}>No questions yet. Tap Generate to create from resume.</ThemedText>
      ) : (
        <View style={styles.gap}>
          {drafts.map((q) => (
            <QuestionRow
              key={q.id}
              question={q}
              applicationId={application.id}
              onChanged={(updated) => setQuestions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))}
              onDeleted={(id) => setQuestions((prev) => prev.filter((p) => p.id !== id))}
            />
          ))}
          {sent.length > 0 ? <SentBatch questions={sent} /> : null}
        </View>
      )}

      {drafts.length > 0 ? (
        <View style={styles.end}>
          <Button size="sm" loading={approvingAll} onPress={() => setExpiryOpen(true)}>{approvingAll ? 'Sending…' : 'Approve All & Send Invite'}</Button>
          {approveAllError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{approveAllError}</ThemedText> : null}
        </View>
      ) : null}
      {inviteSent ? <ThemedText style={[styles.small, styles.semibold, { color: theme.success }]}>Assessment invite created and sent. The link is also shown below.</ThemedText> : null}

      {expiryOpen ? (
        <LinkExpirySheet
          title="Generate Practical Assessment Link"
          description={`Choose how long ${application.name}'s practical assessment link stays usable. After that, opening it shows "This link has expired" and you'd send a new one. Approving sends every remaining draft question to the candidate.`}
          confirmLabel="Approve All & Send"
          onClose={() => setExpiryOpen(false)}
          onConfirm={(hours) => { setExpiryOpen(false); approveAll(hours); }}
        />
      ) : null}
      {share ? <ShareLinkSheet share={share} onClose={() => setShare(null)} /> : null}
    </View>
  );
}

// Loads the assessment recording on demand (it can be tens of MB); audio only in the app.
function RecordingLoader({ applicationId, inviteId }: { applicationId: string; inviteId: string }) {
  const theme = useTheme();
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setUri(await downloadInterviewRecording(applicationId, inviteId, 'camera'));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load recording.'));
    } finally {
      setLoading(false);
    }
  };
  if (uri) return <AudioClip uri={uri} />;
  return (
    <View style={styles.gap}>
      <Button size="sm" variant="secondary" loading={loading} onPress={load}>{loading ? 'Loading…' : 'Load recording'}</Button>
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
    </View>
  );
}

// "Previously sent batch (n questions) — view only", collapsed by default.
function SentBatch({ questions }: { questions: PracticalQuestion[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.gap}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={8}>
        <ThemedText themeColor="textMuted" style={styles.small}>{open ? '▾' : '▸'} Previously sent batch ({questions.length} question{questions.length > 1 ? 's' : ''}) — view only</ThemedText>
      </Pressable>
      {open ? questions.map((q) => (
        <View key={q.id} style={[styles.question, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedText themeColor="textSecondary" style={styles.body}>{q.questionText}</ThemedText>
        </View>
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 12, borderRadius: Radii.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  gap: { gap: 8 },
  end: { alignItems: 'flex-end', gap: 4 },
  small: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 20 },
  semibold: { fontFamily: FontWeights.semiBold },
  question: { padding: 12, gap: 8, borderWidth: 1, borderRadius: Radii.sm },
  input: { minHeight: 72, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
});
