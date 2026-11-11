import { Stack } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { BreakdownPie, CHART_COLORS, formatCurrency, GrowthBarChart, RevenueLineChart, SlabBarChart } from '@/components/financial/charts';
import { ErrorBanner } from '@/components/overview/parts';
import { shareCsv } from '@/components/purchase/helpers';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, Button, Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchCustomerSpendSlabCustomers, fetchCustomerSpendSlabs, fetchFinancialGrowth, fetchFinancialOutstanding,
  fetchFinancialOverview, fetchFinancialRevenueBreakdown, fetchFinancialRevenueTrend, fetchFinancialTopCustomers,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import type {
  CustomerSpendSlab, FinancialOverview, MonthlyGrowthEntry, OutstandingJob, RevenueBreakdownItem, SlabCustomer, TopCustomerEntry,
} from '@/types/api';

const WIDE_MIN = 560;

// The shared page-level period drives Breakdown and Customer Spend Slabs. The
// stat cards, Revenue Trend, Outstanding and Top Customers deliberately don't
// read it (they stay all-time / fixed window), as on the dashboard.
const PERIOD_OPTIONS = ['today', 'week', 'month', 'year', 'all'];
const PERIOD_LABELS: Record<string, string> = { today: 'Today', week: 'This Week', month: 'This Month', year: 'This Year', all: 'All Time' };
const BREAKDOWN_TABS = ['service', 'employee', 'brand', 'payment_mode'] as const;
const BREAKDOWN_LABELS: Record<string, string> = { service: 'By Service', employee: 'By Employee', brand: 'By Vehicle Brand', payment_mode: 'By Payment Mode' };

const SLAB_ORDER: CustomerSpendSlab[] = ['BELOW_2L', '2L_TO_5L', '5L_TO_10L', 'ABOVE_10L'];
const SLAB_LABELS: Record<CustomerSpendSlab, string> = {
  BELOW_2L: 'Below ₹2L', '2L_TO_5L': '₹2L – ₹5L', '5L_TO_10L': '₹5L – ₹10L', ABOVE_10L: 'Above ₹10L',
};
// One fixed colour per slab; skips red, which reads as "danger" elsewhere.
const SLAB_CHART_COLORS = [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[4]];

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 'week' is a trailing 7-day window (not a calendar week), like the backend's getPeriodRange().
function getPeriodDateParams(period: string): { fromDate?: string; toDate?: string } {
  if (period === 'all') return {};
  const now = new Date();
  let from: Date;
  switch (period) {
    case 'today': from = now; break;
    case 'week': from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
    case 'month': from = new Date(now.getFullYear(), now.getMonth(), 1); break;
    case 'year': from = new Date(now.getFullYear(), 0, 1); break;
    default: from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { fromDate: isoDate(from), toDate: isoDate(now) };
}

function overdueVariant(days: number): 'danger' | 'warning' | 'orange' {
  if (days > 30) return 'danger';
  if (days > 15) return 'warning';
  return 'orange';
}

// Responsive grid: `cols` per row, equal widths.
function Grid({ cols, gap = 16, children }: { cols: number; gap?: number; children: ReactNode[] }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((c, k) => <View key={k} style={styles.cell}>{c}</View>)}
          {Array.from({ length: cols - row.length }).map((_, k) => <View key={`p${k}`} style={styles.cell} />)}
        </View>
      ))}
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.pill, { backgroundColor: active ? theme.primary : theme.backgroundElement }]}>
      <ThemedText style={[styles.pillText, { color: active ? '#ffffff' : theme.textSecondary }]}>{label}</ThemedText>
    </Pressable>
  );
}

function Empty({ text, pad = 24 }: { text: string; pad?: number }) {
  return <ThemedText themeColor="textMuted" style={[styles.empty, { paddingVertical: pad }]}>{text}</ThemedText>;
}

