import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { fmtDate, fmtDateTime } from '@/components/applications/application-format';
import { DOC_TYPE_LABELS, MANDATORY_TYPES, statusBadgeVariant } from '@/components/onboarding/document-format';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Input } from '@/components/ui';
import { Fonts, FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteIdentityDocument, downloadIdentityDocumentFile, getErrorMessage, revealIdentityDocumentValue, setOnboardingDocumentStatus } from '@/lib/api';
import type { IdentityDocumentStatus, OnboardingDocument } from '@/types/api';

type Props = { doc: OnboardingDocument; canManage: boolean; onChanged: () => void };

// Dashboard DocumentRow. A PENDING document's review controls (and a number's
// reveal) show directly under the row; once verified/rejected only the outcome
// stays, so there are no lingering Verify/Reject/Delete buttons to hit by accident.
export function DocumentRow({ doc, canManage, onChanged }: Props) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState('');
  const showActions = canManage && doc.status === 'PENDING';

  const reveal = async () => {
    setRevealing(true);
    setError('');
    try {
      setRevealed(await revealIdentityDocumentValue(doc.id));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to reveal value.'));
    } finally {
      setRevealing(false);
    }
  };

  // Downloaded to the cache, then opened in the device's share / open-with sheet.
  const view = async () => {
    setError('');
    try {
      const { uri } = await downloadIdentityDocumentFile(doc.id, doc.filename);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, doc.mimeType ? { mimeType: doc.mimeType } : undefined);
      else setError('Sharing isn’t available on this device.');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not open the document.'));
    }
  };

  const doRemove = async () => {
    setBusy(true);
    try {
      await deleteIdentityDocument(doc.id);
      onChanged();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete.'));
    } finally {
      setBusy(false);
    }
  };
  const remove = () => Alert.alert('Delete document', 'Delete this document permanently?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: doRemove },
  ]);

  const setStatus = async (status: IdentityDocumentStatus, reason?: string) => {
    setBusy(true);
    setError('');
    try {
      await setOnboardingDocumentStatus(doc.id, status, reason);
      setRejecting(false);
      onChanged();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update status.'));
    } finally {
      setBusy(false);
    }
  };

  const reviewed = !!doc.verifiedBy && doc.status !== 'PENDING';
  const hasDetail = doc.hasValue || (doc.type === 'BANK_ACCOUNT' && (!!doc.bankIfsc || !!doc.bankBranch))
    || (!!doc.filename && !!doc.fileSize) || (doc.status === 'REJECTED' && !!doc.rejectionReason) || reviewed || showActions || !!error;

  const meta = [
    doc.filename && doc.fileSize ? `File size: ${(doc.fileSize / 1024).toFixed(0)} KB` : null,
    reviewed ? `${doc.status === 'VERIFIED' ? 'Verified' : 'Reviewed'} by ${doc.verifiedBy?.name} · ${fmtDateTime(doc.verifiedAt)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.head}>
        <View style={styles.headMain}>
          <View style={styles.titleLine}>
            <ThemedText style={[styles.title, styles.shrink]}>{`${DOC_TYPE_LABELS[doc.type]}${doc.label ? ` — ${doc.label}` : ''}`}</ThemedText>
            {MANDATORY_TYPES.has(doc.type) ? <Badge variant="warning" size="sm">Required</Badge> : null}
            <Badge variant={statusBadgeVariant(doc.status)} size="sm">{doc.status}</Badge>
          </View>
          <ThemedText themeColor="textMuted" style={styles.small}>
            {`${doc.filename || (doc.hasValue ? 'Number on file' : 'No file')} · ${fmtDate(doc.createdAt)} by ${doc.uploadedBy.name}`}
          </ThemedText>
        </View>
        {doc.filename ? <Button size="sm" variant="secondary" onPress={view}>View</Button> : null}
      </View>

      {hasDetail ? (
        <View style={[styles.detail, { borderTopColor: theme.border }]}>
          {doc.hasValue ? (
            <View style={styles.valueLine}>
              <ThemedText themeColor="textMuted" style={styles.body}>{doc.type === 'BANK_ACCOUNT' ? 'Account Number:' : 'Value:'}</ThemedText>
              <ThemedText style={[styles.body, styles.mono]}>{revealed ?? doc.maskedValue ?? '••••'}</ThemedText>
              {!revealed ? (
                <Button size="sm" variant="secondary" loading={revealing} onPress={reveal}>{revealing ? 'Revealing…' : 'Reveal'}</Button>
              ) : (
                <Button size="sm" variant="secondary" onPress={() => setRevealed(null)}>Hide</Button>
              )}
            </View>
          ) : null}
          {revealed ? <ThemedText themeColor="textMuted" style={styles.tiny}>This reveal was logged against your account.</ThemedText> : null}
          {doc.type === 'BANK_ACCOUNT' && (doc.bankIfsc || doc.bankBranch) ? (
            <ThemedText style={styles.body}>
              {doc.bankIfsc ? `IFSC: ${doc.bankIfsc}` : ''}{doc.bankIfsc && doc.bankBranch ? ' · ' : ''}{doc.bankBranch ? `Branch: ${doc.bankBranch}` : ''}
            </ThemedText>
          ) : null}

          {doc.status === 'REJECTED' && doc.rejectionReason ? (
            <View style={[styles.reject, { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
              <ThemedText style={[styles.small, { color: theme.danger }]}>{`Rejected: ${doc.rejectionReason}`}</ThemedText>
            </View>
          ) : null}
          {meta ? <ThemedText themeColor="textMuted" style={styles.small}>{meta}</ThemedText> : null}
          {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}

          {rejecting ? (
            <View style={styles.stack}>
              <Input placeholder="Reason for rejection" value={rejectReason} onChangeText={setRejectReason} />
              <View style={styles.actions}>
                <Button size="sm" variant="danger" disabled={busy || !rejectReason.trim()} onPress={() => setStatus('REJECTED', rejectReason.trim())}>Confirm Reject</Button>
                <Button size="sm" variant="secondary" onPress={() => setRejecting(false)}>Cancel</Button>
              </View>
            </View>
          ) : null}

          {showActions && !rejecting ? (
            <View style={styles.actions}>
              <Button size="sm" disabled={busy} onPress={() => setStatus('VERIFIED')}>Verify</Button>
              <Button size="sm" variant="danger" disabled={busy} onPress={() => setRejecting(true)}>Reject</Button>
              <Button size="sm" variant="secondary" disabled={busy} onPress={remove}>Delete</Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  headMain: { flex: 1, minWidth: 0, gap: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  title: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 10, lineHeight: 14 },
  mono: { fontFamily: Fonts?.mono },
  detail: { borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  valueLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  reject: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.sm },
  stack: { gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
