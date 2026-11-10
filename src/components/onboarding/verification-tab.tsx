import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fmtDate } from '@/components/applications/application-format';
import { DOC_TYPE_LABELS, statusBadgeVariant } from '@/components/onboarding/document-format';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchAllOnboardingDocuments, fetchVerificationQueue, getErrorMessage } from '@/lib/api';
import type { CandidateVerificationQueueItem, IdentityDocumentStatus, OnboardingDocument } from '@/types/api';

type Filter = IdentityDocumentStatus | 'ALL';
const FILTERS: Filter[] = ['ALL', 'PENDING', 'VERIFIED', 'REJECTED'];

type Props = {
  /** Opens the Documents tab on that person (the dashboard's ?tab=documents&userId= link). */
  onOpenDocuments: (userId: string) => void;
  refreshKey: number;
};

// Dashboard VerificationTab: candidates awaiting HR review, then the
// cross-employee document status list (read-only) with a status filter.
export function VerificationTab({ onOpenDocuments, refreshKey }: Props) {
  return (
    <View style={styles.section}>
      <CandidateQueue onOpenDocuments={onOpenDocuments} refreshKey={refreshKey} />
      <DocumentStatusList refreshKey={refreshKey} />
    </View>
  );
}

function CandidateQueue({ onOpenDocuments, refreshKey }: Props) {
  const theme = useTheme();
  const [queue, setQueue] = useState<CandidateVerificationQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setQueue(await fetchVerificationQueue());
    } catch (err: unknown) {
      setQueue([]);
      setError(getErrorMessage(err, 'Could not load the verification queue.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / pull-to-refresh
    load();
  }, [load, refreshKey]);

  return (
    <View style={styles.stack}>
      <ThemedText themeColor="textMuted" style={styles.groupTitle}>CANDIDATES AWAITING REVIEW</ThemedText>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {queue === null ? (
        <Card padding="md"><Skeleton height={16} width="50%" /><Skeleton height={16} /></Card>
      ) : queue.length === 0 && !error ? (
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No candidates have submitted for review yet.</ThemedText></Card>
      ) : queue.length > 0 ? (
        <Card padding="none">
          {queue.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => onOpenDocuments(c.id)}
              accessibilityRole="button"
              accessibilityLabel={`Review documents for ${c.name}`}
              style={({ pressed }) => [styles.queueRow, i < queue.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }, pressed && { opacity: 0.7 }]}>
              <View style={styles.titleLine}>
                <ThemedText style={[styles.name, styles.shrink]}>{c.name}</ThemedText>
                <Badge variant={c.onboardingStatus === 'HR_REVIEW' ? 'success' : 'primary'} size="sm">{c.onboardingStatus}</Badge>
                {c.overdue ? <Badge variant="danger" size="sm">{`Overdue — ${c.daysSinceStatusChange}d awaiting HR`}</Badge> : null}
              </View>
              <ThemedText themeColor="textMuted" style={styles.small}>
                {`${c.documentsSummary.verified}/${c.documentsSummary.required} verified`}
                {c.documentsSummary.rejectedTypes.length > 0 ? <ThemedText style={[styles.small, { color: theme.danger }]}>{` · Rejected: ${c.documentsSummary.rejectedTypes.join(', ')}`}</ThemedText> : null}
              </ThemedText>
              <View style={styles.start}><Button size="sm" variant="secondary" onPress={() => onOpenDocuments(c.id)}>Review Documents</Button></View>
            </Pressable>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function DocumentStatusList({ refreshKey }: { refreshKey: number }) {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [docs, setDocs] = useState<OnboardingDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setDocs(null);
    try {
      setDocs(await fetchAllOnboardingDocuments(filter === 'ALL' ? undefined : filter));
    } catch (err: unknown) {
      setDocs([]);
      setError(getErrorMessage(err, 'Could not load documents.'));
    }
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on filter change / pull-to-refresh
    load();
  }, [load, refreshKey]);

  return (
    <View style={styles.stack}>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: theme.surface }]}>
              <ThemedText style={[styles.chipText, { color: active ? theme.primary : theme.textMuted }]}>{f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {docs === null ? (
        <Card padding="md"><Skeleton height={16} width="50%" /><Skeleton height={16} /></Card>
      ) : docs.length === 0 && !error ? (
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>Nothing here.</ThemedText></Card>
      ) : docs.length > 0 ? (
        <Card padding="none">
          {docs.map((doc, i) => (
            <View key={doc.id} style={[styles.docRow, i < docs.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
              <View style={styles.docMain}>
                <ThemedText style={styles.name}>{`${doc.user?.name ?? ''}${doc.user?.employeeId ? ` (${doc.user.employeeId})` : ''}`}</ThemedText>
                <ThemedText themeColor="textSecondary" style={styles.small}>{`${DOC_TYPE_LABELS[doc.type]}${doc.label ? ` — ${doc.label}` : ''}`}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.small}>{`${fmtDate(doc.createdAt)} by ${doc.uploadedBy.name}`}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.small}>{`Reviewed by: ${doc.verifiedBy ? `${doc.verifiedBy.name} · ${fmtDate(doc.verifiedAt)}` : '—'}`}</ThemedText>
              </View>
              <Badge variant={statusBadgeVariant(doc.status)} size="sm">{doc.status}</Badge>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 24 },
  stack: { gap: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  shrink: { flexShrink: 1 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  groupTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  queueRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  start: { alignSelf: 'flex-start' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: Radii.sm, minHeight: 36, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  docRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  docMain: { flex: 1, minWidth: 0, gap: 2 },
});
