import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import {
  CHART_COLORS, Chip, EmptyText, HBarChart, HistBadge, KPICard, MONTH_NAMES, OutlineBtn, RevenueChart,
  SectionHeader, SkeletonRows, StatusBadge, TableCard, axisK, fmtDate, getPreset, inr, isoDate,
} from '@/components/erp-finance/parts';
import { shareCsv, csvCell } from '@/components/inventory/csv';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Select, Skeleton } from '@/components/ui';
import { FontWeights, Fonts, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchErpFinanceCustomers, fetchErpFinanceDaily, fetchErpFinanceMonthlyBreakdown, fetchErpFinanceOrders,
  fetchErpFinanceOverview, fetchErpFinanceSalesPerformance, fetchErpFinanceServices, getErrorMessage,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type {
  ErpFinanceCustomer, ErpFinanceDailyPoint, ErpFinanceEmployeePerformance, ErpFinanceMonthlyBreakdown,
  ErpFinanceOrder, ErpFinanceOverview, ErpFinanceService,
} from '@/types/api';

const WIDE_MIN = 560;
const TWO_COL_MIN = 900;
const ORDERS_LIMIT = 50;
// The dashboard page itself bounces everyone except OWNER / STORE_MANAGER to /dashboard.
const ALLOWED_ROLES = ['OWNER', 'STORE_MANAGER'];

type Preset = 'month' | 'quarter' | 'year' | 'pick' | 'custom';
const PRESETS: Preset[] = ['month', 'quarter', 'year', 'pick', 'custom'];
const PRESET_LABEL: Record<Preset, string> = { month: 'This Month', quarter: 'This Quarter', year: 'This Year', pick: 'By Month', custom: 'Custom' };

const ORDER_COLS: { h: string; w: number }[] = [
  { h: 'Date', w: 100 }, { h: 'Order Id', w: 130 }, { h: 'Customer', w: 150 }, { h: 'Car Model', w: 120 },
  { h: 'Item', w: 190 }, { h: 'Qty', w: 50 }, { h: 'Unit Price', w: 100 }, { h: 'Order Value', w: 110 },
  { h: 'Profit', w: 100 }, { h: 'Margin', w: 70 }, { h: 'Status', w: 100 }, { h: 'Sold By', w: 110 }, { h: 'Remarks', w: 150 },
];

// Dashboard exportCSV: same headers, values and filename.
async function exportCSV(orders: ErpFinanceOrder[], from: string, to: string) {
  const headers = ['Date', 'Order Id', 'Customer', 'Car Model', 'Item', 'Qty', 'Unit Price', 'Order Value', 'Profit', 'Status', 'Sold By', 'Remarks', 'Source'];
  const rows = orders.map((o) => [
    fmtDate(o.date), o.orderNumber ?? '', o.customerName ?? '', o.vehicleModel ?? '', (o.lineItems ?? []).join('; '),
    o.qty != null ? o.qty : '', o.unitPrice != null ? o.unitPrice.toFixed(2) : '', (o.amount ?? 0).toFixed(2),
    o.profit != null ? o.profit.toFixed(2) : '', o.status ?? '', o.soldBy ?? '', o.remarks ?? '', o.isHistorical ? 'Historical' : 'Live',
  ]);
  await shareCsv(`orders_${from}_${to}.csv`, [headers, ...rows].map((r) => r.map(csvCell).join(',')));
}

export default function ErpFinanceScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const allowed = ALLOWED_ROLES.includes(user?.role ?? '');

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;
  const twoCol = width >= TWO_COL_MIN;

  const [initial] = useState(() => getPreset('month'));
  const [preset, setPreset] = useState<Preset>('month');
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());
  const [thisYear] = useState(() => new Date().getFullYear());
  const [thisMonth] = useState(() => new Date().getMonth());

  const [kpis, setKpis] = useState<ErpFinanceOverview['kpis'] | null>(null);
  const [chart, setChart] = useState<ErpFinanceOverview['chart']>([]);
  const [kpisLoading, setKpisLoading] = useState(true);

  const [orders, setOrders] = useState<ErpFinanceOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [orderGrouping, setOrderGrouping] = useState<'lineItem' | 'order'>('order');

  const [employees, setEmployees] = useState<ErpFinanceEmployeePerformance[]>([]);
  const [empLoading, setEmpLoading] = useState(true);
  const [showMonthly, setShowMonthly] = useState(false);
  const [monthly, setMonthly] = useState<ErpFinanceMonthlyBreakdown>({ employees: [], months: [] });
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  const [byRevenue, setByRevenue] = useState<ErpFinanceService[]>([]);
  const [byVolume, setByVolume] = useState<ErpFinanceService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesTab, setServicesTab] = useState<'revenue' | 'volume'>('revenue');

  const [customers, setCustomers] = useState<ErpFinanceCustomer[]>([]);
  const [walkInCount, setWalkInCount] = useState(0);
  const [customersLoading, setCustomersLoading] = useState(true);

  const [drillMonth, setDrillMonth] = useState<string | null>(null);
  const [drillDays, setDrillDays] = useState<ErpFinanceDailyPoint[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef('');
  const reqId = useRef(0);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);

  const loadOverview = useCallback(async () => {
    setKpisLoading(true);
    try {
      const r = await fetchErpFinanceOverview(dateFrom, dateTo);
      setKpis(r.kpis);
      setChart(r.chart ?? []);
    } catch { setKpis(null); } finally { setKpisLoading(false); }
  }, [dateFrom, dateTo]);

  const loadOrders = useCallback(async (page = 1, search = '') => {
    const id = ++reqId.current;
    setOrdersLoading(true);
    try {
      const r = await fetchErpFinanceOrders({ from: dateFrom, to: dateTo, page, limit: ORDERS_LIMIT, search });
      if (id !== reqId.current) return;
      setOrders(r.orders ?? []);
      setOrdersTotal(r.total ?? 0);
    } catch {
      if (id === reqId.current) { setOrders([]); setError("Couldn't load orders. Check your connection and try again."); }
    } finally {
      if (id === reqId.current) setOrdersLoading(false);
    }
  }, [dateFrom, dateTo]);

  const loadEmployees = useCallback(async () => {
    setEmpLoading(true);
    try { setEmployees((await fetchErpFinanceSalesPerformance(dateFrom, dateTo)) ?? []); } catch { setEmployees([]); } finally { setEmpLoading(false); }
  }, [dateFrom, dateTo]);

  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    try {
      const r = await fetchErpFinanceServices(dateFrom, dateTo);
      setByRevenue(r.byRevenue ?? []);
      setByVolume(r.byVolume ?? []);
    } catch { setByRevenue([]); setByVolume([]); } finally { setServicesLoading(false); }
  }, [dateFrom, dateTo]);

  const loadCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const r = await fetchErpFinanceCustomers(dateFrom, dateTo);
      setCustomers(r.customers ?? []);
      setWalkInCount(r.walkInCount ?? 0);
    } catch { setCustomers([]); } finally { setCustomersLoading(false); }
  }, [dateFrom, dateTo]);

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    try { setMonthly((await fetchErpFinanceMonthlyBreakdown(dateFrom, dateTo)) ?? { employees: [], months: [] }); }
    catch { setMonthly({ employees: [], months: [] }); } finally { setMonthlyLoading(false); }
  }, [dateFrom, dateTo]);

  const loadAll = useCallback(() => {
    setError('');
    loadOverview();
    loadOrders(1, searchRef.current);
    loadEmployees();
    loadServices();
    loadCustomers();
  }, [loadOverview, loadOrders, loadEmployees, loadServices, loadCustomers]);

  useEffect(() => {
    if (!allowed) return;
    /* eslint-disable react-hooks/set-state-in-effect -- reset paging and fetch on mount / date range change */
    setOrdersPage(1);
    setDrillMonth(null);
    loadAll();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [allowed, loadAll]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when Monthly View opens
    if (allowed && showMonthly) loadMonthly();
  }, [allowed, showMonthly, loadMonthly]);

  const onRefresh = async () => {
    setRefreshing(true);
    loadAll();
    if (showMonthly) loadMonthly();
    await new Promise((r) => setTimeout(r, 600));
    setRefreshing(false);
  };

  const onSearch = (val: string) => {
    setOrdersSearch(val);
    searchRef.current = val;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setOrdersPage(1); loadOrders(1, val); }, 400);
  };

  const selectPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'pick') {
      const d = new Date();
      setPickerYear(d.getFullYear());
      setPickerMonth(d.getMonth());
      setDateFrom(isoDate(new Date(d.getFullYear(), d.getMonth(), 1)));
      setDateTo(isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0)));
    } else if (p !== 'custom') {
      const r = getPreset(p);
      setDateFrom(r.from);
      setDateTo(r.to);
    }
  };

  const applyMonth = (y: number, m: number) => {
    setPickerYear(y);
    setPickerMonth(m);
    setDateFrom(isoDate(new Date(y, m, 1)));
    setDateTo(isoDate(new Date(y, m + 1, 0)));
  };

  const onBarPress = async (ym: string) => {
    if (drillMonth === ym) { setDrillMonth(null); return; }
    setDrillMonth(ym);
    setDrillLoading(true);
    try {
      const [y, m] = ym.split('-');
      const mPad = m.padStart(2, '0');
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      setDrillDays((await fetchErpFinanceDaily(`${y}-${mPad}-01`, `${y}-${mPad}-${String(lastDay).padStart(2, '0')}`)) ?? []);
    } catch { setDrillDays([]); } finally { setDrillLoading(false); }
  };

  const exportPage = async () => {
    setExporting(true);
    try { await exportCSV(orders, dateFrom, dateTo); } catch (e) { setError(getErrorMessage(e, 'Export failed')); } finally { setExporting(false); }
  };
  const exportAll = async () => {
    setExporting(true);
    try {
      const r = await fetchErpFinanceOrders({ from: dateFrom, to: dateTo, page: 1, limit: 2000 });
      await exportCSV(r.orders ?? [], dateFrom, dateTo);
    } catch { setError('Export failed — try a shorter date range'); } finally { setExporting(false); }
  };

  // Dashboard displayOrders: "By Order" merges line items of the same order.
  const displayOrders = useMemo(() => {
    if (orderGrouping === 'lineItem') return orders;
    const keyOf = (o: ErpFinanceOrder) => (o.isHistorical ? (o.orderNumber?.trim() || `_uid_${o.id}`) : o.id);
    const seen = new Set<string>();
    const result: ErpFinanceOrder[] = [];
    const liMap: Record<string, string[]> = {};
    for (const o of orders) {
      const k = keyOf(o);
      if (!liMap[k]) liMap[k] = [];
      liMap[k].push(...(o.lineItems ?? []));
      if (!seen.has(k)) { seen.add(k); result.push(o); }
    }
    return result.map((o) => ({ ...o, lineItems: Array.from(new Set(liMap[keyOf(o)])) }));
  }, [orders, orderGrouping]);

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'ERP Finance' }} />
      {children}
    </ThemedView>
  );

  if (!allowed) {
    return shell(
      <View style={styles.denied}>
        <ThemedText themeColor="textMuted" style={styles.body}>
          You don&apos;t have access to ERP Finance. It is available to Owner and Store Manager accounts only.
        </ThemedText>
      </View>,
    );
  }

  const pad = wide ? 24 : 16;
  const inner = Math.max(0, width - pad * 2);
  const kCols = width >= TWO_COL_MIN ? 6 : wide ? 3 : 2;
  const kGap = 12;
  const kW = Math.floor((inner - kGap * (kCols - 1)) / kCols);
  const momUp = (kpis?.momGrowth ?? 0) >= 0;
  const noOrders = (kpis?.totalOrders ?? 0) === 0;
  const totalPages = Math.max(1, Math.ceil(ordersTotal / ORDERS_LIMIT));
  const hFrom = dateFrom.slice(0, 7);
  const hTo = dateTo.slice(0, 7);
  const services = servicesTab === 'revenue' ? byRevenue : byVolume;
  const yearOptions = Array.from({ length: thisYear - 2025 + 1 }, (_, i) => String(2025 + i));
  const monthOptions = MONTH_NAMES.map((n, i) => ({ value: String(i), label: n }))
    .filter((o) => !(pickerYear === thisYear && Number(o.value) > thisMonth));

  const th = (text: string, style?: object) => (
    <ThemedText themeColor="textMuted" style={[styles.th, style]}>{text.toUpperCase()}</ThemedText>
  );
  const headRow = { backgroundColor: theme.surface, borderBottomColor: theme.border };
  const rowLine = { borderBottomColor: theme.border };

  const header = (
    <View style={styles.sections}>
      <View>
        <ThemedText style={styles.h1}>Finance Records</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.subtitle}>Cash collected · Jan 2025 → present · live + historical Excel data</ThemedText>
      </View>

      {/* Date range */}
      <View style={[styles.card, styles.filterCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.chips}>
          {PRESETS.map((p) => <Chip key={p} label={PRESET_LABEL[p]} active={preset === p} onPress={() => selectPreset(p)} />)}
        </View>
        {preset === 'pick' ? (
          <View style={styles.pickRow}>
            <View style={styles.flex1}>
              <Select options={monthOptions} value={String(pickerMonth)} onChange={(v) => applyMonth(pickerYear, Number(v))} />
            </View>
            <View style={styles.flex1}>
              <Select
                options={yearOptions.map((y) => ({ value: y, label: y }))}
                value={String(pickerYear)}
                onChange={(v) => {
                  const y = Number(v);
                  applyMonth(y, y === thisYear ? Math.min(pickerMonth, thisMonth) : pickerMonth);
                }}
              />
            </View>
          </View>
        ) : null}
        {preset === 'custom' ? (
          <View style={styles.pickRow}>
            <View style={styles.flex1}><DateField label="From" value={dateFrom} onChange={(v) => v && setDateFrom(v)} compact /></View>
            <ThemedText themeColor="textMuted" style={styles.small}>to</ThemedText>
            <View style={styles.flex1}><DateField label="To" value={dateTo} onChange={(v) => v && setDateTo(v)} compact /></View>
          </View>
        ) : null}
        <ThemedText themeColor="textMuted" style={[styles.small, !wide && { textAlign: 'left' }, wide && { textAlign: 'right' }]}>{dateFrom} → {dateTo}</ThemedText>
      </View>

      {error ? <ErrorBanner message={error} onRetry={() => { loadAll(); }} /> : null}

      {/* Overview */}
      <View>
        <SectionHeader title="Overview" sub="Order Value for selected period" />
        {kpisLoading ? (
          <View style={styles.kpiGrid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.kpiSkel, { width: kW, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}><Skeleton height={64} /></View>
            ))}
          </View>
        ) : kpis ? (
          <View style={styles.kpiGrid}>
            <View style={{ width: kW }}><KPICard label="Revenue Collected" value={inr(kpis.totalRevenue)} color={theme.primary} /></View>
            <View style={{ width: kW }}><KPICard label="Total Profit" value={inr(kpis.totalProfit)} color={theme.success} /></View>
            <View style={{ width: kW }}><KPICard label="Av. Order Value" value={noOrders ? 'N/A' : inr(kpis.avgOrderValue)} mono={!noOrders} /></View>
            <View style={{ width: kW }}><KPICard label="Profit per Order" value={noOrders ? 'N/A' : inr(kpis.profitPerOrder)} mono={!noOrders} color={theme.success} /></View>
            <View style={{ width: kW }}><KPICard label="Total No of Orders" value={String(kpis.totalOrders)} mono={false} /></View>
            <View style={{ width: kW }}>
              <KPICard
                label="Month on Month Growth" mono={false}
                value={`${momUp ? '+' : ''}${kpis.momGrowth.toFixed(1)}%`}
                color={momUp ? theme.success : theme.danger} sub="vs previous period" />
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <EmptyText text="Couldn't load overview data. Check your connection and try again." />
          </View>
        )}

        <View style={[styles.card, styles.chartCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText style={styles.chartTitle}>
            Revenue Collected — Jan 2025 to Present · <ThemedText themeColor="textMuted" style={styles.chartHint}>Tap a bar for daily breakdown</ThemedText>
          </ThemedText>
          <View style={styles.legend}>
            <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: CHART_COLORS[0] }]} /><ThemedText themeColor="textMuted" style={styles.small}>Order Value</ThemedText></View>
            <View style={styles.legendItem}><View style={[styles.swatchLine, { backgroundColor: CHART_COLORS[1] }]} /><ThemedText themeColor="textMuted" style={styles.small}>Profit</ThemedText></View>
          </View>
          {kpisLoading ? <Skeleton height={192} /> : chart.length === 0 ? (
            <View style={styles.noData}><ThemedText themeColor="textMuted" style={styles.body}>No data</ThemedText></View>
          ) : (
            <RevenueChart data={chart} selected={drillMonth} onSelect={onBarPress} hFrom={hFrom} hTo={hTo} />
          )}
        </View>

        {drillMonth ? (
          <View style={[styles.card, styles.drillCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.drillHead}>
              <ThemedText style={styles.chartTitle}>
                Daily breakdown — {MONTH_NAMES[Number(drillMonth.split('-')[1]) - 1]} {drillMonth.split('-')[0]}
              </ThemedText>
              <OutlineBtn label="✕ Close" onPress={() => setDrillMonth(null)} />
            </View>
            {drillLoading ? (
              <EmptyText text="Loading..." />
            ) : drillDays.length === 0 ? (
              <EmptyText text="No daily summary data for this month" />
            ) : (
              <View>
                <View style={[styles.trow, headRow]}>
                  {th('Date', styles.cDate)}{th('Order Value', styles.cNum)}{th('Profit', styles.cNum)}{th('Orders', styles.cSm)}{th('Enquiries', styles.cSm)}
                </View>
                {drillDays.map((d, i) => (
                  <View key={i} style={[styles.trow, rowLine]}>
                    <ThemedText themeColor="textMuted" style={[styles.td, styles.cDate]}>{fmtDate(d.date)}</ThemedText>
                    <ThemedText style={[styles.td, styles.cNum, styles.mono, styles.strong]}>{inr(d.revenue)}</ThemedText>
                    <ThemedText style={[styles.td, styles.cNum, styles.mono, { color: theme.success }]}>{d.profit > 0 ? inr(d.profit) : '—'}</ThemedText>
                    <ThemedText style={[styles.td, styles.cSm]}>{d.orders || '—'}</ThemedText>
                    <ThemedText themeColor="textMuted" style={[styles.td, styles.cSm]}>{d.entries || '—'}</ThemedText>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}
      </View>

      {/* Orders heading + controls */}
      <View>
        <SectionHeader
          title="Orders"
          sub={`${ordersTotal.toLocaleString()} line items imported · ${kpis?.totalOrders?.toLocaleString() ?? '—'} total orders in period`} />
        <View style={styles.controls}>
          <View style={styles.chips}>
            <Chip small label="By Order" active={orderGrouping === 'order'} onPress={() => setOrderGrouping('order')} />
            <Chip small label="By Line Item" active={orderGrouping === 'lineItem'} onPress={() => setOrderGrouping('lineItem')} />
          </View>
          <View style={styles.chips}>
            <OutlineBtn label="Export Page" onPress={exportPage} disabled={orders.length === 0 || exporting} />
            <OutlineBtn label="Export All" onPress={exportAll} disabled={exporting} solid />
          </View>
        </View>
        <View style={styles.searchWrap}>
          <SearchBox value={ordersSearch} onChange={onSearch} />
        </View>

        {wide ? (
          <TableCard>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={[styles.trow, headRow]}>
                  {ORDER_COLS.map((c) => <ThemedText key={c.h} themeColor="textMuted" style={[styles.th, { width: c.w }]}>{c.h.toUpperCase()}</ThemedText>)}
                </View>
                {ordersLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <View key={i} style={[styles.trow, rowLine]}>
                      {ORDER_COLS.map((c) => <View key={c.h} style={{ width: c.w, paddingRight: 12 }}><Skeleton height={14} /></View>)}
                    </View>
                  ))
                ) : orders.length === 0 ? (
                  <View style={{ width: ORDER_COLS.reduce((s, c) => s + c.w, 0) }}><EmptyText text="No orders found for this period." /></View>
                ) : displayOrders.map((o) => <OrderTableRow key={o.id} o={o} line={rowLine} />)}
              </View>
            </ScrollView>
            <Pager page={ordersPage} pages={totalPages} total={ordersTotal} onPage={(p) => { setOrdersPage(p); loadOrders(p, ordersSearch); }} />
          </TableCard>
        ) : ordersLoading ? (
          <View style={styles.cardsGap}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={110} />)}</View>
        ) : orders.length === 0 ? (
          <TableCard><EmptyText text="No orders found for this period." /></TableCard>
        ) : null}
      </View>
    </View>
  );

  const footer = (
    <View style={styles.sections}>
      {!wide && !ordersLoading && orders.length > 0 ? (
        <TableCard><Pager page={ordersPage} pages={totalPages} total={ordersTotal} onPage={(p) => { setOrdersPage(p); loadOrders(p, ordersSearch); }} /></TableCard>
      ) : null}

      {/* Sales performance */}
      <View>
        <SectionHeader
          title="Sales Performance"
          sub="Order Value and Profit by employee"
          right={<OutlineBtn label="Monthly View" onPress={() => setShowMonthly((v) => !v)} solid={showMonthly} />} />
        <View style={[styles.cols, twoCol && styles.colsRow]}>
          <View style={[styles.card, styles.chartCard, twoCol && styles.flex1, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText style={styles.chartTitle}>Order Value by Employee</ThemedText>
            {empLoading ? <Skeleton height={192} /> : employees.length === 0 ? (
              <View style={styles.noData}><ThemedText themeColor="textMuted" style={styles.body}>No data</ThemedText></View>
            ) : (
              <HBarChart rows={employees.slice(0, 8).map((e) => ({ label: e.name, value: e.revenue }))} color={CHART_COLORS[0]} format={axisK} />
            )}
          </View>
          <View style={twoCol ? styles.flex1 : undefined}>
            <TableCard>
              <View style={[styles.trow, headRow]}>
                {th('Employee', styles.cName)}{th('Order Value', styles.cNum)}{th('Profit', styles.cNum)}{th('Orders', styles.cSm)}
              </View>
              {empLoading ? <SkeletonRows n={5} /> : employees.length === 0 ? <EmptyText text="No data" /> : employees.map((e, i) => (
                <View key={i} style={[styles.trow, rowLine]}>
                  <View style={styles.cName}>
                    <ThemedText numberOfLines={1} style={[styles.td, styles.medium]}>{e.name}</ThemedText>
                    {e.designation ? <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.tiny}>{e.designation}</ThemedText> : null}
                  </View>
                  <ThemedText style={[styles.td, styles.cNum, styles.mono, styles.strong]}>{inr(e.revenue)}</ThemedText>
                  <ThemedText style={[styles.td, styles.cNum, styles.mono, { color: theme.success }]}>{e.profit > 0 ? inr(e.profit) : '—'}</ThemedText>
                  <ThemedText style={[styles.td, styles.cSm, styles.medium]}>{e.orderCount}</ThemedText>
                </View>
              ))}
            </TableCard>
          </View>
        </View>

        {showMonthly ? (
          <View style={styles.monthlyWrap}>
            <TableCard>
              <View style={[styles.monthlyHead, rowLine]}><ThemedText style={styles.chartTitle}>Monthly Revenue by Employee</ThemedText></View>
              {monthlyLoading ? <EmptyText text="Loading..." /> : monthly.employees.length === 0 ? <EmptyText text="No data for selected period" /> : (
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View>
                    <View style={[styles.trow, headRow]}>
                      <ThemedText themeColor="textMuted" style={[styles.th, styles.mEmp]}>EMPLOYEE</ThemedText>
                      {monthly.months.map((m) => (
                        <ThemedText key={m} themeColor="textMuted" style={[styles.th, styles.mCell]}>
                          {`${MONTH_NAMES[Number(m.split('-')[1]) - 1]} '${m.split('-')[0].slice(2)}`.toUpperCase()}
                        </ThemedText>
                      ))}
                      <ThemedText themeColor="textMuted" style={[styles.th, styles.mCell]}>TOTAL</ThemedText>
                    </View>
                    {monthly.employees.map((emp, i) => (
                      <View key={i} style={[styles.trow, rowLine]}>
                        <ThemedText numberOfLines={1} style={[styles.td, styles.mEmp, styles.medium]}>{emp.name}</ThemedText>
                        {emp.monthly.map((m, j) => (
                          <ThemedText key={j} style={[styles.td, styles.mCell, styles.mono, m.revenue <= 0 && { color: theme.textMuted }]}>
                            {m.revenue > 0 ? `₹${Math.round(m.revenue / 1000)}k` : '—'}
                          </ThemedText>
                        ))}
                        <ThemedText style={[styles.td, styles.mCell, styles.mono, styles.strong, { color: theme.primary }]}>₹{(emp.total / 100000).toFixed(1)}L</ThemedText>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </TableCard>
          </View>
        ) : null}
      </View>

      {/* Services */}
      <View>
        <SectionHeader
          title="Services"
          right={
            <View style={styles.chips}>
              <Chip small label="By Order Value" active={servicesTab === 'revenue'} onPress={() => setServicesTab('revenue')} />
              <Chip small label="By Volume" active={servicesTab === 'volume'} onPress={() => setServicesTab('volume')} />
            </View>
          } />
        <View style={[styles.cols, twoCol && styles.colsRow]}>
          <View style={[styles.card, styles.chartCard, twoCol && styles.flex1, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {servicesLoading ? <Skeleton height={224} /> : services.length === 0 ? (
              <View style={styles.noData}><ThemedText themeColor="textMuted" style={styles.body}>No data</ThemedText></View>
            ) : (
              <HBarChart
                rows={services.map((s) => ({ label: s.service, value: servicesTab === 'revenue' ? s.revenue : (s.volume ?? 0) }))}
                color={CHART_COLORS[2]}
                format={servicesTab === 'revenue' ? axisK : (v) => String(Math.round(v))} />
            )}
          </View>
          <View style={twoCol ? styles.flex1 : undefined}>
            <TableCard>
              <View style={[styles.trow, headRow]}>
                {th('Service', styles.cName)}{th('Order Value', [styles.cNum, styles.right])}{th(servicesTab === 'revenue' ? 'Orders' : 'Units', [styles.cSm, styles.right])}
              </View>
              {servicesLoading ? <SkeletonRows n={6} /> : services.length === 0 ? <EmptyText text="No data" /> : services.map((s, i) => (
                <View key={i} style={[styles.trow, rowLine]}>
                  <ThemedText style={[styles.td, styles.cName, styles.medium]}>{s.service}</ThemedText>
                  <ThemedText style={[styles.td, styles.cNum, styles.mono, styles.right]}>{inr(s.revenue)}</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.td, styles.cSm, styles.right]}>
                    {servicesTab === 'revenue' ? (s.orderCount ?? 0) : Math.round(s.volume ?? 0)}
                  </ThemedText>
                </View>
              ))}
            </TableCard>
          </View>
        </View>
      </View>

      {/* Top customers */}
      <View>
        <SectionHeader title="Top Customers" sub="Ranked by total spend in selected period" />
        <TableCard>
          {wide ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fillW}>
              <View style={styles.flex1}>
                <View style={[styles.trow, headRow]}>
                  {th('#', styles.cRank)}{th('Customer', styles.cName)}{th('Phone', styles.cPhone)}{th('Total Order Value', styles.cNum)}{th('Orders', styles.cSm)}{th('Last Visit', styles.cDate)}
                </View>
                {customersLoading ? <SkeletonRows n={8} /> : customers.length === 0 ? <EmptyText text="No customer data for this period." /> : customers.map((c, i) => (
                  <View key={i} style={[styles.trow, rowLine]}>
                    <ThemedText style={[styles.td, styles.cRank, styles.bold, { color: i < 3 ? theme.primary : theme.textMuted }]}>{i + 1}</ThemedText>
                    <ThemedText numberOfLines={1} style={[styles.td, styles.cName, styles.medium]}>{c.name}</ThemedText>
                    <ThemedText themeColor="textMuted" style={[styles.td, styles.cPhone]}>{c.phone ?? '—'}</ThemedText>
                    <ThemedText style={[styles.td, styles.cNum, styles.mono, styles.strong]}>{inr(c.totalSpend)}</ThemedText>
                    <ThemedText style={[styles.td, styles.cSm, styles.medium]}>{c.orderCount}</ThemedText>
                    <ThemedText themeColor="textMuted" style={[styles.td, styles.cDate]}>{fmtDate(c.lastVisit)}</ThemedText>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : customersLoading ? <SkeletonRows n={6} /> : customers.length === 0 ? <EmptyText text="No customer data for this period." /> : customers.map((c, i) => (
            <View key={i} style={[styles.custRow, rowLine]}>
              <ThemedText style={[styles.bold, styles.custRank, { color: i < 3 ? theme.primary : theme.textMuted }]}>{i + 1}</ThemedText>
              <View style={styles.flex1}>
                <ThemedText numberOfLines={1} style={styles.medium}>{c.name}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.tiny}>{c.phone ?? '—'} · Last visit {fmtDate(c.lastVisit)}</ThemedText>
              </View>
              <View style={styles.right}>
                <ThemedText style={[styles.mono, styles.strong]}>{inr(c.totalSpend)}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.tiny}>{c.orderCount} orders</ThemedText>
              </View>
            </View>
          ))}
        </TableCard>
        {walkInCount > 0 ? (
          <ThemedText themeColor="textMuted" style={[styles.small, styles.walkIn]}>ℹ {walkInCount.toLocaleString()} Walk-in line items excluded from Top Customers list.</ThemedText>
        ) : null}
      </View>

      {/* Historical notice */}
      <View style={[styles.notice, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.dot, { backgroundColor: theme.success }]} />
        <ThemedText themeColor="textMuted" style={[styles.small, styles.flex1]}>
          <ThemedText style={[styles.small, styles.bold]}>13,530 historical line items (Jan 2025 – Jul 2026)</ThemedText>
          {' imported from Excel records and merged across all sections. Historical rows are tagged '}
          <ThemedText style={[styles.small, styles.bold, { color: theme.warning, backgroundColor: withAlpha(theme.warning, 0.13) }]}> HIST </ThemedText>
          {' in the Orders table. Profit data available for ~32% of line items (stored per service row).'}
        </ThemedText>
      </View>
    </View>
  );

  return shell(
    <FlatList
      data={!wide && !ordersLoading ? displayOrders : []}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => <OrderCard o={item} />}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ItemSeparatorComponent={Gap}
      contentContainerStyle={[styles.page, { padding: pad, paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={10}
      windowSize={7}
    />,
  );
}

function Gap() { return <View style={{ height: 12 }} />; }

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search customer or order #"
        placeholderTextColor={theme.textMuted}
        autoCorrect={false}
        accessibilityLabel="Search orders"
        style={[styles.searchInput, { color: theme.text }]}
      />
    </View>
  );
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const theme = useTheme();
  if (pages <= 1) return null;
  return (
    <View style={[styles.pager, { borderTopColor: theme.border }]}>
      <ThemedText themeColor="textMuted" style={styles.small}>Page {page} of {pages} · {total} total</ThemedText>
      <View style={styles.chips}>
        <OutlineBtn label="← Prev" onPress={() => onPage(Math.max(1, page - 1))} disabled={page === 1} />
        <OutlineBtn label="Next →" onPress={() => onPage(Math.min(pages, page + 1))} disabled={page === pages} />
      </View>
    </View>
  );
}

function marginOf(o: ErpFinanceOrder) {
  return o.profit != null && (o.amount ?? 0) > 0 ? (o.profit / (o.amount as number)) * 100 : null;
}

function OrderTableRow({ o, line }: { o: ErpFinanceOrder; line: object }) {
  const theme = useTheme();
  const margin = marginOf(o);
  const mc = margin == null ? theme.textMuted : margin > 40 ? theme.success : margin > 20 ? theme.warning : theme.danger;
  const items = (o.lineItems ?? []).join(', ');
  const W = (i: number) => ({ width: ORDER_COLS[i].w, paddingRight: 12 });
  return (
    <View style={[styles.trow, line, { opacity: o.isHistorical ? 0.85 : 1 }]}>
      <ThemedText themeColor="textMuted" style={[styles.td, W(0)]}>{fmtDate(o.date)}</ThemedText>
      <View style={[W(1), styles.idCell]}>
        <ThemedText numberOfLines={1} style={[styles.td, styles.mono, { color: theme.primary, flexShrink: 1 }]}>{o.orderNumber || '—'}</ThemedText>
        {o.isHistorical ? <HistBadge /> : null}
      </View>
      <ThemedText numberOfLines={1} style={[styles.td, styles.medium, W(2)]}>{o.customerName}</ThemedText>
      <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.td, W(3)]}>{o.vehicleModel || '—'}</ThemedText>
      <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.td, W(4)]}>{items || '—'}</ThemedText>
      <ThemedText themeColor="textMuted" style={[styles.td, W(5)]}>{o.qty != null ? o.qty : '—'}</ThemedText>
      <View style={[W(6), styles.idCell]}>
        <ThemedText themeColor="textMuted" style={[styles.td, styles.mono]}>{o.unitPrice != null ? inr(o.unitPrice) : '—'}</ThemedText>
        {o.unitPrice != null && (o.amount ?? 0) > 0 && o.unitPrice > (o.amount as number) ? (
          <ThemedText accessibilityLabel="Unit price exceeds order value — possible data entry error" style={{ color: theme.warning, fontSize: 12 }}>⚠</ThemedText>
        ) : null}
      </View>
      <ThemedText style={[styles.td, styles.mono, styles.strong, W(7)]}>{inr(o.amount ?? 0)}</ThemedText>
      <ThemedText style={[styles.td, styles.mono, { color: theme.success }, W(8)]}>{o.profit != null ? inr(o.profit) : '—'}</ThemedText>
      <ThemedText style={[styles.td, styles.bold, W(9), margin != null && { color: mc }]}>{margin != null ? `${margin.toFixed(1)}%` : '—'}</ThemedText>
      <View style={W(10)}><StatusBadge status={o.status} /></View>
      <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.td, W(11)]}>{o.soldBy || '—'}</ThemedText>
      <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.td, W(12)]}>{o.remarks || '—'}</ThemedText>
    </View>
  );
}

