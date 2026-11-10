import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { fmtDateTime } from '@/components/applications/application-format';
import { Sheet } from '@/components/customers/sheet';
import { CANDIDATE_STATUS_HINT, CANDIDATE_STATUS_LABELS, candidateStatusBadgeVariant } from '@/components/onboarding/onboarding-format';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Input } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { approveCandidateOnboarding, createCandidate, getErrorMessage, sendOnboardingInvite } from '@/lib/api';
import type { Candidate, OnboardingInviteResult, OnboardingInviteStatusInfo } from '@/types/api';

// ── New Candidate ────────────────────────────────────────────────────────────
// Dashboard NewCandidateModal: a lightweight pre-hire row.
export function NewCandidateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Candidate) => void }) {
  const [name, setName] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [personalPhone, setPersonalPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      onCreated(await createCandidate({
        name: name.trim(),
        personalEmail: personalEmail.trim() || undefined,
        personalPhone: personalPhone.trim() || undefined,
        department: department.trim() || undefined,
      }));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to create candidate.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="New Candidate"
      footer={
        <>
          <Button style={styles.flex1} variant="secondary" disabled={saving} onPress={onClose}>Cancel</Button>
          <Button style={styles.flex1} loading={saving} onPress={submit}>{saving ? 'Creating…' : 'Create Candidate'}</Button>
        </>
      }>
      {error ? <ErrorBanner message={error} /> : null}
      <Input label="Name" required value={name} onChangeText={setName} />
      <Input label="Personal Email" value={personalEmail} onChangeText={setPersonalEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Personal Phone" value={personalPhone} onChangeText={setPersonalPhone} keyboardType="phone-pad" />
      <Input label="Department" value={department} onChangeText={setDepartment} />
    </Sheet>
  );
}

// ── Candidate actions ────────────────────────────────────────────────────────
type PanelProps = {
  candidate: Candidate;
  preJoiningTermsApproved: boolean;
  inviteStatus: OnboardingInviteStatusInfo | null;
  onInviteSent: (info: OnboardingInviteResult) => void;
  onApproved: (result: { username: string; temporaryPassword: string }) => void;
  onVerifyDocuments: (userId: string) => void;
};

// Dashboard CandidateActionsPanel. The card sits inline (name + status badges)
// and its actions open in a bottom sheet.
export function CandidateActionsPanel({ candidate, preJoiningTermsApproved, inviteStatus, onInviteSent, onApproved, onVerifyDocuments }: PanelProps) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isClosed = candidate.onboardingStatus === 'APPROVED' || candidate.onboardingStatus === 'REJECTED';
  const hint = CANDIDATE_STATUS_HINT[candidate.onboardingStatus] ?? null;

  const sendInvite = async () => {
    setBusy(true);
    setError('');
    try {
      onInviteSent(await sendOnboardingInvite(candidate.id));
      setOpen(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to send invitation.'));
    } finally {
      setBusy(false);
    }
  };

  const doApprove = async () => {
    setBusy(true);
    setError('');
    try {
      onApproved(await approveCandidateOnboarding(candidate.id));
      setOpen(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to approve candidate.'));
    } finally {
      setBusy(false);
    }
  };

  const approve = () => Alert.alert(
    'Approve onboarding',
    `Approve ${candidate.name} and issue a temporary login?`,
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Approve', onPress: doApprove }],
  );

  return (
    <Card padding="md">
      <View style={styles.stack}>
        <View style={styles.header}>
          <ThemedText style={[styles.name, styles.flex1]} numberOfLines={2}>{`Onboarding — ${candidate.name}`}</ThemedText>
          <View style={styles.badges}>
            {candidate.overdue ? <Badge variant="danger" size="sm">{`${candidate.daysSinceInvited}d overdue`}</Badge> : null}
            <Badge variant={candidateStatusBadgeVariant(candidate.onboardingStatus)} size="sm">{CANDIDATE_STATUS_LABELS[candidate.onboardingStatus] ?? candidate.onboardingStatus}</Badge>
          </View>
        </View>
        <Button size="sm" variant="secondary" onPress={() => { setError(''); setOpen(true); }}>Onboarding actions</Button>
      </View>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        locked={busy}
        title={`Onboarding — ${candidate.name}`}
        footer={<Button style={styles.flex1} variant="secondary" disabled={busy} onPress={() => setOpen(false)}>Close</Button>}>
        <View style={styles.badges}>
          {candidate.overdue ? <Badge variant="danger" size="sm">{`${candidate.daysSinceInvited}d overdue`}</Badge> : null}
          <Badge variant={candidateStatusBadgeVariant(candidate.onboardingStatus)} size="sm">{CANDIDATE_STATUS_LABELS[candidate.onboardingStatus] ?? candidate.onboardingStatus}</Badge>
        </View>
        {preJoiningTermsApproved && !isClosed && hint ? (
          <View style={[styles.hint, { backgroundColor: hint.ready ? withAlpha(theme.success, 0.1) : theme.backgroundElement }]}>
            <ThemedText style={[styles.small, { color: hint.ready ? theme.success : theme.textSecondary }]}>{`${hint.ready ? '✓ ' : ''}${hint.text}`}</ThemedText>
          </View>
        ) : null}
        {error ? <ErrorBanner message={error} /> : null}
        {!preJoiningTermsApproved ? (
          <ThemedText themeColor="textMuted" style={styles.body}>Approve this candidate&apos;s Pre-Joining Terms before sending an invitation.</ThemedText>
        ) : isClosed ? (
          <ThemedText themeColor="textMuted" style={styles.body}>This candidate&apos;s onboarding is already closed.</ThemedText>
        ) : (
          <View style={styles.stack}>
            <Button variant="secondary" loading={busy} onPress={sendInvite}>{inviteStatus?.status === 'PENDING' ? 'Resend Invitation' : 'Send Onboarding Invitation'}</Button>
            <Button variant={hint?.ready ? 'primary' : 'secondary'} onPress={() => { setOpen(false); onVerifyDocuments(candidate.id); }}>Verify Documents</Button>
            <Button disabled={busy} onPress={approve}>Approve Onboarding</Button>
            {inviteStatus && !hint?.ready ? (
              <ThemedText themeColor="textMuted" style={styles.small}>{`Last invite: ${inviteStatus.status} (expires ${fmtDateTime(inviteStatus.expiresAt)})`}</ThemedText>
            ) : null}
          </View>
        )}
      </Sheet>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  flex1: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  hint: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
});