function SlabSheet({
  slab, period, customers, loading, onClose,
}: { slab: CustomerSpendSlab; period: string; customers: SlabCustomer[]; loading: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [exportError, setExportError] = useState('');
  const q = search.trim().toLowerCase();
  const filtered = q ? customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)) : customers;
  const vehicleText = (c: SlabCustomer, sep: string) => c.vehicles.map((v) => [v.make, v.model, v.year].filter(Boolean).join(' ') || 'Vehicle').join(sep);

  // Exports exactly what's visible (respects the search box).
  const exportCsv = async () => {
    if (filtered.length === 0) return;
    setExportError('');
    const rows: (string | number)[][] = [
      ['Name', 'Phone', 'Vehicle(s)', 'Total Spent', 'Purchased Items'],
      ...filtered.map((c) => [c.name, c.phone, vehicleText(c, '; '), String(c.totalSpent), c.purchasedItems.join('; ')]),
    ];
    try {
      if (!(await shareCsv(`customer-spend-${slab}-${period}.csv`, rows))) setExportError('Sharing isn’t available on this device.');
    } catch (e: unknown) {
      setExportError(e instanceof Error && e.message ? e.message : "Couldn't export CSV. Try again.");
    }
  };

  return (
    <Sheet visible fullHeight onClose={onClose} title={`Customers ${SLAB_LABELS[slab]} — ${PERIOD_LABELS[period]}`}>
      {!loading && customers.length > 0 ? (
        <View style={styles.searchRow}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or phone..."
            placeholderTextColor={theme.textMuted}
            style={[styles.search, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
          />
          <Button size="sm" onPress={exportCsv} disabled={filtered.length === 0}>Download CSV</Button>
        </View>
      ) : null}
      {exportError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{exportError}</ThemedText> : null}
      {loading ? (
        <View style={styles.gap8}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={72} />)}</View>
      ) : customers.length === 0 ? (
        <Empty text="No customers in this slab." pad={32} />
      ) : filtered.length === 0 ? (
        <Empty text={`No customers match "${search}".`} pad={32} />
      ) : (
        <View style={styles.gap8}>
          {filtered.map((c) => (
            <View key={c.id} style={[styles.slabRow, { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.between}>
                <View style={styles.flex1}>
                  <ThemedText style={styles.name}>{c.name}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.small}>{c.phone}</ThemedText>
                </View>
                <ThemedText style={[styles.mono, styles.semi]}>{formatCurrency(c.totalSpent)}</ThemedText>
              </View>
              {c.vehicles.length > 0 ? <ThemedText themeColor="textSecondary" style={[styles.small, { marginTop: 8 }]}>{vehicleText(c, ', ')}</ThemedText> : null}
              {c.purchasedItems.length > 0 ? <ThemedText themeColor="textMuted" style={[styles.small, { marginTop: 4 }]}>{`Purchased: ${c.purchasedItems.join(', ')}`}</ThemedText> : null}
            </View>
          ))}
        </View>
      )}
    </Sheet>
  );
}

