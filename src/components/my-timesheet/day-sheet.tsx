import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteTimesheetEntryAttachment, fetchMentionableUsers, unlinkTimesheetEntryContact, uploadTimesheetEntryAttachment } from '@/lib/api';
import {
  mtDownloadAttachment,
  mtGetOne,
  mtLinkContact,
  mtReplyToEntry,
  mtSave,
  mtSubmit,
  type MtAttachment,
  type MtContactLink,
  type MtDay,
  type MtLinkContactInput,
  type MtReply,
  type MtTask,
} from '@/lib/my-timesheet-api';
import { pickFromCamera, pickFromGallery, type PickedFile } from '@/lib/upload';
import type { MentionableUser } from '@/types/api';
import { ContactComposeForm, type LinkContactResult } from './contact-form';
import {
  MANAGER_ROLES,
  MentionField,
  ReplyThread,
  apiErrorMessage,
  contactTypeDisplay,
  displayContactPhone,
  formatDateTimeIST,
  formatTimeIST,
  localDateStr,
  newEntryId,
} from './parts';
import { WorkDocSection } from './work-docs';

interface TaskRow { id: string; task: string; hoursText: string; mentions: string[]; orig: MtTask }

const rowFrom = (t: MtTask): TaskRow => ({ id: t.id ?? newEntryId(), task: t.task, hoursText: t.hours ? String(t.hours) : '', mentions: t.mentions ?? [], orig: t });
const blankRow = (): TaskRow => ({ id: newEntryId(), task: '', hoursText: '', mentions: [], orig: { task: '', hours: 0 } });
const hoursOf = (r: TaskRow) => parseFloat(r.hoursText) || 0;

type ApiErr = { response?: { status?: number; data?: { error?: string; data?: unknown } } };

