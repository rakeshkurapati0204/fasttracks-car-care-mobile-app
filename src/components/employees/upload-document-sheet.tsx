import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { uploadIdentityDocument } from '@/lib/api';
import { pickFromCamera, pickFromGallery, useFileUpload, type PickedFile } from '@/lib/upload';
import type { IdentityDocType } from '@/types/api';

// Same limits as the dashboard's file input and the backend: jpeg / png / webp / pdf.
const UPLOAD_RULES = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  maxSizeBytes: 10 * 1024 * 1024,
};

// The dashboard's three document types.
const DOC_TYPES: { value: IdentityDocType; label: string }[] = [
  { value: 'PAN_CARD', label: 'PAN Card' },
  { value: 'AADHAAR_CARD', label: 'Aadhaar Card' },
  { value: 'OTHER', label: 'Other' },
];

type Props = {
  employee: { id: string; name: string };
  onClose: () => void;
  /** Called after a successful upload. */
  onUploaded: () => void;
};

// Dashboard upload form (type, "What is this document?", file), as a bottom
// sheet. Mount only while open so every opening starts fresh.
export function UploadDocumentSheet({ employee, onClose, onUploaded }: Props) {
  const theme = useTheme();
  const [docType, setDocType] = useState<IdentityDocType>('PAN_CARD');
  const [docLabel, setDocLabel] = useState('');
  const upload = useFileUpload<unknown>(UPLOAD_RULES);

  const chooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: UPLOAD_RULES.allowedMimeTypes, copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    const file: PickedFile = { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size };
    upload.pick(file);
  };

  const submit = async () => {
    const result = await upload.upload((file, ctrl) =>
      uploadIdentityDocument(employee.id, file, docType, docType === 'OTHER' ? docLabel.trim() || undefined : undefined, ctrl),
    );
    if (result) {
      onUploaded();
      onClose();
    }
  };

  const uploading = upload.status === 'uploading';

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={uploading}
      title="Upload document"
      subtitle={employee.name}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={uploading}>Cancel</Button>
          <Button style={styles.flex1} loading={uploading} disabled={!upload.file} onPress={submit}>Upload</Button>
        </>
      }>
      <Select label="Document type" options={DOC_TYPES} value={docType} onChange={(v) => setDocType(v as IdentityDocType)} />
      {docType === 'OTHER' ? <Input value={docLabel} onChangeText={setDocLabel} placeholder="What is this document?" /> : null}

      <View style={styles.pickRow}>
        <Button size="sm" variant="secondary" icon="document-attach-outline" onPress={chooseFile} disabled={uploading}>Choose file</Button>
        <Button size="sm" variant="secondary" icon="camera-outline" disabled={uploading} onPress={async () => { const f = await pickFromCamera(); if (f) upload.pick(f); }}>Take photo</Button>
        <Button size="sm" variant="secondary" icon="images-outline" disabled={uploading} onPress={async () => { const f = await pickFromGallery(); if (f) upload.pick(f); }}>Gallery</Button>
      </View>

      {upload.file ? (
        <View style={[styles.picked, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <ThemedText style={styles.small} numberOfLines={1}>{upload.file.name}</ThemedText>
          {uploading ? <ActivityIndicator size="small" /> : null}
        </View>
      ) : (
        <ThemedText themeColor="textMuted" style={styles.small}>JPEG, PNG, WebP or PDF, up to 10 MB.</ThemedText>
      )}
      {upload.error ? <ThemedText themeColor="danger" style={styles.small}>{upload.error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  small: { fontSize: 12, lineHeight: 18 },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  picked: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12, borderWidth: 1, borderRadius: Radii.sm },
});
