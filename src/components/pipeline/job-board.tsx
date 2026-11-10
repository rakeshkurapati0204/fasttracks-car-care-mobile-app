import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getAvatarColor, getInitials } from '@/components/employees/employee-format';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { PipelineJob, PipelineStatus } from '@/types/api';

// The dashboard's column order, colours and labels.
export const PIPELINE_COLUMNS: PipelineStatus[] = [
  'NEW_ENQUIRY', 'QUOTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'FOLLOW_UP_NEEDED', 'CANCELLED',
];

export const COLUMN_COLORS: Record<PipelineStatus, string> = {
  NEW_ENQUIRY: '#6AA4CC',
  QUOTED: '#9070C8',
  CONFIRMED: '#38B4C0',
  IN_PROGRESS: '#E8A828',
  COMPLETED: '#36C87E',
  CANCELLED: '#E06868',
  FOLLOW_UP_NEEDED: '#D88840',
};

export const STATUS_LABEL: Record<PipelineStatus, string> = {
  NEW_ENQUIRY: 'New Enquiry',
  QUOTED: 'Quoted',
  CONFIRMED: 'Confirmed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  FOLLOW_UP_NEEDED: 'Follow-up Needed',
};

// ₹12,000 (the dashboard's formatCurrency).
export function formatCurrency(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

export function daysSince(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// Overdue once the follow-up's own day (IST) has ended.
export function isFollowUpOverdue(iso: string) {
  if (!iso) return false;
  const istNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const due = new Date(new Date(iso).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  due.setHours(23, 59, 59, 999);
  return istNow > due;
}

export const jobAmount = (j: PipelineJob) => j.finalAmount || j.quotedAmount || 0;

export function JobCard({ job, status, canMove, onMove }: { job: PipelineJob; status: PipelineStatus; canMove: boolean; onMove: (j: PipelineJob, from: PipelineStatus) => void }) {
  const theme = useTheme();
  const router = useRouter();
  const name = job.assignedTo?.name || 'U';
  const days = daysSince(job.updatedAt);
  const stale = days > 7 && !['COMPLETED', 'CANCELLED'].includes(status);
  const overdue = job.followUpDate ? isFollowUpOverdue(job.followUpDate) : false;
  const amount = job.finalAmount || job.quotedAmount;
  const services = job.serviceTypes ?? [];

  return (
    <Pressable
      onPress={() => router.push(`/customers/job/${job.id}`)}
      accessibilityRole="button"
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.head}>
        <ThemedText style={styles.name}>{job.customerName}</ThemedText>
        {job.priority !== 'NORMAL' ? <ThemedText style={styles.prio}>{job.priority === 'VIP' ? 'VIP' : 'HOT'}</ThemedText> : null}
      </View>

      <View style={styles.vehicle}>
        <ThemedText themeColor="textSecondary" style={styles.brand}>{job.vehicleBrand}</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.plate}>{`• ${job.vehicleNumber}`}</ThemedText>
      </View>

      <View style={styles.services}>
        {services.slice(0, 2).map((s) => (
          <View key={s} style={styles.service}><ThemedText style={[styles.serviceText, { color: theme.primary }]}>{s}</ThemedText></View>
        ))}
        {services.length > 2 ? <ThemedText themeColor="textMuted" style={styles.more}>{`+${services.length - 2}`}</ThemedText> : null}
      </View>

      <View style={styles.footer}>
        <ThemedText style={styles.amount}>{amount ? formatCurrency(amount) : '—'}</ThemedText>
        <View style={styles.right}>
          {stale ? <ThemedText style={[styles.stale, { color: theme.danger }]}>{`${days}d`}</ThemedText> : null}
          {overdue ? <View style={[styles.dot, { backgroundColor: theme.danger }]} accessibilityLabel="Follow-up overdue" /> : null}
          <View style={[styles.avatar, { backgroundColor: getAvatarColor(name) }]}>
            <ThemedText style={styles.avatarText}>{getInitials(name)}</ThemedText>
          </View>
          {canMove ? (
            <Pressable onPress={() => onMove(job, status)} accessibilityRole="button" accessibilityLabel="Move to…" hitSlop={8} style={[styles.moveBtn, { borderColor: theme.border }]}>
              <Ionicons name="swap-horizontal" size={16} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// A status column: title, count in the status colour, total value, and the cards.
export function ColumnHeader({ status, count, total }: { status: PipelineStatus; count: number; total: number }) {
  const theme = useTheme();
  const color = COLUMN_COLORS[status];
  return (
    <View style={[styles.colHead, { borderBottomColor: color }]}>
      <View style={styles.colTop}>
        <ThemedText style={[styles.colTitle, { color: theme.text }]}>{STATUS_LABEL[status]}</ThemedText>
        <View style={[styles.count, { backgroundColor: color }]}><ThemedText style={styles.countText}>{count}</ThemedText></View>
      </View>
      <ThemedText themeColor="textMuted" style={styles.total}>{formatCurrency(total)}</ThemedText>
    </View>
  );
}

export function PipelineColumn({
  status, jobs, canMove, onMove, maxHeight,
}: { status: PipelineStatus; jobs: PipelineJob[]; canMove: boolean; onMove: (j: PipelineJob, from: PipelineStatus) => void; maxHeight: number }) {
  const theme = useTheme();
  const total = jobs.reduce((s, j) => s + jobAmount(j), 0);
  return (
    <View style={[styles.column, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ColumnHeader status={status} count={jobs.length} total={total} />
      <ScrollView style={{ maxHeight }} contentContainerStyle={styles.colBody} nestedScrollEnabled>
        {jobs.map((j) => <JobCard key={j.id} job={j} status={status} canMove={canMove} onMove={onMove} />)}
        {jobs.length === 0 ? <View style={{ minHeight: 120 }} /> : null}
      </ScrollView>
    </View>
  );
}

// "Move to…": the touch replacement for the dashboard's drag between columns.
export function MoveSheet({ job, from, onClose, onPick }: { job: PipelineJob; from: PipelineStatus; onClose: () => void; onPick: (to: PipelineStatus) => void }) {
  const theme = useTheme();
  return (
    <Sheet visible onClose={onClose} title="Move to…" subtitle={`${job.customerName} · currently ${STATUS_LABEL[from]}`}>
      {PIPELINE_COLUMNS.filter((s) => s !== from).map((s) => (
        <Pressable key={s} onPress={() => onPick(s)} accessibilityRole="button" style={[styles.pick, { borderColor: theme.border }]}>
          <View style={[styles.pickDot, { backgroundColor: COLUMN_COLORS[s] }]} />
          <ThemedText style={styles.pickText}>{STATUS_LABEL[s]}</ThemedText>
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 12, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 14, lineHeight: 18, fontFamily: FontWeights.semiBold, flex: 1 },
  prio: { fontSize: 12, lineHeight: 16 },
  vehicle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  brand: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  plate: { fontSize: 10, lineHeight: 14, fontFamily: Fonts?.mono },
  services: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  service: { backgroundColor: 'rgba(104,15,26,0.12)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  serviceText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  more: { fontSize: 10, lineHeight: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  amount: { fontFamily: Fonts?.mono, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stale: { fontSize: 10, lineHeight: 14 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  avatar: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 9, lineHeight: 12, fontFamily: FontWeights.bold },
  moveBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colHead: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 2 },
  colTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  colTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  count: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#ffffff', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  total: { fontSize: 10, lineHeight: 14, fontFamily: Fonts?.mono },
  column: { width: 240, borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  colBody: { padding: 8, gap: 8 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8 },
  pickDot: { width: 12, height: 12, borderRadius: 6 },
  pickText: { fontSize: 14, lineHeight: 20 },
});
