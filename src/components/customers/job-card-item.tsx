import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { memo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';

import { InvBadge, JobStatusBadge } from '@/components/customers/badges';
import { CopyButton } from '@/components/customers/copy-button';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Select } from '@/components/ui';
import { FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage } from '@/lib/api';
import { fmtDateTime, fmtINR } from '@/lib/customers-format';
import type { CjJobCard, HandledByEmployee } from '@/types/api';

type Tone = 'blue' | 'green' | 'red' | 'orange' | 'muted';

// The card's small pill buttons: tinted blue (Mark Ready), green / red (release),
// solid orange (Collect Payment), grey outlined (Invoice, Photos).
function Action({ label, icon, tone, onPress, loading, grow }: { label: string; icon?: keyof typeof Ionicons.glyphMap; tone: Tone; onPress: () => void; loading?: boolean; grow?: boolean }) {
  const theme = useTheme();
  const tint = (c: string) => ({ fg: c, bg: withAlpha(c, 0.15), border: withAlpha(c, 0.3) });
  const look = {
    blue: tint('#3b82f6'),
    green: tint(theme.success),
    red: tint(theme.danger),
    orange: { fg: '#ffffff', bg: '#f97316', border: '#f97316' },
    muted: { fg: theme.textMuted, bg: theme.surface, border: theme.border },
  }[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, { backgroundColor: look.bg, borderColor: look.border }, grow && styles.actionGrow, (pressed || loading) && { opacity: 0.6 }]}>
      {loading ? <ActivityIndicator size="small" color={look.fg} /> : (
        <>
          {icon ? <Ionicons name={icon} size={14} color={look.fg} /> : null}
          <ThemedText style={[styles.actionText, { color: look.fg }, tone !== 'muted' && styles.actionTextBold]} numberOfLines={1}>{label}</ThemedText>
        </>
      )}
    </Pressable>
  );
}

type Props = {
  job: CjJobCard;
  onStatusChange: (id: string, status: 'READY' | 'RELEASED') => Promise<void>;
  onOpenMedia: (job: CjJobCard) => void;
  onReassign: (job: CjJobCard, handledById: string) => void;
  onError: (message: string) => void;
  canReassign: boolean;
  isViewOnly: boolean;
  employees: HandledByEmployee[];
};

