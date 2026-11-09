import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, errText, Flash, useFlash } from '@/components/employees/tab-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createRecurringTask, deleteRecurringTask, fetchRecurringTasks } from '@/lib/api';
import type { EmployeeCardItem, RecurrenceType, RecurringTaskDefinition } from '@/types/api';

// Dashboard employees/page.tsx → Tasks tab (state ~1513–1570, UI ~2714–2819): the standing (recurring) tasks that
// apply to this person — role-wide ones for their role plus ones assigned to them — with add / remove. The tab is
// only shown when canEdit (OWNER, or STORE_MANAGER for someone who is neither OWNER nor STORE_MANAGER); the
// recurring-tasks routes are OWNER / STORE_MANAGER only on the server.
const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'TWICE_DAILY', label: 'Twice daily' },
  { value: 'WEEKLY', label: 'Weekly' },
];
const EMPTY_FORM = { title: '', description: '', recurrence: 'DAILY' as RecurrenceType, applyToRole: false };

export function EmployeeTasksTab({ employee, canEdit }: { employee: EmployeeCardItem; canEdit: boolean }) {
  const theme = useTheme();
  const [defs, setDefs] = useState<RecurringTaskDefinition[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const { msg, flash } = useFlash(3000);
  const roleLabel = employee.role.replace(/_/g, ' ');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchRecurringTasks();
      setDefs((all ?? []).filter((d) => (d.scope === 'ROLE' && d.role === employee.role) || (d.scope === 'INDIVIDUAL' && d.assignedToId === employee.id)));
    } catch { setDefs([]); }
    finally { setLoading(false); }
  }, [employee.role, employee.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open
    load();
  }, [load]);

  const create = async () => {
    if (!form.title.trim()) { flash('Title is required'); return; }
    setSaving(true);
    try {
      await createRecurringTask({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        recurrence: form.recurrence,
        scope: form.applyToRole ? 'ROLE' : 'INDIVIDUAL',
        targetRole: form.applyToRole ? employee.role : undefined,
        assignedToId: form.applyToRole ? undefined : employee.id,
      });
      flash('✓ Standing task created');
      setShowForm(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      flash(errText(err, 'Failed to create standing task'));
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setLoading(true);
    try { await deleteRecurringTask(id); await load(); }
    catch { flash('Failed to remove standing task'); }
    finally { setLoading(false); }
  };

  return (
    <View style={styles.gap}>
      <Flash msg={msg} />

      {canEdit && !showForm ? <Button variant="secondary" fullWidth onPress={() => setShowForm(true)}>+ Add standing task</Button> : null}

      {canEdit && showForm ? (
        <Card style={styles.gapSm}>
          <Input placeholder="Title (e.g. Check tool inventory)" value={form.title} onChangeText={(t) => setForm((f) => ({ ...f, title: t }))} />
          <Input placeholder="Description (optional)" value={form.description} onChangeText={(t) => setForm((f) => ({ ...f, description: t }))} multiline numberOfLines={2} />
          <Select value={form.recurrence} onChange={(v) => setForm((f) => ({ ...f, recurrence: v as RecurrenceType }))} options={RECURRENCE_OPTIONS} />
          <Pressable onPress={() => setForm((f) => ({ ...f, applyToRole: !f.applyToRole }))} accessibilityRole="checkbox" accessibilityState={{ checked: form.applyToRole }} style={styles.check}>
            <Ionicons name={form.applyToRole ? 'checkbox' : 'square-outline'} size={20} color={form.applyToRole ? theme.primary : theme.textMuted} />
            <View style={styles.flex1}>
              <ThemedText style={styles.small}>Apply to all employees with the {roleLabel} designation</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.small}>
                {form.applyToRole
                  ? `Creates this for everyone currently in ${roleLabel}, and automatically for anyone who joins that role later.`
                  : `Unchecked — this task applies to ${employee.name} only.`}
              </ThemedText>
            </View>
          </Pressable>
          <View style={styles.row}>
            <View style={styles.flex1}><Button fullWidth loading={saving} onPress={create}>Save</Button></View>
            <Button variant="ghost" onPress={() => setShowForm(false)} disabled={saving}>Cancel</Button>
          </View>
        </Card>
      ) : null}

      {loading ? (
        <View style={styles.gapSm}><Skeleton height={64} /><Skeleton height={64} /></View>
      ) : defs.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.empty}>No standing tasks apply to {employee.name} yet.</ThemedText>
      ) : (
        <View style={styles.gapSm}>
          {defs.map((def) => (
            <Card key={def.id} style={styles.def}>
              <View style={styles.flex1}>
                <ThemedText style={styles.title}>{def.title}</ThemedText>
                {def.description ? <ThemedText themeColor="textMuted" style={[styles.small, { marginTop: 2 }]}>{def.description}</ThemedText> : null}
                <View style={styles.tags}>
                  <View style={[styles.tag, { backgroundColor: 'rgba(13,148,136,0.15)' }]}><ThemedText style={[styles.tagText, { color: '#0d9488' }]}>{def.recurrence.replace('_', ' ')}</ThemedText></View>
                  <View style={[styles.tag, { backgroundColor: theme.backgroundElement }]}>
                    <ThemedText themeColor="textMuted" style={styles.tagText}>{def.scope === 'ROLE' ? `Role-wide (${(def.role ?? '').replace(/_/g, ' ')})` : 'Individual'}</ThemedText>
                  </View>
                </View>
              </View>
              {canEdit ? (
                <Pressable onPress={() => remove(def.id)} accessibilityRole="button" accessibilityLabel="Remove" hitSlop={8} style={styles.trash}>
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </Pressable>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 16 },
  gapSm: { gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  check: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  small: { fontSize: 12, lineHeight: 16 },
  empty: { fontSize: 12, lineHeight: 16, textAlign: 'center', paddingVertical: 32 },
  def: { padding: 12, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radii.sm },
  tagText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  trash: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
