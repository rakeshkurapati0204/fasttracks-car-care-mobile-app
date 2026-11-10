import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { buildInvoicePayload, formFromInvoice, InvoiceEditSheet, type InvoiceFormState } from '@/components/invoices/edit-sheet';
import {
  INVOICE_STATUS_OPTIONS, PAGE_SIZE, STATUS_META, WIDE_MIN, buildInvoiceText, canPrint, fmtDate, fmtINR, paymentLabel, PRINT_LOCK_TEXT,
} from '@/components/invoices/helpers';
import { OpenInvoices } from '@/components/invoices/open-list';
import { InvoiceReports } from '@/components/invoices/reports';
import { InvoiceViewSheet } from '@/components/invoices/view-sheet';
import { NewInvoiceWizard } from '@/components/invoices/wizard';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Select, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteInvoice, fetchInvoiceFull, fetchInvoicePaymentHistory, fetchInvoiceStats, fetchInvoicesPage, generateInvoiceWaybill, getErrorMessage,
  recordInvoicePayment, sendInvoiceEmail, sendInvoiceWhatsapp, updateInvoiceRaw,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import type { InvoiceFull, InvoiceRow, InvoiceStats } from '@/types/api';

// Mirrors the dashboard's Sales Invoices page (invoices/page.tsx) plus New Invoice (new/page.tsx), Open Invoices
// (open/page.tsx) and the print page's content. Permissions follow the dashboard: the resolved 'invoices' mode
// (view_only / create_collect / full_access) decides what a user can do; full_access = edit, delete, waybill,
// cancel; create_collect and up can create and collect payments. The server re-checks every one of them.
// "Print" is the OS share sheet with the print page's blocks in its order (no PDF package in the app).
const COLS = [
  { label: 'Invoice #', col: 'invoiceNumber', w: 130 }, { label: 'Date', col: 'createdAt', w: 100 }, { label: 'Customer', col: 'customerName', w: 160 },
  { label: 'Vehicle', col: 'vehicleNumber', w: 130 }, { label: 'Amount', col: 'grandTotal', w: 100 }, { label: 'Paid', col: 'paidAmount', w: 90 },
  { label: 'Status', col: 'status', w: 120 }, { label: 'Payment', col: 'paymentMode', w: 100 }, { label: 'Actions', col: '', w: 130 },
];
const SORT_OPTIONS = COLS.filter((c) => c.col).map((c) => ({ value: c.col, label: c.label }));

