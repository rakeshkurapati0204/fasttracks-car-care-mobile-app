import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { MentionInput } from '@/components/expenses/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { DateField } from '@/components/call-tracker/date-field';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  assignTimesheetEntryTask,
  createStaffRemark,
  fetchTimesheetAttachmentDataUri,
  fetchTimesheetDetail,
  fetchWorkDocsForTimesheet,
  getErrorMessage,
  replyToTimesheetEntryMentions,
  replyToWorkDocMentions,
  searchWorkDocs,
} from '@/lib/api';
import type {
  MentionableUser,
  RemarkCategory,
  RemarkRating,
  RemarkVisibility,
  TimesheetDetail,
  TimesheetEntryAttachment,
  WorkDocumentation,
} from '@/types/api';

import { formatDateLabel, formatPrice, quoteLabel } from './helpers';

export interface RosterEntry { id: string; name: string; role: string; status: string; timesheetId: string | null; totalHours: number }

interface ReplyItem {
  id: string;
  authorId: string;
  author?: { id: string; name: string };
  message: string;
  mentionedUsers?: { id: string; name: string }[];
}

const MENTION_BG = 'rgba(13,148,136,0.15)';
const MENTION_FG = '#0d9488';
const QUICK_REPLIES = ['👍 Got it', 'On it', 'Will check'];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlights each @-tagged name by the CURRENT name of the ids in mentionedUsers (never by scanning for a bare "@").
function MessageText({ message, mentionedUsers, color }: { message: string; mentionedUsers?: { id: string; name: string }[]; color?: string }) {
  const names = Array.from(new Set((mentionedUsers ?? []).map((u) => u.name).filter(Boolean)));
  if (names.length === 0) return <ThemedText style={[styles.msg, color ? { color } : null]}>{message}</ThemedText>;
  names.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g');
  return (
    <ThemedText style={[styles.msg, color ? { color } : null]}>
      {message.split(pattern).map((part, i) =>
        part.startsWith('@') && names.includes(part.slice(1))
          ? <ThemedText key={i} style={{ backgroundColor: MENTION_BG, color: MENTION_FG, fontFamily: FontWeights.semiBold }}>{part}</ThemedText>
          : part,
      )}
    </ThemedText>
  );
}

