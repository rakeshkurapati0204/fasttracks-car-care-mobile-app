import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fmtDate, fmtDateTime } from '@/components/applications/application-format';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Skeleton } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { downloadOnboardingPdf, fetchOnboardingChecklist, getErrorMessage, setOnboardingTaskDone } from '@/lib/api';
import type { OnboardingChecklist, OnboardingTask } from '@/types/api';

type Props = {
  userId: string;
  onClose: () => void;
  /** Called after a task is toggled so the list behind can refresh. */
  onChanged: () => void;
};

// Dashboard OnboardingDetailModal as a full-screen sheet: completion badge,
// "started by", Print / Export PDF, a progress bar and the task list.
export function OnboardingDetailSheet({ userId, onClose, onChanged }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [checklist, setChecklist] = useState<OnboardingChecklist | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setNotFound(false);
    try {
      setChecklist(await fetchOnboardingChecklist(userId));
    } catch {
      setNotFound(true);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    load();
  }, [load]);

  const toggle = async (task: OnboardingTask) => {
    setError('');
    try {
      setChecklist(await setOnboardingTaskDone(task.id, !task.isDone));
      onChanged();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update task.'));
    }
  };

  // The PDF route needs the Bearer header: saved to the cache, then shared / opened.
  const printPdf = async () => {
    if (!checklist) return;
    setExporting(true);
    setError('');
    try {
      const { uri } = await downloadOnboardingPdf(userId, checklist.user.name);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
      else setError('Sharing isn’t available on this device.');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not export the checklist.'));
    } finally {
      setExporting(false);
    }
  };

  const done = checklist?.tasks.filter((t) => t.isDone).length ?? 0;
  const total = checklist?.tasks.length ?? 0;
  const title = checklist ? `Onboarding — ${checklist.user.name}` : 'Onboarding';

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedText style={styles.title} numberOfLines={1}>{title}</ThemedText>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}>
            <Ionicons name="close" size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24, maxWidth: Math.min(width, 900) }]} keyboardShouldPersistTaps="handled">
          {notFound ? (
            <ThemedText themeColor="textMuted" style={styles.body}>
              No onboarding checklist exists for this employee. Checklists are created automatically — contact engineering if one is missing.
            </ThemedText>
          ) : !checklist ? (
            <><Skeleton height={24} width="50%" /><Skeleton height={8} /><Skeleton height={56} /><Skeleton height={56} /></>
          ) : (
            <>
              <View style={styles.topRow}>
                <Badge variant={checklist.completedAt ? 'success' : 'warning'} size="sm">
                  {checklist.completedAt ? `Completed ${fmtDate(checklist.completedAt)}` : `${done}/${total} tasks done`}
                </Badge>
                <ThemedText themeColor="textMuted" style={styles.small}>{`Started ${fmtDate(checklist.createdAt)} by ${checklist.createdBy.name}`}</ThemedText>
              </View>
              <View style={styles.start}>
                <Button size="sm" variant="secondary" loading={exporting} onPress={printPdf}>⬇ Print / Export PDF</Button>
              </View>

              <View style={[styles.track, { backgroundColor: theme.border }]}>
                <View style={[styles.fill, { width: `${total ? (done / total) * 100 : 0}%`, backgroundColor: theme.primary }]} />
              </View>

              {error ? <ErrorBanner message={error} /> : null}

              {checklist.tasks.map((task) => (
                <View
                  key={task.id}
                  style={[styles.task, { borderColor: theme.border, backgroundColor: task.isDone ? withAlpha(theme.success, 0.06) : theme.surface }]}>
                  <Pressable
                    onPress={() => toggle(task)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: task.isDone }}
                    accessibilityLabel={task.title}
                    hitSlop={10}
                    style={[styles.checkbox, { borderColor: task.isDone ? theme.success : theme.textSecondary, backgroundColor: task.isDone ? theme.success : 'transparent' }]}>
                    {task.isDone ? <ThemedText style={styles.check}>✓</ThemedText> : null}
                  </Pressable>
                  <View style={styles.taskMain}>
                    <View style={styles.titleLine}>
                      <ThemedText style={[styles.name, task.isDone && styles.struck]}>{task.title}</ThemedText>
                      {task.responsible ? <Badge variant="secondary" size="sm">{task.responsible}</Badge> : null}
                    </View>
                    {task.description ? <ThemedText themeColor="textMuted" style={styles.small}>{task.description}</ThemedText> : null}
                    {task.isDone && task.doneAt ? <ThemedText themeColor="textMuted" style={styles.tiny}>{`Done ${fmtDateTime(task.doneAt)}`}</ThemedText> : null}
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: 20, paddingRight: 8, minHeight: 56, borderBottomWidth: 1 },
  title: { flex: 1, fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12, width: '100%', alignSelf: 'center' },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 16 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  struck: { textDecorationLine: 'line-through' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  start: { alignSelf: 'flex-start' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  task: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: Radii.md },
  taskMain: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  checkbox: { width: 26, height: 26, borderRadius: Radii.sm, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  check: { color: '#fff', fontSize: 16, lineHeight: 20, fontFamily: FontWeights.bold },
});