export default function InvoicesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const { hasTab, tabMode } = usePermissions();
  const mode = tabMode('invoices');
  const enabled = hasTab('invoices');
  const isAdmin = enabled && mode === 'full_access';
  const canRecordPayment = enabled && (mode === 'create_collect' || mode === 'full_access');
  const canCreate = canRecordPayment;
  const isSales = user?.role === 'SALES';

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;

  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const [screen, setScreen] = useState<'list' | 'new' | 'open'>('list');
  const [resume, setResume] = useState<{ invoice: InvoiceFull; step: 1 | 2 | 3 } | undefined>(undefined);
  const [tab, setTab] = useState<'invoices' | 'reports'>('invoices');

  const [stats, setStats] = useState<InvoiceStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [view, setView] = useState<{ invoice: InvoiceFull; pay: boolean } | null>(null);
  const [viewBusy, setViewBusy] = useState(false);
  const [edit, setEdit] = useState<InvoiceFull | null>(null);
  const [form, setForm] = useState<InvoiceFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (isSales) { setStatsLoading(false); return; } // SALES: skip company-wide stats
    setStatsLoading(true);
    try { setStats(await fetchInvoiceStats()); } catch { /* ignore, like the dashboard */ } finally { setStatsLoading(false); }
  }, [isSales]);

  const load = useCallback(async () => {
    setLoading(true); setLoadError('');
    try {
      const r = await fetchInvoicesPage({ page, limit: PAGE_SIZE, sortBy: sortCol, sortDir, search, status: filterStatus, from: filterFrom, to: filterTo });
      setInvoices(r.items); setTotalCount(r.total);
    } catch { setLoadError('Failed to load invoices.'); showToast(false, 'Failed to load invoices.'); }
    finally { setLoading(false); }
  }, [page, sortCol, sortDir, search, filterStatus, filterFrom, filterTo, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on filter change
    load();
  }, [load]);

  // Search runs 400 ms after the last keystroke (the dashboard searches on every keystroke).
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const refreshAll = () => { load(); loadStats(); };
  const onRefresh = async () => { setRefreshing(true); await Promise.all([load(), loadStats()]); setRefreshing(false); };

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  };

  // GET /invoices (the list) has no line items; only the detail route does.
  const fetchFull = async (id: string): Promise<InvoiceFull | null> => {
    try { return await fetchInvoiceFull(id); } catch { showToast(false, 'Failed to load invoice details.'); return null; }
  };

  const openView = async (id: string, pay = false) => {
    setOpeningId(id);
    const full = await fetchFull(id);
    setOpeningId(null);
    if (full) setView({ invoice: full, pay });
  };

  const openEdit = async (id: string) => {
    setOpeningId(id);
    const full = await fetchFull(id);
    setOpeningId(null);
    if (!full) return;
    setForm(formFromInvoice(full)); setEdit(full); setModalError(''); setView(null);
  };

  const printInvoice = async (id: string) => {
    setOpeningId(id);
    const full = await fetchFull(id);
    if (full) {
      if (!canPrint(full.status)) Alert.alert('Invoice Not Yet Paid', PRINT_LOCK_TEXT(full.status));
      else {
        const history = await fetchInvoicePaymentHistory(id).catch(() => []);
        try { await Share.share({ message: buildInvoiceText(full, history), title: `Invoice ${full.invoiceNumber}` }); } catch { /* share sheet dismissed */ }
      }
    }
    setOpeningId(null);
  };

  const handleDelete = (inv: InvoiceRow) => {
    Alert.alert(`Delete invoice ${inv.invoiceNumber}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteInvoice(inv.id); showToast(true, 'Invoice deleted.'); refreshAll(); } catch { showToast(false, 'Failed to delete invoice.'); }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form || !edit) return;
    setModalError('');
    const built = buildInvoicePayload(form);
    if ('error' in built) { setModalError(built.error); return; }
    setSaving(true);
    try {
      await updateInvoiceRaw(edit.id, built.payload);
      showToast(true, 'Invoice updated.');
      setEdit(null); setForm(null); refreshAll();
    } catch (e) { setModalError(getErrorMessage(e, 'Failed to save invoice.')); }
    finally { setSaving(false); }
  };

  const handleRecordPayment = async (inv: InvoiceFull, amount: number, method: string) => {
    setViewBusy(true);
    try {
      await recordInvoicePayment(inv.id, amount, method);
      showToast(true, amount >= inv.grandTotal ? 'Invoice fully paid!' : `₹${amount.toFixed(0)} recorded — balance remaining.`);
      const updated = await fetchFull(inv.id);
      if (updated) setView({ invoice: updated, pay: false });
      refreshAll();
    } catch (e) { showToast(false, getErrorMessage(e, 'Failed to record payment.')); }
    finally { setViewBusy(false); }
  };

  const handleWaybill = async (inv: InvoiceFull) => {
    setViewBusy(true);
    try { const r = await generateInvoiceWaybill(inv.id); showToast(true, `Waybill: ${r.waybillNo || 'Generated'}`); load(); }
    catch { showToast(false, 'Failed to generate waybill.'); }
    finally { setViewBusy(false); }
  };

  const handleEmail = async (inv: InvoiceFull) => {
    setViewBusy(true);
    try { await sendInvoiceEmail(inv.id); showToast(true, 'Invoice emailed to customer.'); }
    catch (e) { showToast(false, getErrorMessage(e, 'Failed to send email.')); }
    finally { setViewBusy(false); }
  };

  const handleWhatsApp = async (inv: InvoiceFull) => {
    setViewBusy(true);
    try { await sendInvoiceWhatsapp(inv.id); showToast(true, 'Invoice sent via WhatsApp.'); }
    catch (e) { showToast(false, getErrorMessage(e, 'Failed to send WhatsApp.')); }
    finally { setViewBusy(false); }
  };

  // Open Invoices → resume in the wizard (Complete Invoice → Items, Edit → Customer & Vehicle).
  const resumeInWizard = async (id: string, step: 1 | 2) => {
    const full = await fetchFull(id);
    if (full) { setResume({ invoice: full, step }); setScreen('new'); }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const filtersActive = !!(search || filterStatus || filterFrom || filterTo);
  const clearFilters = () => { setSearchInput(''); setSearch(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); setPage(1); };

  const renderActions = (inv: InvoiceRow) => (
    <View style={styles.actions}>
      <Pressable onPress={() => openView(inv.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel="View" style={[styles.act, { backgroundColor: 'rgba(59,130,246,0.12)' }]}><Ionicons name="eye-outline" size={16} color="#2563eb" /></Pressable>
      {isAdmin ? <Pressable onPress={() => openEdit(inv.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Edit" style={[styles.act, { backgroundColor: 'rgba(245,158,11,0.12)' }]}><Ionicons name="create-outline" size={16} color="#b45309" /></Pressable> : null}
      <Pressable onPress={() => printInvoice(inv.id)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Print" style={[styles.act, { backgroundColor: 'rgba(100,116,139,0.12)' }]}><Ionicons name="print-outline" size={16} color="#475569" /></Pressable>
      {isAdmin ? <Pressable onPress={() => handleDelete(inv)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Delete" style={[styles.act, { backgroundColor: 'rgba(239,68,68,0.12)' }]}><Ionicons name="trash-outline" size={16} color="#b91c1c" /></Pressable> : null}
    </View>
  );

  const badge = (status: string) => { const st = STATUS_META[status] ?? STATUS_META.DRAFT; return <View style={[styles.badge, { backgroundColor: st.bg }]}><ThemedText style={[styles.badgeText, { color: st.color }]}>{st.label}</ThemedText></View>; };
  const payCell = (inv: InvoiceRow) => (inv.paymentMode === 'SPLIT' ? `Split (${Array.isArray(inv.splitPayments) ? inv.splitPayments.length : '—'})` : paymentLabel(inv.paymentMode));

  const statCards = [
    { label: 'Total Invoices', value: stats ? String(stats.total ?? 0) : '' },
    { label: 'This Month', value: stats ? fmtINR(stats.monthRevenue ?? 0) : '' },
    { label: 'Today', value: stats ? fmtINR(stats.todayRevenue ?? 0) : '' },
    { label: 'Outstanding', value: stats ? fmtINR(stats.totalOutstanding ?? 0) : '' },
    { label: 'Collected', value: stats ? fmtINR(stats.totalCollected ?? 0) : '' },
  ];

  const table = (
    <View style={[styles.table, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={[styles.tr, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        {COLS.map((c) => (
          <Pressable key={c.label} disabled={!c.col} onPress={() => toggleSort(c.col)} style={{ width: c.w }}>
            <ThemedText themeColor="textMuted" style={styles.th}>{c.label}{c.col && sortCol === c.col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}</ThemedText>
          </Pressable>
        ))}
      </View>
      {invoices.map((inv) => (
        <View key={inv.id} style={[styles.tr, { borderBottomColor: theme.border }]}>
          <ThemedText numberOfLines={1} style={[styles.mono, { width: COLS[0].w, color: theme.primary }]}>{inv.invoiceNumber}</ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.small, { width: COLS[1].w }]}>{fmtDate(inv.createdAt)}</ThemedText>
          <View style={{ width: COLS[2].w }}>
            <ThemedText numberOfLines={1} style={styles.medium}>{inv.customerName || '—'}</ThemedText>
            {inv.customerPhone ? <ThemedText themeColor="textMuted" style={styles.small}>{inv.customerPhone}</ThemedText> : null}
          </View>
          <View style={{ width: COLS[3].w }}>
            {inv.vehicleNumber ? <><ThemedText style={[styles.small, styles.semi]}>{inv.vehicleNumber}</ThemedText><ThemedText themeColor="textMuted" style={styles.small}>{[inv.vehicleBrand, inv.vehicleModel].filter(Boolean).join(' ')}</ThemedText></> : <ThemedText themeColor="textSecondary" style={styles.small}>—</ThemedText>}
          </View>
          <ThemedText style={[styles.p, styles.semi, { width: COLS[4].w }]}>{fmtINR(inv.grandTotal)}</ThemedText>
          <ThemedText style={[styles.p, styles.semi, { width: COLS[5].w, color: inv.paidAmount > 0 ? '#16a34a' : theme.textMuted }]}>{fmtINR(inv.paidAmount)}</ThemedText>
          <View style={{ width: COLS[6].w }}>{badge(inv.status)}</View>
          <ThemedText themeColor="textSecondary" style={[styles.small, { width: COLS[7].w }, inv.paymentMode === 'SPLIT' && { color: theme.primary }]}>{payCell(inv)}</ThemedText>
          <View style={{ width: COLS[8].w }}>{renderActions(inv)}</View>
        </View>
      ))}
    </View>
  );

  const cards = (
    <View style={styles.gap}>
      {invoices.map((inv) => (
        <Pressable key={inv.id} onPress={() => openView(inv.id)} disabled={openingId === inv.id} accessibilityRole="button" style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.between}>
            <ThemedText numberOfLines={1} style={[styles.mono, { color: theme.primary, flex: 1 }]}>{inv.invoiceNumber}</ThemedText>
            {badge(inv.status)}
          </View>
          <ThemedText style={styles.medium}>{inv.customerName || '—'}</ThemedText>
          {inv.customerPhone ? <ThemedText themeColor="textMuted" style={styles.small}>{inv.customerPhone}</ThemedText> : null}
          <View style={styles.between}><ThemedText themeColor="textMuted" style={styles.small}>{fmtDate(inv.createdAt)}</ThemedText><ThemedText themeColor="textSecondary" style={styles.small}>{inv.vehicleNumber ? `${inv.vehicleNumber} ${[inv.vehicleBrand, inv.vehicleModel].filter(Boolean).join(' ')}` : '—'}</ThemedText></View>
          <View style={[styles.cardFoot, { borderTopColor: theme.border }]}>
            <View>
              <ThemedText style={[styles.p, styles.semi]}>{fmtINR(inv.grandTotal)}</ThemedText>
              <ThemedText style={[styles.small, { color: inv.paidAmount > 0 ? '#16a34a' : theme.textMuted }]}>Paid {fmtINR(inv.paidAmount)} · {payCell(inv)}</ThemedText>
            </View>
            {renderActions(inv)}
          </View>
        </Pressable>
      ))}
    </View>
  );

  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, i) => Math.max(1, Math.min(totalPages - 4, page - 2)) + i);

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: screen === 'new' ? 'New Invoice' : screen === 'open' ? 'Open Invoices' : 'Sales Invoices' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} keyboardShouldPersistTaps="handled">
        {screen === 'new' ? (
          <NewInvoiceWizard
            key={resume?.invoice.id ?? 'new'}
            userId={user?.id ?? ''}
            wide={wide}
            resume={resume}
            onClose={() => { setScreen('list'); setResume(undefined); refreshAll(); }}
            onViewInvoice={(id) => { setScreen('list'); setResume(undefined); refreshAll(); openView(id); }}
          />
        ) : screen === 'open' ? (
          <OpenInvoices
            wide={wide}
            notify={showToast}
            onBack={() => { setScreen('list'); refreshAll(); }}
            onComplete={(id) => resumeInWizard(id, 2)}
            onEdit={(id) => resumeInWizard(id, 1)}
            onCollect={(id) => { setScreen('list'); openView(id, true); }}
          />
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.flex1}>
                <ThemedText style={styles.title}>Sales Invoices</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.sub}>Manage service invoices, billing and reports.</ThemedText>
              </View>
              {canCreate ? <Button icon="add" onPress={() => { setResume(undefined); setScreen('new'); }}>New Invoice</Button> : null}
            </View>

            {!isSales ? (
              <View style={styles.stats}>
                {statCards.map((s) => (
                  <View key={s.label} style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.statWide]}>
                    <ThemedText themeColor="textMuted" style={styles.small}>{s.label}</ThemedText>
                    {statsLoading ? <Skeleton height={20} /> : <ThemedText style={styles.statValue}>{s.value}</ThemedText>}
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.btns}>
              <Pressable onPress={() => setScreen('open')} accessibilityRole="button" style={[styles.open, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.3)' }]}>
                <ThemedText style={{ color: '#dc2626', fontSize: 14, fontFamily: FontWeights.semiBold }}>Open Invoices</ThemedText>
              </Pressable>
            </View>

            <View style={[styles.track, { backgroundColor: theme.surface }]}>
              {(['invoices', 'reports'] as const).filter((t) => !isSales || t === 'invoices').map((t) => (
                <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} style={[styles.tabBtn, { backgroundColor: tab === t ? theme.primary : 'transparent' }]}>
                  <ThemedText style={[styles.tabText, { color: tab === t ? '#fff' : theme.textMuted }]}>{t === 'invoices' ? 'All Invoices' : 'Reports'}</ThemedText>
                </Pressable>
              ))}
            </View>

            {tab === 'invoices' ? (
              <View style={styles.gap}>
                <View style={[styles.filters, wide && styles.filtersWide]}>
                  <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, wide && styles.flex1]}>
                    <Ionicons name="search" size={16} color={theme.textMuted} />
                    <TextInput value={searchInput} onChangeText={setSearchInput} placeholder="Search invoice#, customer, vehicle, phone..." placeholderTextColor={theme.textMuted} autoCapitalize="none" autoCorrect={false} style={[styles.searchInput, { color: theme.text }]} />
                  </View>
                  <View style={wide ? styles.w160 : undefined}><Select value={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1); }} options={INVOICE_STATUS_OPTIONS} /></View>
                  <View style={wide ? styles.w150 : undefined}><DateField label="From" compact value={filterFrom} onChange={(v) => { setFilterFrom(v); setPage(1); }} /></View>
                  <View style={wide ? styles.w150 : undefined}><DateField label="To" compact value={filterTo} onChange={(v) => { setFilterTo(v); setPage(1); }} /></View>
                  {!wide ? (
                    <View style={styles.sortRow}>
                      <View style={styles.flex1}><Select value={sortCol} onChange={(v) => { setSortCol(v); setPage(1); }} options={SORT_OPTIONS} /></View>
                      <Button variant="outline" onPress={() => { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); setPage(1); }}>{sortDir === 'asc' ? '↑' : '↓'}</Button>
                    </View>
                  ) : null}
                  {filtersActive ? <Button variant="outline" onPress={clearFilters}>Clear</Button> : null}
                </View>

                {loadError && invoices.length > 0 ? <ErrorBanner message={loadError} onRetry={load} /> : null}
                {loading && invoices.length === 0 ? (
                  <View style={styles.gap}><Skeleton height={wide ? 44 : 130} /><Skeleton height={wide ? 44 : 130} /><Skeleton height={wide ? 44 : 130} /></View>
                ) : invoices.length === 0 ? (
                  <ThemedText themeColor="textMuted" style={styles.empty}>{loadError ? 'Could not load invoices.' : 'No invoices found.'}</ThemedText>
                ) : (
                  <View style={loading ? styles.dim : undefined}>{wide ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{table}</ScrollView> : cards}</View>
                )}

                {totalPages > 1 ? (
                  <View style={[styles.pager, wide && styles.pagerWide]}>
                    <ThemedText themeColor="textMuted" style={styles.small}>Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}</ThemedText>
                    <View style={styles.pagerBtns}>
                      <Button variant="outline" size="sm" disabled={page <= 1 || loading} onPress={() => setPage((p) => p - 1)}>Previous</Button>
                      {pageNumbers.map((p) => (
                        <Pressable key={p} onPress={() => setPage(p)} accessibilityRole="button" style={[styles.pageNum, { backgroundColor: page === p ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
                          <ThemedText style={[styles.small, { color: page === p ? '#fff' : theme.text }]}>{p}</ThemedText>
                        </Pressable>
                      ))}
                      <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onPress={() => setPage((p) => p + 1)}>Next</Button>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : (
              <InvoiceReports wide={wide} onError={(m) => showToast(false, m)} />
            )}
          </>
        )}
      </ScrollView>

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 16, backgroundColor: toast.ok ? '#22c55e' : '#ef4444' }]}>
          <ThemedText style={styles.toastText}>{toast.msg}</ThemedText>
        </View>
      ) : null}

      {view ? (
        <InvoiceViewSheet
          key={view.invoice.id + view.invoice.paidAmount}
          invoice={view.invoice}
          isAdmin={isAdmin}
          canRecordPayment={canRecordPayment}
          startWithPayment={view.pay}
          busy={viewBusy}
          wide={wide}
          onClose={() => setView(null)}
          onEdit={() => openEdit(view.invoice.id)}
          onRecordPayment={(amount, method) => handleRecordPayment(view.invoice, amount, method)}
          onWaybill={() => handleWaybill(view.invoice)}
          onEmail={() => handleEmail(view.invoice)}
          onWhatsApp={() => handleWhatsApp(view.invoice)}
        />
      ) : null}

      {edit && form ? (
        <InvoiceEditSheet
          invoice={edit}
          form={form}
          setForm={setForm as React.Dispatch<React.SetStateAction<InvoiceFormState>>}
          saving={saving}
          error={modalError}
          onClose={() => { setEdit(null); setForm(null); }}
          onSave={handleSave}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  content: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: Radii.lg, padding: 16, gap: 4 },
  statWide: { flexBasis: '18%' },
  statValue: { fontSize: 18, lineHeight: 26, fontFamily: FontWeights.bold },
  btns: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  open: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radii.sm, borderWidth: 1.5 },
  track: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, gap: 4, borderRadius: Radii.md },
  tabBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: Radii.sm },
  tabText: { fontSize: 14, fontFamily: FontWeights.medium },
  filters: { gap: 8 },
  filtersWide: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  w160: { width: 160 },
  w150: { width: 150 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, minWidth: 200 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  sortRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  table: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  th: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  mono: { fontSize: 12, lineHeight: 16, fontFamily: Fonts?.mono, fontWeight: '600' },
  medium: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  semi: { fontFamily: FontWeights.semiBold },
  p: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  act: { padding: 7, borderRadius: Radii.sm },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 14, gap: 6 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  empty: { textAlign: 'center', paddingVertical: 48, fontSize: 14 },
  dim: { opacity: 0.6 },
  pager: { gap: 8 },
  pagerWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerBtns: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pageNum: { width: 32, height: 32, borderRadius: Radii.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16, zIndex: 50, borderRadius: Radii.md, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
