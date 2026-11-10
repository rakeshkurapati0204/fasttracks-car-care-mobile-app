import { Ionicons } from '@expo/vector-icons';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Fonts, FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DeviceImportResult } from '@/lib/api';

type Row = DeviceImportResult['results'][number];

// Dashboard badge colours for the Status and Result columns.
function statusTint(status: string) {
  if (status === 'PRESENT') return { bg: '#22c55e22', fg: '#16a34a' };
  if (status === 'LATE') return { bg: '#f59e0b22', fg: '#d97706' };
  return { bg: '#e5e7eb', fg: '#6b7280' };
}
function resultTint(result: string) {
  if (result === 'Updated') return { bg: '#22c55e22', fg: '#16a34a' };
  if (result === 'Not found') return { bg: '#ef444422', fg: '#dc2626' };
  return { bg: '#f59e0b22', fg: '#d97706' };
}

function Tag({ text, tint }: { text: string; tint: { bg: string; fg: string } }) {
  return (
    <View style={[styles.tag, { backgroundColor: tint.bg }]}>
      <ThemedText style={[styles.tagText, { color: tint.fg }]}>{text}</ThemedText>
    </View>
  );
}

// Dashboard "Import Results": the Updated / Skipped / Not found summary and a
// table of Employee, Punch Time, Status and Result. A FlatList so a long import
// stays smooth.
export function ImportResultsSheet({ result, onClose }: { result: DeviceImportResult; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: insets.bottom }]}>
          <View style={[styles.head, { borderBottomColor: theme.border }]}>
            <View style={styles.flex1}>
              <ThemedText style={styles.title}>Import Results</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.sub}>
                {`Updated: ${result.summary.updated}  ·  Skipped: ${result.summary.skipped}  ·  Not found: ${result.summary.notFound}`}
              </ThemedText>
            </View>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.tr, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
            <ThemedText themeColor="textSecondary" style={[styles.th, { flex: 1.3 }]}>Employee</ThemedText>
            <ThemedText themeColor="textSecondary" style={[styles.th, { flex: 1.3 }]}>Punch Time</ThemedText>
            <ThemedText themeColor="textSecondary" style={[styles.th, { flex: 0.9 }]}>Status</ThemedText>
            <ThemedText themeColor="textSecondary" style={[styles.th, { flex: 1 }]}>Result</ThemedText>
          </View>

          <FlatList<Row>
            data={result.results}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item }) => (
              <View style={[styles.tr, { borderBottomColor: theme.border }]}>
                <ThemedText style={[styles.td, { flex: 1.3 }]} numberOfLines={2}>{item.employeeName || item.deviceUserId}</ThemedText>
                <ThemedText themeColor="textSecondary" style={[styles.mono, { flex: 1.3 }]}>{item.punchTime ? item.punchTime.slice(0, 16).replace('T', ' ') : '—'}</ThemedText>
                <View style={[styles.cell, { flex: 0.9 }]}><Tag text={item.status || '—'} tint={statusTint(item.status)} /></View>
                <View style={[styles.cell, { flex: 1 }]}><Tag text={item.result} tint={resultTint(item.result)} /></View>
              </View>
            )}
            initialNumToRender={20}
            windowSize={7}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '80%', borderTopLeftRadius: 12, borderTopRightRadius: 12, borderWidth: 1, borderBottomWidth: 0, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  sub: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  th: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  td: { fontSize: 13, lineHeight: 18 },
  mono: { fontSize: 12, lineHeight: 16, fontFamily: Fonts?.mono },
  cell: { alignItems: 'flex-start' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold },
});
