import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input } from '@/components/ui';
import { FontWeights, Fonts, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteBankAccountDocument, deleteEmiDocument, downloadAccountDocument, fetchBankAccountDocuments, fetchEmiDocuments,
  getErrorMessage, uploadBankAccountDocument, uploadEmiDocument,
} from '@/lib/api';
import { pickFromCamera, validatePickedFile, type PickedFile } from '@/lib/upload';
import type { AccountDocument } from '@/types/api';

import { DOC_RULES, fmtDateTime, fmtFileSize } from './helpers';

export type Notify = (type: 'success' | 'error' | 'warning', msg: string) => void;

// Dashboard Badge: coloured text on a 13% tint, 10px uppercase semibold.
export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: withAlpha(color, 0.13) }]}>
      <ThemedText style={[styles.tagText, { color }]}>{label.toUpperCase()}</ThemedText>
    </View>
  );
}

// Dashboard Field: small muted label above the control.
export function AField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText themeColor="textMuted" style={styles.fieldLabel}>{label}</ThemedText>
      {children}
      {hint ? <ThemedText themeColor="textMuted" style={styles.hint}>{hint}</ThemedText> : null}
    </View>
  );
}

export function FormError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.formErr, { backgroundColor: withAlpha(theme.danger, 0.08), borderColor: withAlpha(theme.danger, 0.3) }]}>
      <ThemedText style={[styles.small, { color: theme.danger, fontFamily: FontWeights.semiBold }]}>{message}</ThemedText>
    </View>
  );
}

export function EmptyState({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="business-outline" size={24} color={theme.textMuted} />
      </View>
      <ThemedText themeColor="textMuted" style={styles.small}>{message}</ThemedText>
    </View>
  );
}

// Uppercase muted caption + big bold amount ("Total across all accounts").
export function Summary({ caption, value, color, action }: { caption: string; value: string; color: string; action: ReactNode }) {
  return (
    <View style={styles.summary}>
      <View style={styles.flex1}>
        <ThemedText themeColor="textMuted" style={styles.caption}>{caption.toUpperCase()}</ThemedText>
        <ThemedText style={[styles.bigAmount, { color }]}>{value}</ThemedText>
      </View>
      {action}
    </View>
  );
}

export function AccCard({ children, accent }: { children: ReactNode; accent?: string }) {
  return (
    <Card style={accent ? { borderLeftWidth: 3, borderLeftColor: accent } : undefined}>
      {children}
    </Card>
  );
}

export function Money({ value, color, size = 20, suffix }: { value: string; color: string; size?: number; suffix?: string }) {
  return (
    <ThemedText style={{ color, fontSize: size, lineHeight: size + 6, fontFamily: Fonts?.mono, fontWeight: '700' }}>
      {value}
      {suffix ? <ThemedText themeColor="textMuted" style={styles.suffix}>{suffix}</ThemedText> : null}
    </ThemedText>
  );
}

