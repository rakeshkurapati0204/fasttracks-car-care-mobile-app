import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorBanner } from '@/components/overview/parts';
import { buildEditPayload, formFromQuotation, QuotationEditSheet, type QuotationFormState } from '@/components/quotations/edit-sheet';
import { ADMIN_ROLES, PAGE_SIZE, STATUS_KEYS, STATUS_META, WIDE_MIN, buildQuotationText, dmy, fmt } from '@/components/quotations/helpers';
import { StatusPill } from '@/components/quotations/parts';
import { QuotationViewSheet } from '@/components/quotations/view-sheet';
import { NewQuotationWizard } from '@/components/quotations/wizard';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Select, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  cancelQuotation, deleteQuotation, fetchQuotationFull, fetchQuotationsPage, getErrorMessage, updateQuotationRaw,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { QuotationFull, QuotationListItem } from '@/types/api';

// Mirrors the dashboard's Quotations page (quotations/page.tsx): list with search / status filter / paging,
// view, edit, print, cancel, delete — and the 3-step New Quotation flow (quotations/new/page.tsx).
//
// GET / GET :id are open to ADMIN_ROLES (OWNER, STORE_MANAGER, ACCOUNTING) and to anyone with a per-employee
// 'quotations' permission override (those see only their own). Not predictable from the role alone, so the
// screen is not hidden client-side: a denied fetch shows "Couldn't load quotations. Check your connection and try again." like the dashboard.
// PUT /:id is admin or the quotation's own creator; cancel and delete are ADMIN_ROLES only (the server
// re-checks all of it). "Print" is the OS share sheet (no PDF package in the app).
export default function QuotationsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role) : false;

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

  const [mode, setMode] = useState<'list' | 'new'>('list');
  const [quotations, setQuotations] = useState<QuotationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const [viewQuotation, setViewQuotation] = useState<QuotationFull | null>(null);
  const [viewBusy, setViewBusy] = useState(false);
  const [viewError, setViewError] = useState('');
  const [editQuotation, setEditQuotation] = useState<QuotationFull | null>(null);
  const [form, setForm] = useState<QuotationFormState | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetchQuotationsPage({ page, limit: PAGE_SIZE, search, status: filterStatus });
      setQuotations(res.items);
      setTotalCount(res.total);
    } catch {
      setLoadError("Couldn't load quotations. Check your connection and try again.");
      showToast(false, "Couldn't load quotations. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [page, search, filterStatus, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on filter change
    load();
  }, [load]);

  // Search runs 400 ms after the last keystroke (the dashboard searches on every keystroke).
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openEdit = async (id: string) => {
    setOpeningId(id);
    try {
      const full = await fetchQuotationFull(id);
      setEditQuotation(full);
      setForm(formFromQuotation(full));
      setModalError('');
      setViewQuotation(null);
    } catch {
      showToast(false, "Couldn't load quotation details. Check your connection and try again.");
    } finally {
      setOpeningId(null);
    }
  };

  const openView = async (id: string) => {
    setOpeningId(id);
    try {
      setViewQuotation(await fetchQuotationFull(id));
      setViewError('');
    } catch {
      showToast(false, "Couldn't load quotation details. Check your connection and try again.");
    } finally {
      setOpeningId(null);
    }
  };

  // "Print": the print page's blocks, in its order, through the OS share sheet.
  const printQuotation = async (id: string, loaded?: QuotationFull) => {
    setOpeningId(id);
    try {
      const full = loaded ?? await fetchQuotationFull(id);
      await Share.share({ message: buildQuotationText(full), title: `Quotation ${full.quotationNumber}` });
    } catch {
      showToast(false, "Couldn't load quotation details. Check your connection and try again.");
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = (id: string, fromView: boolean) => {
    Alert.alert('Delete this quotation? This cannot be undone.', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          if (fromView) setViewBusy(true);
          try {
            await deleteQuotation(id);
            showToast(true, 'Quotation deleted.');
            setViewQuotation(null);
            await load();
          } catch {
            showToast(false, 'Failed to delete quotation.');
          } finally {
            setViewBusy(false);
          }
        },
      },
    ]);
  };

  const handleCancel = (id: string) => {
    Alert.alert('Mark this quotation as rejected/cancelled?', undefined, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes', style: 'destructive',
        onPress: async () => {
          setViewBusy(true);
          try {
            await cancelQuotation(id);
            showToast(true, 'Quotation cancelled.');
            setViewQuotation(null);
            await load();
          } catch {
            showToast(false, 'Failed to cancel quotation.');
          } finally {
            setViewBusy(false);
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!form || !editQuotation) return;
    setModalError('');
    const built = buildEditPayload(form);
    if ('error' in built) { setModalError(built.error); return; }
    setModalSaving(true);
    try {
      await updateQuotationRaw(editQuotation.id, built.payload);
      showToast(true, 'Quotation updated.');
      setEditQuotation(null);
      setForm(null);
      await load();
    } catch (e) {
      setModalError(getErrorMessage(e, 'Failed to save quotation.'));
    } finally {
      setModalSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const renderActions = (q: QuotationListItem) => (
    <View style={styles.actions}>
      <Pressable onPress={() => openEdit(q.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit" style={styles.act}>
        <Ionicons name="create-outline" size={18} color={theme.textSecondary} />
      </Pressable>
      <Pressable onPress={() => printQuotation(q.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Print" style={styles.act}>
        <Ionicons name="print-outline" size={18} color={theme.textSecondary} />
      </Pressable>
      {isAdmin ? (
        <Pressable onPress={() => handleDelete(q.id, false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete" style={styles.act}>
          <Ionicons name="trash-outline" size={18} color={theme.danger} />
        </Pressable>
      ) : null}
    </View>
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.flex1}>
        <ThemedText style={styles.title}>Quotations</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.sub}>Estimates for customers — no payment collected here.</ThemedText>
      </View>
      <Button icon="add" onPress={() => setMode('new')}>New Quotation</Button>
    </View>
  );

  const filters = (
    <View style={[styles.filters, wide && styles.filtersWide]}>
      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.flex1]}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search by number, customer, phone, vehicle…"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>
      <View style={wide ? styles.statusWide : undefined}>
        <Select
          value={filterStatus}
          onChange={(v) => { setFilterStatus(v); setPage(1); }}
          options={[{ value: '', label: 'All statuses' }, ...STATUS_KEYS.map((k) => ({ value: k, label: STATUS_META[k].label }))]}
        />
      </View>
    </View>
  );

  const COLS = ['Number', 'Customer', 'Vehicle', 'Grand Total', 'Status', 'Valid Until', 'Actions'];

  const table = (
    <View style={[styles.table, { borderColor: theme.border }]}>
      <View style={[styles.tr, { borderBottomColor: theme.border }]}>
        {COLS.map((h, i) => (
          <ThemedText key={h} themeColor="textMuted" style={[styles.th, colStyle[i]]}>{h}</ThemedText>
        ))}
      </View>
      {quotations.map((q) => (
        <View key={q.id} style={[styles.tr, { borderBottomColor: theme.border }]}>
          <Pressable onPress={() => openView(q.id)} disabled={openingId === q.id} accessibilityRole="button" style={colStyle[0]}>
            <ThemedText numberOfLines={1} style={styles.mono}>{q.quotationNumber}</ThemedText>
          </Pressable>
          <ThemedText numberOfLines={1} style={[styles.td, colStyle[1]]}>{q.customerName}</ThemedText>
          <ThemedText numberOfLines={1} themeColor="textSecondary" style={[styles.td, colStyle[2]]}>{q.vehicleNumber || '—'}</ThemedText>
          <ThemedText numberOfLines={1} style={[styles.td, styles.semi, colStyle[3]]}>₹{fmt(q.grandTotal)}</ThemedText>
          <View style={colStyle[4]}><StatusPill status={q.status} /></View>
          <ThemedText numberOfLines={1} themeColor="textSecondary" style={[styles.td, colStyle[5]]}>{q.validUntil ? new Date(q.validUntil).toLocaleDateString('en-IN') : '—'}</ThemedText>
          <View style={colStyle[6]}>{renderActions(q)}</View>
        </View>
      ))}
    </View>
  );

  const cards = (
    <View style={styles.cards}>
      {quotations.map((q) => (
        <View key={q.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardTop}>
            <Pressable onPress={() => openView(q.id)} disabled={openingId === q.id} accessibilityRole="button" style={styles.flex1}>
              <ThemedText numberOfLines={1} style={styles.mono}>{q.quotationNumber}</ThemedText>
            </Pressable>
            <StatusPill status={q.status} />
          </View>
          <ThemedText numberOfLines={1} style={styles.cardName}>{q.customerName}</ThemedText>
          <View style={styles.cardRow}>
            <ThemedText themeColor="textMuted" style={styles.cardLabel}>Vehicle</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.cardVal}>{q.vehicleNumber || '—'}</ThemedText>
          </View>
          <View style={styles.cardRow}>
            <ThemedText themeColor="textMuted" style={styles.cardLabel}>Valid Until</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.cardVal}>{q.validUntil ? dmy(q.validUntil) : '—'}</ThemedText>
          </View>
          <View style={[styles.cardFoot, { borderTopColor: theme.border }]}>
            <View>
              <ThemedText themeColor="textMuted" style={styles.cardLabel}>Grand Total</ThemedText>
              <ThemedText style={[styles.semi, styles.cardTotal]}>₹{fmt(q.grandTotal)}</ThemedText>
            </View>
            {renderActions(q)}
          </View>
        </View>
      ))}
    </View>
  );

  const listBody = loading && quotations.length === 0 ? (
    <View style={styles.gap}><Skeleton height={wide ? 40 : 150} /><Skeleton height={wide ? 40 : 150} /><Skeleton height={wide ? 40 : 150} /></View>
  ) : quotations.length === 0 ? (
    <View style={[styles.emptyBox, wide && { borderWidth: 1, borderColor: theme.border, borderRadius: Radii.lg }]}>
      <ThemedText themeColor="textMuted" style={styles.empty}>{loadError ? 'Could not load quotations.' : 'No quotations yet.'}</ThemedText>
    </View>
  ) : (
    <View style={loading ? styles.dim : undefined}>{wide ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tableScroll}>{table}</ScrollView> : cards}</View>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: mode === 'new' ? 'New Quotation' : 'Quotations' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {mode === 'new' ? (
          <NewQuotationWizard
            userId={user?.id ?? ''}
            wide={wide}
            onClose={() => setMode('list')}
            onCreated={(q) => {
              setMode('list');
              showToast(true, 'Quotation created.');
              setPage(1);
              load();
              openView(q.id);
            }}
          />
        ) : (
          <>
            {header}
            {filters}
            {loadError && quotations.length > 0 ? <ErrorBanner message={loadError} onRetry={load} /> : null}
            {listBody}
            <View style={[styles.pager, wide && styles.pagerWide]}>
              <ThemedText themeColor="textMuted" style={styles.small}>{totalCount} quotation{totalCount === 1 ? '' : 's'}</ThemedText>
              <View style={styles.pagerBtns}>
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onPress={() => setPage((p) => p - 1)}>Prev</Button>
                <ThemedText themeColor="textMuted" style={styles.small}>Page {page} of {totalPages}</ThemedText>
                <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onPress={() => setPage((p) => p + 1)}>Next</Button>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 16, backgroundColor: toast.ok ? '#16a34a' : '#dc2626' }]}>
          <ThemedText style={styles.toastText}>{toast.msg}</ThemedText>
        </View>
      ) : null}

      {viewQuotation ? (
        <QuotationViewSheet
          quotation={viewQuotation}
          isAdmin={isAdmin}
          busy={viewBusy}
          error={viewError}
          wide={wide}
          onClose={() => setViewQuotation(null)}
          onEdit={() => openEdit(viewQuotation.id)}
          onPrint={() => printQuotation(viewQuotation.id, viewQuotation)}
          onCancel={() => handleCancel(viewQuotation.id)}
          onDelete={() => handleDelete(viewQuotation.id, true)}
        />
      ) : null}

      {editQuotation && form ? (
        <QuotationEditSheet
          quotation={editQuotation}
          form={form}
          setForm={setForm as React.Dispatch<React.SetStateAction<QuotationFormState>>}
          saving={modalSaving}
          error={modalError}
          wide={wide}
          onClose={() => { setEditQuotation(null); setForm(null); }}
          onSave={handleSave}
        />
      ) : null}
    </ThemedView>
  );
}

