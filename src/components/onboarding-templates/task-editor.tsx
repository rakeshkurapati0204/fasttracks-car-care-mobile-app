import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { OnboardingTaskInput } from '@/types/api';

const WIDE_MIN = 560;

type Row = { key: number; label: string; description: string; responsible: string };

// Stable React keys (module-level so render stays pure): rows move and are removed.
let keySeq = 0;

type Props = {
  roleName: string;
  initialTasks: OnboardingTaskInput[];
  saving: boolean;
  error: string | null;
  savedAt: Date | null;
  onSave: (tasks: OnboardingTaskInput[]) => void;
  onBack: () => void;
};

// Dashboard TemplateEditor for onboarding templates: rows of Label /
// Description / Responsible with add, remove and reorder. Nothing is persisted
// until Save. Wide: the dashboard's 4-column row; phone: one stacked column.
export function TaskEditor({ roleName, initialTasks, saving, error, savedAt, onSave, onBack }: Props) {
  const theme = useTheme();
  const blank = (): Row => ({ key: keySeq++, label: '', description: '', responsible: '' });
  const [rows, setRows] = useState<Row[]>(() =>
    (initialTasks.length ? initialTasks : [{ label: '', description: '', responsible: '' }]).map((t) => ({
      key: keySeq++,
      label: t.label,
      description: t.description ?? '',
      responsible: t.responsible ?? '',
    })),
  );
  const [width, setWidth] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const touch = () => { setDirty(true); setFormError(null); };
  const update = (key: number, patch: Partial<Row>) => { touch(); setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r))); };
  const add = () => { touch(); setRows((p) => [...p, blank()]); };
  const remove = (key: number) => { touch(); setRows((p) => p.filter((r) => r.key !== key)); };
  const move = (i: number, dir: -1 | 1) => {
    touch();
    setRows((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const save = () => {
    if (rows.some((r) => !r.label.trim())) { setFormError('Every task needs a label.'); return; }
    setFormError(null);
    setDirty(false);
    onSave(rows.map((r) => ({ label: r.label.trim(), description: r.description.trim() || undefined, responsible: r.responsible.trim() || undefined })));
  };

  const back = () => {
    if (!dirty || saving) { onBack(); return; }
    // The dashboard discards silently; on a phone a stray back-swipe would throw
    // away an AI draft, so ask first when there are unsaved edits.
    Alert.alert('Discard changes?', 'You have unsaved changes to this template.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onBack },
    ]);
  };

  const wide = width >= WIDE_MIN;
  const shownError = formError ?? error;

  return (
    <View style={styles.stack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View>
        <Pressable onPress={back} accessibilityRole="button" hitSlop={8} style={styles.back}>
          <ThemedText themeColor="textMuted" style={[styles.body, styles.underline]}>← Back to list</ThemedText>
        </Pressable>
        <ThemedText style={styles.h2}>{roleName}</ThemedText>
      </View>

      {shownError && !saving ? <ErrorBanner message={shownError} /> : null}

      <Card padding="md">
        <View style={styles.stack}>
          {rows.map((r, i) => (
            <View key={r.key} style={[wide ? styles.rowWide : styles.rowPhone, !wide && { borderBottomColor: theme.border, borderBottomWidth: i < rows.length - 1 ? 1 : 0, paddingBottom: i < rows.length - 1 ? 12 : 0 }]}>
              <View style={wide ? styles.labelWide : undefined}><Input label="Label" required={i === 0} value={r.label} onChangeText={(v) => update(r.key, { label: v })} /></View>
              <View style={wide ? styles.descWide : undefined}><Input label="Description" value={r.description} onChangeText={(v) => update(r.key, { description: v })} /></View>
              <View style={wide ? styles.respWide : undefined}><Input label="Responsible" value={r.responsible} onChangeText={(v) => update(r.key, { responsible: v })} placeholder="e.g. HR" /></View>
              <View style={styles.btns}>
                <MiniButton label="↑" a11y="Move up" disabled={i === 0} onPress={() => move(i, -1)} />
                <MiniButton label="↓" a11y="Move down" disabled={i === rows.length - 1} onPress={() => move(i, 1)} />
                <MiniButton label="✕" a11y="Remove task" danger disabled={rows.length === 1} onPress={() => remove(r.key)} />
              </View>
            </View>
          ))}

          <View style={[styles.addRow, { borderTopColor: theme.border }]}>
            <Button size="sm" variant="secondary" onPress={add}>+ Add Task</Button>
          </View>

          {/* Outcome right beside Save (a top banner is easy to miss below a long list). */}
          <View style={styles.saveRow}>
            {savedAt && !saving ? (
              <ThemedText style={[styles.body, styles.bold, { color: theme.success }]} accessibilityRole="alert">
                {`✓ Saved at ${savedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
              </ThemedText>
            ) : null}
            {shownError && !saving ? <ThemedText style={[styles.body, { color: theme.danger }]} accessibilityRole="alert">{shownError}</ThemedText> : null}
            <Button size="sm" loading={saving} onPress={save}>{saving ? 'Saving…' : 'Save'}</Button>
          </View>
        </View>
      </Card>
    </View>
  );
}

function MiniButton({ label, onPress, disabled, danger, a11y }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; a11y: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.mini, { borderColor: theme.border, backgroundColor: theme.surface }, disabled && { opacity: 0.3 }]}>
      <ThemedText style={[styles.miniText, danger && { color: theme.danger }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  bold: { fontFamily: FontWeights.semiBold },
  underline: { textDecorationLine: 'underline' },
  h2: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold, marginTop: 4 },
  back: { minHeight: 32, justifyContent: 'center' },
  rowWide: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowPhone: { gap: 12 },
  labelWide: { flex: 1.2, minWidth: 0 },
  descWide: { flex: 2, minWidth: 0 },
  respWide: { flex: 0.8, minWidth: 0 },
  btns: { flexDirection: 'row', gap: 6, justifyContent: 'flex-end', paddingBottom: 2 },
  mini: { width: 40, height: 44, borderWidth: 1, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  miniText: { fontSize: 14, lineHeight: 20 },
  addRow: { borderTopWidth: 1, paddingTop: 12, flexDirection: 'row', justifyContent: 'space-between' },
  saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' },
});
