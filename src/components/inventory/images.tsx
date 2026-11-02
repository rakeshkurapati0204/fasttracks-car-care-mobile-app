import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteInventoryImage, getErrorMessage, uploadInventoryImages } from '@/lib/api';
import { pickFromCamera, pickFromGallery, validatePickedFile, type PickedFile } from '@/lib/upload';

import { IMAGE_RULES } from './constants';

// ─── Catalogue photos on the Edit Product sheet ─────────────────────────────
export function ItemImageManager({ itemId, images, onChange }: { itemId: string; images: string[]; onChange: (urls: string[]) => void }) {
  const theme = useTheme();
  const [uploading, setUploading] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const send = async (file: PickedFile | null) => {
    if (!file) return;
    const invalid = validatePickedFile(file, IMAGE_RULES);
    if (invalid) { setError(invalid); return; }
    setUploading(true);
    setError('');
    try {
      const updated = await uploadInventoryImages(itemId, file, { onProgress: () => {}, signal: new AbortController().signal });
      onChange(updated?.imageUrls ?? []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Upload failed'));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (url: string) => {
    setRemovingUrl(url);
    setError('');
    try {
      const updated = await deleteInventoryImage(itemId, url);
      onChange(updated?.imageUrls ?? []);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to remove photo'));
    } finally {
      setRemovingUrl(null);
    }
  };

  return (
    <View style={styles.gap}>
      <ThemedText themeColor="textSecondary" style={styles.title}>Catalogue Photos</ThemedText>
      <View style={styles.thumbs}>
        {images.map((url) => (
          <View key={url} style={[styles.thumb, { borderColor: theme.border }]}>
            <Image source={{ uri: url }} style={[styles.thumbImg, removingUrl === url && { opacity: 0.4 }]} />
            <Pressable onPress={() => remove(url)} disabled={removingUrl === url} hitSlop={6} accessibilityRole="button" accessibilityLabel="Remove photo" style={styles.thumbX}>
              <Ionicons name="close" size={14} color="#ffffff" />
            </Pressable>
          </View>
        ))}
        {images.length === 0 ? <ThemedText themeColor="textMuted" style={styles.small}>No photos yet</ThemedText> : null}
      </View>
      <View style={styles.row}>
        <Button variant="outline" size="sm" loading={uploading} onPress={async () => send(await pickFromGallery())}>+ Add Photos</Button>
        <Button variant="outline" size="sm" disabled={uploading} onPress={async () => send(await pickFromCamera())}>Take Photo</Button>
      </View>
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
    </View>
  );
}

// ─── Full-screen swipe viewer ───────────────────────────────────────────────
export function ImageLightbox({ images, index, name, onClose, onNavigate }: {
  images: string[]; index: number; name: string; onClose: () => void; onNavigate: (i: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<string>>(null);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index && i >= 0 && i < images.length) onNavigate(i);
  };
  const go = (i: number) => {
    listRef.current?.scrollToIndex({ index: i, animated: true });
    onNavigate(i);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.lbRoot}>
        <View style={[styles.lbTop, { paddingTop: insets.top + 12 }]}>
          <ThemedText numberOfLines={1} style={styles.lbTitle}>{`${name}${images.length > 1 ? `  —  ${index + 1} / ${images.length}` : ''}`}</ThemedText>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={30} color="#ffffff" />
          </Pressable>
        </View>
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(u) => u}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onEnd}
          renderItem={({ item }) => (
            <Pressable onPress={onClose} style={{ width, height: height * 0.7, justifyContent: 'center' }}>
              <Image source={{ uri: item }} style={{ width, height: height * 0.7 }} resizeMode="contain" />
            </Pressable>
          )}
          style={styles.lbList}
        />
        {images.length > 1 ? (
          <View style={[styles.lbThumbs, { paddingBottom: insets.bottom + 16 }]}>
            {images.map((u, i) => (
              <Pressable key={u} onPress={() => go(i)} accessibilityRole="button" accessibilityLabel={`Photo ${i + 1}`}>
                <Image source={{ uri: u }} style={[styles.lbThumb, { opacity: i === index ? 1 : 0.5, borderColor: i === index ? '#ffffff' : 'transparent' }]} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 16 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 72, height: 72, borderRadius: Radii.sm, overflow: 'hidden', borderWidth: 1 },
  thumbImg: { width: '100%', height: '100%' },
  thumbX: { position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  lbRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
  lbTop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20 },
  lbTitle: { flex: 1, color: '#ffffff', fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  lbList: { flexGrow: 0 },
  lbThumbs: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  lbThumb: { width: 48, height: 48, borderRadius: 6, borderWidth: 2 },
});
