import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Input, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { approveTimesheet, fetchEmployeeTimesheetEntries, rejectTimesheet } from '@/lib/api';
import type { EmployeeTimesheetEntry } from '@/types/api';

// Dashboard employees page → Timesheet tab (day cards newest first; each day's TimesheetBlock). Only the timesheet
// block with its approve / reject flow is built here: status pill, total hours, tasks, notes, "Rejected by … /
// Approved by …", and for SUBMITTED timesheets Approve and Reject (reason required). The tab itself is shown to
// OWNER / STORE_MANAGER only (canEdit), and PATCH /timesheets/:id/approve|reject need requireManagerOrOwner on
// the server. Work documentation, standing tasks and ad-hoc tasks under each day are not part of this section.
const STATUS_STYLE: Record<string, { bg: string; fg: string; text: string }> = {
  DRAFT: { bg: 'rgba(245,158,11,0.15)', fg: '#b45309', text: 'Draft' },
  SUBMITTED: { bg: 'rgba(59,130,246,0.15)', fg: '#1d4ed8', text: 'Submitted' },
  APPROVED: { bg: 'rgba(34,197,94,0.15)', fg: '#15803d', text: 'Approved' },
  REJECTED: { bg: 'rgba(249,115,22,0.15)', fg: '#c2410c', text: 'Rejected' },
};

const errText = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

function TimesheetBlock({ entry, onChanged }: { entry: EmployeeTimesheetEntry; onChanged: (updated: EmployeeTimesheetEntry) => void }) {
  const theme = useTheme();
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const style = STATUS_STYLE[entry.status] ?? { bg: 'rgba(148,163,184,0.15)', fg: '#64748b', text: entry.status };

  const approve = async () => {
    setActing(true); setActionError(null);
    try { onChanged(await approveTimesheet(entry.id) as unknown as EmployeeTimesheetEntry); }
    catch (err) { setActionError(errText(err, 'Failed to approve.')); }
    finally { setActing(false); }
  };

  const reject = async () => {
    if (!rejectNotes.trim()) { setActionError('Rejection reason is required.'); return; }
    setActing(true); setActionError(null);
    try { onChanged(await rejectTimesheet(entry.id, rejectNotes.trim()) as unknown as EmployeeTimesheetEntry); setShowReject(false); }
    catch (err) { setActionError(errText(err, 'Failed to reject.')); }
    finally { setActing(false); }
  };

  return (
    <View style={styles.block}>
      <View style={styles.between}>
        <View style={[styles.pill, { backgroundColor: style.bg }]}><ThemedText style={[styles.pillText, { color: style.fg }]}>{style.text}</ThemedText></View>
        <ThemedText style={styles.hours}>{(entry.totalHours ?? 0).toFixed(1)}h</ThemedText>
      </View>

      {entry.entries.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.p}>No tasks logged.</ThemedText>
      ) : (
        <View>
          {entry.entries.map((t, i) => (
            <View key={i} style={[styles.task, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <View style={styles.flex1}>
                <ThemedText style={styles.p}>{t.task}</ThemedText>
                {t.notes ? <ThemedText themeColor="textMuted" numberOfLines={2} style={styles.small}>{t.notes}</ThemedText> : null}
              </View>
              <ThemedText themeColor="textSecondary" style={styles.taskHours}>{(t.hours ?? 0).toFixed(1)}h</ThemedText>
            </View>
          ))}
        </View>
      )}

      {entry.notes && entry.status !== 'REJECTED' ? (
        <ThemedText themeColor="textMuted" style={[styles.small, styles.rule, { borderTopColor: theme.border, fontStyle: 'italic' }]}>{entry.notes}</ThemedText>
      ) : null}
      {entry.status === 'REJECTED' && entry.approvedBy ? (
        <ThemedText style={[styles.small, styles.rule, { borderTopColor: theme.border, color: theme.danger }]}>Rejected by {entry.approvedBy.name}{entry.notes ? `: "${entry.notes}"` : ''}</ThemedText>
      ) : null}
      {entry.status === 'APPROVED' && entry.approvedBy ? (
        <ThemedText themeColor="textMuted" style={[styles.small, styles.rule, { borderTopColor: theme.border }]}>Approved by {entry.approvedBy.name}</ThemedText>
      ) : null}

      {actionError ? <ThemedText style={[styles.small, { color: theme.danger, marginTop: 8 }]}>{actionError}</ThemedText> : null}

      {entry.status === 'SUBMITTED' ? (
        <View style={[styles.rule, { borderTopColor: theme.border }]}>
          {!showReject ? (
            <View style={styles.row}>
              <Button size="sm" onPress={approve} loading={acting}>Approve</Button>
              <Button size="sm" variant="outline" onPress={() => setShowReject(true)} disabled={acting}>Reject</Button>
            </View>
          ) : (
            <View style={styles.gap}>
              <Input placeholder="Reason for rejection (required)" value={rejectNotes} onChangeText={setRejectNotes} multiline numberOfLines={2} />
              <View style={[styles.row, styles.end]}>
                <Button size="sm" variant="ghost" disabled={acting} onPress={() => { setShowReject(false); setRejectNotes(''); setActionError(null); }}>Cancel</Button>
                <Button size="sm" variant="danger" onPress={reject} loading={acting}>Confirm Reject</Button>
              </View>
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}

export function EmployeeTimesheetTab({ employeeId, employeeName }: { employeeId: string; employeeName: string }) {
  const theme = useTheme();
  const [entries, setEntries] = useState<EmployeeTimesheetEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await fetchEmployeeTimesheetEntries(employeeId)); } catch { setEntries([]); }
    finally { setLoading(false); }
  }, [employeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open
    load();
  }, [load]);

  const days = useMemo(() => [...entries].sort((a, b) => b.date.localeCompare(a.date)), [entries]);
  const onChanged = (updated: EmployeeTimesheetEntry) => setEntries((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));

  if (loading) return <View style={styles.gap}><Skeleton height={128} /><Skeleton height={128} /><Skeleton height={128} /></View>;
  if (days.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, padding: 24 }]}>
        <ThemedText themeColor="textMuted" style={[styles.p, { textAlign: 'center' }]}>No activity recorded yet — no timesheets, standing tasks, or ad-hoc tasks for {employeeName}.</ThemedText>
      </View>
    );
  }
  return (
    <View style={styles.gap}>
      {days.map((ts) => {
        const label = new Date(`${ts.date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
        return (
          <View key={ts.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.dayHead, { borderBottomColor: theme.border }]}><ThemedText style={styles.day}>{label}</ThemedText></View>
            <TimesheetBlock entry={ts} onChanged={onChanged} />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  dayHead: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1 },
  day: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  block: { padding: 16 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  hours: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono, fontWeight: '700' },
  task: { flexDirection: 'row', gap: 12, paddingVertical: 6, alignItems: 'flex-start' },
  taskHours: { width: 48, textAlign: 'right', fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono },
  p: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  rule: { borderTopWidth: 1, paddingTop: 8, marginTop: 8 },
});
