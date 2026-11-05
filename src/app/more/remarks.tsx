import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createStaffRemark, deleteStaffRemark, fetchAllStaffRemarks, fetchMyStaffRemarks, replyToRemark, updateStaffRemark } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fetchActiveEmployeesForRemarks } from '@/lib/remarks-api';
import type { EmployeeListItem, MyRemark, RemarkCategory, RemarkRating, RemarkReply, RemarkVisibility, StaffRemark } from '@/types/api';

// Mirrors the dashboard Remarks page (dashboard/remarks/page.tsx + AddRemarkModal + RemarkReplyThread) and
// backend/src/routes/remarks.ts. OWNER gets the management view (add / edit / delete / filters / staff history);
// every other role gets the read-only "my remarks" view (GET /remarks/mine) with a reply box. Reply access is
// enforced server-side (OWNER, or the remark's subject when it is VISIBLE_TO_EMPLOYEE).
const WIDE_MIN = 560;
const TEXT_TRUNCATE_LENGTH = 140;
const POS = '#15803d';
const NEG = '#b91c1c';

const CATEGORY_LABELS: Record<RemarkCategory, string> = {
  ATTENDANCE: 'Attendance',
  PUNCTUALITY: 'Punctuality',
  SALES: 'Sales',
  CUSTOMER_HANDLING: 'Customer Handling',
  BEHAVIOUR: 'Behaviour',
  TEAMWORK: 'Teamwork',
  INITIATIVE: 'Initiative',
  OTHER: 'Other',
};
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as RemarkCategory[];

const IST = 'Asia/Kolkata';
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: IST });
const roleLabel = (role?: string | null) => (role ?? '').replace(/_/g, ' ');
const errText = (err: any, fallback: string): string => err?.response?.data?.error ?? fallback;

// Backend gate (POST /remarks/:id/reply) is OWNER-or-recipient; this only decides what to render.
function canReply(user: { id?: string; role: string } | null | undefined, recipientId: string) {
  if (!user) return false;
  return user.role === 'OWNER' || user.id === recipientId;
}

function RatingBadge({ rating }: { rating: RemarkRating }) {
  const pos = rating === 'POSITIVE';
  return (
    <View style={[styles.pill, { backgroundColor: pos ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)' }]}>
      <ThemedText style={[styles.pillText, { color: pos ? POS : NEG, fontFamily: FontWeights.semiBold }]}>{pos ? 'Positive' : 'Negative'}</ThemedText>
    </View>
  );
}

function CategoryBadge({ category }: { category: RemarkCategory }) {
  const theme = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: theme.surface }]}>
      <ThemedText themeColor="textMuted" style={styles.pillText}>{CATEGORY_LABELS[category]}</ThemedText>
    </View>
  );
}