// Dashboard JobCardItem. Release only when the invoice is fully PAID; the
// backend enforces the same rule (PATCH /job-cards/:id/status).
function JobCardItemBase({ job, onStatusChange, onOpenMedia, onReassign, onError, canReassign, isViewOnly, employees }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [showInvoiceSheet, setShowInvoiceSheet] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);

  const canRelease = job.invoice?.status === 'PAID';
  const noInvoice = !job.invoice;
  const hasUnpaidInvoice = !!job.invoice && job.invoice.status !== 'PAID' && job.invoice.status !== 'DRAFT' && job.invoice.status !== 'CANCELLED';
  const invEmpty = !job.invoice || (job.invoice.status === 'DRAFT' && (job.invoice.grandTotal ?? 0) === 0);
  const releaseBlockReason = invEmpty
    ? 'Cannot release car: no invoice has been created for this job yet.'
    : `Cannot release car: invoice not fully paid. Balance due: ${fmtINR(Number(job.invoice?.balanceDue ?? job.invoice?.grandTotal ?? 0))}.`;

  const run = async (status: 'READY' | 'RELEASED') => {
    setUpdating(true);
    try {
      await onStatusChange(job.id, status);
    } catch (err: unknown) {
      onError(getErrorMessage(err, 'Could not update this job.'));
    } finally {
      setUpdating(false);
    }
  };

  const openJob = () => router.push(`/customers/job/${job.id}` as never);
  const goInvoices = () => router.push('/more/invoices' as never);

  const handlerOptions = [
    ...(employees.some((e) => e.id === job.handledBy.id) ? [] : [{ value: job.handledBy.id, label: job.handledBy.name }]),
    ...employees.map((e) => ({ value: e.id, label: e.name })),
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: job.status === 'WALKED_OUT' ? 0.6 : 1 }]}>
      <Pressable onPress={openJob} accessibilityRole="button" accessibilityLabel={`Open job ${job.jobNumber}`} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <View style={styles.top}>
          <View style={styles.flex1}>
            <View style={styles.wrapRow}>
              <ThemedText themeColor="primary" style={styles.jobNumber}>{job.jobNumber}</ThemedText>
              <JobStatusBadge status={job.status} />
            </View>
            <View style={[styles.wrapRow, styles.nameRow]}>
              <ThemedText style={styles.name}>{job.customer.name}</ThemedText>
              {job.customerRole === 'DRIVER' && <Badge size="sm" variant="warning">🚗 Driver</Badge>}
            </View>
          </View>
          <InvBadge status={job.invoice?.status} />
        </View>
      </Pressable>

      {job.customer.phone ? (
        <View style={styles.inline}>
          <Pressable onPress={() => Linking.openURL(`tel:${job.customer.phone}`)} hitSlop={8} accessibilityRole="link" accessibilityLabel={`Call ${job.customer.phone}`}>
            <ThemedText themeColor="textMuted" style={styles.small}>{job.customer.phone}</ThemedText>
          </Pressable>
          <CopyButton value={job.customer.phone} label="Copy phone" />
        </View>
      ) : null}

      <View style={styles.details}>
        <View style={styles.twoCol}>
          <View style={[styles.inline, styles.flex1]}>
            {job.vehicleNumber ? (
              <>
                <ThemedText style={[styles.small, styles.vehicle]}>{job.vehicleNumber}</ThemedText>
                <CopyButton value={job.vehicleNumber} label="Copy vehicle number" />
                {job.vehicle?.make ? <ThemedText themeColor="textMuted" style={styles.small}>{job.vehicle.make} {job.vehicle.model}</ThemedText> : null}
              </>
            ) : (
              <ThemedText themeColor="textMuted" style={[styles.small, styles.italic]}>Walk-in / No Vehicle</ThemedText>
            )}
          </View>
          <View style={styles.byCol}>
            {canReassign ? (
              <>
                <ThemedText themeColor="textMuted" style={styles.small}>By</ThemedText>
                <View style={styles.bySelect}>
                  <Select compact options={handlerOptions} value={job.handledBy.id} onChange={(v) => onReassign(job, v)} placeholder="Reassign" />
                </View>
              </>
            ) : (
              <ThemedText themeColor="textMuted" style={styles.small}>By {job.handledBy.name}</ThemedText>
            )}
          </View>
        </View>

        <ThemedText themeColor="textMuted" style={[styles.small, styles.italic]} numberOfLines={2}>{job.reasonForVisit}</ThemedText>

        {job.status === 'WALKED_OUT' && job.walkoutReason ? (
          <View style={[styles.walkout, { backgroundColor: withAlpha(theme.textMuted, 0.12) }]}>
            <ThemedText themeColor="textMuted" style={styles.small}>
              {job.walkoutReason.replace(/_/g, ' ')}
              {job.walkoutNote ? ` — ${job.walkoutNote}` : ''}
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.between}>
          <ThemedText themeColor="textMuted" style={styles.small}>{fmtDateTime(job.createdAt)}</ThemedText>
          {job.invoice && job.invoice.grandTotal > 0 ? <ThemedText style={[styles.small, styles.bold]}>{fmtINR(job.invoice.grandTotal)}</ThemedText> : null}
        </View>
        {job.invoice && (job.invoice.balanceDue ?? 0) > 0 ? (
          <ThemedText themeColor="danger" style={styles.small}>Balance due: {fmtINR(job.invoice.balanceDue ?? 0)}</ThemedText>
        ) : null}
      </View>

      <View style={styles.actions}>
        {(job.status === 'IN_PROGRESS' || job.status === 'WALKED_OUT') && !isViewOnly && (
          <Action label="Mark Ready" tone="blue" grow loading={updating} onPress={() => run('READY')} />
        )}
        {job.status === 'READY' && noInvoice && !isViewOnly && (
          <ThemedText style={[styles.small, { color: '#f97316' }, styles.fullWidth]}>Generate an invoice and collect full payment before releasing</ThemedText>
        )}
        {job.status === 'READY' && !isViewOnly && (
          <Action
            label={!canRelease ? (noInvoice ? 'No Invoice — Cannot Release' : 'Collect Payment First') : 'Release Car ✓'}
            tone={canRelease ? 'green' : 'red'}
            grow
            loading={updating}
            onPress={() => (canRelease ? run('RELEASED') : setShowReleaseDialog(true))}
          />
        )}
        {hasUnpaidInvoice && job.invoiceId ? <Action label="Collect Payment" tone="orange" onPress={goInvoices} /> : null}
        {job.invoiceId && invEmpty && job.status !== 'WALKED_OUT' ? <Action label="Invoice" tone="muted" onPress={() => setShowInvoiceSheet(true)} /> : null}
        {job.invoiceId && !invEmpty ? <Action label="Invoice" tone="muted" onPress={goInvoices} /> : null}
        <Action label={(job.mediaCount ?? 0) > 0 ? String(job.mediaCount) : 'Photos'} icon="camera-outline" tone="muted" onPress={() => onOpenMedia(job)} />
      </View>

      <Sheet
        visible={showReleaseDialog}
        onClose={() => setShowReleaseDialog(false)}
        title="Cannot Release Car"
        footer={<Button variant="secondary" fullWidth onPress={() => setShowReleaseDialog(false)}>Close</Button>}>
        <View style={styles.warnRow}>
          <View style={[styles.warnIcon, { backgroundColor: withAlpha(theme.danger, 0.15) }]}>
            <Ionicons name="warning-outline" size={22} color={theme.danger} />
          </View>
          <ThemedText themeColor="textMuted" style={[styles.releaseText, styles.flex1]}>{releaseBlockReason}</ThemedText>
        </View>
      </Sheet>

      <Sheet
        visible={showInvoiceSheet}
        onClose={() => setShowInvoiceSheet(false)}
        title="Create Invoice"
        subtitle={`Choose invoice type for ${job.jobNumber}`}
        footer={<Button variant="ghost" fullWidth onPress={() => setShowInvoiceSheet(false)}>Cancel</Button>}>
        {[
          { title: 'Collect Advance →', text: 'Record an advance payment now, full invoice later' },
          { title: 'Create Full Invoice →', text: 'Add services and generate a complete invoice' },
        ].map((o) => (
          <View key={o.title} style={[styles.option, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText style={[styles.small, styles.bold]}>{o.title}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>{o.text}</ThemedText>
          </View>
        ))}
        <ThemedText themeColor="textMuted" style={styles.small}>Creating invoices isn&apos;t available in the app yet. Use the dashboard.</ThemedText>
      </Sheet>
    </View>
  );
}

// Memoised: the list passes stable callbacks, so a row only re-renders when its own job changes.
export const JobCardItem = memo(JobCardItemBase);

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  card: { padding: Spacing.three, borderRadius: Radii.lg, borderWidth: 1, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  wrapRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  nameRow: { marginTop: 4 },
  jobNumber: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  name: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  small: { fontSize: 12, lineHeight: 18 },
  vehicle: { fontFamily: FontWeights.medium },
  italic: { fontStyle: 'italic' },
  bold: { fontFamily: FontWeights.semiBold },
  details: { gap: 8, marginTop: 4 },
  twoCol: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  byCol: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bySelect: { width: 116 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walkout: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  action: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 14, borderRadius: Radii.md, borderWidth: 1 },
  actionGrow: { flexGrow: 1 },
  actionText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  actionTextBold: { fontFamily: FontWeights.semiBold },
  fullWidth: { width: '100%' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warnIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  releaseText: { fontSize: 14, lineHeight: 21 },
  option: { padding: Spacing.three, borderRadius: Radii.md, borderWidth: 1, gap: 2, opacity: 0.6 },
});
