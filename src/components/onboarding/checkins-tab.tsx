import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fmtDate } from '@/components/applications/application-format';
import { Sheet } from '@/components/customers/sheet';
import { MILESTONE_LABELS, type CheckInFilter } from '@/components/onboarding/onboarding-format';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { completeProbationCheckIn, fetchProbationCheckInDetails, getErrorMessage } from '@/lib/api';
import type { ProbationCheckInDetail, ProbationCheckInStatus, ProbationMilestone } from '@/types/api';

const STATUS_BADGE: Record<ProbationCheckInStatus, { variant: 'danger' | 'warning' | 'success' | 'muted'; label: string }> = {
  OVERDUE: { variant: 'danger', label: 'Overdue' },
  DUE_SOON: { variant: 'warning', label: 'Due Soon' },
  COMPLETED: { variant: 'success', label: 'Completed' },
  NOT_YET_DUE: { variant: 'muted', label: 'Not Yet Due' },
};

type Filter = ProbationCheckInStatus | 'ALL';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'DUE_SOON', label: 'Due Soon' },
  { key: 'NOT_YET_DUE', label: 'Not Yet Due' },
  { key: 'COMPLETED', label: 'Completed' },
];

const RATING_OPTIONS = [
  { value: '', label: 'No rating' },
  { value: '1', label: '1 — Poor' },
  { value: '2', label: '2 — Below expectations' },
  { value: '3', label: '3 — Meeting expectations' },
  { value: '4', label: '4 — Good' },
  { value: '5', label: '5 — Excellent' },
];

type Props = {
  initialFilter?: CheckInFilter;
  initialUserId?: string;
  initialMilestone?: ProbationMilestone;
  refreshKey: number;
};

// Dashboard CheckInsTab: Day 7/30/60/90 probation check-ins for every active
// employee with a joining date, with a status filter and a complete/view sheet.
export function CheckInsTab({ initialFilter = 'ALL', initialUserId, initialMilestone, refreshKey }: Props) {
  const theme = useTheme();
  const [rows, setRows] = useState<ProbationCheckInDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<ProbationCheckInDetail | null>(null);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const autoOpenPending = useRef(!!(initialUserId && initialMilestone));

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchProbationCheckInDetails();
      setRows(data);
      // Deep-linked from an Overview check-ins list: jump into that person's
      // milestone on the first load only (saving reloads and must not reopen it).
      if (autoOpenPending.current) {
        autoOpenPending.current = false;
        const match = data.find((r) => r.userId === initialUserId && r.milestone === initialMilestone);
        if (match && match.status !== 'COMPLETED') setCompleting(match);
      }
    } catch (err: unknown) {
      setRows([]);
      setError(getErrorMessage(err, 'Could not load check-ins.'));
    }
  }, [initialUserId, initialMilestone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / pull-to-refresh
    load();
  }, [load, refreshKey]);

  const all = rows ?? [];
  const visible = filter === 'ALL' ? all : all.filter((r) => r.status === filter);

  return (
    <View style={styles.stack}>
      <ThemedText themeColor="textMuted" style={styles.body}>
        Day 7/30/60/90 probation check-ins for every active employee with a joining date on file — employees without one won&apos;t appear until it&apos;s set on the Employment &amp; Role tab.
      </ThemedText>

      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === 'ALL' ? all.length : all.filter((r) => r.status === f.key).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.surface }]}>
              <ThemedText style={[styles.chipText, { color: active ? theme.primary : theme.textMuted }]}>{`${f.label}${rows === null ? '' : ` (${count})`}`}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {rows === null ? (
        <Card padding="md"><Skeleton height={16} width="50%" /><Skeleton height={16} /></Card>
      ) : !error && rows.length === 0 ? (
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No check-ins to show — no active employees have a joining date set yet.</ThemedText></Card>
      ) : !error && visible.length === 0 ? (
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No check-ins with this status.</ThemedText></Card>
      ) : visible.length > 0 ? (
        <Card padding="none">
          {visible.map((r, i) => (
            <View key={`${r.userId}:${r.milestone}`} style={[styles.row, i < visible.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <View style={styles.rowMain}>
                <View style={styles.titleLine}>
                  <ThemedText style={[styles.name, styles.shrink]}>{r.employee.name}</ThemedText>
                  <Badge variant={STATUS_BADGE[r.status].variant} size="sm">{STATUS_BADGE[r.status].label}</Badge>
                </View>
                <ThemedText themeColor="textSecondary" style={styles.small}>{`${MILESTONE_LABELS[r.milestone]} · due ${fmtDate(r.dueDate)}`}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.small}>{`Manager: ${r.reportingManager?.name ?? '—'}`}</ThemedText>
              </View>
              <Button size="sm" variant="secondary" onPress={() => setCompleting(r)}>{r.status === 'COMPLETED' ? 'View' : 'Complete Check-in'}</Button>
            </View>
          ))}
        </Card>
      ) : null}

      {completing ? (
        <CompleteCheckInSheet row={completing} onClose={() => setCompleting(null)} onSaved={() => { setCompleting(null); load(); }} />
      ) : null}
    </View>
  );
}

// Dashboard CompleteCheckInModal: optional rating + notes. Opening a completed
// check-in shows (and can re-save) what was recorded.
function CompleteCheckInSheet({ row, onClose, onSaved }: { row: ProbationCheckInDetail; onClose: () => void; onSaved: () => void }) {
  const [rating, setRating] = useState(row.rating ? String(row.rating) : '');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await completeProbationCheckIn(row.userId, row.milestone, { rating: rating ? Number(rating) : undefined, notes: notes.trim() || undefined });
      onSaved();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to record check-in.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`${MILESTONE_LABELS[row.milestone]} Check-in — ${row.employee.name}`}
      footer={
        <>
          <Button style={styles.flex1} variant="secondary" disabled={saving} onPress={onClose}>Cancel</Button>
          <Button style={styles.flex1} loading={saving} onPress={submit}>{saving ? 'Saving…' : 'Save Check-in'}</Button>
        </>
      }>
      {error ? <ErrorBanner message={error} /> : null}
      <Select label="Rating (optional)" options={RATING_OPTIONS} value={rating} onChange={setRating} />
      <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="What was discussed, any concerns, next steps…" multiline numberOfLines={4} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  flex1: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: Radii.sm, minHeight: 36, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
});
