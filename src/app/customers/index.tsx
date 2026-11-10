import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { JoinedToggle, TabPills } from '@/components/customers/controls';
import { CrmRow, CRM_COLUMNS } from '@/components/customers/crm-row';
import { MenuButton } from '@/components/menu-button';
import { InspectionMediaSheet } from '@/components/customers/inspection-media-sheet';
import { JobCardItem } from '@/components/customers/job-card-item';
import { Sheet } from '@/components/customers/sheet';
import { BOARD_PAGE, StatusBoardCard } from '@/components/customers/status-board';
import { WalkoutSheet } from '@/components/customers/walkout-sheet';
import { ErrorBanner, SM_BREAKPOINT } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteCustomer,
  downloadCustomersCsv,
  fetchActiveJobCards,
  fetchBoardJobCards,
  fetchCrmCustomerPage,
  fetchHandledByEmployees,
  getErrorMessage,
  reassignJobCard,
  setJobBoardStage,
  updateJobCardStatus,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useContentWidth } from '@/lib/drawer-context';
import { CRM_SEARCH_LABELS, CRM_SEARCH_PLACEHOLDERS, JOB_STATUS_LABELS, SOURCE_FILTER_OPTIONS } from '@/lib/customers-format';
import { usePermissions } from '@/lib/permissions-context';
import type { BoardStage, CjJobCard, CrmCustomerRow, CrmSearchBy, HandledByEmployee, JobCardStatus } from '@/types/api';

// Dashboard ALLOWED_ROLES; anyone else needs the customers_jobs tab granted.
const ALLOWED_ROLES = ['OWNER', 'STORE_MANAGER', 'SALES'];
// Who may export the All Customers CSV (dashboard check, and the server's EXPORT_ROLES).
const CSV_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'CASHIER'];
const LIMIT = 30;
// Active jobs and board cards are rendered 20 at a time (filters and counts
// still run over the full set); the rest loads on scroll / "Show more".
const PAGE = 20;
const GUTTER = Spacing.three;

type Tab = 'jobs' | 'customers' | 'status';

const CRM_SEARCH_OPTIONS = (Object.keys(CRM_SEARCH_LABELS) as CrmSearchBy[]).map((k) => ({ value: k, label: CRM_SEARCH_LABELS[k] }));