export default function FinancialScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { hasTab } = usePermissions();
  // Dashboard rule: Owner, Store Manager, or the per-employee `financial` permission.
  const canAccess = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER' || hasTab('financial');

  const [width, setWidth] = useState(0);
  const [period, setPeriod] = useState('month');
  const [activeTab, setActiveTab] = useState<(typeof BREAKDOWN_TABS)[number]>('service');
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [trend, setTrend] = useState<{ date: string; revenue: number }[]>([]);
  const [breakdown, setBreakdown] = useState<RevenueBreakdownItem[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingJob[]>([]);
  const [topCustomers, setTopCustomers] = useState<TopCustomerEntry[]>([]);
  const [growth, setGrowth] = useState<{ current: number; previous: number; growthPercent: number; chartData: MonthlyGrowthEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [slabCounts, setSlabCounts] = useState<Record<CustomerSpendSlab, number> | null>(null);
  const [slabCountsLoading, setSlabCountsLoading] = useState(true);
  const [activeSlab, setActiveSlab] = useState<CustomerSpendSlab | null>(null);
  const [slabCustomers, setSlabCustomers] = useState<SlabCustomer[]>([]);
  const [slabCustomersLoading, setSlabCustomersLoading] = useState(false);

  const wide = width >= WIDE_MIN;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [ov, tr, out, top, gr] = await Promise.allSettled([
        fetchFinancialOverview(),
        fetchFinancialRevenueTrend(period),
        fetchFinancialOutstanding(),
        fetchFinancialTopCustomers(),
        fetchFinancialGrowth(),
      ]);
      if (ov.status === 'fulfilled') setOverview(ov.value);
      if (tr.status === 'fulfilled') setTrend(tr.value);
      if (out.status === 'fulfilled') setOutstanding(out.value?.jobs ?? []);
      if (top.status === 'fulfilled') setTopCustomers(top.value ?? []);
      if (gr.status === 'fulfilled') {
        const arr = gr.value;
        if (Array.isArray(arr) && arr.length >= 2) {
          const current = arr[arr.length - 1]?.revenue ?? 0;
          const previous = arr[arr.length - 2]?.revenue ?? 0;
          setGrowth({ current, previous, growthPercent: previous > 0 ? ((current - previous) / previous) * 100 : 0, chartData: arr });
        } else if (Array.isArray(arr) && arr.length === 1) {
          setGrowth({ current: arr[0].revenue, previous: 0, growthPercent: 0, chartData: arr });
        }
      }
      setFailed([ov, tr, out, top, gr].every((r) => r.status === 'rejected'));
    } finally {
      setLoading(false);
    }
  }, [period]);

  const fetchBreakdown = useCallback(async () => {
    try {
      setBreakdown((await fetchFinancialRevenueBreakdown(period, activeTab)) ?? []);
    } catch {
      /* silent, as on the dashboard */
    }
  }, [period, activeTab]);

  const fetchSlabCounts = useCallback(async () => {
    setSlabCountsLoading(true);
    try {
      const { fromDate, toDate } = getPeriodDateParams(period);
      setSlabCounts(await fetchCustomerSpendSlabs(fromDate, toDate));
    } catch {
      setSlabCounts(null);
    } finally {
      setSlabCountsLoading(false);
    }
  }, [period]);

  const openSlab = useCallback(async (slab: CustomerSpendSlab) => {
    setActiveSlab(slab);
    setSlabCustomersLoading(true);
    try {
      const { fromDate, toDate } = getPeriodDateParams(period);
      setSlabCustomers((await fetchCustomerSpendSlabCustomers(slab, fromDate, toDate)) ?? []);
    } catch {
      setSlabCustomers([]);
    } finally {
      setSlabCustomersLoading(false);
    }
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / period change
    if (canAccess) fetchData();
  }, [canAccess, fetchData]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / period or tab change
    if (canAccess) fetchBreakdown();
  }, [canAccess, fetchBreakdown]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / period change
    if (canAccess) fetchSlabCounts();
  }, [canAccess, fetchSlabCounts]);
  // A slab sheet that's open refreshes when the period changes.
  useEffect(() => {
    if (activeSlab) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh the open slab list on a period change
      openSlab(activeSlab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), fetchBreakdown(), fetchSlabCounts()]);
    setRefreshing(false);
  };

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Financial' }} />
      {children}
    </ThemedView>
  );

  if (!canAccess) {
    return shell(
      <View style={[styles.page, { padding: wide ? 24 : 16 }]}>
        <Card style={styles.centerCard}>
          <ThemedText style={styles.emptyTitle}>You don&apos;t have access to Financial.</ThemedText>
        </Card>
      </View>,
    );
  }

  const total = SLAB_ORDER.reduce((sum, s) => sum + (slabCounts?.[s] ?? 0), 0);
  const slabChartData = SLAB_ORDER.map((slab) => {
    const count = slabCounts?.[slab] ?? 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return { slab, label: SLAB_LABELS[slab], count, pct, labelText: `${count} customer${count === 1 ? '' : 's'} (${pct}%)` };
  });
  const growthData = growth ?? { current: 0, previous: 0, growthPercent: 0, chartData: [] as MonthlyGrowthEntry[] };

  const stat = (label: string, value: string | number) => (
    <Card>
      <ThemedText themeColor="textSecondary" style={styles.statLabel}>{label}</ThemedText>
      <ThemedText style={[styles.statValue, styles.mono]}>{String(value)}</ThemedText>
    </Card>
  );
  const sectionTitle = (t: string) => <ThemedText style={styles.sectionTitle}>{t}</ThemedText>;

  const skeletonCards = (n: number) => (
    <Grid cols={wide ? 4 : 2}>
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} height={84} />)}
    </Grid>
  );

  const trendCard = (
    <Card>
      {sectionTitle('Revenue Trend')}
      {trend.length > 0 ? <RevenueLineChart data={trend} /> : <Empty text="No revenue data for this period." pad={64} />}
    </Card>
  );
  const growthCard = (
    <Card>
      {sectionTitle('Growth (MoM)')}
      {growthData.chartData.length > 0 ? (
        <>
          <View style={styles.growthHead}>
            <ThemedText style={[styles.statValue, styles.mono]}>{formatCurrency(growthData.current)}</ThemedText>
            <Badge variant={growthData.growthPercent >= 0 ? 'success' : 'danger'}>
              {`${growthData.growthPercent >= 0 ? '+' : ''}${growthData.growthPercent.toFixed(1)}%`}
            </Badge>
          </View>
          <GrowthBarChart data={growthData.chartData} />
        </>
      ) : (
        <Empty text="No growth data available." pad={48} />
      )}
    </Card>
  );

  return shell(
    <ScrollView
      contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled">
      <View style={[styles.head, wide && styles.headWide]}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Current Finances</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>Cash collected · outstanding balances · customer performance</ThemedText>
        </View>
        <View style={styles.pills}>
          {PERIOD_OPTIONS.map((p) => <Pill key={p} label={PERIOD_LABELS[p]} active={period === p} onPress={() => setPeriod(p)} />)}
        </View>
      </View>

      {failed ? <ErrorBanner message="Could not load financial data." onRetry={onRefresh} /> : null}

      <View>
        <ThemedText style={[styles.sectionTitle, { marginBottom: 12 }]}>
          {'Customers by Spend Slab '}
          <ThemedText themeColor="textMuted" style={styles.sectionSub}>{`— ${PERIOD_LABELS[period]}`}</ThemedText>
        </ThemedText>
        <View style={styles.gap16}>
          {slabCountsLoading ? (
            skeletonCards(4)
          ) : (
            <Grid cols={wide ? 4 : 2}>
              {SLAB_ORDER.map((slab) => (
                <Card key={slab} onPress={() => openSlab(slab)}>
                  <ThemedText themeColor="textSecondary" style={styles.statLabel}>{SLAB_LABELS[slab]}</ThemedText>
                  <ThemedText style={[styles.statValue, styles.mono]}>{String(slabCounts?.[slab] ?? 0)}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.tiny}>customers</ThemedText>
                </Card>
              ))}
            </Grid>
          )}
          <Card>
            {sectionTitle('Spend Slab Distribution')}
            {slabCountsLoading ? <Skeleton height={180} /> : <SlabBarChart data={slabChartData} colors={SLAB_CHART_COLORS} />}
          </Card>
        </View>
      </View>

      {loading ? (
        skeletonCards(4)
      ) : (
        <Grid cols={wide ? 4 : 2}>
          {stat('Collected This Month', formatCurrency(overview?.revenue.thisMonth ?? 0))}
          {stat('Collected This Year', formatCurrency(overview?.revenue.thisYear ?? 0))}
          {stat('Invoices This Month', overview?.jobs.thisMonth ?? 0)}
          {stat('Outstanding', formatCurrency(overview?.outstanding.amount ?? 0))}
        </Grid>
      )}

      {wide ? (
        <View style={styles.threeCol}>
          <View style={{ flex: 2, minWidth: 0 }}>{trendCard}</View>
          <View style={styles.flex1}>{growthCard}</View>
        </View>
      ) : (
        <View style={styles.gap16}>{trendCard}{growthCard}</View>
      )}

      <Card>
        <View style={styles.tabs}>
          {BREAKDOWN_TABS.map((t) => <Pill key={t} label={BREAKDOWN_LABELS[t]} active={activeTab === t} onPress={() => setActiveTab(t)} />)}
        </View>
        {breakdown.length > 0 ? (
          <View style={[styles.gap16, wide && styles.twoColRow]}>
            <View style={wide ? styles.flex1 : undefined}><BreakdownPie data={breakdown} /></View>
            <View style={[styles.gap4, wide && styles.flex1]}>
              {breakdown.map((row, i) => (
                <View key={`${row.service}${i}`} style={[styles.listRow, { backgroundColor: theme.backgroundElement }]}>
                  <View style={styles.legendLeft}>
                    <View style={[styles.dot, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]} />
                    <ThemedText style={[styles.name, styles.flex1]}>{row.service}</ThemedText>
                  </View>
                  <View style={styles.right}>
                    <ThemedText style={[styles.mono, styles.semi]}>{formatCurrency(row.revenue)}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.tiny}>{`${row.count} jobs`}</ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Empty text="No job payment data for this period." pad={32} />
        )}
      </Card>

      <View style={wide ? styles.twoColRow : styles.gap16}>
        <View style={wide ? styles.flex1 : undefined}>
          <Card>
            {sectionTitle('Outstanding Payments')}
            <View style={styles.gap4}>
              {outstanding.map((row) => {
                const days = row.daysSinceCreated ?? 0;
                return (
                  <View key={row.id} style={[styles.listRow, { backgroundColor: theme.backgroundElement }]}>
                    <View style={styles.flex1}>
                      <ThemedText style={styles.name}>{row.customer?.name ?? '—'}</ThemedText>
                      <ThemedText themeColor="textMuted" style={[styles.tiny, styles.mono]}>
                        {String(row.vehicleNumber ?? row.vehicleBrand ?? '—')}
                      </ThemedText>
                    </View>
                    <View style={styles.right}>
                      <ThemedText style={[styles.mono, styles.semi]}>{formatCurrency(Number(row.finalAmount ?? row.quotedAmount ?? 0))}</ThemedText>
                      <Badge variant={overdueVariant(days)} size="sm">{`${days}d overdue`}</Badge>
                    </View>
                  </View>
                );
              })}
              {outstanding.length === 0 ? <Empty text="No outstanding payments." /> : null}
            </View>
          </Card>
        </View>

        <View style={wide ? styles.flex1 : undefined}>
          <Card>
            {sectionTitle('Top Customers')}
            <View style={styles.gap4}>
              {topCustomers.map((row, i) => (
                <View key={row.customer?.id ?? i} style={[styles.listRow, { backgroundColor: theme.backgroundElement }]}>
                  <View style={styles.legendLeft}>
                    <View style={[styles.rank, { backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }]}>
                      <ThemedText style={styles.rankText}>{`#${i + 1}`}</ThemedText>
                    </View>
                    <View style={styles.flex1}>
                      <ThemedText style={styles.name}>{row.customer?.name ?? '—'}</ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.tiny}>{`${row.invoiceCount} invoices`}</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={[styles.mono, styles.semi]}>{formatCurrency(row.totalSpent)}</ThemedText>
                </View>
              ))}
              {topCustomers.length === 0 ? <Empty text="No customer data available." /> : null}
            </View>
          </Card>
        </View>
      </View>

      {activeSlab ? (
        <SlabSheet slab={activeSlab} period={period} customers={slabCustomers} loading={slabCustomersLoading} onClose={() => setActiveSlab(null)} />
      ) : null}
    </ScrollView>,
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  cell: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 1200, alignSelf: 'center', gap: 24 },
  head: { gap: 12 },
  headWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  pill: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, marginBottom: 12 },
  sectionSub: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.regular },
  statLabel: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
  statValue: { fontSize: 24, lineHeight: 32, fontWeight: '700' },
  tiny: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  small: { fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: Fonts?.mono },
  semi: { fontFamily: FontWeights.semiBold, fontWeight: '600' },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  gap4: { gap: 4 },
  gap8: { gap: 8 },
  gap16: { gap: 16 },
  threeCol: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  twoColRow: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 16 },
  growthHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  legendLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  right: { alignItems: 'flex-end', gap: 2 },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#ffffff', fontSize: 10, lineHeight: 12, fontFamily: FontWeights.bold },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  centerCard: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  search: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 14, fontFamily: FontWeights.regular },
  slabRow: { padding: 12, borderRadius: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
