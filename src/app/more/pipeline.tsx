import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/overview/parts';
import {
  COLUMN_COLORS, ColumnHeader, isFollowUpOverdue, JobCard, jobAmount, MoveSheet, PIPELINE_COLUMNS, PipelineColumn, STATUS_LABEL,
} from '@/components/pipeline/job-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, Card, Select, Skeleton } from '@/components/ui';
import { UnderTestBanner } from '@/components/ui/coming-soon';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchAssignableEmployees, fetchJobsPipeline, getErrorMessage, updateJobStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import type { PipelineJob, PipelineResponse, PipelineStatus } from '@/types/api';

const WIDE_MIN = 560;

// Dashboard rule: Owner, or the per-employee `job_tracker` permission. The
// server also needs a manager role for GET /jobs/pipeline (a 403 lands on the
// same "no access" message). Moving a job (PUT /jobs/:id/status) needs
// requireJobAccess; of the roles that can open this screen only Owner and
// Store Manager pass it, so the move control is shown to them only.
const MOVE_ROLES = ['OWNER', 'STORE_MANAGER'];

export default function PipelineScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const { user } = useAuth();
  const { status: permStatus, hasTab } = usePermissions();
  const canAccess = user?.role === 'OWNER' || hasTab('job_tracker');
  const canMove = MOVE_ROLES.includes(user?.role ?? '');

  const [width, setWidth] = useState(0);
  const [pipeline, setPipeline] = useState<PipelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [staffList, setStaffList] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [staffFilter, setStaffFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [active, setActive] = useState<PipelineStatus>('NEW_ENQUIRY');
  const [moving, setMoving] = useState<{ job: PipelineJob; from: PipelineStatus } | null>(null);
  const wide = width >= WIDE_MIN;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPipeline(await fetchJobsPipeline());
    } catch (err: unknown) {
      if ((err as { response?: { status?: number } })?.response?.status === 403) setForbidden(true);
      else setError(getErrorMessage(err, 'Could not load the pipeline.'));
      setPipeline(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canAccess) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
      load();
      fetchAssignableEmployees().then(setStaffList).catch(() => {});
    }
  }, [canAccess, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const jobsFor = useCallback(
    (status: PipelineStatus): PipelineJob[] => {
      let jobs = pipeline?.[status] ?? [];
      if (search) {
        const s = search.toLowerCase();
        jobs = jobs.filter(
          (j) => j.customerName?.toLowerCase().includes(s) || j.vehicleNumber?.toLowerCase().includes(s) || j.vehicleBrand?.toLowerCase().includes(s),
        );
      }
      if (staffFilter) jobs = jobs.filter((j) => j.assignedTo?.id === staffFilter);
      if (priorityFilter) jobs = jobs.filter((j) => j.priority === priorityFilter);
      return jobs;
    },
    [pipeline, search, staffFilter, priorityFilter],
  );

  const overdueCount = useMemo(
    () => (pipeline?.FOLLOW_UP_NEEDED ?? []).filter((j) => j.followUpDate && isFollowUpOverdue(j.followUpDate)).length,
    [pipeline],
  );

  // Same optimistic move + revert-on-failure as the dashboard's drag end.
  const move = async (job: PipelineJob, from: PipelineStatus, to: PipelineStatus) => {
    setMoving(null);
    if (from === to) return;
    setPipeline((prev) => {
      if (!prev) return prev;
      return { ...prev, [from]: (prev[from] ?? []).filter((j) => j.id !== job.id), [to]: [job, ...(prev[to] ?? [])] };
    });
    try {
      await updateJobStatus(job.id, to);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not move this job.'));
      load();
    }
  };

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Job Tracker' }} />
      {children}
    </ThemedView>
  );

  if (permStatus !== 'ready') return shell(<View style={styles.pad}><Skeleton height={64} /></View>);
  if (!canAccess || forbidden) {
    return shell(
      <View style={[styles.pad, { padding: wide ? 24 : 16 }]}>
        <Card style={styles.centerCard}><ThemedText style={styles.emptyText}>You don&apos;t have access to Job Tracker.</ThemedText></Card>
      </View>,
    );
  }

  const searchBox = (
    <TextInput
      value={search}
      onChangeText={setSearch}
      placeholder="Search customer, vehicle, plate..."
      placeholderTextColor={theme.textMuted}
      style={[styles.search, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }, wide && { width: 224 }]}
    />
  );

  const header = (
    <View style={styles.headerWrap}>
      <UnderTestBanner />
      <View style={styles.headRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Job Tracker</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            {canMove ? 'Move jobs between stages to update their status' : 'Jobs by stage'}
          </ThemedText>
        </View>
        {overdueCount > 0 ? <Badge variant="danger" dot>{`${overdueCount} follow-up${overdueCount === 1 ? '' : 's'} overdue`}</Badge> : null}
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      <View style={[styles.filters, wide && styles.filtersWide]}>
        {searchBox}
        <View style={wide ? { width: 180 } : undefined}>
          <Select
            value={staffFilter}
            onChange={setStaffFilter}
            options={[{ value: '', label: 'All staff' }, ...staffList.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </View>
        <View style={wide ? { width: 180 } : undefined}>
          <Select
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={[
              { value: '', label: 'All priorities' },
              { value: 'NORMAL', label: 'Normal' },
              { value: 'VIP', label: 'VIP' },
              { value: 'HOT', label: 'Hot' },
            ]}
          />
        </View>
      </View>
    </View>
  );

  const body = () => {
    if (loading) {
      return <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={wide ? 200 : 110} />)}</View>;
    }
    if (!pipeline) return null;
    if (wide) {
      return (
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.board}>
          {PIPELINE_COLUMNS.map((status) => (
            <PipelineColumn
              key={status}
              status={status}
              jobs={jobsFor(status)}
              canMove={canMove}
              onMove={(job, from) => setMoving({ job, from })}
              maxHeight={Math.max(320, windowH - 340)}
            />
          ))}
        </ScrollView>
      );
    }
    const jobs = jobsFor(active);
    return (
      <View style={styles.gap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {PIPELINE_COLUMNS.map((status) => {
            const on = status === active;
            const c = COLUMN_COLORS[status];
            return (
              <Pressable
                key={status}
                onPress={() => setActive(status)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.chip, { backgroundColor: on ? c : theme.surface, borderColor: on ? c : theme.border }]}>
                <ThemedText style={[styles.chipText, { color: on ? '#ffffff' : theme.text }]}>{STATUS_LABEL[status]}</ThemedText>
                <View style={[styles.chipCount, { backgroundColor: on ? 'rgba(255,255,255,0.3)' : c }]}>
                  <ThemedText style={styles.chipCountText}>{jobsFor(status).length}</ThemedText>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={[styles.single, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ColumnHeader status={active} count={jobs.length} total={jobs.reduce((s, j) => s + jobAmount(j), 0)} />
        </View>
        {jobs.map((j) => <JobCard key={j.id} job={j} status={active} canMove={canMove} onMove={(job, from) => setMoving({ job, from })} />)}
        {jobs.length === 0 ? <ThemedText themeColor="textMuted" style={styles.emptyText}>No jobs.</ThemedText> : null}
      </View>
    );
  };

  return shell(
    <>
      <FlatList
        data={[0]}
        keyExtractor={() => 'board'}
        renderItem={() => <View>{body()}</View>}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      />
      {moving ? <MoveSheet job={moving.job} from={moving.from} onClose={() => setMoving(null)} onPick={(to) => move(moving.job, moving.from, to)} /> : null}
    </>,
  );
}


const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  pad: { padding: 16 },
  page: { width: '100%' },
  headerWrap: { gap: 16, marginBottom: 16 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20 },
  filters: { gap: 8 },
  filtersWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: FontWeights.regular },
  gap: { gap: 12 },
  board: { gap: 12, paddingBottom: 8, alignItems: 'flex-start' },
  chips: { gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  chipText: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  chipCount: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  chipCountText: { color: '#ffffff', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  single: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  centerCard: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 24 },
});
