import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fmtDate } from '@/components/applications/application-format';
import { getAvatarColor, getInitials } from '@/components/employees/employee-format';
import { OnboardingDetailSheet } from '@/components/onboarding/onboarding-detail';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Card, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchOnboardingOverview, getErrorMessage } from '@/lib/api';
import type { OnboardingOverviewItem } from '@/types/api';

const DONE_COLOR = '#167A48';
const TWO_COLS_MIN = 560;
const THREE_COLS_MIN = 900;

function ProgressBar({ done, total }: { done: number; total: number }) {
  const theme = useTheme();
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <View style={[styles.track, { backgroundColor: theme.border }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: pct === 100 ? DONE_COLOR : theme.primary }]} />
    </View>
  );
}

type Props = {
  /** Pre-selects a person's checklist (from an Overview drill-down or Applications). */
  initialUserId?: string;
  refreshKey: number;
};

// Dashboard OnboardingTab: "Onboarding checklists currently in progress" as a
// 1 / 2 / 3 column card grid. Tapping a card opens that person's checklist.
export function ChecklistTab({ initialUserId, refreshKey }: Props) {
  const [items, setItems] = useState<OnboardingOverviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(initialUserId || null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setItems(await fetchOnboardingOverview());
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not load onboarding checklists.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount and on pull-to-refresh
    load();
  }, [load, refreshKey]);

  const cols = width >= THREE_COLS_MIN ? 3 : width >= TWO_COLS_MIN ? 2 : 1;
  const rows: OnboardingOverviewItem[][] = [];
  for (let i = 0; i < (items?.length ?? 0); i += cols) rows.push((items ?? []).slice(i, i + cols));

  return (
    <View style={styles.stack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ThemedText themeColor="textMuted" style={styles.small}>Onboarding checklists currently in progress.</ThemedText>
      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {!error && items === null ? <Card padding="md"><Skeleton height={14} width="60%" /><Skeleton height={8} /></Card> : null}
      {items && items.length === 0 ? <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No onboarding checklists in progress.</ThemedText></Card> : null}
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((c) => (
            <Pressable key={c.id} onPress={() => setSelected(c.userId)} accessibilityRole="button" accessibilityLabel={`Open ${c.user.name}'s checklist`} style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}>
              <Card padding="md" style={styles.cell}>
                <View style={styles.person}>
                  <View style={[styles.avatar, { backgroundColor: getAvatarColor(c.user.name) }]}>
                    <ThemedText style={styles.initials}>{getInitials(c.user.name)}</ThemedText>
                  </View>
                  <View style={styles.flex1}>
                    <ThemedText style={styles.name} numberOfLines={1}>{c.user.name}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.small} numberOfLines={1}>{c.user.designation || c.user.employeeId || '—'}</ThemedText>
                  </View>
                </View>
                <ProgressBar done={c.completedTasks} total={c.totalTasks} />
                <ThemedText themeColor="textMuted" style={styles.small}>{`${c.completedTasks}/${c.totalTasks} tasks · started ${fmtDate(c.createdAt)}`}</ThemedText>
              </Card>
            </Pressable>
          ))}
          {Array.from({ length: cols - row.length }).map((_, k) => <View key={`pad-${k}`} style={styles.cell} />)}
        </View>
      ))}
      {selected ? <OnboardingDetailSheet userId={selected} onClose={() => setSelected(null)} onChanged={load} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1 },
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontSize: 13, lineHeight: 16, fontFamily: FontWeights.bold },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: 8 },
  fill: { height: '100%', borderRadius: 4 },
});
