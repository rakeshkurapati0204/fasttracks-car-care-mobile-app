import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ReplyThread } from '@/components/shared/reply-thread';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  completeDailyTask, createTask, deleteTask, fetchEmployees, fetchMyDailyTasks, fetchTask, fetchTasks, fetchWorkDoc, markNotificationsRead,
  replyToTaskThread, TASK_NOTIFICATION_TYPES, updateTask, updateTaskStatus,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { pickFromCamera, pickFromGallery, type PickedFile } from '@/lib/upload';
import type { DailyTaskCompletion, EmployeeListItem, Task, TaskStatus, TimesheetEntryReply, WorkDocReply } from '@/types/api';

const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER'];
const WIDE_MIN = 560;
const DONE = '#15803d';
const OVERDUE = '#b91c1c';

// What a task's thread section needs, whether it came from a work-doc note or
// from one timesheet entry; normalised once so the render doesn't branch.
interface TaskThreadData {
  description: string;
  replies: (WorkDocReply | TimesheetEntryReply)[];
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
/** Days until a due date; negative means overdue. Compared date-only, no clock. */
function daysUntil(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

const proofOf = (c: DailyTaskCompletion) => c.proof ?? c.definition.proof ?? 'NONE';

export default function TasksScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const myId = user?.id ?? '';
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);