// ─── Documents sheet (bank accounts: label optional · EMIs: label required) ──
export function DocumentsSheet({ kind, ownerId, title, onClose, notify }: {
  kind: 'bank' | 'emi'; ownerId: string; title: string; onClose: () => void; notify: Notify;
}) {
  const theme = useTheme();
  const emi = kind === 'emi';
  const [docs, setDocs] = useState<AccountDocument[] | null>(null);
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setDocs(await (emi ? fetchEmiDocuments(ownerId) : fetchBankAccountDocuments(ownerId)));
    } catch {
      notify('error', 'Failed to load documents');
      setDocs([]);
    }
  }, [emi, ownerId, notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the sheet opens
    load();
  }, [load]);

  const pick = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: DOC_RULES.allowedMimeTypes, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    choose({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size });
  };
  const camera = async () => { const f = await pickFromCamera(); if (f) choose(f); };
  const choose = (f: PickedFile) => {
    const invalid = validatePickedFile(f, DOC_RULES);
    if (invalid) { setError(invalid); setFile(null); return; }
    setError('');
    setFile(f);
  };

  const upload = async () => {
    if (!file) { setError('Choose a file first'); return; }
    if (emi && !label.trim()) { setError('Enter a document type/label'); return; }
    setUploading(true);
    setError('');
    const ctrl = { onProgress: () => {}, signal: new AbortController().signal };
    try {
      if (emi) await uploadEmiDocument(ownerId, file, label.trim(), ctrl);
      else await uploadBankAccountDocument(ownerId, file, label.trim() || undefined, ctrl);
      notify('success', 'Document uploaded');
      setLabel('');
      setFile(null);
      await load();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (d: AccountDocument) => {
    try {
      await (emi ? deleteEmiDocument(d.id) : deleteBankAccountDocument(d.id));
      notify('success', 'Document deleted');
      await load();
    } catch {
      notify('error', 'Failed to delete document');
    }
  };

  const view = async (d: AccountDocument) => {
    try {
      const { uri } = await downloadAccountDocument(kind, d.id, d.filename);
      if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
      await Sharing.shareAsync(uri, { mimeType: d.mimeType });
    } catch {
      notify('error', 'Failed to open document');
    }
  };

  return (
    <Sheet visible fullHeight onClose={onClose} locked={uploading} title={`Documents — ${title}`}>
      <View style={styles.gap}>
        <AField label={emi ? 'Document Type *' : 'Label (optional)'}>
          <Input value={label} onChangeText={setLabel} placeholder={emi ? 'e.g. Sanction Letter, Statement' : 'e.g. Statement — August 2026'} />
        </AField>
        <AField label="File">
          <View style={styles.row}>
            <Button variant="outline" size="sm" onPress={pick} disabled={uploading} style={styles.flex1}>{file ? file.name : 'Choose file'}</Button>
            <Button variant="outline" size="sm" onPress={camera} disabled={uploading}>Camera</Button>
          </View>
        </AField>
        {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
        <View style={styles.end}>
          <Button onPress={upload} loading={uploading} disabled={!file || (emi && !label.trim())}>
            {uploading ? 'Uploading…' : emi ? 'Upload Document' : 'Upload Statement'}
          </Button>
        </View>
      </View>

      <View style={[styles.divider, { borderTopColor: theme.border }]}>
        {docs === null ? (
          <ThemedText themeColor="textMuted" style={[styles.small, styles.center]}>Loading…</ThemedText>
        ) : docs.length === 0 ? (
          <ThemedText themeColor="textMuted" style={[styles.small, styles.center]}>No documents uploaded yet</ThemedText>
        ) : (
          docs.map((d) => (
            <View key={d.id} style={[styles.docRow, { borderBottomColor: theme.border }]}>
              <View style={styles.flex1}>
                <Pressable onPress={() => view(d)} accessibilityRole="button">
                  <ThemedText numberOfLines={1} style={[styles.docName, { color: theme.primary }]}>{d.label || d.filename}</ThemedText>
                </Pressable>
                <ThemedText themeColor="textMuted" style={styles.tiny}>
                  {`${d.filename} · ${fmtFileSize(d.fileSize)} · ${d.uploadedBy.name} · ${fmtDateTime(d.createdAt)}`}
                </ThemedText>
              </View>
              <Pressable onPress={() => remove(d)} hitSlop={8} accessibilityRole="button">
                <ThemedText style={[styles.tiny, { color: theme.danger, textDecorationLine: 'underline' }]}>Delete</ThemedText>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  end: { alignItems: 'flex-end' },
  small: { fontSize: 13, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 15 },
  center: { textAlign: 'center', paddingVertical: 16 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 0.4 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  hint: { fontSize: 10, lineHeight: 14 },
  formErr: { borderWidth: 1, borderRadius: 8, padding: 10 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 56 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  caption: { fontSize: 11, lineHeight: 15, fontFamily: FontWeights.medium, letterSpacing: 0.5, marginBottom: 2 },
  bigAmount: { fontSize: 24, lineHeight: 32, fontFamily: Fonts?.mono, fontWeight: '700' },
  suffix: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  divider: { borderTopWidth: 1, paddingTop: 12 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1 },
  docName: { fontSize: 14, lineHeight: 20, textDecorationLine: 'underline' },
});
