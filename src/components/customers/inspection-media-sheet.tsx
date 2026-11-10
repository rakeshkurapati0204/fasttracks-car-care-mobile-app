import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radii } from '@/constants/theme';
import { deleteInspectionMedia, fetchInspectionMedia, getErrorMessage, uploadInspectionMedia } from '@/lib/api';
import { pickFromCamera, pickFromGallery, useFileUpload } from '@/lib/upload';
import type { CjJobCard, JobCardInspectionMedia } from '@/types/api';

// Same limits as the job detail screen / backend inspectionUpload (images only
// in the app: the pickers are image-only).
const UPLOAD_RULES = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'],
  maxSizeBytes: 100 * 1024 * 1024,
};

type Props = {
  job: CjJobCard | null;
  /** OWNER / STORE_MANAGER only (the backend refuses everyone else). */
  canDelete: boolean;
  canUpload: boolean;
  onClose: () => void;
  onCountChange: (jobId: string, count: number) => void;
};

// Dashboard InspectionMediaModal, as a bottom sheet.
export function InspectionMediaSheet({ job, canDelete, canUpload, onClose, onCountChange }: Props) {
  return (
    <Sheet visible={!!job} onClose={onClose} title="Inspection photos" subtitle={job ? `${job.jobNumber} · ${job.customer.name}${job.vehicleNumber ? ` · ${job.vehicleNumber}` : ''}` : undefined}>
      {job ? <MediaBody key={job.id} job={job} canDelete={canDelete} canUpload={canUpload} onCountChange={onCountChange} /> : null}
    </Sheet>
  );
}

function MediaBody({ job, canDelete, canUpload, onCountChange }: { job: CjJobCard; canDelete: boolean; canUpload: boolean; onCountChange: Props['onCountChange'] }) {
  const [media, setMedia] = useState<JobCardInspectionMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const upload = useFileUpload<{ uploaded: JobCardInspectionMedia[]; count: number }>(UPLOAD_RULES);

  useEffect(() => {
    let alive = true;
    fetchInspectionMedia(job.id)
      .then((list) => { if (alive) setMedia(list); })
      .catch((err: unknown) => { if (alive) { setMedia([]); setError(getErrorMessage(err, 'Could not load photos.')); } });
    return () => { alive = false; };
  }, [job.id]);

  const refresh = async () => {
    const list = await fetchInspectionMedia(job.id);
    setMedia(list);
    onCountChange(job.id, list.length);
  };

  const doUpload = () =>
    upload.upload((file, ctrl) => uploadInspectionMedia(job.id, file, ctrl)).then((result) => {
      if (result) {
        upload.reset();
        refresh().catch(() => {});
      }
    });

  const onDelete = (m: JobCardInspectionMedia) => {
    Alert.alert('Delete this photo?', m.filename, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingId(m.id);
          setError(null);
          try {
            await deleteInspectionMedia(job.id, m.id);
            await refresh();
          } catch (err: unknown) {
            setError(getErrorMessage(err, 'Could not delete this photo.'));
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  return (
    <>
      {media === null ? (
        <ActivityIndicator />
      ) : media.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.italic}>No inspection photos uploaded yet.</ThemedText>
      ) : (
        <View style={styles.grid}>
          {media.map((m) => (
            <View key={m.id}>
              {m.type === 'image' ? (
                <Image source={{ uri: m.url }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.videoThumb]}><ThemedText type="small">Video</ThemedText></View>
              )}
              {canDelete && (
                <Pressable onPress={() => onDelete(m)} disabled={deletingId === m.id} accessibilityLabel="Delete photo" style={styles.del}>
                  {deletingId === m.id ? <ActivityIndicator size="small" /> : <ThemedText style={styles.delText}>✕</ThemedText>}
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {canUpload ? (
        upload.file ? (
          <View style={styles.pending}>
            <ThemedText type="small" numberOfLines={1} style={styles.flex1}>{upload.file.name}</ThemedText>
            {upload.status === 'uploading' ? (
              <ActivityIndicator size="small" />
            ) : upload.status === 'error' ? (
              <Button size="sm" onPress={upload.retry}>Retry</Button>
            ) : (
              <Button size="sm" onPress={doUpload}>Upload</Button>
            )}
            <Button size="sm" variant="ghost" onPress={upload.reset}>Cancel</Button>
          </View>
        ) : (
          <View style={styles.pending}>
            <Button size="sm" variant="secondary" icon="camera-outline" onPress={async () => { const f = await pickFromCamera(); if (f) upload.pick(f); }}>Take photo</Button>
            <Button size="sm" variant="secondary" icon="images-outline" onPress={async () => { const f = await pickFromGallery(); if (f) upload.pick(f); }}>Gallery</Button>
          </View>
        )
      ) : null}

      {upload.error ? <ThemedText themeColor="danger" type="small">{upload.error}</ThemedText> : null}
      {error ? <ThemedText themeColor="danger" type="small">{error}</ThemedText> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  italic: { fontStyle: 'italic' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: Radii.sm },
  videoThumb: { backgroundColor: 'rgba(127,127,127,0.2)', alignItems: 'center', justifyContent: 'center' },
  del: { position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  delText: { color: '#ffffff' },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
});
