import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openExternalUrl } from '@/lib/open-url';

import { linkKind } from './helpers';

// "Share a link" box (Google Drive / Docs / any URL) — same fields and wording as the dashboard.
export function ShareLinkBox({ sending, onShare, onClose }: {
  sending: boolean; onShare: (url: string, note: string) => Promise<boolean>; onClose: () => void;
}) {
  const theme = useTheme();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const kind = url.trim() ? linkKind(url.trim()) : null;
  const share = async () => { if (await onShare(url, note)) onClose(); };
  const field = [styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }];
  return (
    <View style={[styles.box, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.top}>
        <ThemedText style={[styles.title, { color: theme.primary }]}>Share a link</ThemedText>
        <View style={styles.topRight}>
          <ThemedText onPress={() => openExternalUrl('https://drive.google.com/drive/my-drive')} themeColor="textMuted" style={styles.drive} accessibilityRole="link">
            Open Google Drive ↗
          </ThemedText>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={16} color={theme.textMuted} />
          </Pressable>
        </View>
      </View>
      <TextInput value={url} onChangeText={setUrl} autoFocus autoCapitalize="none" autoCorrect={false} keyboardType="url" onSubmitEditing={share}
        placeholder="Paste link — Google Drive, Docs, Sheets or any URL" placeholderTextColor={theme.textMuted} style={field} />
      <View style={styles.row}>
        <TextInput value={note} onChangeText={setNote} onSubmitEditing={share} placeholder="Add a note (optional)" placeholderTextColor={theme.textMuted} style={[field, styles.flex1]} />
        <Pressable onPress={share} disabled={!url.trim() || sending} accessibilityRole="button"
          style={[styles.btn, { backgroundColor: theme.primary, opacity: !url.trim() || sending ? 0.4 : 1 }]}>
          <ThemedText style={styles.btnText}>Share</ThemedText>
        </Pressable>
      </View>
      {kind ? (
        <ThemedText themeColor="textMuted" style={styles.hint}>
          Detected: <ThemedText style={styles.bold}>{kind}</ThemedText> — make sure the file&apos;s sharing is set so your team can open it.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  box: { paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderTopWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  drive: { fontSize: 12, lineHeight: 16, textDecorationLine: 'underline' },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 14 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  btnText: { color: '#fff', fontSize: 14, fontFamily: FontWeights.medium },
  hint: { fontSize: 12, lineHeight: 16 },
  bold: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
});
