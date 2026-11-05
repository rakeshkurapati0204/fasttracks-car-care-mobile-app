import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TeamChatMessage } from '@/types/api';

import { docExt, docName, mediaKind } from './helpers';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// In-app image viewer: swipe between every image in the chat.
export function ImageLightbox({ urls, start, onClose }: { urls: string[]; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.lightbox}>
        <FlatList
          data={urls}
          horizontal
          pagingEnabled
          initialScrollIndex={Math.min(start, urls.length - 1)}
          getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(u, i) => `${i}-${u}`}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <Pressable onPress={onClose} style={{ width, height, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Close image">
              <Image source={{ uri: item }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
            </Pressable>
          )}
        />
        <Pressable onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        {urls.length > 1 ? <ThemedText style={styles.counter}>{index + 1} / {urls.length}</ThemedText> : null}
      </View>
    </Modal>
  );
}

// Plays a voice note inline: play/pause + progress + clock. The audio player is only created once the
// note is tapped, so a long chat doesn't hold one player per message.
export function VoiceNote({ uri, mine }: { uri: string; mine: boolean }) {
  const [started, setStarted] = useState(false);
  if (started) return <VoicePlayer uri={uri} mine={mine} />;
  return <VoiceBar mine={mine} playing={false} ratio={0} label="0:00" onPress={() => setStarted(true)} />;
}

function VoicePlayer({ uri, mine }: { uri: string; mine: boolean }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; player.play(); }
  }, [player]);
  const total = status.duration > 0 ? status.duration : 0;
  const ratio = total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const toggle = async () => {
    if (status.playing) { player.pause(); return; }
    if (status.didJustFinish) await player.seekTo(0);
    player.play();
  };
  return (
    <VoiceBar
      mine={mine}
      playing={status.playing}
      loading={!status.isLoaded}
      ratio={ratio}
      label={`${clock(status.currentTime)} / ${clock(total)}`}
      onPress={toggle}
    />
  );
}

function VoiceBar({ mine, playing, loading, ratio, label, onPress }: {
  mine: boolean; playing: boolean; loading?: boolean; ratio: number; label: string; onPress: () => void;
}) {
  const theme = useTheme();
  const fg = mine ? '#fff' : theme.text;
  return (
    <View style={styles.voice}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        style={[styles.playBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.25)' : theme.primary }]}>
        {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={playing ? 'pause' : 'play'} size={14} color="#fff" />}
      </Pressable>
      <View style={styles.voiceBody}>
        <View style={[styles.track, { backgroundColor: mine ? 'rgba(255,255,255,0.3)' : theme.border }]}>
          <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: mine ? '#fff' : theme.primary }]} />
        </View>
        <ThemedText style={[styles.clock, { color: fg }]}>{label}</ThemedText>
      </View>
    </View>
  );
}

// The media part of a bubble: image thumbnail, voice player or document chip.
export function MediaBlock({ msg, mine, fg, opening, onImage, onDoc }: {
  msg: TeamChatMessage; mine: boolean; fg: string; opening: boolean; onImage: (url: string) => void; onDoc: (msg: TeamChatMessage) => void;
}) {
  const theme = useTheme();
  const kind = mediaKind(msg.mediaType);
  if (!kind || !msg.mediaUrl) return null;
  if (kind === 'image') {
    return (
      <Pressable onPress={() => onImage(msg.mediaUrl!)} accessibilityRole="imagebutton" accessibilityLabel="Open image">
        <Image source={{ uri: msg.mediaUrl }} style={styles.image} resizeMode="cover" />
      </Pressable>
    );
  }
  if (kind === 'audio') return <View style={styles.pad}><VoiceNote uri={msg.mediaUrl} mine={mine} /></View>;
  return (
    <Pressable
      onPress={() => onDoc(msg)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${docName(msg.mediaUrl, msg.mediaName)}`}
      style={styles.doc}>
      <View style={[styles.ext, { backgroundColor: mine ? 'rgba(255,255,255,0.2)' : theme.surface, borderColor: theme.border }]}>
        <ThemedText style={[styles.extText, { color: fg }]}>{docExt(msg.mediaUrl, msg.mediaName)}</ThemedText>
      </View>
      <View style={styles.flex1}>
        <ThemedText numberOfLines={1} style={[styles.docName, { color: fg }]}>{docName(msg.mediaUrl, msg.mediaName)}</ThemedText>
        <ThemedText style={[styles.docSub, { color: fg }]}>Tap to open / download</ThemedText>
      </View>
      {opening ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name="download-outline" size={16} color={fg} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  close: { position: 'absolute', top: 48, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', bottom: 48, alignSelf: 'center', color: '#fff', fontSize: 13 },
  pad: { paddingHorizontal: 10, paddingVertical: 8 },
  image: { width: 220, height: 220 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 200 },
  playBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  voiceBody: { flex: 1, gap: 4 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%' },
  clock: { fontSize: 11, lineHeight: 14 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, minWidth: 200 },
  ext: { width: 36, height: 40, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  extText: { fontSize: 9, lineHeight: 12, fontFamily: FontWeights.bold },
  docName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  docSub: { fontSize: 11, lineHeight: 15, opacity: 0.75 },
});
