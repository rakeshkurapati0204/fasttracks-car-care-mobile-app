import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fmtDateTime } from '@/components/applications/application-format';
import { CandidateActionsPanel, NewCandidateSheet } from '@/components/onboarding/candidate-sheets';
import { CopyTextButton, LetterGenerateForm, LetterShareMenu, type PickableEmployee } from '@/components/onboarding/letter-form';
import { LETTER_TYPE_BADGE, LETTER_TYPE_LABELS } from '@/components/onboarding/onboarding-format';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  downloadLetterPdf, fetchAllLetters, fetchCandidates, fetchLetterHistory, fetchOnboardingInviteStatus, fetchPreJoiningTermsLite, getErrorMessage,
} from '@/lib/api';
import type { Candidate, HRLetter, HRLetterType, IssuedLetterSummary, OnboardingEmployee, OnboardingInviteResult, OnboardingInviteStatusInfo } from '@/types/api';

// Downloads a letter PDF and hands it to the device share / open-with sheet.
// Resolves to an error message, or null on success.
export async function openLetterPdf(letterId: string, type: HRLetterType): Promise<string | null> {
  try {
    const { uri } = await downloadLetterPdf(letterId, LETTER_TYPE_LABELS[type]);
    if (!(await Sharing.isAvailableAsync())) return 'Sharing isn’t available on this device.';
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    return null;
  } catch (err: unknown) {
    return getErrorMessage(err, 'Could not open the letter.');
  }
}

type Props = {
  employees: OnboardingEmployee[];
  initialUserId?: string;
  onVerifyDocuments: (userId: string) => void;
  refreshKey: number;
};