// Column widths of the wide table (Number / Customer / Vehicle / Grand Total / Status / Valid Until / Actions).
const colStyle = [
  { width: 150 }, { width: 170 }, { width: 120 }, { width: 120 }, { width: 100 }, { width: 110 }, { width: 110 },
];

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  content: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  filters: { gap: 12 },
  filtersWide: { flexDirection: 'row', alignItems: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  statusWide: { minWidth: 180 },
  table: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden', minWidth: 880 },
  tableScroll: { flexGrow: 1 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  th: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  td: { fontSize: 14, lineHeight: 20, paddingRight: 8 },
  mono: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono },
  semi: { fontFamily: FontWeights.semiBold },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  act: { padding: 4 },
  cards: { gap: 12 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 14, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardName: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.semiBold },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cardLabel: { fontSize: 12, lineHeight: 16 },
  cardVal: { fontSize: 13, lineHeight: 18 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
  cardTotal: { fontSize: 16, lineHeight: 22 },
  emptyBox: { paddingVertical: 32 },
  empty: { textAlign: 'center', fontSize: 14 },
  dim: { opacity: 0.6 },
  pager: { gap: 8 },
  pagerWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  small: { fontSize: 13, lineHeight: 18 },
  toast: { position: 'absolute', left: 16, right: 16, zIndex: 50, borderRadius: Radii.sm, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
