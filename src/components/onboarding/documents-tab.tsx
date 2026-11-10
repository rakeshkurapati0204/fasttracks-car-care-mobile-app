import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ADMIN_ROLES } from '@/components/applications/application-format';
import {
  DOC_TYPE_LABELS, DOC_UPLOAD_RULES, FILE_OR_VALUE_TYPES, MANDATORY_TYPES, VALUE_TYPES, allMandatoryVerified, sortByDocType,
} from '@/components/onboarding/document-format';
import { DocumentRow } from '@/components/onboarding/document-row';
import { FormGrid, PersonSelect, useCandidates } from '@/components/onboarding/form-parts';
import { LetterRow, openLetterPdf } from '@/components/onboarding/letters-tab';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { fetchLetterHistory, fetchOnboardingDocuments, getErrorMessage, uploadOnboardingDocument } from '@/lib/api';
import { pickFromCamera, pickFromGallery, useFileUpload, type PickedFile } from '@/lib/upload';
import type { HRLetter, HRLetterType, IdentityDocType, OnboardingDocument, OnboardingEmployee } from '@/types/api';

const TYPE_OPTIONS = (Object.keys(DOC_TYPE_LABELS) as IdentityDocType[]).map((t) => ({
  value: t,
  label: `${DOC_TYPE_LABELS[t]}${MANDATORY_TYPES.has(t) ? ' (Required)' : ''}`,
}));