  const [width, setWidth] = useState(0);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Daily Tasks (left column): always the viewer's own, no person filter. ──
  const [dailyTasks, setDailyTasks] = useState<DailyTaskCompletion[] | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);

  const loadDaily = useCallback(async () => {
    try {
      const list = await fetchMyDailyTasks();
      setDailyTasks(list.filter((c) => c.definition.recurrence === 'DAILY'));
    } catch {
      // Silent: daily tasks are a bonus section; a failed fetch shouldn't block the rest.
      setDailyTasks((t) => t ?? []);
    }
  }, []);

  // Proof-required daily tasks (PHOTO / NOTE_PHOTO) open an inline panel to
  // attach a photo (and a note) instead of ticking straight away; the server
  // rejects a bare tick for those with a 400.
  const [proofOpenId, setProofOpenId] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [proofFile, setProofFile] = useState<PickedFile | null>(null);

  // One-way tick, matching the recurring-task engine: a standing task resets
  // fresh at the next period, there is no "un-complete".
  const tickDaily = async (completion: DailyTaskCompletion, withProof = false) => {
    if (completion.status === 'COMPLETED') return;
    const required = proofOf(completion);
    if (required !== 'NONE' && !withProof) {
      setProofOpenId((id) => (id === completion.id ? null : completion.id));
      setProofNote('');
      setProofFile(null);
      return;
    }
    let proof: { note?: string; photo?: string; photoMime?: string } | undefined;
    if (withProof) {
      if (required === 'NOTE_PHOTO' && !proofNote.trim()) { showToast('error', 'Add a note to complete this task.'); return; }
      if (!proofFile) { showToast('error', 'Choose a photo to complete this task.'); return; }
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(proofFile.mimeType)) { showToast('error', 'The photo must be a JPEG, PNG or WEBP image.'); return; }
      if ((proofFile.size ?? 0) > 7 * 1024 * 1024) { showToast('error', 'The photo is too large (max 7 MB). Please choose a smaller one.'); return; }
      try {
        const b64 = await FileSystem.readAsStringAsync(proofFile.uri, { encoding: FileSystem.EncodingType.Base64 });
        proof = { photo: `data:${proofFile.mimeType};base64,${b64}`, photoMime: proofFile.mimeType };
        if (proofNote.trim()) proof.note = proofNote.trim();
      } catch {
        showToast('error', 'Could not read the photo. Please choose it again.');
        return;
      }
    }
    setCompletingId(completion.id);
    const previous = dailyTasks;
    setDailyTasks((list) => list?.map((c) => (c.id === completion.id ? { ...c, status: 'COMPLETED' } : c)) ?? list);
    try {
      const updated = await completeDailyTask(completion.id, proof);
      setDailyTasks((list) => list?.map((c) => (c.id === completion.id ? updated : c)) ?? list);
      setProofOpenId(null);
    } catch (err: unknown) {
      setDailyTasks(previous);
      showToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not mark complete.');
    } finally {
      setCompletingId(null);
    }
  };

  // ── Assigned Tasks (right column): self by default; admins can view another
  // person's via the filter, scoped to this column only. ─────────────────────
  const [assigneeId, setAssigneeId] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default the filter to the signed-in user once known
    if (myId) setAssigneeId(myId);
  }, [myId]);

  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (!assigneeId) return;
    setLoadError(null);
    try {
      // Always pass assignedToId explicitly: a filterless admin request means
      // "everyone" on the backend, which is not what this screen shows.
      setTasks(await fetchTasks({ assignedToId: assigneeId }));
    } catch {
      setTasks((t) => t ?? []);
      setLoadError('Failed to load tasks.');
    }
  }, [assigneeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    loadDaily();
  }, [loadDaily]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    loadTasks();
  }, [loadTasks]);

  // Visiting Tasks marks all reply-notifications read at once, like the dashboard.
  useEffect(() => { markNotificationsRead(TASK_NOTIFICATION_TYPES).catch(() => {}); }, []);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadDaily(), loadTasks()]);
    setRefreshing(false);
  };

  // Admins need the employee list to assign work and to fill the person filter.
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    fetchEmployees().then((list) => setEmployees(list.filter((e) => e.isActive))).catch(() => {});
  }, [isAdmin]);

  // Mirrors the backend's assignee-only check: an admin viewing someone else's
  // list can see it but can't tick it.
  const canToggle = (task: Task) => task.assignedToId === myId;

  const toggleTask = async (task: Task) => {
    if (!canToggle(task)) return;
    const next: TaskStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    setBusyId(task.id);
    const previous = tasks;
    setTasks((ts) => ts?.map((t) => (t.id === task.id ? { ...t, status: next } : t)) ?? ts);
    try {
      const updated = await updateTaskStatus(task.id, next);
      setTasks((ts) => ts?.map((t) => (t.id === task.id ? updated : t)) ?? ts);
    } catch (err: unknown) {
      setTasks(previous);
      showToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not update the task.');
    } finally {
      setBusyId(null);
    }
  };

  // ── Reply threads on tasks that came from a manager's reply to a work-doc
  // note or to one timesheet entry; fetched lazily per task. ─────────────────
  const [threadOpenId, setThreadOpenId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<Record<string, TaskThreadData>>({});
  const [threadLoading, setThreadLoading] = useState<string | null>(null);
  const [replySending, setReplySending] = useState(false);

  const fetchThreadData = async (task: Task): Promise<TaskThreadData | null> => {
    if (task.sourceWorkDocId) {
      const doc = await fetchWorkDoc(task.sourceWorkDocId);
      return { description: doc.description, replies: doc.replies };
    }
    if (task.sourceTimesheetId && task.sourceEntryId) {
      // The task's own thread, fetched via the task itself; task.title is a
      // stable snapshot taken when the task was assigned.
      const full = await fetchTask(task.id);
      return { description: full.title, replies: full.entryReplies ?? [] };
    }
    return null;
  };

  const toggleThread = async (task: Task) => {
    if (threadOpenId === task.id) { setThreadOpenId(null); return; }
    setThreadOpenId(task.id);
    if ((!task.sourceWorkDocId && !task.sourceTimesheetId) || threadData[task.id]) return;
    setThreadLoading(task.id);
    try {
      const data = await fetchThreadData(task);
      if (data) setThreadData((prev) => ({ ...prev, [task.id]: data }));
    } catch {
      // silent: the thread section just stays empty
    } finally {
      setThreadLoading(null);
    }
  };

  const handleThreadReply = async (task: Task, message: string) => {
    if (!task.sourceWorkDocId && !task.sourceTimesheetId) return;
    setReplySending(true);
    try {
      await replyToTaskThread(task.id, message);
      const data = await fetchThreadData(task);
      if (data) setThreadData((prev) => ({ ...prev, [task.id]: data }));
    } finally {
      setReplySending(false);
    }
  };

  // ── Assign / edit form ───────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({ title: '', description: '', assignedToId: '', date: localToday(), dueDate: '' });

  const openCreate = () => {
    setEditing(null);
    setForm({ title: '', description: '', assignedToId: assigneeId !== myId ? assigneeId : '', date: localToday(), dueDate: '' });
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? '',
      assignedToId: task.assignedToId,
      date: task.date.slice(0, 10),
      dueDate: task.dueDate ? task.dueDate.slice(0, 10) : '',
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setFormError('');
    if (!form.title.trim()) { setFormError('Give the task a title.'); return; }
    if (!form.assignedToId) { setFormError('Choose who this is for.'); return; }
    if (!form.date) { setFormError('Pick a date for the task.'); return; }

    setSubmitting(true);
    try {
      if (editing) {
        const updated = await updateTask(editing.id, {
          title: form.title.trim(),
          description: form.description.trim() || null,
          assignedToId: form.assignedToId,
          date: form.date,
          dueDate: form.dueDate || null,
        });
        if (updated.assignedToId === assigneeId) setTasks((ts) => ts?.map((t) => (t.id === editing.id ? updated : t)) ?? ts);
        else setTasks((ts) => ts?.filter((t) => t.id !== editing.id) ?? ts);
        showToast('success', 'Task updated.');
      } else {
        const created = await createTask({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          assignedToId: form.assignedToId,
          date: form.date,
          dueDate: form.dueDate || undefined,
        });
        if (created.assignedToId === assigneeId) setTasks((ts) => [created, ...(ts ?? [])]);
        showToast('success', 'Task assigned.');
      }
      setShowForm(false);
    } catch (err: unknown) {
      setFormError((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not save the task.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (task: Task) => {
    Alert.alert('Delete task', `Delete "${task.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(task.id);
          try {
            await deleteTask(task.id);
            setTasks((ts) => ts?.filter((t) => t.id !== task.id) ?? ts);
            showToast('success', 'Task deleted.');
          } catch (err: unknown) {
            showToast('error', (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not delete the task.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  const sortedTasks = useMemo(
    () => [...(tasks ?? [])].sort((a, b) => (a.status === 'COMPLETED' ? 1 : 0) - (b.status === 'COMPLETED' ? 1 : 0)),
    [tasks],
  );

  const assigneeOptions = useMemo(
    () => [{ value: myId, label: 'Me' }, ...employees.filter((e) => e.id !== myId).map((e) => ({ value: e.id, label: e.name }))],
    [employees, myId],
  );
  const employeeOptions = useMemo(
    () => employees.map((e) => ({ value: e.id, label: `${e.name}${e.employeeId ? ` (${e.employeeId})` : ''}` })),
    [employees],
  );

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;

  const Check = ({ done, enabled }: { done: boolean; enabled: boolean }) => (
    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={done ? DONE : enabled ? theme.textMuted : theme.border} />
  );

  const dailySection = (
    <View style={styles.section}>
      <ThemedText themeColor="textMuted" style={styles.sectionLabel}>DAILY TASKS</ThemedText>
      {dailyTasks === null ? (
        <View style={styles.list}><Skeleton height={64} /><Skeleton height={64} /></View>
      ) : dailyTasks.length === 0 ? (
        <Card padding="lg"><ThemedText themeColor="textMuted" style={styles.empty}>Nothing daily for your role.</ThemedText></Card>
      ) : (
        <View style={styles.list}>
          {dailyTasks.map((c) => {
            const busy = completingId === c.id;
            const done = c.status === 'COMPLETED';
            const proof = proofOf(c);
            const label = c.proofLabel ?? c.definition.proofLabel;
            return (
              <Card key={c.id} padding="sm" style={[styles.row, { opacity: busy ? 0.6 : 1 }]}>
                <View style={styles.rowTop}>
                  <Pressable onPress={() => tickDaily(c)} disabled={busy || done} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={done ? 'Completed' : 'Mark complete'}>
                    <Check done={done} enabled />
                  </Pressable>
                  <View style={styles.flex1}>
                    <ThemedText style={[styles.title, done && { color: theme.textMuted, textDecorationLine: 'line-through' }]}>{c.definition.title}</ThemedText>
                    {c.definition.description ? <ThemedText themeColor="textMuted" style={styles.desc}>{c.definition.description}</ThemedText> : null}
                    {!done && proof !== 'NONE' ? (
                      <ThemedText themeColor="textMuted" style={styles.hint}>
                        {`Needs ${proof === 'NOTE_PHOTO' ? 'a note and a photo' : 'a photo'}${label ? ` (${label})` : ''}`}
                      </ThemedText>
                    ) : null}
                    {!done && proofOpenId === c.id ? (
                      <View style={styles.proof}>
                        {proof === 'NOTE_PHOTO' ? <Input value={proofNote} onChangeText={setProofNote} placeholder="Note" multiline numberOfLines={2} /> : null}
                        <View style={styles.proofBtns}>
                          <Button size="sm" variant="secondary" icon="camera-outline" onPress={async () => { const f = await pickFromCamera(); if (f) setProofFile(f); }}>Take photo</Button>
                          <Button size="sm" variant="secondary" icon="images-outline" onPress={async () => { const f = await pickFromGallery(); if (f) setProofFile(f); }}>Gallery</Button>
                        </View>
                        {proofFile ? <ThemedText themeColor="textMuted" style={styles.hint} numberOfLines={1}>{proofFile.name}</ThemedText> : null}
                        <View style={styles.proofBtns}>
                          <Pressable onPress={() => tickDaily(c, true)} disabled={busy} style={styles.markBtn} accessibilityRole="button">
                            <ThemedText style={styles.markText}>Mark complete</ThemedText>
                          </Pressable>
                          <Pressable onPress={() => setProofOpenId(null)} disabled={busy} hitSlop={8} style={styles.cancelBtn} accessibilityRole="button">
                            <ThemedText themeColor="textMuted" style={styles.small}>Cancel</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );

  const assignedSection = (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText themeColor="textMuted" style={styles.sectionLabel}>ASSIGNED TASKS</ThemedText>
        {isAdmin ? (
          <View style={styles.adminControls}>
            {employees.length > 0 ? (
              <View style={styles.filter}><Select compact options={assigneeOptions} value={assigneeId} onChange={setAssigneeId} /></View>
            ) : null}
            <Button size="sm" icon="add" onPress={openCreate}>Assign task</Button>
          </View>
        ) : null}
      </View>

      {loadError ? <ErrorBanner message={loadError} onRetry={loadTasks} /> : null}

      {tasks === null ? (
        <View style={styles.list}><Skeleton height={80} /><Skeleton height={80} /></View>
      ) : sortedTasks.length === 0 ? (
        loadError ? null : (
          <Card padding="lg"><ThemedText style={[styles.empty, styles.emptyStrong]}>{assigneeId === myId ? 'Nothing assigned to you.' : 'Nothing assigned to them.'}</ThemedText></Card>
        )
      ) : (
        <View style={styles.list}>
          {sortedTasks.map((task) => {
            const busy = busyId === task.id;
            const done = task.status === 'COMPLETED';
            const overdue = !done && task.dueDate ? daysUntil(task.dueDate) < 0 : false;
            const toggleable = canToggle(task);
            const hasThread = !!(task.sourceWorkDocId || task.sourceTimesheetId);
            return (
              <Card key={task.id} padding="sm" style={[styles.row, { borderColor: overdue ? 'rgba(239,68,68,0.4)' : theme.border, opacity: busy ? 0.6 : 1 }]}>
                <View style={styles.rowTop}>
                  <Pressable
                    onPress={() => toggleTask(task)}
                    disabled={busy || !toggleable}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done, disabled: !toggleable }}
                    accessibilityLabel={done ? 'Mark as pending' : 'Mark as completed'}>
                    <Check done={done} enabled={toggleable} />
                  </Pressable>

                  <View style={styles.flex1}>
                    <ThemedText style={[styles.title, done && { color: theme.textMuted, textDecorationLine: 'line-through' }]}>{task.title}</ThemedText>
                    {task.description ? <ThemedText themeColor="textMuted" style={[styles.desc, styles.descGap]}>{task.description}</ThemedText> : null}

                    <View style={styles.meta}>
                      {isAdmin && assigneeId !== myId ? (
                        <ThemedText themeColor="textMuted" style={styles.small}>{'For '}<ThemedText style={[styles.small, styles.bold]}>{task.assignedTo?.name}</ThemedText></ThemedText>
                      ) : null}
                      {!isAdmin && task.assignedBy?.name ? <ThemedText themeColor="textMuted" style={styles.small}>{`From ${task.assignedBy.name}`}</ThemedText> : null}
                      <ThemedText themeColor="textMuted" style={styles.small}>{fmtDate(task.date)}</ThemedText>
                      {task.dueDate ? (
                        <ThemedText themeColor="textMuted" style={[styles.small, overdue && { color: OVERDUE, fontFamily: FontWeights.semiBold }]}>
                          {`Due ${fmtDate(task.dueDate)}${overdue ? ' — overdue' : ''}`}
                        </ThemedText>
                      ) : null}
                    </View>

                    {hasThread ? (
                      <View style={styles.thread}>
                        <Pressable onPress={() => toggleThread(task)} accessibilityRole="button" hitSlop={8}>
                          <ThemedText style={[styles.small, styles.bold, { color: theme.primary }]}>{threadOpenId === task.id ? 'Hide thread' : 'View / reply to thread'}</ThemedText>
                        </Pressable>
                        {threadOpenId === task.id ? (
                          threadLoading === task.id ? (
                            <Skeleton height={40} />
                          ) : (
                            <View style={[styles.threadBox, { backgroundColor: theme.backgroundElement }]}>
                              {threadData[task.id] ? (
                                <ThemedText themeColor="textMuted" style={[styles.small, styles.italic]}>{`Re: “${threadData[task.id].description}”`}</ThemedText>
                              ) : null}
                              <ReplyThread
                                replies={threadData[task.id]?.replies ?? []}
                                currentUserId={myId}
                                onSend={(msg) => handleThreadReply(task, msg)}
                                sending={replySending}
                              />
                            </View>
                          )
                        ) : null}
                      </View>
                    ) : null}

                    {isAdmin ? (
                      <View style={styles.adminActions}>
                        <Pressable onPress={() => openEdit(task)} disabled={busy} accessibilityRole="button" accessibilityLabel="Edit task" style={styles.iconBtn}>
                          <Ionicons name="pencil-outline" size={16} color={theme.textMuted} />
                        </Pressable>
                        <Pressable onPress={() => handleDelete(task)} disabled={busy} accessibilityRole="button" accessibilityLabel="Delete task" style={styles.iconBtn}>
                          <Ionicons name="trash-outline" size={16} color={OVERDUE} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </View>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <SafeAreaView style={styles.flex1} edges={['top']}>
        {toast ? (
          <View style={[styles.toast, { backgroundColor: toast.type === 'success' ? '#22c55e' : '#ef4444' }]} accessibilityRole="alert">
            <ThemedText style={styles.toastText}>{toast.msg}</ThemedText>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={{ padding: pad, paddingBottom: 96, gap: 24 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View>
            <ThemedText style={styles.h1}>Tasks</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.subtitle}>Tick things off as you go.</ThemedText>
          </View>

          {wide ? (
            <View style={styles.columns}>
              <View style={styles.flex1}>{dailySection}</View>
              <View style={styles.flex1}>{assignedSection}</View>
            </View>
          ) : (
            <View style={styles.stack}>{dailySection}{assignedSection}</View>
          )}
        </ScrollView>
      </SafeAreaView>

      {showForm ? (
        <Sheet
          visible
          onClose={() => setShowForm(false)}
          locked={submitting}
          title={editing ? 'Edit task' : 'Assign a task'}
          footer={
            <>
              <Button style={styles.flex1} variant="secondary" disabled={submitting} onPress={() => setShowForm(false)}>Cancel</Button>
              <Button style={styles.flex1} loading={submitting} onPress={handleSubmit}>{editing ? 'Save changes' : 'Assign'}</Button>
            </>
          }>
          <Input label="Title" value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} placeholder="What needs doing?" />
          <Input label="Details (optional)" value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Anything else they should know" multiline numberOfLines={3} />
          <View>
            <Select label="Assign to" placeholder="Choose an employee…" options={employeeOptions} value={form.assignedToId} onChange={(v) => setForm({ ...form, assignedToId: v })} />
            {employees.length === 0 ? <ThemedText themeColor="textMuted" style={[styles.small, styles.gapTop]}>Couldn’t load the employee list — reload the page and try again.</ThemedText> : null}
          </View>
          <View style={wide ? styles.dates : styles.datesPhone}>
            <View style={styles.flex1}><DateField label="Task date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} /></View>
            <View style={styles.flex1}><DateField label="Due (optional)" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} /></View>
          </View>
          {formError ? <ThemedText style={[styles.small, { color: OVERDUE }]}>{formError}</ThemedText> : null}
        </Sheet>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  stack: { gap: 24 },
  columns: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  section: { gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  sectionLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  adminControls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  filter: { minWidth: 120 },
  list: { gap: 8 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyStrong: { fontFamily: FontWeights.medium },
  row: { borderRadius: Radii.lg },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  desc: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  descGap: { marginTop: 4 },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  small: { fontSize: 12, lineHeight: 18 },
  bold: { fontFamily: FontWeights.semiBold },
  italic: { fontStyle: 'italic', marginBottom: 8 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 6 },
  proof: { gap: 8, marginTop: 8 },
  proofBtns: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  markBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm, backgroundColor: '#0d9488', minHeight: 36, justifyContent: 'center' },
  markText: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  thread: { marginTop: 8, gap: 8 },
  threadBox: { padding: 12, borderRadius: Radii.sm },
  adminActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 8 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm },
  toast: { position: 'absolute', top: 16, right: 16, left: 16, zIndex: 50, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  toastText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, textAlign: 'center' },
  dates: { flexDirection: 'row', gap: 12 },
  datesPhone: { gap: 12 },
  gapTop: { marginTop: 4 },
});
