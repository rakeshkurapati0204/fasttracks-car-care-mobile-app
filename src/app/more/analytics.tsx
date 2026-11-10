import { Stack } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HorizontalBarChart, VerticalBarChart } from '@/components/analytics/bar-chart';
import { ErrorBanner, OverviewStat } from '@/components/overview/parts';
import { PermissionGate } from '@/components/permission-gate';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { fetchHiringAnalytics, fetchRetentionAnalytics } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { HiringAnalytics, RetentionAnalytics } from '@/types/api';

// GET /analytics/* is requireHRModuleAccess: OWNER/STORE_MANAGER/HR/ACCOUNTING,
// or anyone granted the hr_module tab (checked by PermissionGate, fail-closed).
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'];
const WIDE_MIN = 560;

// The dashboard's colours.
const GREEN = '#36C87E';
const RED = '#e06868';
const AMBER = '#f59e0b';
const BLUE = '#6AA4CC';

const STAGE_LABELS: Record<keyof HiringAnalytics['stagesCompletedBeforeRejection'], string> = {
  NONE: 'None',
  SCREENED_ONLY: 'Screened',
  INTERVIEWED: 'Interviewed',
  ASSESSED: 'Assessed',
};

// Stat tiles: 2 per row on a phone, `wideCols` per row at 560 or wider
// (dashboard `grid-cols-2 sm:grid-cols-N`).
function TileGrid({ wide, wideCols, children }: { wide: boolean; wideCols: number; children: ReactNode[] }) {
  const cols = wide ? wideCols : 2;
  const rows: ReactNode[][] = [];
  for (let i = 0; i < children.length; i += cols) rows.push(children.slice(i, i + cols));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((c, i) => <View key={i} style={styles.cell}>{c}</View>)}
          {Array.from({ length: cols - row.length }).map((_, k) => <View key={`p${k}`} style={styles.cell} />)}
        </View>
      ))}
    </View>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View>
      <ThemedText style={styles.h2}>{title}</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.subtitle}>{subtitle}</ThemedText>
    </View>
  );
}

function Loading() {
  return <Card padding="md"><Skeleton height={20} width="30%" /><Skeleton height={64} /><Skeleton height={160} /></Card>;
}

function HiringSection({ data, wide }: { data: HiringAnalytics; wide: boolean }) {
  const stageData = (Object.keys(STAGE_LABELS) as (keyof typeof STAGE_LABELS)[]).map((key) => ({
    label: STAGE_LABELS[key],
    value: data.stagesCompletedBeforeRejection[key],
    tip: `Rejected applications: ${data.stagesCompletedBeforeRejection[key]}`,
  }));
  const roleData = data.avgScoreByRole
    .filter((r) => r.avgScore !== null)
    .map((r) => ({ label: r.role, value: r.avgScore as number, tip: `Avg score: ${r.avgScore} (n=${r.scoredCount})` }));

  const charts = [
    <Card key="stage" padding="md">
      <ThemedText style={styles.cardTitle}>Stages Completed Before Rejection</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.cardNote}>
        There&apos;s no exact &quot;rejected from stage X&quot; record in the system — status is a single, overwritten value with no history. This shows which AI stages actually ran before each rejected application was marked REJECTED, which is the closest honest signal available.
      </ThemedText>
      {data.totalRejected === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.empty}>No rejected applications yet.</ThemedText>
      ) : (
        <VerticalBarChart data={stageData} color={RED} />
      )}
    </Card>,
    <Card key="role" padding="md">
      <ThemedText style={styles.cardTitle}>Average Interview Score by Role</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.cardNote}>Excludes applications never interviewed and any AI-flagged (degraded) scorecards.</ThemedText>
      {roleData.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.empty}>No completed interview scorecards yet.</ThemedText>
      ) : (
        <VerticalBarChart data={roleData} color={BLUE} yMax={100} />
      )}
    </Card>,
  ];

  return (
    <View style={styles.sectionStack}>
      <SectionTitle title="Hiring" subtitle="Time-to-hire, rejection funnel, and interview scores across the AI Recruitment pipeline." />

      <TileGrid wide={wide} wideCols={4}>
        {[
          <OverviewStat key="a" label="Total Applications" value={data.totalApplications} />,
          <OverviewStat key="b" label="Hired" value={data.totalHired} color={GREEN} />,
          <OverviewStat key="c" label="Rejection Rate" value={data.rejectionRate !== null ? `${data.rejectionRate}%` : '—'} color={RED} />,
          <OverviewStat key="d" label="Avg. Time to Hire" value={data.avgTimeToHireDays !== null ? `${data.avgTimeToHireDays}d` : '—'} color={AMBER} />,
        ]}
      </TileGrid>
      {data.avgTimeToHireDays !== null ? (
        <ThemedText themeColor="textMuted" style={[styles.small, styles.pullUp]}>
          {`Based on ${data.timeToHireSampleSize} converted application${data.timeToHireSampleSize === 1 ? '' : 's'}.`}
        </ThemedText>
      ) : null}

      {wide ? (
        <View style={styles.chartRow}>{charts.map((c, i) => <View key={i} style={styles.cell}>{c}</View>)}</View>
      ) : (
        <View style={styles.sectionStack}>{charts}</View>
      )}
    </View>
  );
}