export default function CustomersScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const width = useContentWidth();
  const wide = width >= SM_BREAKPOINT;
  const columns = width >= 1100 ? 3 : wide ? 2 : 1;
  const halfGap = columns > 1 ? GUTTER / 2 : 0;
  const { user } = useAuth();
  const { tabMode } = usePermissions();
  const params = useLocalSearchParams<{ tab?: string; employee?: string; status?: string; from?: string; to?: string }>();

  const cjMode = tabMode('customers_jobs');
  const hasAccess = !!user && (ALLOWED_ROLES.includes(user.role) || cjMode !== null);
  // Fails closed like the rest of the app: no resolved permission = read-only.
  const isViewOnly = cjMode === null || cjMode === 'view_only';
  const canReassign = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER';
  const isOwner = user?.role === 'OWNER';

  const customersTab = params.tab === 'customers';
  const [tab, setTab] = useState<Tab>(customersTab ? 'customers' : 'jobs');
  // A tab loads its data the first time it is opened, never all at once.
  const [opened, setOpened] = useState<Record<Tab, boolean>>({ jobs: !customersTab, customers: customersTab, status: false });
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Active jobs
  const [jobs, setJobs] = useState<CjJobCard[]>([]);
  const [jobsLoading, setJobsLoading] = useState(!customersTab);
  const [employees, setEmployees] = useState<HandledByEmployee[]>([]);
  const [mediaJob, setMediaJob] = useState<CjJobCard | null>(null);
  const [jobSearch, setJobSearch] = useState('');
  const [jobFromDate, setJobFromDate] = useState(customersTab ? '' : (params.from ?? ''));
  const [jobToDate, setJobToDate] = useState(customersTab ? '' : (params.to ?? ''));
  const [handledByFilter, setHandledByFilter] = useState(params.employee ?? '');
  const [jobStatusFilter, setJobStatusFilter] = useState(customersTab ? '' : (params.status ?? ''));
  const [jobsReload, setJobsReload] = useState(0);

  // All customers
  const [customers, setCustomers] = useState<CrmCustomerRow[]>([]);
  const [crmTotal, setCrmTotal] = useState(0);
  const [crmLoading, setCrmLoading] = useState(customersTab);
  const [crmSearch, setCrmSearch] = useState('');
  const [crmSearchBy, setCrmSearchBy] = useState<CrmSearchBy>('name');
  const [crmPage, setCrmPage] = useState(1);
  const [crmFromDate, setCrmFromDate] = useState(customersTab ? (params.from ?? '') : '');
  const [crmToDate, setCrmToDate] = useState(customersTab ? (params.to ?? '') : '');
  const [crmSource, setCrmSource] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CrmCustomerRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [crmReload, setCrmReload] = useState(0);
  const [csvLoading, setCsvLoading] = useState(false);

  // Status board
  const [boardJobs, setBoardJobs] = useState<CjJobCard[]>([]);
  const [boardLoading, setBoardLoading] = useState(false);
  const [boardBusyId, setBoardBusyId] = useState<string | null>(null);
  const [walkoutTarget, setWalkoutTarget] = useState<CjJobCard | null>(null);
  const [boardReload, setBoardReload] = useState(0);

  const openTab = (t: Tab) => {
    setTab(t);
    setOpened((o) => (o[t] ? o : { ...o, [t]: true }));
  };

  useEffect(() => {
    if (!hasAccess || !opened.jobs) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-first-open
    setJobsLoading(true);
    fetchActiveJobCards()
      .then((list) => { if (alive) { setJobs(list); setError(''); } })
      .catch((e: unknown) => { if (alive) setError(getErrorMessage(e, 'Failed to load jobs')); })
      .finally(() => { if (alive) setJobsLoading(false); });
    return () => { alive = false; };
  }, [hasAccess, opened.jobs, jobsReload]);

  useEffect(() => {
    if (!canReassign) return;
    fetchHandledByEmployees().then(setEmployees).catch(() => {});
  }, [canReassign]);

  // CRM customers: debounced 300ms, like the dashboard.
  useEffect(() => {
    if (!hasAccess || !opened.customers) return;
    let alive = true;
    const t = setTimeout(() => {
      setCrmLoading(true);
      fetchCrmCustomerPage({ page: crmPage, limit: LIMIT, search: crmSearch, searchBy: crmSearchBy, fromDate: crmFromDate, toDate: crmToDate, source: crmSource })
        .then((r) => { if (alive) { setCustomers(r.customers); setCrmTotal(r.total); setError(''); } })
        .catch((e: unknown) => { if (alive) setError(getErrorMessage(e, 'Failed to load customers')); })
        .finally(() => { if (alive) setCrmLoading(false); });
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [hasAccess, opened.customers, crmSearch, crmSearchBy, crmFromDate, crmToDate, crmSource, crmPage, crmReload]);

  useEffect(() => {
    if (!hasAccess || !opened.status) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-first-open
    setBoardLoading(true);
    fetchBoardJobCards()
      .then((list) => { if (alive) { setBoardJobs(list); setError(''); } })
      .catch((e: unknown) => { if (alive) setError(getErrorMessage(e, 'Failed to load status board')); })
      .finally(() => { if (alive) setBoardLoading(false); });
    return () => { alive = false; };
  }, [hasAccess, opened.status, boardReload]);

  const filteredJobs = useMemo(() => jobs.filter((j) => {
    if (jobSearch) {
      const q = jobSearch.toLowerCase();
      const matches = j.reasonForVisit?.toLowerCase().includes(q) || j.customer?.name?.toLowerCase().includes(q) || j.vehicleNumber?.toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (handledByFilter && !j.handledBy?.name?.toLowerCase().includes(handledByFilter.toLowerCase())) return false;
    // Comma-separated so Overview's "Open Jobs" can pass in-progress + ready at once.
    if (jobStatusFilter && !jobStatusFilter.split(',').includes(j.status)) return false;
    if (jobFromDate && new Date(j.createdAt) < new Date(jobFromDate)) return false;
    if (jobToDate && new Date(j.createdAt) > new Date(jobToDate + 'T23:59:59')) return false;
    return true;
  }), [jobs, jobSearch, handledByFilter, jobStatusFilter, jobFromDate, jobToDate]);
  const jobFiltersActive = !!(jobSearch || handledByFilter || jobStatusFilter || jobFromDate || jobToDate);

  // Paging that resets whenever the filters change, without an effect.
  const jobSig = [jobSearch, handledByFilter, jobStatusFilter, jobFromDate, jobToDate].join('|');
  const [jobPaging, setJobPaging] = useState({ sig: '', n: PAGE });
  const jobsShown = jobPaging.sig === jobSig ? jobPaging.n : PAGE;
  const visibleJobs = useMemo(() => filteredJobs.slice(0, jobsShown), [filteredJobs, jobsShown]);
  const loadMoreJobs = useCallback(() => {
    setJobPaging((p) => {
      const cur = p.sig === jobSig ? p.n : PAGE;
      return cur >= filteredJobs.length ? p : { sig: jobSig, n: cur + PAGE };
    });
  }, [jobSig, filteredJobs.length]);

  const [boardShown, setBoardShown] = useState(BOARD_PAGE);
  const visibleBoard = useMemo(() => boardJobs.slice(0, boardShown), [boardJobs, boardShown]);
  const loadMoreBoard = useCallback(() => {
    setBoardShown((n) => (n >= boardJobs.length ? n : n + BOARD_PAGE));
  }, [boardJobs.length]);

  const onRefresh = () => {
    setRefreshing(true);
    if (tab === 'jobs') setJobsReload((n) => n + 1);
    else if (tab === 'customers') setCrmReload((n) => n + 1);
    else setBoardReload((n) => n + 1);
    setTimeout(() => setRefreshing(false), 600);
  };

  const retry = () => {
    setError('');
    onRefresh();
  };

  // Stable callbacks (all state updates are functional) so memoised rows skip re-rendering.
  const handleStatusChange = useCallback(async (id: string, status: 'READY' | 'RELEASED') => {
    await updateJobCardStatus(id, status as JobCardStatus);
    setJobs((js) => (status === 'RELEASED' ? js.filter((j) => j.id !== id) : js.map((j) => (j.id === id ? { ...j, status } : j))));
  }, []);

  // Saves immediately on selection; the backend allows OWNER / STORE_MANAGER only.
  const handleReassign = useCallback(async (job: CjJobCard, handledById: string) => {
    if (!handledById || handledById === job.handledBy.id) return;
    try {
      const r = await reassignJobCard(job.id, handledById);
      setJobs((js) => js.map((j) => (j.id === job.id ? { ...j, handledBy: { id: r.handledBy.id, name: r.handledBy.name } } : j)));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to reassign'));
    }
  }, []);

  const handleBoardAdvance = useCallback(async (job: CjJobCard, stage: BoardStage) => {
    setBoardBusyId(job.id);
    try {
      const r = await setJobBoardStage(job.id, stage);
      setBoardJobs((js) => js.map((j) => (j.id === job.id ? { ...j, boardStage: r.boardStage } : j)));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not update stage'));
    } finally {
      setBoardBusyId(null);
    }
  }, []);

  const submitWalkout = async (job: CjJobCard, reason: string, remarks: string) => {
    try {
      const r = await setJobBoardStage(job.id, 'WALKED_OUT', { boardWalkoutReason: reason, boardWalkoutRemarks: remarks || undefined });
      setBoardJobs((js) => js.map((j) => (j.id === job.id ? { ...j, boardStage: r.boardStage, boardWalkoutReason: r.boardWalkoutReason, boardWalkoutRemarks: r.boardWalkoutRemarks } : j)));
      setWalkoutTarget(null);
    } catch (e: unknown) {
      throw new Error(getErrorMessage(e, 'Could not save walkout'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCustomer(deleteTarget.id);
      setCustomers((cs) => cs.filter((c) => c.id !== deleteTarget.id));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to delete customer'));
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const openCustomer = useCallback((c: CrmCustomerRow) => {
    router.push(`/customers/${c.id}?name=${encodeURIComponent(c.name)}` as never);
  }, [router]);
  const askDelete = useCallback((c: CrmCustomerRow) => setDeleteTarget(c), []);

  const cell = useMemo(() => ({ width: `${100 / columns}%` as `${number}%`, paddingHorizontal: halfGap, marginBottom: GUTTER }), [columns, halfGap]);

  const renderJob = useCallback(({ item }: { item: CjJobCard }) => (
    <View style={cell}>
      <JobCardItem
        job={item}
        onStatusChange={handleStatusChange}
        onOpenMedia={setMediaJob}
        onReassign={handleReassign}
        onError={setError}
        canReassign={canReassign}
        isViewOnly={isViewOnly}
        employees={employees}
      />
    </View>
  ), [cell, handleStatusChange, handleReassign, canReassign, isViewOnly, employees]);

  const renderCustomer = useCallback(({ item }: { item: CrmCustomerRow }) => (
    <View style={[styles.rowSides, { borderColor: theme.border }]}>
      <CrmRow customer={item} wide={wide} onView={openCustomer} onDelete={isOwner ? askDelete : undefined} />
    </View>
  ), [wide, openCustomer, isOwner, askDelete, theme.border]);

  const renderBoardCard = useCallback(({ item }: { item: CjJobCard }) => (
    <View style={cell}>
      <StatusBoardCard job={item} onAdvance={handleBoardAdvance} onWalkout={setWalkoutTarget} disabled={isViewOnly || boardBusyId === item.id} />
    </View>
  ), [cell, handleBoardAdvance, isViewOnly, boardBusyId]);

  if (!hasAccess) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textMuted">Access denied.</ThemedText>
      </ThemedView>
    );
  }

  const totalPages = Math.ceil(crmTotal / LIMIT);
  const crmFiltersActive = !!(crmFromDate || crmToDate || crmSource);
  // Dashboard downloadCsv: same filters as the list, built by the server, saved to the cache, then the share sheet.
  const downloadCsv = async () => {
    setCsvLoading(true);
    try {
      const { uri } = await downloadCustomersCsv({ fromDate: crmFromDate, toDate: crmToDate, source: crmSource, search: crmSearch, searchBy: crmSearchBy });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Customers & Jobs CSV', UTI: 'public.comma-separated-values-text' });
      else Alert.alert('CSV saved', 'Sharing isn’t available on this device.');
    } catch {
      Alert.alert('CSV download failed. Please try again.');
    } finally {
      setCsvLoading(false);
    }
  };
  const clearJobFilters = () => { setJobSearch(''); setHandledByFilter(''); setJobStatusFilter(''); setJobFromDate(''); setJobToDate(''); };

  const tabOptions = [
    { value: 'jobs', label: `Active Jobs${filteredJobs.length ? ` (${filteredJobs.length})` : ''}` },
    { value: 'customers', label: 'All Customers' },
    { value: 'status', label: 'Status' },
  ];

  const chip = (label: string, onClear: () => void) => (
    <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel={`Clear ${label}`} style={({ pressed }) => [styles.chip, { backgroundColor: theme.primary }, pressed && { opacity: 0.7 }]}>
      <ThemedText style={styles.chipText}>{label}</ThemedText>
      <Ionicons name="close" size={14} color="#fff" />
    </Pressable>
  );

  const searchField = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Ionicons name="search" size={16} color={theme.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={[styles.searchInput, { color: theme.text }]}
      />
    </View>
  );

  // One header element per tab (an element, not a component, so typing in the
  // search box never remounts it).
  const header = (
    <View style={[styles.headerWrap, { paddingHorizontal: halfGap }]}>
      <View style={styles.header}>
        <MenuButton />
        <ThemedText style={styles.title}>Customers & Jobs</ThemedText>
        <Button icon="add" onPress={() => router.push('/more/new-entry' as never)}>New Entry</Button>
      </View>

      {error ? <ErrorBanner message={error} onRetry={retry} /> : null}

      <TabPills options={tabOptions} value={tab} onChange={(v) => openTab(v as Tab)} />

      {tab === 'jobs' && (
        <View style={styles.filters}>
          <View style={styles.filterRow}>
            <View style={styles.searchGrow}>{searchField(jobSearch, setJobSearch, 'Search name, vehicle, work type…')}</View>
            <View style={styles.dateRow}>
              <View style={styles.dateCell}><DateField compact label="From" value={jobFromDate} onChange={setJobFromDate} /></View>
              <ThemedText themeColor="textMuted" style={styles.to}>to</ThemedText>
              <View style={styles.dateCell}><DateField compact label="To" value={jobToDate} onChange={setJobToDate} /></View>
            </View>
          </View>
          <View style={styles.chips}>
            {jobFiltersActive ? <Button size="sm" variant="secondary" onPress={clearJobFilters}>Clear</Button> : null}
            {handledByFilter ? chip(`Staff: ${handledByFilter}`, () => setHandledByFilter('')) : null}
            {jobStatusFilter ? chip(`Status: ${jobStatusFilter.split(',').map((s) => JOB_STATUS_LABELS[s as JobCardStatus] ?? s).join(', ')}`, () => setJobStatusFilter('')) : null}
            {jobFiltersActive ? <ThemedText themeColor="textMuted" style={styles.count}>{filteredJobs.length} of {jobs.length} jobs</ThemedText> : null}
          </View>
        </View>
      )}

      {tab === 'customers' && (
        <View style={styles.filters}>
          <View style={styles.filterRow}>
            <JoinedToggle options={CRM_SEARCH_OPTIONS} value={crmSearchBy} onChange={(v) => { setCrmSearchBy(v as CrmSearchBy); setCrmSearch(''); setCrmPage(1); }} />
            <View style={styles.searchGrow}>{searchField(crmSearch, (v) => { setCrmSearch(v); setCrmPage(1); }, CRM_SEARCH_PLACEHOLDERS[crmSearchBy])}</View>
          </View>
          <View style={styles.filterRow}>
            <View style={styles.dateRow}>
              <View style={styles.dateCell}><DateField compact label="From" value={crmFromDate} onChange={(v) => { setCrmFromDate(v); setCrmPage(1); }} /></View>
              <ThemedText themeColor="textMuted" style={styles.to}>to</ThemedText>
              <View style={styles.dateCell}><DateField compact label="To" value={crmToDate} onChange={(v) => { setCrmToDate(v); setCrmPage(1); }} /></View>
            </View>
            <View style={styles.sourceSelect}>
              <Select options={SOURCE_FILTER_OPTIONS} value={crmSource} onChange={(v) => { setCrmSource(v); setCrmPage(1); }} placeholder="All sources" />
            </View>
            {crmFiltersActive ? <Button size="sm" variant="secondary" onPress={() => { setCrmFromDate(''); setCrmToDate(''); setCrmSource(''); setCrmPage(1); }}>Clear</Button> : null}
            {crmFiltersActive ? <ThemedText themeColor="textMuted" style={styles.count}>{crmTotal} customers</ThemedText> : null}
            {CSV_ROLES.includes(user?.role ?? '') ? (
              <View style={styles.csvBtn}>
                <Button size="sm" disabled={csvLoading} onPress={downloadCsv}>{csvLoading ? 'Preparing…' : '⬇ Download CSV'}</Button>
              </View>
            ) : null}
          </View>
          {!wide && !crmLoading && customers.length > 0 ? <View style={[styles.tableCap, { borderColor: theme.border }]} /> : null}
          {wide && !crmLoading && customers.length > 0 ? (
            <View style={[styles.tableHead, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={[styles.th, styles.flex1]}>CUSTOMER</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, { width: CRM_COLUMNS.phone }]}>PHONE</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, { width: CRM_COLUMNS.vehicles }]}>VEHICLES</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, { width: CRM_COLUMNS.lastVisit }]}>LAST VISIT</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, { width: CRM_COLUMNS.status }]}>STATUS</ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.th, { width: CRM_COLUMNS.total, textAlign: 'right' }]}>TOTAL</ThemedText>
              <View style={styles.thEnd} />
            </View>
          ) : null}
        </View>
      )}

    </View>
  );

  const skeletonCards = (h: number) => (
    <View style={[styles.skelWrap, { paddingHorizontal: halfGap }]}>
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={h} style={styles.skelCard} />)}
    </View>
  );

  const empty = (title: string, extra?: React.ReactNode) => (
    <View style={styles.empty}>
      <ThemedText themeColor="textMuted" style={styles.emptyTitle}>{title}</ThemedText>
      {extra}
    </View>
  );

  const common = {
    style: { backgroundColor: theme.background },
    contentContainerStyle: { paddingTop: GUTTER, paddingBottom: insets.bottom + Spacing.four, paddingHorizontal: GUTTER - halfGap },
    keyboardShouldPersistTaps: 'handled' as const,
    refreshing,
    onRefresh,
    ListHeaderComponent: header,
    initialNumToRender: 10,
    maxToRenderPerBatch: 10,
    windowSize: 7,
    removeClippedSubviews: Platform.OS === 'android',
  };

  const sheets = (
    <>
      <InspectionMediaSheet
        job={mediaJob}
        canDelete={canReassign}
        canUpload={!isViewOnly}
        onClose={() => setMediaJob(null)}
        onCountChange={(id, count) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, mediaCount: count } : j)))}
      />
      <WalkoutSheet job={walkoutTarget} onClose={() => setWalkoutTarget(null)} onSubmit={submitWalkout} />
      <Sheet
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        locked={deleting}
        title="Delete Customer"
        subtitle={deleteTarget?.name}
        footer={
          <>
            <Button variant="secondary" style={styles.flex1} disabled={deleting} onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" style={styles.flex1} loading={deleting} onPress={confirmDelete}>{deleting ? 'Deleting…' : 'Delete'}</Button>
          </>
        }>
        <ThemedText themeColor="textMuted" style={styles.deleteText}>This customer will be hidden from the CRM. Their invoices and history will be preserved.</ThemedText>
      </Sheet>
    </>
  );

  // Only the active tab is mounted, so a tab switch never re-renders the others.
  return (
    <ThemedView style={[styles.flex1, { paddingTop: insets.top }]}>
      {tab === 'jobs' && (
        <FlatList
          {...common}
          key={`jobs-${columns}`}
          numColumns={columns}
          data={jobsLoading ? [] : visibleJobs}
          keyExtractor={(j) => j.id}
          renderItem={renderJob}
          onEndReached={loadMoreJobs}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            jobsLoading ? skeletonCards(208)
            : jobs.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="clipboard-outline" size={48} color={theme.textMuted} />
                <ThemedText themeColor="textMuted" style={styles.emptyTitle}>No active jobs right now</ThemedText>
                <Button icon="add" onPress={() => router.push('/more/new-entry' as never)}>New Entry</Button>
              </View>
            ) : empty('No jobs match your filters', <Button variant="ghost" onPress={clearJobFilters}>Clear filters</Button>)
          }
          ListFooterComponent={filteredJobs.length > visibleJobs.length ? <ThemedText themeColor="textMuted" style={styles.more}>Showing {visibleJobs.length} of {filteredJobs.length} — scroll for more</ThemedText> : null}
        />
      )}

      {tab === 'customers' && (
        <FlatList
          {...common}
          data={crmLoading ? [] : customers}
          keyExtractor={(c) => c.id}
          renderItem={renderCustomer}
          ListEmptyComponent={
            crmLoading ? (
              <View style={styles.skelList}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={56} style={styles.skelRow} />)}</View>
            ) : empty(crmSearch ? 'No customers found' : 'No active customers yet')
          }
          ListFooterComponent={
            <>
              {!crmLoading && customers.length > 0 ? <View style={[styles.tableEnd, { borderColor: theme.border }]} /> : null}
              {totalPages > 1 ? (
              <View style={styles.pager}>
                <Button variant="secondary" disabled={crmPage === 1} onPress={() => setCrmPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <ThemedText themeColor="textMuted" style={styles.pageText}>Page {crmPage} of {totalPages}</ThemedText>
                <Button variant="secondary" disabled={crmPage === totalPages} onPress={() => setCrmPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
              </View>
              ) : null}
            </>
          }
        />
      )}

      {tab === 'status' && (
        <FlatList
          {...common}
          key={`board-${columns}`}
          numColumns={columns}
          data={boardLoading ? [] : visibleBoard}
          keyExtractor={(j) => j.id}
          renderItem={renderBoardCard}
          onEndReached={loadMoreBoard}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={boardLoading ? skeletonCards(160) : empty('No job cards yet.')}
          ListFooterComponent={boardJobs.length > visibleBoard.length ? <ThemedText themeColor="textMuted" style={styles.more}>Showing {visibleBoard.length} of {boardJobs.length} — scroll for more</ThemedText> : null}
        />
      )}

      {sheets}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  headerWrap: { gap: Spacing.three, marginBottom: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  title: { flex: 1, fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  filters: { gap: Spacing.two },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: Radii.md },
  searchInput: { flex: 1, minHeight: 44, fontSize: 14, paddingVertical: 0 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  searchGrow: { flexGrow: 1, flexBasis: 220, minWidth: 180 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexGrow: 1, flexBasis: 260 },
  dateCell: { flex: 1, minWidth: 120 },
  to: { fontSize: 12, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, paddingHorizontal: 10, borderRadius: Radii.pill },
  chipText: { color: '#fff', fontSize: 12, lineHeight: 16 },
  count: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  csvBtn: { marginLeft: 'auto' },
  sourceSelect: { minWidth: 170, flexGrow: 1, flexBasis: 170 },
  skelWrap: { gap: Spacing.three },
  skelCard: { borderRadius: Radii.lg },
  skelList: { gap: 4 },
  skelRow: { borderRadius: Radii.sm },
  empty: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  emptyTitle: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.medium, textAlign: 'center' },
  more: { textAlign: 'center', fontSize: 12, lineHeight: 18, paddingVertical: Spacing.two },
  rowSides: { borderLeftWidth: 1, borderRightWidth: 1 },
  tableCap: { height: 0, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderTopLeftRadius: Radii.md, borderTopRightRadius: Radii.md },
  tableEnd: { height: 0, borderBottomWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderBottomLeftRadius: Radii.md, borderBottomRightRadius: Radii.md },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderTopLeftRadius: Radii.md, borderTopRightRadius: Radii.md },
  th: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  thEnd: { width: 40 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.three },
  pageText: { fontSize: 14, lineHeight: 20 },
  deleteText: { fontSize: 14, lineHeight: 21 },
});
