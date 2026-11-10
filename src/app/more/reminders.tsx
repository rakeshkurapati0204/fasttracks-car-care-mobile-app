import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  ackReminder, createReminderDefinition, deleteReminderDefinition, doneReminder, fetchEmployees,
  fetchMyReminders, fetchReminderDefinitions, getErrorMessage, snoozeReminder, updateReminderDefinition,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { EmployeeListItem, ReminderDefinition, ReminderOccurrence, ReminderRecurrenceType } from '@/types/api';

// Mirrors the dashboard's Reminders page (reminders/page.tsx). OWNER sees "My reminders" plus "Manage all reminders"
// (create / edit / delete definitions, requireOwner on the backend); every other role sees only their own
// reminders grouped Overdue / Due soon / Upcoming. Everyone can acknowledge / snooze 4h / mark done their own.
const RECURRENCE_LABELS: Record<ReminderRecurrenceType, string> = { ONE_OFF: 'One-off', DAILY: 'Daily', WEEKLY: 'Weekly', MONTHLY: 'Monthly' };
const RECURRENCE_OPTIONS = (Object.keys(RECURRENCE_LABELS) as ReminderRecurrenceType[]).map((r) => ({ value: r, label: RECURRENCE_LABELS[r] }));
const DAY_MS = 24 * 60 * 60 * 1000;

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

type Action = 'ack' | 'snooze' | 'done';

function dueBucket(occ: ReminderOccurrence, now: number): 'overdue' | 'soon' | 'upcoming' {
  const due = new Date(occ.dueDate).getTime();
  const leadStart = due - occ.definition.leadDays * DAY_MS;
  if (now >= due) return 'overdue';
  if (now >= leadStart) return 'soon';
  return 'upcoming';
}

const isActive = (o: ReminderOccurrence) => o.status === 'PENDING' || o.status === 'SNOOZED';