// Dashboard LettersTab: New Candidate, the generate form, the picked person's
// candidate actions, then either their letter history or every letter issued.
export function LettersTab({ employees, initialUserId, onVerifyDocuments, refreshKey }: Props) {
  const theme = useTheme();
  const [userId, setUserId] = useState(initialUserId || '');
  const [letters, setLetters] = useState<HRLetter[]>([]);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showNewCandidate, setShowNewCandidate] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<OnboardingInviteStatusInfo | null>(null);
  const [inviteResult, setInviteResult] = useState<OnboardingInviteResult | null>(null);
  const [approval, setApproval] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [termsApproved, setTermsApproved] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const loadCandidates = useCallback(() => {
    fetchCandidates().then(setCandidates).catch(() => {});
  }, []);
  // Refetched on every pick and pull-to-refresh: the candidate submits from
  // their own device, so a list fetched once keeps saying "Invited".
  useEffect(() => {
    loadCandidates();
  }, [loadCandidates, userId, refreshKey]);

  const selectedCandidate = candidates.find((c) => c.id === userId) ?? null;
  const candidateId = selectedCandidate?.id ?? null;

  const loadInviteStatus = useCallback(() => {
    if (!candidateId) { setInviteStatus(null); return; }
    fetchOnboardingInviteStatus(candidateId).then(setInviteStatus).catch(() => setInviteStatus(null));
  }, [candidateId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per candidate
    loadInviteStatus();
    setInviteResult(null);
    setApproval(null);
  }, [loadInviteStatus]);

  // Mirrors the gate on POST /hr/onboarding-invites/:userId — terms must be APPROVED.
  useEffect(() => {
    if (!candidateId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per candidate
      setTermsApproved(false);
      return;
    }
    fetchPreJoiningTermsLite(candidateId).then((t) => setTermsApproved(t?.status === 'APPROVED')).catch(() => setTermsApproved(false));
  }, [candidateId]);

  const loadLetters = useCallback(() => {
    if (!userId) { setLetters([]); return; }
    setLoading(true);
    fetchLetterHistory(userId).then(setLetters).catch(() => setLetters([])).finally(() => setLoading(false));
  }, [userId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on pick / refresh
    loadLetters();
  }, [loadLetters, refreshKey]);

  // Prepend rather than refetch, and only for the person being viewed.
  const addLetter = (letter: HRLetter) => {
    if (letter.userId !== userId) return;
    setLetters((ls) => (ls.some((l) => l.id === letter.id) ? ls : [letter, ...ls]));
  };

  // View PDF and Share both hand the downloaded file to the device's share /
  // open-with sheet (the same approach as the other screens' documents).
  const openPdf = useCallback(async (letterId: string, type: HRLetterType) => {
    setFileError(await openLetterPdf(letterId, type));
  }, []);

  // Candidates sit in the same picker; employeeId "Candidate" is display-only.
  const pickable: PickableEmployee[] = useMemo(() => [
    ...employees.map((e) => ({
      id: e.id, name: e.name, employeeId: e.employeeId, role: e.role, designation: e.designation, joiningDate: e.joiningDate,
      department: e.department, address: e.address, phone: e.phone, personalPhone: e.personalPhone, emergencyContactPhone: e.emergencyContactPhone,
    })),
    ...candidates.map((c) => ({
      id: c.id, name: c.name, employeeId: 'Candidate',
      department: c.department, address: c.address, personalPhone: c.personalPhone, emergencyContactPhone: c.emergencyContactPhone,
    })),
  ], [employees, candidates]);

  return (
    <View style={styles.stack}>
      <View style={styles.end}>
        <Button size="sm" variant="secondary" onPress={() => setShowNewCandidate(true)}>+ New Candidate</Button>
      </View>
      {showNewCandidate ? (
        <NewCandidateSheet
          onClose={() => setShowNewCandidate(false)}
          onCreated={(c) => { setCandidates((cs) => [c, ...cs]); setUserId(c.id); setShowNewCandidate(false); }}
        />
      ) : null}

      {fileError ? <ErrorBanner message={fileError} /> : null}

      <LetterGenerateForm
        employees={pickable}
        userId={userId}
        onUserIdChange={setUserId}
        onGenerated={addLetter}
        onView={openPdf}
        onShare={openPdf}
      />

      {selectedCandidate ? (
        <CandidateActionsPanel
          candidate={selectedCandidate}
          preJoiningTermsApproved={termsApproved}
          inviteStatus={inviteStatus}
          onInviteSent={(info) => { setInviteResult(info); loadInviteStatus(); }}
          onApproved={(result) => {
            setApproval(result);
            setCandidates((cs) => cs.map((c) => (c.id === selectedCandidate.id ? { ...c, onboardingStatus: 'APPROVED' } : c)));
          }}
          onVerifyDocuments={onVerifyDocuments}
        />
      ) : null}

      {inviteResult ? (
        <Card padding="md">
          <View style={styles.stack}>
            {inviteResult.emailSent ? (
              <ThemedText style={[styles.name, { color: theme.success }]}>
                {`✓ Invite Sent — emailed to ${inviteResult.sentTo}. Here's the link in case you need it (shown only once):`}
              </ThemedText>
            ) : (
              <ThemedText style={[styles.name, { color: theme.warning }]}>
                {`Share Link Manually — ${inviteResult.hasEmail ? "the email couldn't be sent." : 'no personal email on file for this candidate.'} Copy this link and send it yourself (WhatsApp, SMS or email). Shown only once:`}
              </ThemedText>
            )}
            <ThemedText selectable style={[styles.code, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>{inviteResult.inviteLink}</ThemedText>
            <View style={styles.actions}><CopyTextButton text={inviteResult.inviteLink} /></View>
            <ThemedText themeColor="textMuted" style={styles.small}>{`Expires ${fmtDateTime(inviteResult.expiresAt)}.`}</ThemedText>
          </View>
        </Card>
      ) : null}

      {approval ? (
        <Card padding="md">
          <View style={styles.stack}>
            <ThemedText style={styles.name}>Candidate approved — temporary login (shown only once):</ThemedText>
            <ThemedText selectable style={styles.body}>{`Username: ${approval.username}`}</ThemedText>
            <ThemedText selectable style={styles.body}>{`Temporary password: ${approval.temporaryPassword}`}</ThemedText>
          </View>
        </Card>
      ) : null}

      {!userId ? (
        <AllLettersList refreshKey={refreshKey} onView={openPdf} onShare={openPdf} onSelectEmployee={setUserId} />
      ) : loading ? (
        <Card padding="md"><Skeleton height={16} width="40%" /><Skeleton height={16} /></Card>
      ) : letters.length === 0 ? (
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No letters issued to this employee yet.</ThemedText></Card>
      ) : (
        <Card padding="none">
          {letters.map((l, i) => (
            <LetterRow
              key={l.id}
              id={l.id}
              type={l.type}
              issuedAt={l.issuedAt}
              issuedBy={l.issuedBy.name}
              last={i === letters.length - 1}
              onView={openPdf}
              onShare={openPdf}
            />
          ))}
        </Card>
      )}
    </View>
  );
}

// One letter, as a stacked row: [name] type badge, issued date + issuer, actions.
export function LetterRow({ id, type, issuedAt, issuedBy, employee, last, onView, onShare, onSelectEmployee }: {
  id: string; type: HRLetterType; issuedAt: string; issuedBy: string; last: boolean;
  employee?: { userId: string; label: string };
  onView: (id: string, type: HRLetterType) => void;
  onShare: (id: string, type: HRLetterType) => void;
  onSelectEmployee?: (userId: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.letterRow, !last && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <View style={styles.flex1}>
        {employee ? (
          <Pressable onPress={() => onSelectEmployee?.(employee.userId)} accessibilityRole="link" hitSlop={6}>
            <ThemedText style={[styles.name, styles.link]} numberOfLines={1}>{employee.label}</ThemedText>
          </Pressable>
        ) : null}
        <View style={styles.badgeLine}><Badge variant={LETTER_TYPE_BADGE[type]} size="sm">{LETTER_TYPE_LABELS[type]}</Badge></View>
        <ThemedText themeColor="textSecondary" style={styles.small}>{`${fmtDateTime(issuedAt)} · ${issuedBy}`}</ThemedText>
      </View>
      <View style={styles.rowActions}>
        <Button size="sm" variant="secondary" onPress={() => onView(id, type)}>View PDF</Button>
        <LetterShareMenu letterId={id} onDeviceShare={() => onShare(id, type)} />
      </View>
    </View>
  );
}

// Every letter issued: the 5 newest up front, "View all" reveals the rest with
// a name/ID search and a type filter (dashboard AllLettersList).
const RECENT_LETTERS_COUNT = 5;

function AllLettersList({ refreshKey, onView, onShare, onSelectEmployee }: {
  refreshKey: number;
  onView: (id: string, type: HRLetterType) => void;
  onShare: (id: string, type: HRLetterType) => void;
  onSelectEmployee: (userId: string) => void;
}) {
  const [letters, setLetters] = useState<IssuedLetterSummary[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<HRLetterType | 'ALL'>('ALL');
  const theme = useTheme();

  useEffect(() => {
    fetchAllLetters().then(setLetters).catch(() => setLetters([]));
  }, [refreshKey]);

  if (!letters) return <Card padding="md"><Skeleton height={16} width="40%" /><Skeleton height={16} /></Card>;
  if (letters.length === 0) {
    return (
      <View style={styles.stack}>
        <ThemedText themeColor="textMuted" style={styles.sectionTitle}>LETTERS ISSUED</ThemedText>
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No letters have been issued yet.</ThemedText></Card>
      </View>
    );
  }

  // GET /hr/letters is newest-first already, so the first N are the most recent.
  const canExpand = letters.length > RECENT_LETTERS_COUNT;
  const q = search.trim().toLowerCase();
  const filtered = !showAll
    ? letters.slice(0, RECENT_LETTERS_COUNT)
    : letters.filter((l) => {
        if (typeFilter !== 'ALL' && l.type !== typeFilter) return false;
        if (!q) return true;
        return l.user.name.toLowerCase().includes(q) || (l.user.employeeId ?? '').toLowerCase().includes(q);
      });

  const typeOptions = [{ value: 'ALL', label: 'All types' }, ...(Object.keys(LETTER_TYPE_LABELS) as HRLetterType[]).map((t) => ({ value: t, label: LETTER_TYPE_LABELS[t] }))];

  return (
    <View style={styles.stack}>
      <ThemedText themeColor="textMuted" style={styles.sectionTitle}>{showAll ? `ALL LETTERS ISSUED (${letters.length})` : 'RECENT LETTERS ISSUED'}</ThemedText>
      {showAll ? (
        <View style={styles.stack}>
          <Input value={search} onChangeText={setSearch} placeholder="Search by employee name or ID" />
          <Select options={typeOptions} value={typeFilter} onChange={(v) => setTypeFilter(v as HRLetterType | 'ALL')} />
        </View>
      ) : null}
      {filtered.length === 0 ? (
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No letters match your search.</ThemedText></Card>
      ) : (
        <Card padding="none">
          {filtered.map((l, i) => (
            <LetterRow
              key={l.id}
              id={l.id}
              type={l.type}
              issuedAt={l.issuedAt}
              issuedBy={l.issuedBy.name}
              last={i === filtered.length - 1}
              employee={{ userId: l.userId, label: `${l.user.name}${l.user.employeeId ? ` (${l.user.employeeId})` : ''}` }}
              onView={onView}
              onShare={onShare}
              onSelectEmployee={onSelectEmployee}
            />
          ))}
        </Card>
      )}
      {canExpand ? (
        <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" hitSlop={8}>
          <ThemedText style={[styles.small, { color: theme.primary, fontFamily: FontWeights.semiBold }]}>
            {showAll ? '← Show recent only' : `View all ${letters.length} letters →`}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  end: { alignItems: 'flex-end' },
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  link: { textDecorationLine: 'underline' },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  code: { fontSize: 12, lineHeight: 18, padding: 8, borderWidth: 1, borderRadius: 8 },
  actions: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  letterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  badgeLine: { flexDirection: 'row', marginVertical: 4 },
  rowActions: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
});