function RetentionSection({ data, wide }: { data: RetentionAnalytics; wide: boolean }) {
  const hasTracked = data.departedTrackedCount > 0;
  const n = data.departedNoDataCount;
  const since = data.earliestTrackedDeparture
    ? new Date(data.earliestTrackedDeparture).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : '—';
  const reasons = data.reasonBreakdown.map((r) => ({ label: r.reason, value: r.count, tip: `Departures: ${r.count}` }));

  return (
    <View style={styles.sectionStack}>
      <SectionTitle title="Retention" subtitle="Departure date/reason are only captured going forward, from each deactivation — there is no historical backfill." />

      <TileGrid wide={wide} wideCols={3}>
        {[
          <OverviewStat key="a" label="Active Employees" value={data.activeCount} />,
          <OverviewStat key="b" label="Tracked Departures" value={data.departedTrackedCount} color={RED} />,
          <OverviewStat key="c" label="Avg. Tenure (tracked)" value={data.avgTenureDays !== null ? `${data.avgTenureDays}d` : '—'} color={AMBER} />,
        ]}
      </TileGrid>

      {!hasTracked ? (
        <Card padding="md">
          <ThemedText style={styles.body}>No tracked departures yet — this section will populate as employees are deactivated with a departure date going forward.</ThemedText>
          {n > 0 ? (
            <ThemedText themeColor="textMuted" style={[styles.small, styles.gapTop]}>
              {`${n} earlier deactivation${n === 1 ? '' : 's'} exist${n === 1 ? 's' : ''} with no departure date on file (from before this feature, or left blank) — excluded from retention numbers, not counted as zero.`}
            </ThemedText>
          ) : null}
        </Card>
      ) : (
        <>
          <ThemedText themeColor="textMuted" style={styles.small}>
            {`Tracking since ${since}.${n > 0 ? ` ${n} additional past deactivation${n === 1 ? '' : 's'} with no departure date on file (not included above).` : ''}`}
          </ThemedText>
          <Card padding="md">
            <ThemedText style={[styles.cardTitle, styles.gapBottom]}>Departure Reasons</ThemedText>
            <HorizontalBarChart data={reasons} color={BLUE} />
          </Card>
        </>
      )}
    </View>
  );
}

function AnalyticsContent() {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [hiring, setHiring] = useState<HiringAnalytics | null>(null);
  const [retention, setRetention] = useState<RetentionAnalytics | null>(null);
  const [hiringError, setHiringError] = useState(false);
  const [retentionError, setRetentionError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Each section loads on its own so one failing endpoint never blanks the other.
  const loadHiring = useCallback(async () => {
    setHiringError(false);
    try { setHiring(await fetchHiringAnalytics()); } catch { setHiringError(true); }
  }, []);
  const loadRetention = useCallback(async () => {
    setRetentionError(false);
    try { setRetention(await fetchRetentionAnalytics()); } catch { setRetentionError(true); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    loadHiring();
    loadRetention();
  }, [loadHiring, loadRetention]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadHiring(), loadRetention()]);
    setRefreshing(false);
  };

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Analytics' }} />
      <ScrollView
        contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + 40, gap: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View>
          <ThemedText style={styles.h1}>Analytics</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Hiring and retention trends across the HR module.</ThemedText>
        </View>

        {hiringError ? <ErrorBanner message="Failed to load hiring analytics." onRetry={loadHiring} />
          : hiring === null ? <Loading /> : <HiringSection data={hiring} wide={wide} />}

        {retentionError ? <ErrorBanner message="Failed to load retention analytics." onRetry={loadRetention} />
          : retention === null ? <Loading /> : <RetentionSection data={retention} wide={wide} />}
      </ScrollView>
    </ThemedView>
  );
}

export default function AnalyticsScreen() {
  const { user } = useAuth();
  if (ADMIN_ROLES.includes(user?.role ?? '')) return <AnalyticsContent />;
  return (
    <PermissionGate tabKey="hr_module" deniedMessage="Analytics is available to Owner, Store Manager, HR and Accounting roles, or users granted HR module access.">
      <AnalyticsContent />
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  sectionStack: { gap: 16 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, minWidth: 0 },
  chartRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  h2: { fontSize: 18, lineHeight: 26, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  cardTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  cardNote: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 24 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  pullUp: { marginTop: -8 },
  gapTop: { marginTop: 8 },
  gapBottom: { marginBottom: 12 },
});