// Type-to-search, multi-select picker (dashboard TargetPickerModal).
function TargetPicker({ employees, initialSelected, onClose, onConfirm }: {
  employees: EmployeeListItem[]; initialSelected: string[]; onClose: () => void; onConfirm: (ids: string[]) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? employees.filter((e) => e.name.toLowerCase().includes(q)) : employees;
  }, [employees, query]);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Sheet visible onClose={onClose} title="Notify…" footer={
      <View style={styles.flex1}><Button fullWidth disabled={selected.length === 0} onPress={() => onConfirm(selected)}>{`Confirm (${selected.length})`}</Button></View>
    }>
      <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Type a name…" placeholderTextColor={theme.textMuted} autoCorrect={false} style={[styles.searchInput, { color: theme.text }]} />
      </View>
      <View>
        {filtered.map((e) => {
          const on = selected.includes(e.id);
          return (
            <Pressable key={e.id} onPress={() => toggle(e.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={[styles.pickRow, on && { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.pickLeft}>
                <View style={[styles.checkbox, { borderColor: theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
                  {on ? <Ionicons name="checkmark" size={12} color="#ffffff" /> : null}
                </View>
                <ThemedText style={[styles.p, styles.flex1]} numberOfLines={1}>{e.name}</ThemedText>
              </View>
              <ThemedText themeColor="textMuted" style={styles.small}>{e.role?.replace(/_/g, ' ')}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

export default function RemindersScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const isOwner = user?.role === 'OWNER';

  const [width, setWidth] = useState(0);
  const wide = width >= 560;

  const [definitions, setDefinitions] = useState<ReminderDefinition[]>([]);
  const [mine, setMine] = useState<ReminderOccurrence[]>([]);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [now, setNow] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReminderDefinition | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<ReminderRecurrenceType>('MONTHLY');
  const [anchorDate, setAnchorDate] = useState('');
  const [leadDays, setLeadDays] = useState('0');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      if (isOwner) {
        const [defs, occ] = await Promise.all([fetchReminderDefinitions(), fetchMyReminders()]);
        setDefinitions(defs ?? []);
        setMine(occ ?? []);
      } else {
        setMine((await fetchMyReminders()) ?? []);
      }
      setNow(Date.now());
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to load reminders.'));
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  useEffect(() => {
    if (!isOwner) return;
    fetchEmployees().then((res) => setEmployees((res ?? []).filter((e) => e.isActive))).catch(() => {});
  }, [isOwner]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const act = async (id: string, action: Action) => {
    setActingId(id);
    try {
      await (action === 'ack' ? ackReminder(id) : action === 'snooze' ? snoozeReminder(id) : doneReminder(id));
      await load();
    } catch (e) {
      setError(getErrorMessage(e, action === 'ack' ? 'Failed to acknowledge reminder.' : action === 'snooze' ? 'Failed to snooze reminder.' : 'Failed to mark reminder done.'));
    } finally { setActingId(null); }
  };

  const openForm = (def: ReminderDefinition | null) => {
    setEditing(def);
    setTitle(def?.title ?? '');
    setDescription(def?.description ?? '');
    setRecurrenceType(def?.recurrenceType ?? 'MONTHLY');
    setAnchorDate(def ? def.anchorDate.slice(0, 10) : '');
    setLeadDays(String(def?.leadDays ?? 0));
    setTargetIds(def?.targets.map((t) => t.user.id) ?? []);
    setFormError('');
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditing(null); setShowPicker(false); };

  const targetNames = useMemo(() => {
    // Names come from the active-employee list, as on the dashboard.
    return employees.filter((e) => targetIds.includes(e.id)).map((e) => e.name);
  }, [employees, targetIds]);

  const save = async () => {
    if (!title.trim() || !anchorDate || targetIds.length === 0) {
      setFormError('Title, due date, and at least one person to notify are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const payload = { title: title.trim(), description: description.trim() || undefined, recurrenceType, anchorDate, leadDays: Number(leadDays) || 0, targetUserIds: targetIds };
      if (editing) await updateReminderDefinition(editing.id, payload);
      else await createReminderDefinition(payload);
      closeForm();
      load();
    } catch (e) {
      setFormError(getErrorMessage(e, 'Failed to save reminder.'));
    } finally { setSaving(false); }
  };

  const confirmDelete = (def: ReminderDefinition) => {
    Alert.alert('Delete this reminder?', def.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteReminderDefinition(def.id);
            setDefinitions((ds) => ds.filter((d) => d.id !== def.id));
          } catch (e) { setError(getErrorMessage(e, 'Failed to delete reminder.')); }
        },
      },
    ]);
  };

  const active = mine.filter(isActive);

  const iconBtn = (name: keyof typeof Ionicons.glyphMap, label: string, color: string, onPress: () => void, disabled?: boolean) => (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={[styles.iconBtn, disabled && styles.dim]}>
      <Ionicons name={name} size={20} color={color} />
    </Pressable>
  );

  const ownerOccurrence = (occ: ReminderOccurrence) => (
    <View key={occ.id} style={[styles.card, styles.between, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.flex1}>
        <ThemedText style={[styles.p, styles.semi]}>{occ.definition.title}</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.small}>{fmtDate(occ.dueDate)}</ThemedText>
      </View>
      <View style={styles.row}>
        {iconBtn('checkmark', 'Acknowledge', theme.textMuted, () => act(occ.id, 'ack'), actingId === occ.id)}
        {iconBtn('time-outline', 'Snooze 4h', theme.textMuted, () => act(occ.id, 'snooze'), actingId === occ.id)}
        {iconBtn('checkmark-circle-outline', 'Mark done', theme.primary, () => act(occ.id, 'done'), actingId === occ.id)}
      </View>
    </View>
  );

  const pill = (text: string) => (
    <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}><ThemedText themeColor="textMuted" style={styles.small}>{text}</ThemedText></View>
  );

  const definitionCard = (def: ReminderDefinition) => (
    <View key={def.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.between}>
        <View style={styles.flex1}>
          <View style={styles.wrapRow}>
            <ThemedText style={[styles.p, styles.semi]}>{def.title}</ThemedText>
            {pill(RECURRENCE_LABELS[def.recurrenceType])}
            {pill(`Lead ${def.leadDays}d`)}
          </View>
          {def.description ? <ThemedText themeColor="textMuted" style={[styles.small, styles.mt4]}>{def.description}</ThemedText> : null}
          <ThemedText themeColor="textMuted" style={[styles.small, styles.mt4]}>
            Due {fmtDate(def.anchorDate)} · Notifies {def.targets.map((t) => t.user.name).join(', ')}
          </ThemedText>
        </View>
        <View style={styles.row}>
          {iconBtn('create-outline', 'Edit', theme.textMuted, () => openForm(def))}
          {iconBtn('trash-outline', 'Delete', '#b91c1c', () => confirmDelete(def))}
        </View>
      </View>
    </View>
  );

  const employeeCard = (occ: ReminderOccurrence) => {
    const busy = actingId === occ.id;
    return (
      <View key={occ.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText style={[styles.p, styles.semi]}>{occ.definition.title}</ThemedText>
        {occ.definition.description ? <ThemedText themeColor="textMuted" style={styles.small}>{occ.definition.description}</ThemedText> : null}
        <ThemedText themeColor="textMuted" style={styles.small}>{fmtDate(occ.dueDate)}</ThemedText>
        <View style={styles.wrapRow}>
          <Button variant="secondary" size="sm" icon="checkmark" disabled={busy} onPress={() => act(occ.id, 'ack')}>Acknowledge</Button>
          <Button variant="secondary" size="sm" icon="time-outline" disabled={busy} onPress={() => act(occ.id, 'snooze')}>Snooze 4h</Button>
          <Button size="sm" icon="checkmark-circle-outline" disabled={busy} onPress={() => act(occ.id, 'done')}>Mark done</Button>
        </View>
      </View>
    );
  };

  const group = (label: string, items: ReminderOccurrence[]) => items.length === 0 ? null : (
    <View key={label} style={styles.gap8}>
      <ThemedText style={[styles.p, styles.bold]}>{label}</ThemedText>
      {items.map(employeeCard)}
    </View>
  );

  const skeletons = <View style={styles.gap8}><Skeleton height={wide ? 64 : 80} /><Skeleton height={wide ? 64 : 80} /><Skeleton height={wide ? 64 : 80} /></View>;

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Reminders' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>Reminders</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.sub}>{isOwner ? 'Manual recurring reminders — pop up + bell until acknowledged.' : 'Things you need to act on.'}</ThemedText>
          </View>
          {isOwner ? <Button icon="add" onPress={() => openForm(null)}>New reminder</Button> : null}
        </View>

        {error ? <ErrorBanner message={error} onRetry={load} /> : null}

        {loading ? skeletons : isOwner ? (
          <>
            <View style={styles.gap8}>
              <ThemedText style={[styles.p, styles.bold]}>My reminders</ThemedText>
              {active.length === 0 ? <ThemedText themeColor="textMuted" style={[styles.small, styles.py16]}>Nothing due.</ThemedText> : active.map(ownerOccurrence)}
            </View>
            <View style={styles.gap8}>
              <ThemedText style={[styles.p, styles.bold]}>Manage all reminders</ThemedText>
              {definitions.length === 0 ? <ThemedText themeColor="textMuted" style={[styles.small, styles.py16]}>No reminders created yet.</ThemedText> : definitions.map(definitionCard)}
            </View>
          </>
        ) : active.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <ThemedText style={[styles.p, styles.medium]}>Nothing here yet.</ThemedText>
          </View>
        ) : (
          <>
            {group('Overdue', active.filter((o) => dueBucket(o, now) === 'overdue'))}
            {group('Due soon', active.filter((o) => dueBucket(o, now) === 'soon'))}
            {group('Upcoming', active.filter((o) => dueBucket(o, now) === 'upcoming'))}
          </>
        )}
      </ScrollView>

      {formOpen ? (
        <Sheet visible={!showPicker} fullHeight onClose={closeForm} locked={saving} title={editing ? 'Edit reminder' : 'New reminder'} footer={
          <View style={styles.flex1}><Button fullWidth onPress={save} loading={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create reminder'}</Button></View>
        }>
          {formError ? <ThemedText style={[styles.small, styles.errBox, { color: '#b91c1c' }]}>{formError}</ThemedText> : null}
          <Input value={title} onChangeText={setTitle} placeholder="Title (e.g. Pay ICICI credit card)" />
          <Input value={description} onChangeText={setDescription} placeholder="Description (optional)" multiline numberOfLines={2} />
          <View style={[styles.two, wide && styles.twoWide]}>
            <View style={styles.flex1}><Select label="Recurrence" value={recurrenceType} onChange={(v) => setRecurrenceType(v as ReminderRecurrenceType)} options={RECURRENCE_OPTIONS} /></View>
            <View style={styles.flex1}>
              <DateField label={recurrenceType === 'ONE_OFF' ? 'Due date' : recurrenceType === 'MONTHLY' ? 'Due (sets day of month)' : 'Due (sets reference date)'} value={anchorDate} onChange={setAnchorDate} />
            </View>
          </View>
          <Input label="Start nagging N days before due" value={leadDays} onChangeText={(v) => setLeadDays(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
          <View>
            <ThemedText themeColor="textSecondary" style={styles.label}>Notify</ThemedText>
            <Pressable onPress={() => setShowPicker(true)} accessibilityRole="button" style={[styles.pickBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText style={[styles.p, !targetNames.length && { color: theme.textMuted }]}>{targetNames.length ? targetNames.join(', ') : 'Choose people to notify…'}</ThemedText>
            </Pressable>
          </View>
        </Sheet>
      ) : null}

      {formOpen && showPicker ? (
        <TargetPicker employees={employees} initialSelected={targetIds} onClose={() => setShowPicker(false)} onConfirm={(ids) => { setTargetIds(ids); setShowPicker(false); }} />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap8: { gap: 8 },
  row: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  content: { padding: 16, gap: 24, width: '100%', maxWidth: 896, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  p: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  semi: { fontFamily: FontWeights.semiBold },
  bold: { fontFamily: FontWeights.bold },
  medium: { fontFamily: FontWeights.medium },
  mt4: { marginTop: 4 },
  py16: { paddingVertical: 16 },
  dim: { opacity: 0.5 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 14, gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.sm },
  iconBtn: { padding: 6, minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, borderWidth: 1, borderRadius: Radii.lg },
  errBox: { backgroundColor: 'rgba(239,68,68,0.12)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  two: { gap: 16 },
  twoWide: { flexDirection: 'row' },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium, marginBottom: 4 },
  pickBtn: { minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: Radii.md, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, minHeight: 44, borderRadius: Radii.sm },
  pickLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
