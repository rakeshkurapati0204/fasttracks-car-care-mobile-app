import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createLegalCase, downloadLegalDocument, fetchLegalCaseDocuments, saveLegalCase, uploadLegalDocument } from '@/lib/api';
import { useFileUpload, type PickedFile } from '@/lib/upload';
import type { LegalCase, LegalDocument } from '@/types/api';

export type Section = 'PERSONAL' | 'PROFESSIONAL';

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The backend's multer filter: PDF, images and Office documents, 15 MB.
const DOC_MIMES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const UPLOAD_RULES = { allowedMimeTypes: DOC_MIMES, maxSizeBytes: 15 * 1024 * 1024 };

function ErrorText({ message }: { message: string }) {
  const theme = useTheme();
  return message ? <ThemedText style={[styles.body, { color: theme.danger }]}>{message}</ThemedText> : null;
}

// ─── New Case ────────────────────────────────────────────────────────────────
export function NewCaseSheet({ section, onClose, onCreated, onError }: { section: Section; onClose: () => void; onCreated: () => void; onError: (m: string) => void }) {
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState('Open');
  const [nextHearingDate, setNextHearingDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!title.trim() || !status.trim()) { setError('Title and status are required'); return; }
    setSaving(true);
    setError('');
    try {
      await createLegalCase({ section, title: title.trim(), status: status.trim(), nextHearingDate: nextHearingDate || undefined, notes: notes || undefined });
      onCreated();
    } catch {
      setError('Failed to create case');
      onError('Failed to create case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`New ${section === 'PERSONAL' ? 'Personal' : 'Professional'} Case`}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} style={styles.flex1}>Cancel</Button>
          <Button onPress={create} loading={saving} style={styles.flex1}>Create Case</Button>
        </>
      }>
      <Input label="Title *" value={title} onChangeText={setTitle} />
      <Input label="Status *" value={status} onChangeText={setStatus} />
      <DateField label="Next Hearing Date" value={nextHearingDate} onChange={setNextHearingDate} />
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline />
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Case detail: fields + documents vault ──────────────────────────────────
export function CaseDetailSheet({
  legalCase, wide, onClose, onUpdated, notify,
}: { legalCase: LegalCase; wide: boolean; onClose: () => void; onUpdated: () => void; notify: (type: 'success' | 'error', msg: string) => void }) {
  const theme = useTheme();
  const [title, setTitle] = useState(legalCase.title);
  const [status, setStatus] = useState(legalCase.status);
  const [nextHearingDate, setNextHearingDate] = useState(legalCase.nextHearingDate ? legalCase.nextHearingDate.slice(0, 10) : '');
  const [notes, setNotes] = useState(legalCase.notes ?? '');
  const [saving, setSaving] = useState(false);

  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docLabel, setDocLabel] = useState('');
  const [error, setError] = useState('');
  const upload = useFileUpload<LegalDocument>(UPLOAD_RULES);
  const uploading = upload.status === 'uploading';

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      setDocs((await fetchLegalCaseDocuments(legalCase.id)) ?? []);
    } catch {
      notify('error', 'Failed to load documents');
    } finally {
      setDocsLoading(false);
    }
  }, [legalCase.id, notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    loadDocs();
  }, [loadDocs]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await saveLegalCase(legalCase.id, { title, status, nextHearingDate: nextHearingDate || null, notes: notes || null });
      notify('success', 'Case updated');
      onUpdated();
    } catch {
      setError('Failed to update case');
      notify('error', 'Failed to update case');
    } finally {
      setSaving(false);
    }
  };

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: DOC_MIMES, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    const file: PickedFile = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size };
    upload.pick(file);
  };

  const doUpload = async () => {
    if (!upload.file || !docLabel.trim()) { setError('Choose a file and enter a label'); return; }
    setError('');
    const result = await upload.upload((file, ctrl) => uploadLegalDocument(legalCase.id, file, docLabel.trim(), ctrl));
    if (result) {
      notify('success', 'Document uploaded');
      setDocLabel('');
      upload.reset();
      loadDocs();
    }
  };

  const view = async (d: LegalDocument) => {
    try {
      const { uri } = await downloadLegalDocument(d.id, d.filename);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
      await Sharing.shareAsync(uri, { mimeType: d.mimeType });
    } catch {
      notify('error', 'Failed to open document');
    }
  };

  const cell = wide ? styles.flex1 : undefined;
  return (
    <Sheet visible fullHeight onClose={onClose} locked={saving || uploading} title={legalCase.title}>
      <View style={[styles.grid, wide && styles.gridRow]}>
        <View style={cell}><Input label="Title" value={title} onChangeText={setTitle} /></View>
        <View style={cell}><Input label="Status" value={status} onChangeText={setStatus} /></View>
      </View>
      <View style={[styles.grid, wide && styles.gridRow]}>
        <View style={cell}><DateField label="Next Hearing Date" value={nextHearingDate} onChange={setNextHearingDate} /></View>
        {wide ? <View style={styles.flex1} /> : null}
      </View>
      <Input label="Notes" value={notes} onChangeText={setNotes} multiline />
      <View style={styles.right}><Button onPress={save} loading={saving}>Save Changes</Button></View>

      <View style={[styles.docs, { borderTopColor: theme.border }]}>
        <ThemedText style={styles.docsTitle}>Documents</ThemedText>
        <View style={[styles.uploadRow, wide && styles.uploadRowWide]}>
          <View style={wide ? styles.flex1 : undefined}>
            <Input placeholder="Document label (e.g. Court Order — 12 Aug)" value={docLabel} onChangeText={setDocLabel} />
          </View>
          <Button variant="outline" onPress={chooseFile} disabled={uploading}>{upload.file ? 'Change file' : 'Choose file'}</Button>
          <Button variant="secondary" onPress={doUpload} loading={uploading} disabled={!upload.file || !docLabel.trim()}>Upload</Button>
        </View>
        {upload.file ? <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.small}>{upload.file.name}</ThemedText> : null}
        <ErrorText message={upload.error ?? error} />

        {docsLoading ? (
          <ThemedText themeColor="textMuted" style={styles.center}>Loading…</ThemedText>
        ) : docs.length === 0 ? (
          <ThemedText themeColor="textMuted" style={styles.center}>No documents uploaded yet</ThemedText>
        ) : (
          <View>
            {docs.map((d) => (
              <View key={d.id} style={[styles.docRow, { borderBottomColor: theme.border }, wide && styles.docRowWide]}>
                <Pressable onPress={() => view(d)} accessibilityRole="button" style={wide ? styles.flex1 : undefined}>
                  <ThemedText numberOfLines={1} style={[styles.docLabel, { color: theme.primary }]}>{d.label}</ThemedText>
                </Pressable>
                <ThemedText themeColor="textMuted" style={[styles.meta, !wide && { marginTop: 2 }]}>
                  {`${d.filename} · ${fmtFileSize(d.fileSize)} · ${d.uploadedBy.name} · ${fmtDate(d.createdAt)}`}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row' },
  right: { alignItems: 'flex-end' },
  docs: { borderTopWidth: 1, paddingTop: 16, gap: 12 },
  docsTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  uploadRow: { gap: 8 },
  uploadRowWide: { flexDirection: 'row', alignItems: 'flex-start' },
  center: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 16 },
  docRow: { paddingVertical: 8, borderBottomWidth: 1 },
  docRowWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  docLabel: { fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' },
  meta: { fontSize: 11, lineHeight: 16 },
});