function OrderCard({ o }: { o: ErpFinanceOrder }) {
  const theme = useTheme();
  const margin = marginOf(o);
  const mc = margin == null ? theme.textMuted : margin > 40 ? theme.success : margin > 20 ? theme.warning : theme.danger;
  const items = (o.lineItems ?? []).join(', ');
  return (
    <View style={[styles.card, styles.orderCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: o.isHistorical ? 0.85 : 1 }]}>
      <View style={styles.ocTop}>
        <View style={styles.flex1}>
          <ThemedText numberOfLines={1} style={styles.medium}>{o.customerName}</ThemedText>
          <View style={styles.idCell}>
            <ThemedText numberOfLines={1} style={[styles.small, styles.mono, { color: theme.primary, flexShrink: 1 }]}>{o.orderNumber || '—'}</ThemedText>
            {o.isHistorical ? <HistBadge /> : null}
          </View>
        </View>
        <View style={styles.right}>
          <ThemedText style={[styles.mono, styles.strong]}>{inr(o.amount ?? 0)}</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.tiny}>{fmtDate(o.date)}</ThemedText>
        </View>
      </View>
      <ThemedText themeColor="textMuted" style={styles.small}>{[o.vehicleModel, items].filter(Boolean).join(' · ') || '—'}</ThemedText>
      <View style={styles.ocStats}>
        <ThemedText themeColor="textMuted" style={styles.small}>Qty {o.qty != null ? o.qty : '—'}</ThemedText>
        <ThemedText themeColor="textMuted" style={[styles.small, styles.mono]}>
          Unit {o.unitPrice != null ? inr(o.unitPrice) : '—'}
          {o.unitPrice != null && (o.amount ?? 0) > 0 && o.unitPrice > (o.amount as number) ? <ThemedText style={{ color: theme.warning }}> ⚠</ThemedText> : null}
        </ThemedText>
        <ThemedText style={[styles.small, styles.mono, { color: theme.success }]}>Profit {o.profit != null ? inr(o.profit) : '—'}</ThemedText>
        <ThemedText style={[styles.small, styles.bold, margin != null && { color: mc }]}>{margin != null ? `${margin.toFixed(1)}%` : '—'}</ThemedText>
      </View>
      <View style={styles.ocBottom}>
        <StatusBadge status={o.status} />
        <ThemedText themeColor="textMuted" style={styles.tiny}>{o.soldBy ? `Sold by ${o.soldBy}` : '—'}</ThemedText>
      </View>
      {o.remarks ? <ThemedText themeColor="textMuted" numberOfLines={2} style={styles.small}>{o.remarks}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 1400, alignSelf: 'center' },
  sections: { gap: 32 },
  denied: { alignItems: 'center', justifyContent: 'center', paddingVertical: 120, paddingHorizontal: 24 },
  body: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 12 },
  filterCard: { padding: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  small: { fontSize: 12, lineHeight: 16 },
  tiny: { fontSize: 11, lineHeight: 15 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  kpiSkel: { borderWidth: 1, borderRadius: 12, padding: 20 },
  chartCard: { padding: 20, gap: 12 },
  chartTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  chartHint: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.regular },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 2 },
  swatchLine: { width: 16, height: 2 },
  noData: { height: 192, alignItems: 'center', justifyContent: 'center' },
  drillCard: { padding: 16, marginTop: 16, gap: 12 },
  drillHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  controls: { gap: 8, marginBottom: 8 },
  searchWrap: { marginBottom: 12 },
  search: { borderWidth: 1, borderRadius: 8, minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' },
  searchInput: { fontSize: 14, paddingVertical: 8 },
  cardsGap: { gap: 12 },
  orderCard: { padding: 14, gap: 6 },
  ocTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  ocStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  ocBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  right: { alignItems: 'flex-end', textAlign: 'right' },
  idCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  th: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.5, paddingRight: 12 },
  td: { fontSize: 13, lineHeight: 18 },
  mono: { fontFamily: Fonts?.mono },
  strong: { fontFamily: FontWeights.semiBold },
  medium: { fontFamily: FontWeights.medium },
  bold: { fontFamily: FontWeights.bold },
  cDate: { width: 96 },
  cName: { flex: 1, minWidth: 80, paddingRight: 8 },
  cNum: { width: 92, paddingRight: 8 },
  cSm: { width: 56, paddingRight: 8 },
  cRank: { width: 32 },
  cPhone: { width: 120 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: 16, borderTopWidth: 1 },
  cols: { gap: 24 },
  colsRow: { flexDirection: 'row', alignItems: 'flex-start' },
  monthlyWrap: { marginTop: 24 },
  monthlyHead: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  mEmp: { width: 130, paddingRight: 8 },
  mCell: { width: 90, textAlign: 'right', paddingRight: 12 },
  fillW: { flexGrow: 1 },
  custRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1 },
  custRank: { width: 20, fontSize: 12 },
  walkIn: { marginTop: 8, paddingHorizontal: 4 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