// Dashboard ReplyThread: chronological bubbles, quick replies, @-taggable compose box + Send.
function ReplyThread({ replies, currentUserId, onSend, sending, placeholder, mentionUsers }: {
  replies: ReplyItem[]; currentUserId: string; onSend: (message: string, mentions: string[]) => Promise<void>;
  sending: boolean; placeholder: string; mentionUsers: MentionableUser[];
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [error, setError] = useState('');

  const send = async (message: string, ids: string[]) => {
    setError('');
    try {
      await onSend(message, ids);
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Could not send the reply.'));
      return false;
    }
  };
  const submit = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    if (await send(t, mentions)) { setDraft(''); setMentions([]); }
  };

  return (
    <View style={styles.gap8}>
      {replies.length > 0 ? (
        <View style={styles.gap6}>
          {replies.map((r) => {
            const me = r.authorId === currentUserId;
            return (
              <View key={r.id} style={{ flexDirection: 'row', justifyContent: me ? 'flex-end' : 'flex-start' }}>
                <View style={[styles.bubble, me ? { backgroundColor: theme.primary } : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
                  {!me ? <ThemedText themeColor="textMuted" style={styles.bubbleAuthor}>{r.author?.name ?? 'Unknown'}</ThemedText> : null}
                  <MessageText message={r.message} mentionedUsers={r.mentionedUsers} color={me ? '#fff' : undefined} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.wrapRow}>
        {QUICK_REPLIES.map((q) => (
          <Pressable key={q} disabled={sending} onPress={() => send(q, [])} style={[styles.quick, { backgroundColor: theme.surface, borderColor: theme.border, opacity: sending ? 0.5 : 1 }]}>
            <ThemedText themeColor="textMuted" style={styles.quickText}>{q}</ThemedText>
          </Pressable>
        ))}
      </View>
      <View style={styles.composeRow}>
        <View style={styles.flex1}>
          <MentionInput value={draft} onChange={(v, m) => { setDraft(v); setMentions(m); }} users={mentionUsers} placeholder={placeholder} disabled={sending} onSubmit={submit} />
        </View>
        <Button size="sm" onPress={submit} loading={sending} disabled={!draft.trim() || sending}>Send</Button>
      </View>
      {error ? <ThemedText style={[styles.err, { color: theme.danger }]}>{error}</ThemedText> : null}
    </View>
  );
}

// One-shot compose box for Assign Task.
function AssignTaskBox({ onSend, sending }: { onSend: (message: string) => Promise<void>; sending: boolean }) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    setError('');
    try { await onSend(t); setDraft(''); } catch (e) { setError(getErrorMessage(e, 'Could not assign the task.')); }
  };
  return (
    <View style={styles.gap6}>
      <View style={styles.composeRow}>
        <View style={styles.flex1}>
          <Input value={draft} onChangeText={setDraft} placeholder="What should they follow up on?" editable={!sending} onSubmitEditing={submit} returnKeyType="send" />
        </View>
        <Button size="sm" onPress={submit} loading={sending} disabled={!draft.trim() || sending}>Assign</Button>
      </View>
      {error ? <ThemedText style={[styles.err, { color: theme.danger }]}>{error}</ThemedText> : null}
    </View>
  );
}

// Private attachment: fetched with auth, saved to cache, then opened via the OS share sheet.
async function openAttachment(a: TimesheetEntryAttachment) {
  const dataUri = await fetchTimesheetAttachmentDataUri(a.id, a.mimeType);
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
  const safe = a.filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const uri = `${FileSystem.cacheDirectory}${a.id}-${safe}`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: a.mimeType });
}

type EntryReply = TimesheetDetail['entryReplies'][number] & { mentionedUsers?: { id: string; name: string }[] };
type DocReply = WorkDocumentation['replies'][number] & { mentionedUsers?: { id: string; name: string }[] };

// Inline employee panel — only this person's timesheet + work-doc notes for the selected date.
export function InlineEmployeePanel({ emp, date, currentUserId, onReplySent, mentionUsers, refreshTick }: {
  emp: RosterEntry; date: string; currentUserId: string; onReplySent: () => void; mentionUsers: MentionableUser[]; refreshTick: number;
}) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [timesheet, setTimesheet] = useState<TimesheetDetail | null>(null);
  const [docs, setDocs] = useState<WorkDocumentation[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<Record<string, 'reply' | 'assign'>>({});
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState('');

  const load = useCallback(async () => {
    if (!emp.timesheetId) { setTimesheet(null); setDocs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [ts, d] = await Promise.all([fetchTimesheetDetail(emp.timesheetId), fetchWorkDocsForTimesheet(emp.timesheetId)]);
      setTimesheet(ts);
      setDocs(d);
    } catch {
      setTimesheet(null);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [emp.timesheetId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on pull-to-refresh
    load();
  }, [load, refreshTick]);

  const handleReply = async (docId: string, message: string, mentions: string[]) => {
    setSendingId(docId);
    try {
      await replyToWorkDocMentions(docId, message, mentions);
      setDocs(await fetchWorkDocsForTimesheet(emp.timesheetId!));
      onReplySent();
    } finally { setSendingId(null); }
  };

  const handleEntryReply = async (entryId: string, message: string, mentions: string[]) => {
    setSendingId(entryId);
    try {
      await replyToTimesheetEntryMentions(emp.timesheetId!, entryId, message, mentions);
      setTimesheet(await fetchTimesheetDetail(emp.timesheetId!));
      onReplySent();
    } finally { setSendingId(null); }
  };

  const handleAssignTask = async (entryId: string, message: string) => {
    setSendingId(entryId);
    try {
      await assignTimesheetEntryTask(emp.timesheetId!, entryId, message);
      setTimesheet(await fetchTimesheetDetail(emp.timesheetId!));
      setExpandedAction((prev) => { const next = { ...prev }; delete next[entryId]; return next; });
      onReplySent();
    } finally { setSendingId(null); }
  };

  const toggleAction = (entryId: string, action: 'reply' | 'assign') => {
    setExpandedAction((prev) => {
      const next = { ...prev };
      if (next[entryId] === action) delete next[entryId]; else next[entryId] = action;
      return next;
    });
  };

  const viewAttachment = async (a: TimesheetEntryAttachment) => {
    setOpeningId(a.id);
    setAttachError('');
    try { await openAttachment(a); } catch (e) { setAttachError(getErrorMessage(e, 'Could not open the attachment.')); } finally { setOpeningId(null); }
  };

  if (loading) {
    return (
      <View style={styles.panelPad}>
        <Skeleton width="33%" height={16} />
        <Skeleton height={64} style={{ borderRadius: Radii.md }} />
      </View>
    );
  }

  if (!emp.timesheetId || !timesheet) {
    return (
      <View style={styles.panelPad}>
        <ThemedText themeColor="textMuted" style={styles.centerText}>No timesheet logged by {emp.name} on {formatDateLabel(date)}.</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.panelPad, { gap: 16 }]}>
      <View style={styles.gap8}>
        <ThemedText style={styles.h3}>Tasks logged — {timesheet.totalHours}h total</ThemedText>
        {timesheet.entries.length === 0 ? (
          <ThemedText themeColor="textMuted" style={styles.xs}>No task rows logged.</ThemedText>
        ) : (
          <View style={styles.gap8}>
            {timesheet.entries.map((e, i) => {
              const entryReplies = (timesheet.entryReplies ?? []).filter((r) => r.entryId === e.id) as EntryReply[];
              const openTask = (timesheet.followUpTasks ?? []).find((t) => t.sourceEntryId === e.id);
              const atts = (timesheet.entryAttachments ?? []).filter((a) => a.entryId === e.id);
              const expanded = e.id ? expandedAction[e.id] : undefined;
              return (
                <View key={e.id ?? i} style={[styles.entry, { backgroundColor: theme.surface }]}>
                  <View style={styles.between}>
                    <ThemedText style={[styles.sm, styles.flex1]}>{e.task}</ThemedText>
                    <ThemedText themeColor="textMuted" style={[styles.xs, { fontFamily: Fonts?.mono }]}>{e.hours}h</ThemedText>
                  </View>

                  {atts.length > 0 ? (
                    <View style={styles.wrapRow}>
                      {atts.map((a) => (
                        <Pressable key={a.id} onPress={() => viewAttachment(a)} disabled={openingId === a.id} style={[styles.attach, { backgroundColor: theme.background, borderColor: theme.border }]}>
                          <ThemedText style={styles.attachText} numberOfLines={1}>📎 {a.filename}</ThemedText>
                          {openingId === a.id ? <ActivityIndicator size="small" /> : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {attachError && atts.length > 0 ? <ThemedText style={[styles.err, { color: theme.danger }]}>{attachError}</ThemedText> : null}

                  {e.id ? (
                    <>
                      <View style={styles.actionRow}>
                        <Pressable onPress={() => toggleAction(e.id!, 'reply')} hitSlop={8}>
                          <ThemedText style={[styles.action, { color: theme.primary }]}>
                            {expanded === 'reply' ? 'Hide' : entryReplies.length > 0 ? `Reply (${entryReplies.length})` : 'Reply'}
                          </ThemedText>
                        </Pressable>
                        {openTask ? (
                          <ThemedText style={[styles.action, { color: theme.success }]}>✓ Task assigned</ThemedText>
                        ) : (
                          <Pressable onPress={() => toggleAction(e.id!, 'assign')} hitSlop={8}>
                            <ThemedText style={[styles.action, { color: theme.primary }]}>{expanded === 'assign' ? 'Cancel' : 'Assign Task'}</ThemedText>
                          </Pressable>
                        )}
                      </View>
                      {expanded === 'reply' ? (
                        <ReplyThread
                          replies={entryReplies}
                          currentUserId={currentUserId}
                          onSend={(msg, mentions) => handleEntryReply(e.id!, msg, mentions)}
                          sending={sendingId === e.id}
                          placeholder="Reply to this entry… use @ to tag someone"
                          mentionUsers={mentionUsers}
                        />
                      ) : null}
                      {expanded === 'assign' ? <AssignTaskBox onSend={(msg) => handleAssignTask(e.id!, msg)} sending={sendingId === e.id} /> : null}
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        {timesheet.notes ? <ThemedText themeColor="textMuted" style={[styles.xs, { fontStyle: 'italic' }]}>“{timesheet.notes}”</ThemedText> : null}
      </View>

      <View style={styles.gap8}>
        <ThemedText style={styles.h3}>Work documentation {docs.length > 0 ? `(${docs.length})` : ''}</ThemedText>
        {docs.length === 0 ? (
          <ThemedText themeColor="textMuted" style={styles.xs}>No notes logged for this day.</ThemedText>
        ) : (
          <View style={styles.gap12}>
            {docs.map((doc) => (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <ThemedText style={styles.sm}>{doc.description}</ThemedText>
                {doc.type === 'CUSTOMER_INTERACTION' && doc.customer ? (
                  <ThemedText themeColor="textMuted" style={styles.xs}>{doc.customer.name}{doc.customer.phone ? ` · ${doc.customer.phone}` : ''}</ThemedText>
                ) : null}
                {doc.vendorName || doc.contactPhone ? (
                  <ThemedText themeColor="textMuted" style={styles.xs}>{doc.vendorName}{doc.vendorName && doc.contactPhone ? ' · ' : ''}{doc.contactPhone}</ThemedText>
                ) : null}
                <ReplyThread
                  replies={doc.replies as DocReply[]}
                  currentUserId={currentUserId}
                  onSend={(msg, mentions) => handleReply(doc.id, msg, mentions)}
                  sending={sendingId === doc.id}
                  placeholder="Reply to this note… use @ to tag someone"
                  mentionUsers={mentionUsers}
                />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Search Docs tab — global, cross-employee full-text search over work documentation ───
type SearchDoc = WorkDocumentation & { timesheet?: { date?: string; user?: { name?: string } } };

export function SearchDocsTab({ wide }: { wide: boolean }) {
  const theme = useTheme();
  const [q, setQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [results, setResults] = useState<SearchDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async (p = 1) => {
    setLoading(true);
    setSearched(true);
    try {
      const res = await searchWorkDocs({ q: q || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page: p, limit: 30 });
      setResults(res.docs as SearchDoc[]);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setPage(p);
    } catch { setResults([]); } finally { setLoading(false); }
  };

  return (
    <View style={styles.gap16}>
      <View style={[styles.searchRow, wide && { flexDirection: 'row', alignItems: 'flex-end' }]}>
        <View style={wide ? styles.flex1 : undefined}>
          <Input value={q} onChangeText={setQ} placeholder="Search description or vendor..." onSubmitEditing={() => doSearch(1)} returnKeyType="search" autoCapitalize="none" />
        </View>
        <View style={[styles.dateRow]}>
          <View style={styles.flex1}><DateField label="From" value={dateFrom} onChange={setDateFrom} compact /></View>
          <View style={styles.flex1}><DateField label="To" value={dateTo} onChange={setDateTo} compact /></View>
        </View>
        <Button onPress={() => doSearch(1)} loading={loading} size="sm">Search</Button>
      </View>

      {!searched ? (
        <ThemedText themeColor="textMuted" style={[styles.sm, styles.centerText, { paddingVertical: 32 }]}>Enter a keyword or date range to search documentation entries</ThemedText>
      ) : loading ? (
        <View style={styles.gap8}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={64} style={{ borderRadius: Radii.md }} />)}</View>
      ) : results.length === 0 ? (
        <ThemedText themeColor="textMuted" style={[styles.sm, styles.centerText, { paddingVertical: 32 }]}>No results found</ThemedText>
      ) : (
        <>
          <ThemedText themeColor="textMuted" style={styles.xs}>{total} result{total !== 1 ? 's' : ''}</ThemedText>
          <View style={styles.gap8}>
            {results.map((doc) => (
              <View key={doc.id} style={[styles.searchCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.between}>
                  <ThemedText style={[styles.sm, styles.semi, styles.flex1]}>{doc.description}</ThemedText>
                  <View style={styles.right}>
                    <ThemedText style={[styles.xs, styles.semi]}>{doc.timesheet?.user?.name ?? '—'}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.xs}>
                      {doc.timesheet?.date ? new Date(doc.timesheet.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </ThemedText>
                  </View>
                </View>
                {doc.type === 'CUSTOMER_INTERACTION' && doc.customer ? (
                  <ThemedText themeColor="textMuted" style={styles.xs}>
                    <ThemedText style={[styles.xs, styles.semi]}>{doc.customer.name}</ThemedText>
                    {doc.customer.phone ? ` · ${doc.customer.phone}` : ''}
                    {doc.jobCard ? ` · Job #${doc.jobCard.jobNumber}` : ''}
                  </ThemedText>
                ) : null}
                {doc.type === 'CUSTOMER_INTERACTION' && doc.quotes.length > 0 ? (
                  <ThemedText themeColor="textMuted" style={styles.xs}>
                    {doc.quotes.map((qt, i) => `${i > 0 ? ' · ' : ''}${quoteLabel(i, doc.quotes.length)}: ${formatPrice(qt.amount)}`).join('')}
                  </ThemedText>
                ) : null}
                {doc.vendorName || doc.contactPhone ? (
                  <ThemedText themeColor="textMuted" style={styles.xs}>{doc.vendorName}{doc.vendorName && doc.contactPhone ? ' · ' : ''}{doc.contactPhone}</ThemedText>
                ) : null}
                {doc.quotedPrice || doc.finalPrice ? (
                  <ThemedText themeColor="textMuted" style={styles.xs}>
                    {doc.quotedPrice ? `Quoted: ${formatPrice(doc.quotedPrice)}` : ''}
                    {doc.quotedPrice && doc.finalPrice ? '   →   ' : ''}
                    {doc.finalPrice ? `Final: ${formatPrice(doc.finalPrice)}` : ''}
                  </ThemedText>
                ) : null}
                {doc.files.length > 0 ? (
                  <View style={styles.wrapRow}>
                    {doc.files.map((f) => (
                      <Pressable key={f.id} onPress={() => Linking.openURL(f.url).catch(() => {})} style={[styles.fileChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <ThemedText themeColor="textSecondary" style={styles.xs} numberOfLines={1}>{f.filename}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          {totalPages > 1 ? (
            <View style={styles.between}>
              <ThemedText themeColor="textMuted" style={styles.sm}>Page {page} of {totalPages}</ThemedText>
              <View style={styles.composeRow}>
                <Button variant="outline" size="sm" disabled={page === 1} onPress={() => doSearch(page - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onPress={() => doSearch(page + 1)}>Next</Button>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

// ─── Add remark (OWNER only) — dashboard AddRemarkModal, create mode ───
const REMARK_CATEGORIES: { key: RemarkCategory; label: string }[] = [
  { key: 'ATTENDANCE', label: 'Attendance' },
  { key: 'PUNCTUALITY', label: 'Punctuality' },
  { key: 'SALES', label: 'Sales' },
  { key: 'CUSTOMER_HANDLING', label: 'Customer Handling' },
  { key: 'BEHAVIOUR', label: 'Behaviour' },
  { key: 'TEAMWORK', label: 'Teamwork' },
  { key: 'INITIATIVE', label: 'Initiative' },
  { key: 'OTHER', label: 'Other' },
];

export function AddRemarkSheet({ employee, onClose }: { employee: { id: string; name: string } | null; onClose: () => void }) {
  const theme = useTheme();
  const [rating, setRating] = useState<RemarkRating>('POSITIVE');
  const [category, setCategory] = useState<RemarkCategory>('ATTENDANCE');
  const [visibility, setVisibility] = useState<RemarkVisibility>('VISIBLE_TO_EMPLOYEE');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const empId = employee?.id;
  useEffect(() => {
    if (empId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the form each time the sheet opens
      setRating('POSITIVE'); setCategory('ATTENDANCE'); setVisibility('VISIBLE_TO_EMPLOYEE'); setNote(''); setError('');
    }
  }, [empId]);

  const submit = async () => {
    if (!employee) return;
    if (!note.trim()) { setError('Write a note.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await createStaffRemark({ employeeId: employee.id, rating, category, visibility, note: note.trim() });
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, 'Could not save the remark.'));
    } finally { setSubmitting(false); }
  };

  const toggleBtn = (active: boolean, label: string, onPress: () => void, tone?: 'good' | 'bad') => {
    const c = tone === 'good' ? '#15803d' : tone === 'bad' ? '#b91c1c' : theme.primary;
    const bg = tone === 'good' ? 'rgba(34,197,94,0.15)' : tone === 'bad' ? 'rgba(239,68,68,0.15)' : theme.primary;
    return (
      <Pressable key={label} onPress={onPress} style={[styles.toggle, active
        ? { backgroundColor: bg, borderColor: tone ? c : theme.primary }
        : { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={[styles.toggleText, { color: active ? (tone ? c : '#fff') : theme.textMuted }]}>{label}</ThemedText>
      </Pressable>
    );
  };

  return (
    <Sheet
      visible={!!employee}
      onClose={onClose}
      title="Add remark"
      subtitle={employee?.name}
      locked={submitting}
      footer={
        <>
          <Button variant="secondary" fullWidth onPress={onClose} disabled={submitting} style={styles.flex1}>Cancel</Button>
          <Button fullWidth onPress={submit} loading={submitting} style={styles.flex1}>Save remark</Button>
        </>
      }>
      <View style={styles.gap6}>
        <ThemedText themeColor="textMuted" style={[styles.xs, styles.semi]}>Rating</ThemedText>
        <View style={styles.composeRow}>
          {toggleBtn(rating === 'POSITIVE', 'Positive', () => setRating('POSITIVE'), 'good')}
          {toggleBtn(rating === 'NEGATIVE', 'Negative', () => setRating('NEGATIVE'), 'bad')}
        </View>
      </View>
      <Select label="Category" value={category} onChange={(v) => setCategory(v as RemarkCategory)} options={REMARK_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} />
      <View style={styles.gap6}>
        <ThemedText themeColor="textMuted" style={[styles.xs, styles.semi]}>Visibility</ThemedText>
        <View style={styles.composeRow}>
          {toggleBtn(visibility === 'PRIVATE', 'Private (only you)', () => setVisibility('PRIVATE'))}
          {toggleBtn(visibility === 'VISIBLE_TO_EMPLOYEE', 'Visible to employee', () => setVisibility('VISIBLE_TO_EMPLOYEE'))}
        </View>
        {visibility === 'VISIBLE_TO_EMPLOYEE' ? <ThemedText themeColor="textMuted" style={styles.xs}>{employee?.name} will be notified.</ThemedText> : null}
      </View>
      <Input label="Note" value={note} onChangeText={setNote} placeholder="What happened?" multiline numberOfLines={4} textAlignVertical="top" />
      {error ? <ThemedText style={[styles.xs, { color: '#b91c1c' }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  gap12: { gap: 12 },
  gap16: { gap: 16 },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  right: { alignItems: 'flex-end', flexShrink: 0 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  composeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  centerText: { textAlign: 'center' },
  semi: { fontFamily: FontWeights.semiBold },
  msg: { fontSize: 14, lineHeight: 20 },
  sm: { fontSize: 14, lineHeight: 20 },
  xs: { fontSize: 12, lineHeight: 18 },
  h3: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  err: { fontSize: 12, lineHeight: 18 },
  bubble: { maxWidth: '85%', borderRadius: Radii.md, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleAuthor: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, marginBottom: 2 },
  quick: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.pill, borderWidth: 1 },
  quickText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.medium },
  panelPad: { padding: 16, gap: 8 },
  entry: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm, gap: 6 },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.sm, borderWidth: 1, maxWidth: '100%' },
  attachText: { fontSize: 11, lineHeight: 16, textDecorationLine: 'underline' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 },
  action: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  docCard: { padding: 12, borderRadius: Radii.md, borderWidth: 1, gap: 6 },
  searchRow: { gap: 8 },
  dateRow: { flexDirection: 'row', gap: 8 },
  searchCard: { padding: 16, borderRadius: Radii.md, borderWidth: 1, gap: 4 },
  fileChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.pill, borderWidth: 1, maxWidth: '100%' },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: Radii.sm, borderWidth: 1, alignItems: 'center' },
  toggleText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
});