// Dashboard DayEntryModal. The two themed confirm overlays there are native alerts here, and the "Contact linked."
// toast is shown inline at the top of the sheet (a screen-level toast would sit behind this modal).
export function DayEntrySheet({ date, existing, user, onClose, onSaved }: {
  date: Date;
  existing?: MtDay;
  user: { id: string; role: string } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const theme = useTheme();
  const [tasks, setTasks] = useState<TaskRow[]>(() => (existing?.entries?.length ? existing.entries.map(rowFrom) : [blankRow()]));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Tracked separately from `existing` so an auto-save triggered by attaching a file is usable immediately.
  const [timesheetId, setTimesheetId] = useState<string | null>(existing?.id ?? null);
  // status / canEdit / editableUntil / lockedReason independent of the `existing` prop, so a 403 mid-edit flips this
  // sheet to the locked view immediately.
  const [current, setCurrent] = useState<MtDay | undefined>(existing);

  const dateStr = localDateStr(date.getFullYear(), date.getMonth() + 1, date.getDate());

  const status = current?.status;
  const isDraftStatus = !current || status === 'DRAFT';
  const isRejectedStatus = status === 'REJECTED';
  const isSubmittedStatus = status === 'SUBMITTED';
  // The backend is the only source of truth for editability. DRAFT (or no timesheet yet) is always editable;
  // everything else needs an explicit canEdit: true.
  const canEditNow = isDraftStatus ? true : current?.canEdit === true;
  const lockedReason = current?.lockedReason ?? null;
  const editableUntil = current?.editableUntil ?? null;

  const validate = () => {
    const valid = tasks.filter((t) => t.task.trim());
    if (valid.length === 0) { setError('Add at least one task.'); return null; }
    return valid;
  };

  // Shallow comparison against the last-known-persisted state — only used to warn before an action that would
  // silently discard unsaved text (see handleAttach).
  const hasUnsavedChanges = () => {
    const baseline = current?.entries ?? [];
    if (tasks.length !== baseline.length) return true;
    const changedTask = tasks.some((t, i) => {
      const b = baseline[i];
      return !b || t.task !== b.task || hoursOf(t) !== Number(b.hours);
    });
    if (changedTask) return true;
    return notes !== (current?.notes ?? '');
  };

  // One save path for Save Draft, Submit and the auto-save that fires when attaching a file / linking a contact.
  const doSave = async (): Promise<MtDay | null> => {
    const valid = validate();
    if (!valid) return null;
    const entries: MtTask[] = valid.map((r) => ({ ...r.orig, id: r.id, task: r.task, hours: hoursOf(r), mentions: r.mentions }));
    // notes is sent as-is, including an empty string, so an intentional clear reaches the backend.
    const res = await mtSave(dateStr, entries, notes);
    setTimesheetId(res.id);
    setCurrent(res);
    return res;
  };

  const [entryReplies, setEntryReplies] = useState<MtReply[]>(existing?.entryReplies ?? []);
  const [replySendingId, setReplySendingId] = useState<string | null>(null);
  const [replyError, setReplyError] = useState('');

  // Everyone taggable; loaded once per open. Degrades to a plain text box on failure.
  const [mentionUsers, setMentionUsers] = useState<MentionableUser[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchMentionableUsers()
      .then((res) => { if (!cancelled) setMentionUsers(res ?? []); })
      .catch(() => { /* never blocks saving */ });
    return () => { cancelled = true; };
  }, []);

  const [attachments, setAttachments] = useState<MtAttachment[]>(existing?.entryAttachments ?? []);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [attachMenuFor, setAttachMenuFor] = useState<string | null>(null);
  const [attachError, setAttachError] = useState('');
  const [contacts, setContacts] = useState<MtContactLink[]>(existing?.entryContacts ?? []);
  const [contactError, setContactError] = useState('');
  const [composeOpenFor, setComposeOpenFor] = useState<string | null>(null);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);

  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3500);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const refreshFromServer = async (id?: string) => {
    const tid = id ?? timesheetId ?? current?.id;
    if (!tid) return;
    const res = await mtGetOne(tid);
    // Also refreshes status/canEdit/editableUntil/lockedReason — flips the sheet to the locked view right after a 403.
    setCurrent(res);
    setEntryReplies(res.entryReplies ?? []);
    setAttachments(res.entryAttachments ?? []);
    setContacts(res.entryContacts ?? []);
  };

  const performAttach = async (entryId: string, file: PickedFile) => {
    // On a SUBMITTED timesheet entries and attachments each consume the one available edit, so auto-saving text first
    // would use it up and the attachment would 403. For an already-persisted SUBMITTED timesheet attach directly;
    // DRAFT/REJECTED (or a new, unsaved entry) auto-save first.
    const skipAutoSave = isSubmittedStatus && !!timesheetId;
    setUploadingFor(entryId);
    try {
      let targetId: string | null = skipAutoSave ? timesheetId : null;
      if (!skipAutoSave) {
        const saved = await doSave();
        if (!saved) { setAttachError('Add a short description for this task before attaching a file.'); return; }
        targetId = saved.id;
      }
      if (!targetId) { setAttachError('Save this entry before attaching a file.'); return; }
      await uploadTimesheetEntryAttachment(targetId, entryId, file, { onProgress: () => {}, signal: new AbortController().signal });
      await refreshFromServer(targetId);
    } catch (e) {
      if ((e as ApiErr)?.response?.status === 403) await refreshFromServer();
      else setAttachError(apiErrorMessage(e, 'Failed to upload attachment.'));
    } finally {
      setUploadingFor(null);
    }
  };

  const handleAttach = (entryId: string, file: PickedFile) => {
    setAttachError('');
    // The attachment hangs off this entry id, so it needs its own text before there's anything to save.
    const task = tasks.find((t) => t.id === entryId);
    if (!task?.task.trim()) { setAttachError('Add a short description for this task before attaching a file.'); return; }
    // Attaching to a SUBMITTED timesheet skips saving text, so unsaved changes would be lost — warn first.
    const skipAutoSave = isSubmittedStatus && !!timesheetId;
    if (skipAutoSave && canEditNow && hasUnsavedChanges()) {
      Alert.alert(
        'Unsaved changes',
        'You have unsaved changes to this timesheet. Attaching a file will use your one remaining edit, and your unsaved text changes will NOT be saved.\n\nSave your text changes first, or continue to attach the file instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue and attach', onPress: () => { void performAttach(entryId, file); } },
        ],
      );
      return;
    }
    void performAttach(entryId, file);
  };

  const pickAttach = async (entryId: string, how: 'camera' | 'gallery' | 'pdf') => {
    setAttachMenuFor(null);
    if (how === 'pdf') {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      handleAttach(entryId, { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/pdf', size: a.size });
      return;
    }
    const f = how === 'camera' ? await pickFromCamera() : await pickFromGallery();
    if (f) handleAttach(entryId, f);
  };

  const handleViewAttachment = async (a: MtAttachment) => {
    try {
      const { uri } = await mtDownloadAttachment(a.id, a.filename);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: a.mimeType });
      else setAttachError('Failed to open attachment.');
    } catch {
      setAttachError('Failed to open attachment.');
    }
  };

  const handleDeleteAttachment = (a: MtAttachment) => {
    Alert.alert('Remove attachment?', `"${a.filename}" will be removed from this task.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setAttachError('');
          try {
            await deleteTimesheetEntryAttachment(a.id);
            await refreshFromServer();
          } catch (e) {
            if ((e as ApiErr)?.response?.status === 403) await refreshFromServer();
            else setAttachError('Failed to remove attachment.');
          }
        },
      },
    ]);
  };

  // Needs a persisted entry to link against, so it auto-saves first via doSave. Returns a result for the form.
  const handleLinkContact = async (entryId: string, data: MtLinkContactInput): Promise<LinkContactResult> => {
    const task = tasks.find((t) => t.id === entryId);
    if (!task?.task.trim()) return { ok: false, kind: 'error', message: 'Add a short description for this task before adding a contact.' };
    try {
      const saved = await doSave();
      if (!saved) return { ok: false, kind: 'error', message: 'Add a short description for this task before adding a contact.' };
      await mtLinkContact(saved.id, entryId, data);
      await refreshFromServer(saved.id);
      showToast('Contact linked.');
      return { ok: true };
    } catch (e) {
      const err = e as ApiErr;
      if (err?.response?.status === 409 && err.response.data?.data) {
        return { ok: false, kind: 'conflict', conflict: err.response.data.data as never };
      }
      return { ok: false, kind: 'error', message: apiErrorMessage(e, 'Failed to link contact.') };
    }
  };

  // Visibility is convenience only — the backend 403 is the real gate.
  const handleUnlinkContact = (c: MtContactLink) => {
    const label = c.contact.name || displayContactPhone(c.contact.phone);
    Alert.alert('Remove contact?', `Remove ${label} from this task entry? This only removes it from this task — it stays in the Contacts directory.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          setContactError('');
          try {
            await unlinkTimesheetEntryContact(c.id);
            await refreshFromServer();
          } catch {
            setContactError('Failed to remove contact.');
          }
        },
      },
    ]);
  };

  const handleEmployeeReply = async (entryId: string, message: string, mentions?: string[]) => {
    if (!timesheetId) return;
    setReplySendingId(entryId);
    setReplyError('');
    try {
      await mtReplyToEntry(timesheetId, entryId, message, mentions);
      const res = await mtGetOne(timesheetId);
      setEntryReplies(res.entryReplies ?? []);
    } catch (e) {
      setReplyError(apiErrorMessage(e, 'Could not send that reply.'));
    } finally {
      setReplySendingId(null);
    }
  };

  const addTask = () => setTasks((p) => [...p, blankRow()]);
  const removeTask = (i: number) => setTasks((p) => p.filter((_, idx) => idx !== i));
  const updateTaskText = (i: number, value: string, mentions: string[]) => setTasks((p) => p.map((t, idx) => (idx === i ? { ...t, task: value, mentions } : t)));
  const updateHours = (i: number, value: string) => setTasks((p) => p.map((t, idx) => (idx === i ? { ...t, hoursText: value } : t)));

  const totalHours = tasks.reduce((sum, t) => sum + hoursOf(t), 0);

  const runSave = async (afterSave?: (saved: MtDay) => Promise<void>, setBusy: (b: boolean) => void = setSaving, failMsg = 'Failed to save.') => {
    setError('');
    setBusy(true);
    try {
      const saved = await doSave();
      if (!saved) return;
      if (afterSave) await afterSave(saved);
      onSaved();
      onClose();
    } catch (e) {
      if ((e as ApiErr)?.response?.status === 403) await refreshFromServer();
      else setError(apiErrorMessage(e, failMsg));
    } finally {
      setBusy(false);
    }
  };

  // DRAFT's "Save Draft", REJECTED's "Save" and (after confirmation) SUBMITTED's one-time edit.
  const handleSaveDraft = () => runSave();
  const handleSubmit = () => runSave(async (saved) => { await mtSubmit(saved.id); }, setSubmitting, 'Failed to submit.');

  const confirmSubmittedEdit = () => {
    Alert.alert(
      'Use your only edit?',
      'This is your ONLY edit for this timesheet. Once you save, it will be locked permanently and cannot be changed again. Please check every task and hours value now.\n\nSave this edit?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save this edit', onPress: () => { void runSave(); } },
      ],
    );
  };

  const formattedDate = date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const chipStyle = [styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }];
  const ghostBtn = (label: string, onPress: () => void, disabled?: boolean) => (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.ghostBtn, { backgroundColor: theme.surface, borderColor: theme.border, opacity: disabled ? 0.5 : 1 }]} accessibilityRole="button">
      <ThemedText themeColor="textMuted" style={styles.chipText}>{label}</ThemedText>
    </Pressable>
  );

  const busy = saving || submitting;
  const footer = !canEditNow ? (
    <View style={styles.footer}><View style={styles.flex1}><Button variant="outline" fullWidth onPress={onClose}>Close</Button></View></View>
  ) : isSubmittedStatus ? (
    <View style={styles.footer}>
      <View style={styles.flex1}><Button variant="outline" fullWidth onPress={onClose} disabled={busy}>Cancel</Button></View>
      <View style={styles.flex1}><Button fullWidth onPress={confirmSubmittedEdit} loading={saving}>Save edit</Button></View>
    </View>
  ) : (
    <View style={styles.footer}>
      <View style={styles.flex1}><Button variant="outline" fullWidth onPress={onClose} disabled={busy}>Cancel</Button></View>
      <View style={styles.flex1}><Button variant="secondary" fullWidth onPress={handleSaveDraft} loading={saving} disabled={busy}>{isRejectedStatus ? 'Save' : 'Save Draft'}</Button></View>
      <View style={styles.flex1}><Button fullWidth onPress={handleSubmit} loading={submitting} disabled={busy}>Submit</Button></View>
    </View>
  );

  return (
    <Sheet visible fullHeight onClose={onClose} locked={busy} title={`Timesheet — ${formattedDate}`} footer={footer}>
      {toast ? (
        <View style={[styles.notice, { backgroundColor: 'rgba(54,200,126,0.12)' }]}><ThemedText style={[styles.p, { color: '#167A48' }]}>{toast}</ThemedText></View>
      ) : null}
      {isRejectedStatus ? (
        <View style={[styles.notice, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
          <ThemedText style={[styles.p, { color: '#B42318' }]}><ThemedText style={[styles.p, styles.bold, { color: '#B42318' }]}>Rejected:</ThemedText> {current?.notes || 'No reason provided.'}</ThemedText>
        </View>
      ) : null}
      {isSubmittedStatus && canEditNow ? (
        <View style={[styles.notice, { backgroundColor: 'rgba(54,200,126,0.1)' }]}>
          <ThemedText style={[styles.p, { color: '#167A48' }]}>Editable until {editableUntil ? formatTimeIST(editableUntil) : '—'} — one change only.</ThemedText>
        </View>
      ) : null}
      {!canEditNow ? (
        <View style={[styles.notice, { backgroundColor: 'rgba(107,114,128,0.12)' }]}>
          <ThemedText themeColor="textMuted" style={styles.p}>{lockedReason ?? 'This timesheet cannot be edited.'}</ThemedText>
        </View>
      ) : null}

      {/* Tasks */}
      <View style={styles.gap12}>
        <View style={styles.between}>
          <ThemedText style={[styles.p, styles.medium]}>Tasks</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.small}>Total: <ThemedText style={[styles.small, styles.bold]}>{totalHours.toFixed(1)}h</ThemedText></ThemedText>
        </View>

        {tasks.map((t, i) => {
          const replies = entryReplies.filter((r) => r.entryId === t.id);
          const mine = attachments.filter((a) => a.entryId === t.id);
          const mineContacts = contacts.filter((c) => c.entryId === t.id);
          const expandedContact = mineContacts.find((c) => c.id === expandedContactId);
          const showExtras = !(mine.length === 0 && mineContacts.length === 0 && !canEditNow);
          return (
            <View key={i} style={styles.gap6}>
              <View style={styles.taskRow}>
                <View style={styles.flex1}>
                  <MentionField
                    value={t.task}
                    onChange={(v, m) => updateTaskText(i, v, m)}
                    users={mentionUsers}
                    initialMentions={t.mentions}
                    placeholder="Describe the task… use @ to tag someone"
                    disabled={!canEditNow}
                    multiline
                  />
                </View>
                <TextInput
                  value={t.hoursText}
                  onChangeText={(v) => updateHours(i, v)}
                  placeholder="hrs"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="decimal-pad"
                  editable={canEditNow}
                  style={[styles.hours, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, opacity: canEditNow ? 1 : 0.6 }]}
                />
                {canEditNow && tasks.length > 1 ? (
                  <Pressable onPress={() => removeTask(i)} hitSlop={8} style={styles.xBtn} accessibilityLabel={`Remove task ${i + 1}`}>
                    <ThemedText themeColor="textMuted">✕</ThemedText>
                  </Pressable>
                ) : null}
              </View>

              {showExtras ? (
                <>
                  <View style={styles.wrapRow}>
                    {mine.map((a) => (
                      <View key={a.id} style={chipStyle}>
                        <Pressable onPress={() => handleViewAttachment(a)}><ThemedText numberOfLines={1} style={[styles.chipText, styles.underline, styles.chipName]}>{a.filename}</ThemedText></Pressable>
                        {canEditNow ? <Pressable onPress={() => handleDeleteAttachment(a)} hitSlop={8} accessibilityLabel="Remove attachment"><ThemedText style={[styles.chipText, { color: theme.danger }]}>×</ThemedText></Pressable> : null}
                      </View>
                    ))}
                    {mineContacts.map((c) => {
                      const deleted = !!c.contact.deletedAt;
                      const canUnlink = canEditNow && !!user && (c.linkedById === user.id || MANAGER_ROLES.includes(user.role));
                      return (
                        <View key={c.id} style={chipStyle}>
                          <Pressable onPress={() => setExpandedContactId((cur) => (cur === c.id ? null : c.id))}>
                            <ThemedText numberOfLines={1} style={[styles.chipText, styles.chipName, { color: deleted ? theme.textMuted : theme.text, textDecorationLine: deleted ? 'line-through' : 'underline', opacity: deleted ? 0.6 : 1 }]}>
                              {c.contact.name || displayContactPhone(c.contact.phone)}
                            </ThemedText>
                          </Pressable>
                          {canUnlink ? <Pressable onPress={() => handleUnlinkContact(c)} hitSlop={8} accessibilityLabel="Remove contact from this task"><ThemedText style={[styles.chipText, { color: theme.danger }]}>×</ThemedText></Pressable> : null}
                        </View>
                      );
                    })}
                    {canEditNow ? (
                      <>
                        {ghostBtn(uploadingFor === t.id ? 'Uploading…' : '＋ Attach bill / photo', () => setAttachMenuFor((cur) => (cur === t.id ? null : t.id)), uploadingFor === t.id)}
                        {ghostBtn('＋ Add Contact', () => setComposeOpenFor((cur) => (cur === t.id ? null : t.id)))}
                      </>
                    ) : null}
                  </View>

                  {attachMenuFor === t.id ? (
                    <View style={styles.wrapRow}>
                      <Button variant="outline" size="sm" onPress={() => pickAttach(t.id, 'camera')}>Camera</Button>
                      <Button variant="outline" size="sm" onPress={() => pickAttach(t.id, 'gallery')}>Photos</Button>
                      <Button variant="outline" size="sm" onPress={() => pickAttach(t.id, 'pdf')}>PDF</Button>
                    </View>
                  ) : null}

                  {expandedContact ? (
                    <View style={[styles.expanded, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <ThemedText style={styles.chipText}>
                        <ThemedText style={[styles.chipText, styles.bold]}>{expandedContact.contact.name || displayContactPhone(expandedContact.contact.phone)}</ThemedText>
                        {expandedContact.contact.name ? ` — ${displayContactPhone(expandedContact.contact.phone)}` : ''}
                      </ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.chipText}>{contactTypeDisplay(expandedContact.contact.contactType, expandedContact.contact.contactTypeOther)}</ThemedText>
                      {expandedContact.reason ? <ThemedText themeColor="textMuted" style={styles.chipText}>Reason: {expandedContact.reason}</ThemedText> : null}
                      <ThemedText themeColor="textMuted" style={styles.chipText}>Linked by {expandedContact.linkedBy?.name ?? 'Unknown'} on {formatDateTimeIST(expandedContact.createdAt)}</ThemedText>
                      {expandedContact.contact.deletedAt ? <ThemedText themeColor="danger" style={styles.chipText}>This contact has been removed from the directory.</ThemedText> : null}
                    </View>
                  ) : null}

                  {composeOpenFor === t.id ? (
                    <ContactComposeForm onSubmit={(data) => handleLinkContact(t.id, data)} onDone={() => setComposeOpenFor(null)} onCancel={() => setComposeOpenFor(null)} />
                  ) : null}
                </>
              ) : null}

              {replies.length > 0 ? (
                <View style={[styles.expanded, { backgroundColor: theme.surface, borderColor: 'transparent' }]}>
                  <ReplyThread
                    replies={replies}
                    currentUserId={user?.id ?? ''}
                    onSend={(msg, mentions) => handleEmployeeReply(t.id, msg, mentions)}
                    sending={replySendingId === t.id}
                    placeholder="Reply… use @ to tag someone"
                    mentionUsers={mentionUsers}
                    error={replySendingId === null ? replyError : undefined}
                  />
                </View>
              ) : null}
            </View>
          );
        })}

        {canEditNow ? <Button variant="outline" size="sm" onPress={addTask}>+ Add Task</Button> : null}
      </View>

      {/* Notes */}
      <View style={styles.gap6}>
        <ThemedText style={[styles.p, styles.medium]}>Notes (optional)</ThemedText>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          editable={canEditNow}
          multiline
          placeholder="Any additional notes..."
          placeholderTextColor={theme.textMuted}
          style={[styles.notes, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, opacity: canEditNow ? 1 : 0.6 }]}
        />
      </View>

      {error ? <ThemedText themeColor="danger" style={styles.p}>{error}</ThemedText> : null}
      {attachError ? <ThemedText themeColor="danger" style={styles.p}>{attachError}</ThemedText> : null}
      {contactError ? <ThemedText themeColor="danger" style={styles.p}>{contactError}</ThemedText> : null}

      {/* initialTimesheetId is `timesheetId`, not `existing?.id` — a file attached to a task above can create the
          timesheet mid-session, and the notes section's own blank-entries auto-save must not overwrite it. */}
      <WorkDocSection date={dateStr} initialTimesheetId={timesheetId} onTimesheetCreated={onSaved} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  footer: { flexDirection: 'row', gap: 8, flex: 1 },
  gap6: { gap: 6 },
  gap12: { gap: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  p: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 17 },
  medium: { fontFamily: FontWeights.medium },
  bold: { fontFamily: FontWeights.bold },
  notice: { borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 8 },
  hours: { width: 64, minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 6, paddingVertical: 10, fontSize: 14, textAlign: 'center', fontFamily: FontWeights.regular },
  xBtn: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 8, paddingVertical: 6 },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  chipName: { maxWidth: 160 },
  underline: { textDecorationLine: 'underline' },
  ghostBtn: { borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 10, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  expanded: { borderWidth: 1, borderRadius: Radii.sm, padding: 8, gap: 2 },
  notes: { minHeight: 76, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top', fontFamily: FontWeights.regular },
});