// Collapses to one line when long / multi-line, with a Show more / Show less toggle.
function CollapsibleNote({ note, secondary }: { note: string; secondary?: boolean }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const isLong = note.includes('\n') || note.length > TEXT_TRUNCATE_LENGTH;
  return (
    <View>
      <ThemedText themeColor={secondary ? 'textSecondary' : 'text'} numberOfLines={isLong && !expanded ? 1 : undefined} style={styles.p}>{note}</ThemedText>
      {isLong ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} style={styles.toggle} accessibilityRole="button">
          <Ionicons name="chevron-down" size={12} color={theme.primary} style={expanded ? styles.flip : undefined} />
          <ThemedText style={[styles.small, { color: theme.primary, fontFamily: FontWeights.semiBold }]}>{expanded ? 'Show less' : 'Show more'}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function ReplyList({ replies }: { replies: RemarkReply[] }) {
  return (
    <View style={styles.gap8}>
      {replies.map((rep) => (
        <View key={rep.id} style={styles.gap2}>
          <View style={styles.replyHead}>
            <ThemedText style={[styles.small, styles.semi]}>{rep.author.name}</ThemedText>
            <RoleTag role={rep.author.role} />
            <ThemedText themeColor="textMuted" style={styles.small}>{fmtDateTime(rep.createdAt)}</ThemedText>
          </View>
          <CollapsibleNote note={rep.body} secondary />
        </View>
      ))}
    </View>
  );
}

function RoleTag({ role }: { role: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.roleTag, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText themeColor="textMuted" style={styles.tiny}>{roleLabel(role)}</ThemedText>
    </View>
  );
}

// Collapsed prompt expands into a textarea + Cancel / Reply.
function ReplyComposer({ remarkId, onPosted, compact }: { remarkId: string; onPosted: (reply: RemarkReply) => void; compact?: boolean }) {
  const theme = useTheme();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const reset = () => { setExpanded(false); setBody(''); setError(''); };

  const submit = async () => {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const reply = await replyToRemark(remarkId, body.trim());
      onPosted(reply);
      setBody('');
      setExpanded(false);
    } catch (err: any) {
      setError(errText(err, 'Could not post reply.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!expanded) {
    return (
      <Pressable onPress={() => setExpanded(true)} accessibilityRole="button" style={[styles.replyPrompt, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText themeColor="textMuted" style={styles.small}>Write a reply…</ThemedText>
      </Pressable>
    );
  }
  const empty = !body.trim();
  return (
    <View style={styles.gap6}>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Write a reply…"
        placeholderTextColor={theme.textMuted}
        multiline
        autoFocus
        editable={!submitting}
        style={[styles.replyInput, { minHeight: compact ? 56 : 76, color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
      />
      <View style={styles.replyActions}>
        {error ? <ThemedText style={[styles.small, { color: NEG, flex: 1 }]}>{error}</ThemedText> : <View style={styles.flex1} />}
        <Pressable onPress={reset} hitSlop={6} style={styles.cancelLink}>
          <ThemedText themeColor="textMuted" style={styles.small}>Cancel</ThemedText>
        </Pressable>
        <Pressable
          onPress={submit}
          disabled={submitting || empty}
          accessibilityRole="button"
          style={[styles.replyBtn, { backgroundColor: theme.primary, opacity: submitting || empty ? 0.5 : 1 }]}>
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={13} color="#fff" />}
          <ThemedText style={[styles.small, { color: '#fff', fontFamily: FontWeights.medium }]}>{submitting ? 'Sending…' : 'Reply'}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

// ── Type-to-search employee picker (Add remark for…) ───────────────────────
function EmployeePickerSheet({ employees, onClose, onSelect }: {
  employees: EmployeeListItem[];
  onClose: () => void;
  onSelect: (emp: { id: string; name: string }) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? employees.filter((e) => e.name.toLowerCase().includes(q)) : employees;
  }, [employees, query]);

  return (
    <Sheet visible onClose={onClose} title="Add remark for…">
      <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Type a name…" placeholderTextColor={theme.textMuted} autoFocus autoCorrect={false} style={[styles.searchInput, { color: theme.text }]} />
      </View>
      {filtered.length === 0 ? (
        <ThemedText themeColor="textMuted" style={[styles.small, styles.center]}>No employees match “{query}”.</ThemedText>
      ) : (
        <View>
          {filtered.map((e) => (
            <Pressable key={e.id} onPress={() => onSelect({ id: e.id, name: e.name })} style={styles.pickRow} accessibilityRole="button">
              <ThemedText style={[styles.p, styles.flex1]}>{e.name}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.small}>{roleLabel(e.role)}</ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

// ── Add / edit form ────────────────────────────────────────────────────────
function RemarkFormSheet({ employee, existing, onClose, onSaved }: {
  employee: { id: string; name: string };
  existing: StaffRemark | null;
  onClose: () => void;
  onSaved: (saved: StaffRemark, wasEdit: boolean) => void;
}) {
  const theme = useTheme();
  const isEditing = !!existing;
  const [rating, setRating] = useState<RemarkRating>(existing?.rating ?? 'POSITIVE');
  const [category, setCategory] = useState<RemarkCategory>(existing?.category ?? 'ATTENDANCE');
  const [visibility, setVisibility] = useState<RemarkVisibility>(existing?.visibility ?? 'VISIBLE_TO_EMPLOYEE');
  const [note, setNote] = useState(existing?.note ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!note.trim()) { setError('Write a note.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const saved = existing
        ? await updateStaffRemark(existing.id, { rating, category, visibility, note: note.trim() })
        : await createStaffRemark({ employeeId: employee.id, rating, category, visibility, note: note.trim() });
      onSaved(saved, isEditing);
      onClose();
    } catch (err: any) {
      setError(errText(err, 'Could not save the remark.'));
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible fullHeight onClose={onClose} locked={submitting} title={isEditing ? 'Edit remark' : 'Add remark'} subtitle={employee.name}
      footer={
        <View style={styles.footer}>
          <View style={styles.flex1}><Button variant="outline" onPress={onClose} disabled={submitting} fullWidth>Cancel</Button></View>
          <View style={styles.flex1}><Button onPress={submit} loading={submitting} fullWidth>Save remark</Button></View>
        </View>
      }>
      <View style={styles.gap4}>
        <ThemedText themeColor="textMuted" style={[styles.small, styles.semi]}>Rating</ThemedText>
        <View style={styles.toggleRow}>
          {(['POSITIVE', 'NEGATIVE'] as const).map((r) => {
            const on = rating === r;
            const c = r === 'POSITIVE' ? POS : NEG;
            return (
              <Pressable
                key={r} onPress={() => setRating(r)} accessibilityRole="button"
                style={[styles.opt, on ? { backgroundColor: withAlpha(c, 0.15), borderColor: c } : { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText style={[styles.optText, { color: on ? c : theme.textMuted }]}>{r === 'POSITIVE' ? 'Positive' : 'Negative'}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Select label="Category" value={category} onChange={(v) => setCategory(v as RemarkCategory)} options={CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))} />

      <View style={styles.gap4}>
        <ThemedText themeColor="textMuted" style={[styles.small, styles.semi]}>Visibility</ThemedText>
        <View style={styles.toggleRow}>
          {([['PRIVATE', 'Private (only you)'], ['VISIBLE_TO_EMPLOYEE', 'Visible to employee']] as const).map(([v, label]) => {
            const on = visibility === v;
            return (
              <Pressable
                key={v} onPress={() => setVisibility(v)} accessibilityRole="button"
                style={[styles.opt, on ? { backgroundColor: theme.primary, borderColor: theme.primary } : { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText style={[styles.optText, { color: on ? '#fff' : theme.textMuted }]}>{label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        {visibility === 'VISIBLE_TO_EMPLOYEE' ? <ThemedText themeColor="textMuted" style={styles.small}>{employee.name} will be notified.</ThemedText> : null}
      </View>

      <View style={styles.gap4}>
        <ThemedText themeColor="textMuted" style={[styles.small, styles.semi]}>Note</ThemedText>
        <TextInput
          value={note} onChangeText={setNote} placeholder="What happened?" placeholderTextColor={theme.textMuted} multiline editable={!submitting}
          style={[styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        />
      </View>

      {error ? <ThemedText style={[styles.small, { color: NEG }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

// ── One remark inside the staff history popup ──────────────────────────────
function HistoryRemarkRow({ remark, onPosted }: { remark: StaffRemark; onPosted: (remarkId: string, reply: RemarkReply) => void }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const replies = remark.replies;
  const shown = expanded ? replies : replies.slice(-1);
  return (
    <View style={[styles.histRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.between}>
        <CategoryBadge category={remark.category} />
        <ThemedText themeColor="textMuted" style={styles.small}>{fmtDate(remark.createdAt)}</ThemedText>
      </View>
      <CollapsibleNote note={remark.note} />
      {replies.length > 0 ? (
        <View style={[styles.divTop, { borderTopColor: theme.border }]}>
          <ReplyList replies={shown} />
          {replies.length > 1 ? (
            <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} style={styles.toggle} accessibilityRole="button">
              <Ionicons name="chevron-down" size={12} color={theme.primary} style={expanded ? styles.flip : undefined} />
              <ThemedText style={[styles.small, { color: theme.primary, fontFamily: FontWeights.semiBold }]}>{expanded ? 'Hide full thread' : `View full thread (${replies.length})`}</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={replies.length > 0 ? undefined : [styles.divTop, { borderTopColor: theme.border }]}>
        <ReplyComposer remarkId={remark.id} onPosted={(r) => onPosted(remark.id, r)} compact />
      </View>
    </View>
  );
}

function StaffHistorySheet({ employee, remarks, wide, onClose, onPosted }: {
  employee: { id: string; name: string };
  remarks: StaffRemark[];
  wide: boolean;
  onClose: () => void;
  onPosted: (remarkId: string, reply: RemarkReply) => void;
}) {
  const theme = useTheme();
  const mine = useMemo(() => remarks.filter((r) => r.employee.id === employee.id), [remarks, employee.id]);
  const col = (rating: RemarkRating) => {
    const rows = mine.filter((r) => r.rating === rating);
    const color = rating === 'POSITIVE' ? POS : NEG;
    return (
      <View style={[styles.gap8, wide && styles.flex1]}>
        <ThemedText style={[styles.small, styles.upper, { color, fontFamily: FontWeights.bold }]}>{rating === 'POSITIVE' ? 'Positive' : 'Negative'}</ThemedText>
        {rows.length === 0 ? (
          <View style={[styles.none, { backgroundColor: theme.backgroundElement }]}><ThemedText themeColor="textMuted" style={styles.small}>None yet.</ThemedText></View>
        ) : rows.map((r) => <HistoryRemarkRow key={r.id} remark={r} onPosted={onPosted} />)}
      </View>
    );
  };
  return (
    <Sheet visible fullHeight onClose={onClose} title={employee.name} subtitle={`${mine.length} remark(s) on file`}>
      <View style={[styles.gap16, wide && styles.wideRow]}>
        {col('POSITIVE')}
        {col('NEGATIVE')}
      </View>
    </Sheet>
  );
}

function Toast({ toast, bottom }: { toast: { ok: boolean; msg: string } | null; bottom: number }) {
  if (!toast) return null;
  return (
    <View pointerEvents="none" style={[styles.toast, { bottom, backgroundColor: toast.ok ? '#22c55e' : '#ef4444' }]}>
      <ThemedText style={styles.toastText}>{toast.msg}</ThemedText>
    </View>
  );
}

function useToast() {
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { toast, showToast };
}

// ── Owner view ─────────────────────────────────────────────────────────────
function OwnerRemarksView() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const { toast, showToast } = useToast();
  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;

  const [allRemarks, setAllRemarks] = useState<StaffRemark[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);

  const [employeeFilter, setEmployeeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<RemarkCategory | ''>('');
  const [ratingFilter, setRatingFilter] = useState<RemarkRating | ''>('');
  const [visibilityFilter, setVisibilityFilter] = useState<RemarkVisibility | ''>('');

  const [addFor, setAddFor] = useState<{ id: string; name: string } | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [editingRemark, setEditingRemark] = useState<StaffRemark | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<StaffRemark | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [historyStaff, setHistoryStaff] = useState<{ id: string; name: string } | null>(null);

  const loadRemarks = useCallback(async () => {
    try {
      setAllRemarks(await fetchAllStaffRemarks());
    } catch (err: any) {
      showToast(false, errText(err, 'Failed to load remarks.'));
    }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadRemarks().finally(() => setLoading(false));
  }, [loadRemarks]);

  useEffect(() => {
    fetchActiveEmployeesForRemarks().then(setEmployees).catch(() => {});
  }, []);

  const onRefresh = async () => { setRefreshing(true); await loadRemarks(); setRefreshing(false); };

  const appendReply = (remarkId: string, reply: RemarkReply) => {
    setAllRemarks((rs) => rs.map((r) => (r.id === remarkId ? { ...r, replies: [...r.replies, reply] } : r)));
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await deleteStaffRemark(deleteConfirm.id);
      setAllRemarks((rs) => rs.filter((r) => r.id !== deleteConfirm.id));
      showToast(true, 'Remark deleted.');
    } catch (err: any) {
      showToast(false, errText(err, 'Could not delete the remark.'));
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const employeeOptions = useMemo(() => [...employees].sort((a, b) => a.name.localeCompare(b.name)), [employees]);

  const remarks = useMemo(() => allRemarks.filter((r) =>
    (!employeeFilter || r.employee.id === employeeFilter) &&
    (!categoryFilter || r.category === categoryFilter) &&
    (!ratingFilter || r.rating === ratingFilter) &&
    (!visibilityFilter || r.visibility === visibilityFilter)
  ), [allRemarks, employeeFilter, categoryFilter, ratingFilter, visibilityFilter]);

  const staffWithRemarks = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; role: string; positive: number; negative: number }>();
    for (const r of allRemarks) {
      const ex = byId.get(r.employee.id);
      const pos = r.rating === 'POSITIVE' ? 1 : 0;
      if (ex) { ex.positive += pos; ex.negative += 1 - pos; }
      else byId.set(r.employee.id, { id: r.employee.id, name: r.employee.name, role: r.employee.role, positive: pos, negative: 1 - pos });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRemarks]);

  const filterBox = wide ? styles.filterWide : styles.filterPhone;

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Remarks' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>Remarks</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.sub}>Private and shared notes about your team.</ThemedText>
          </View>
          <Button icon="add" onPress={() => setShowPicker(true)}>Add remark</Button>
        </View>

        {staffWithRemarks.length > 0 ? (
          <View style={styles.gap6}>
            <ThemedText themeColor="textMuted" style={[styles.small, styles.semi]}>Staff with remarks — tap for full history</ThemedText>
            <View style={styles.chips}>
              {staffWithRemarks.map((s) => (
                <Pressable
                  key={s.id} onPress={() => setHistoryStaff({ id: s.id, name: s.name })} accessibilityRole="button"
                  style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <ThemedText style={[styles.small, styles.semi]}>{s.name}</ThemedText>
                  <View style={[styles.roleTag, { backgroundColor: theme.surface }]}><ThemedText themeColor="textMuted" style={styles.tiny}>{roleLabel(s.role)}</ThemedText></View>
                  <ThemedText style={[styles.small, { fontFamily: FontWeights.medium }]}>
                    {s.positive > 0 ? <ThemedText style={[styles.small, { color: POS }]}>{s.positive} Positive</ThemedText> : null}
                    {s.positive > 0 && s.negative > 0 ? <ThemedText themeColor="textMuted" style={styles.small}>{' · '}</ThemedText> : null}
                    {s.negative > 0 ? <ThemedText style={[styles.small, { color: NEG }]}>{s.negative} Negative</ThemedText> : null}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.filters}>
          <View style={filterBox}>
            <Select compact value={employeeFilter} onChange={setEmployeeFilter} options={[{ value: '', label: 'Everyone' }, ...employeeOptions.map((e) => ({ value: e.id, label: e.name }))]} />
          </View>
          <View style={filterBox}>
            <Select compact value={categoryFilter} onChange={(v) => setCategoryFilter(v as RemarkCategory | '')} options={[{ value: '', label: 'All categories' }, ...CATEGORY_KEYS.map((k) => ({ value: k, label: CATEGORY_LABELS[k] }))]} />
          </View>
          <View style={filterBox}>
            <Select compact value={ratingFilter} onChange={(v) => setRatingFilter(v as RemarkRating | '')} options={[{ value: '', label: 'Any rating' }, { value: 'POSITIVE', label: 'Positive' }, { value: 'NEGATIVE', label: 'Negative' }]} />
          </View>
          <View style={filterBox}>
            <Select compact value={visibilityFilter} onChange={(v) => setVisibilityFilter(v as RemarkVisibility | '')} options={[{ value: '', label: 'Any visibility' }, { value: 'VISIBLE_TO_EMPLOYEE', label: 'Visible to employee' }, { value: 'PRIVATE', label: 'Private' }]} />
          </View>
        </View>

        {loading ? (
          <View style={styles.gap8}><Skeleton height={120} /><Skeleton height={120} /><Skeleton height={120} /></View>
        ) : remarks.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText style={[styles.p, styles.semi]}>No remarks match this filter.</ThemedText>
          </View>
        ) : (
          <View style={styles.gap8}>
            {remarks.map((r) => (
              <View key={r.id} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.cardTop}>
                  <View style={[styles.flex1, styles.gap6]}>
                    <View style={styles.badgeRow}>
                      <ThemedText style={[styles.p, styles.semi]}>{r.employee.name}</ThemedText>
                      <RatingBadge rating={r.rating} />
                      <CategoryBadge category={r.category} />
                      <View style={styles.visRow}>
                        <Ionicons name={r.visibility === 'PRIVATE' ? 'lock-closed-outline' : 'eye-outline'} size={12} color={theme.textMuted} />
                        <ThemedText themeColor="textMuted" style={styles.small}>{r.visibility === 'PRIVATE' ? 'Private' : 'Visible'}</ThemedText>
                      </View>
                    </View>
                    <CollapsibleNote note={r.note} />
                    <ThemedText themeColor="textMuted" style={styles.small}>{fmtDate(r.createdAt)}</ThemedText>
                  </View>
                  <View style={styles.actions}>
                    <Pressable onPress={() => { setAddFor({ id: r.employee.id, name: r.employee.name }); setEditingRemark(r); }} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit remark">
                      <Ionicons name="create-outline" size={18} color={theme.textMuted} />
                    </Pressable>
                    <Pressable onPress={() => setDeleteConfirm(r)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete remark">
                      <Ionicons name="trash-outline" size={18} color={NEG} />
                    </Pressable>
                  </View>
                </View>
                <View style={[styles.divTop, { borderTopColor: theme.border }]}>
                  {r.replies.length > 0 ? <ReplyList replies={r.replies} /> : null}
                  {canReply(user, r.employee.id) ? <ReplyComposer remarkId={r.id} onPosted={(reply) => appendReply(r.id, reply)} /> : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Toast toast={toast} bottom={insets.bottom + 16} />

      {showPicker ? (
        <EmployeePickerSheet employees={employeeOptions} onClose={() => setShowPicker(false)} onSelect={(emp) => { setAddFor(emp); setShowPicker(false); }} />
      ) : null}

      {addFor ? (
        <RemarkFormSheet
          key={editingRemark?.id ?? addFor.id}
          employee={addFor}
          existing={editingRemark}
          onClose={() => { setAddFor(null); setEditingRemark(null); }}
          onSaved={(saved, wasEdit) => {
            setAllRemarks((rs) => (rs.some((x) => x.id === saved.id)
              ? rs.map((x) => (x.id === saved.id ? { ...saved, replies: x.replies } : x))
              : [{ ...saved, replies: [] }, ...rs]));
            showToast(true, wasEdit ? 'Remark updated.' : 'Remark added.');
          }}
        />
      ) : null}

      {historyStaff ? (
        <StaffHistorySheet employee={historyStaff} remarks={allRemarks} wide={wide} onClose={() => setHistoryStaff(null)} onPosted={appendReply} />
      ) : null}

      {deleteConfirm ? (
        <Sheet
          visible onClose={() => setDeleteConfirm(null)} locked={deleting} title="Delete this remark?" subtitle={`${deleteConfirm.employee.name} · ${fmtDate(deleteConfirm.createdAt)}`}
          footer={
            <View style={styles.footer}>
              <View style={styles.flex1}><Button variant="outline" onPress={() => setDeleteConfirm(null)} disabled={deleting} fullWidth>Cancel</Button></View>
              <View style={styles.flex1}><Button variant="danger" onPress={handleDelete} loading={deleting} fullWidth>{deleting ? 'Deleting…' : 'Delete'}</Button></View>
            </View>
          }>
          <View />
        </Sheet>
      ) : null}
    </ThemedView>
  );
}

// ── Employee view — read-only, own VISIBLE_TO_EMPLOYEE remarks ─────────────
function EmployeeRemarksView() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [remarks, setRemarks] = useState<MyRemark[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      setRemarks(await fetchMyStaffRemarks());
      setLoadError(false);
    } catch {
      // Dashboard falls back to an empty list on failure; the banner just adds a retry on the phone.
      setRemarks([]);
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const appendReply = (remarkId: string, reply: RemarkReply) => {
    setRemarks((rs) => rs.map((r) => (r.id === remarkId ? { ...r, replies: [...r.replies, reply] } : r)));
  };

  return (
    <ThemedView style={styles.flex1}>
      <Stack.Screen options={{ title: 'Remarks' }} />
      <ScrollView
        contentContainerStyle={[styles.content, styles.contentNarrow, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled">
        <View>
          <ThemedText style={styles.title}>Remarks</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.sub}>Notes about your work, shared with you.</ThemedText>
        </View>

        {loadError && !loading ? <ErrorBanner message="Could not load your remarks." onRetry={onRefresh} /> : null}

        {loading ? (
          <View style={styles.gap8}><Skeleton height={110} /><Skeleton height={110} /></View>
        ) : remarks.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText style={[styles.p, styles.semi]}>Nothing here yet.</ThemedText>
          </View>
        ) : (
          <View style={styles.gap8}>
            {remarks.map((r) => (
              <View key={r.id} style={[styles.card, styles.gap6, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <View style={styles.badgeRow}>
                  <RatingBadge rating={r.rating} />
                  <CategoryBadge category={r.category} />
                </View>
                <CollapsibleNote note={r.note} />
                <ThemedText themeColor="textMuted" style={styles.small}>{fmtDate(r.createdAt)}</ThemedText>
                <View style={[styles.divTop, { borderTopColor: theme.border }]}>
                  {r.replies.length > 0 ? <ReplyList replies={r.replies} /> : null}
                  <ReplyComposer remarkId={r.id} onPosted={(reply) => appendReply(r.id, reply)} />
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

export default function RemarksScreen() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'OWNER' ? <OwnerRemarksView /> : <EmployeeRemarksView />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap2: { gap: 2 },
  gap4: { gap: 4 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  wideRow: { flexDirection: 'row' },
  content: { padding: 16, gap: 24, width: '100%', maxWidth: 1024, alignSelf: 'center' },
  contentNarrow: { maxWidth: 672 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  p: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  tiny: { fontSize: 10, lineHeight: 14 },
  semi: { fontFamily: FontWeights.semiBold },
  upper: { textTransform: 'uppercase', letterSpacing: 0.5 },
  center: { textAlign: 'center', paddingVertical: 24 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: Radii.sm },
  roleTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, lineHeight: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterPhone: { flexBasis: '47%', flexGrow: 1 },
  filterWide: { width: 190 },
  card: { borderWidth: 1, borderRadius: Radii.md, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  visRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  divTop: { borderTopWidth: 1, paddingTop: 12, marginTop: 12, gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start' },
  flip: { transform: [{ rotate: '180deg' }] },
  replyHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  replyPrompt: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: Radii.sm },
  replyInput: { borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, textAlignVertical: 'top' },
  replyActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  cancelLink: { paddingHorizontal: 8, paddingVertical: 4 },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  empty: { alignItems: 'center', paddingVertical: 56, borderWidth: 1, borderRadius: Radii.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12 },
  toggleRow: { flexDirection: 'row', gap: 8 },
  opt: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 8 },
  optText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, textAlign: 'center' },
  noteInput: { minHeight: 100, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', gap: 8, flex: 1 },
  histRow: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 8 },
  none: { paddingVertical: 16, alignItems: 'center', borderRadius: Radii.md },
  toast: { position: 'absolute', left: 16, right: 16, zIndex: 50, borderRadius: Radii.md, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