// ── Upload form ──────────────────────────────────────────────────────────────
function DocumentUploadForm({ userId, onUploaded }: { userId: string; onUploaded: () => void }) {
  const theme = useTheme();
  const [type, setType] = useState<IdentityDocType>('PAN_CARD');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [branch, setBranch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const upload = useFileUpload<unknown>(DOC_UPLOAD_RULES);

  const isBank = type === 'BANK_ACCOUNT';
  const isFileOrValue = FILE_OR_VALUE_TYPES.has(type);
  const needsValue = VALUE_TYPES.has(type);
  const fileOptional = isBank || isFileOrValue; // a number alone (or a file alone) is enough
  const uploading = saving || upload.status === 'uploading';

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: DOC_UPLOAD_RULES.allowedMimeTypes, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    upload.pick({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size } satisfies PickedFile);
  };

  const submit = async () => {
    setError('');
    const file = upload.file;
    if (!fileOptional && !file) { setError('A file is required for this document type.'); return; }
    if (isFileOrValue && !file && !value.trim()) { setError('Provide a file, a number, or both.'); return; }
    if (isBank) {
      if (!value.trim()) { setError('Account number is required.'); return; }
      if (!ifsc.trim()) { setError('IFSC code is required.'); return; }
      if (!branch.trim()) { setError('Bank branch is required.'); return; }
    }
    const extra = {
      label: label.trim() || undefined,
      value: needsValue ? value.trim() || undefined : undefined,
      ifsc: isBank ? ifsc.trim() : undefined,
      branch: isBank ? branch.trim() : undefined,
    };
    let ok = false;
    if (file) {
      ok = !!(await upload.upload((f, ctrl) => uploadOnboardingDocument(userId, f, type, extra, ctrl)));
    } else {
      setSaving(true); // number-only document: no file, so no progress hook
      try {
        await uploadOnboardingDocument(userId, null, type, extra, { onProgress: () => {}, signal: new AbortController().signal });
        ok = true;
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Failed to upload document.'));
      } finally {
        setSaving(false);
      }
    }
    if (ok) {
      setLabel(''); setValue(''); setIfsc(''); setBranch('');
      upload.reset();
      onUploaded();
    }
  };

  const shownError = error || upload.error || '';

  return (
    <Card padding="md">
      <View style={styles.stack}>
        {shownError ? <ErrorBanner message={shownError} /> : null}
        <FormGrid cols={3}>
          <Select label="Document Type" required options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v as IdentityDocType)} />
          <Input label="Label (optional)" value={label} onChangeText={setLabel} placeholder="e.g. Primary account" />
          {isFileOrValue ? <Input label="Number" value={value} onChangeText={setValue} placeholder="Optional — encrypted at rest" /> : null}
        </FormGrid>
        {isBank ? (
          <FormGrid cols={3}>
            <Input label="Account Number" required value={value} onChangeText={setValue} placeholder="Encrypted at rest" keyboardType="numeric" />
            <Input label="IFSC Code" required value={ifsc} onChangeText={setIfsc} placeholder="e.g. HDFC0001234" autoCapitalize="characters" />
            <Input label="Bank Branch" required value={branch} onChangeText={setBranch} placeholder="e.g. MG Road" />
          </FormGrid>
        ) : null}

        <View style={styles.stack}>
          <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>{`File${fileOptional ? ' (optional)' : ' *'}`}</ThemedText>
          <View style={styles.actions}>
            <Button size="sm" variant="secondary" icon="document-attach-outline" disabled={uploading} onPress={chooseFile}>Choose file</Button>
            <Button size="sm" variant="secondary" icon="camera-outline" disabled={uploading} onPress={async () => { const f = await pickFromCamera(); if (f) upload.pick(f); }}>Take photo</Button>
            <Button size="sm" variant="secondary" icon="images-outline" disabled={uploading} onPress={async () => { const f = await pickFromGallery(); if (f) upload.pick(f); }}>Gallery</Button>
          </View>
          {upload.file ? (
            <View style={[styles.picked, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.small} numberOfLines={1}>{upload.file.name}</ThemedText>
              {upload.status === 'uploading' ? <ActivityIndicator size="small" /> : null}
            </View>
          ) : (
            <ThemedText themeColor="textMuted" style={styles.small}>JPEG, PNG, WebP or PDF, up to 10 MB.</ThemedText>
          )}
        </View>

        <Button loading={uploading} onPress={submit}>{uploading ? 'Uploading…' : 'Upload Document'}</Button>
      </View>
    </Card>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────
type Props = {
  employees: OnboardingEmployee[];
  userId: string;
  onUserIdChange: (id: string) => void;
  /** Fired when HR's review completes a candidate's mandatory set (not-all → all). */
  onAllMandatoryVerified: (userId: string) => void;
  refreshKey: number;
};

// Dashboard DocumentsTab: a person picker, HR upload form, the person's
// documents (DocumentRow) and their generated letters.
export function DocumentsTab({ employees, userId, onUserIdChange, onAllMandatoryVerified, refreshKey }: Props) {
  const { user } = useAuth();
  const canManage = ADMIN_ROLES.includes(user?.role ?? '');
  const candidates = useCandidates(refreshKey);
  const [docs, setDocs] = useState<OnboardingDocument[]>([]);
  const [letters, setLetters] = useState<HRLetter[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [letterError, setLetterError] = useState<string | null>(null);

  // Resolves with the fresh documents (null on failure / nobody picked) so a
  // row change can compare them without waiting on a state update.
  const load = useCallback(async (): Promise<OnboardingDocument[] | null> => {
    if (!userId) { setDocs([]); setLetters([]); return null; }
    setLoading(true);
    setLoadError(null);
    try {
      const [fresh, history] = await Promise.all([fetchOnboardingDocuments(userId), fetchLetterHistory(userId)]);
      setDocs(fresh);
      setLetters(history);
      return fresh;
    } catch (err: unknown) {
      setDocs([]);
      setLetters([]);
      setLoadError(getErrorMessage(err, 'Could not load documents.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on pick / pull-to-refresh
    load();
  }, [load, refreshKey]);

  // Hand a candidate to Letters the moment HR's review completes their mandatory
  // set — only on the not-all → all transition, never merely on opening someone
  // already fully verified (that would bounce HR straight back out).
  const onRowChanged = () => {
    const uid = userId;
    const was = allMandatoryVerified(docs);
    load().then((fresh) => {
      if (!fresh || was || !allMandatoryVerified(fresh)) return;
      if (candidates.some((c) => c.id === uid)) onAllMandatoryVerified(uid);
    });
  };

  const sorted = useMemo(() => sortByDocType(docs), [docs]);
  const openPdf = async (letterId: string, type: HRLetterType) => setLetterError(await openLetterPdf(letterId, type));

  return (
    <View style={styles.stack}>
      <PersonSelect employees={employees} candidates={candidates} userId={userId} onChange={onUserIdChange} />

      {!userId ? null : (
        <>
          {canManage ? <DocumentUploadForm userId={userId} onUploaded={load} /> : null}

          {loadError ? <ErrorBanner message={loadError} onRetry={load} /> : null}
          {letterError ? <ErrorBanner message={letterError} /> : null}

          {loading ? (
            <Card padding="md"><Skeleton height={44} /><Skeleton height={44} /></Card>
          ) : !loadError && docs.length === 0 && letters.length === 0 ? (
            <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No documents or letters on file for this employee.</ThemedText></Card>
          ) : (
            <>
              {sorted.length > 0 ? (
                <View style={styles.list}>
                  {sorted.map((doc) => <DocumentRow key={doc.id} doc={doc} canManage={canManage} onChanged={onRowChanged} />)}
                </View>
              ) : null}

              {letters.length > 0 ? (
                <View style={styles.stack}>
                  <ThemedText themeColor="textMuted" style={styles.groupTitle}>GENERATED LETTERS</ThemedText>
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
                </View>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  list: { gap: 6 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium },
  groupTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  picked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderWidth: 1, borderRadius: Radii.sm },
});
