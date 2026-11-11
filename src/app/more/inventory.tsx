import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarcodeSheet, printBarcodes, type PrintLabel } from '@/components/inventory/barcode';
import { HistorySheet, ReconcileSheet } from '@/components/inventory/batch-sheets';
import { csvCell, shareCsv } from '@/components/inventory/csv';
import { CATEGORIES, STATUS_CFG, todayYmd, verifyState } from '@/components/inventory/constants';
import { ImageLightbox } from '@/components/inventory/images';
import { downloadTemplate, ImportSheet } from '@/components/inventory/import-sheet';
import { WIDE_MIN } from '@/components/inventory/parts';
import { AddProductWizard, AddStockSheet, EditProductSheet } from '@/components/inventory/product-sheets';
import { ProductCard, ProductTableRow, TableHeader, type ProductActions } from '@/components/inventory/product-list';
import { DraftsTab, ItemsOutTab } from '@/components/inventory/tabs';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteInventoryItem, fetchIncomingReceipts, fetchInventoryList, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import type { DraftReceipt, InventoryListItem } from '@/types/api';

// The dashboard's own role lists: Items Out / draft actions are role-gated, the
// page itself is view-only when the Inventory tab mode is 'view_only'. The
// server enforces the same lists (INVENTORY_WRITE_ROLES / the tab's access mode).
const IO_ROLES = ['INVENTORY_MANAGER', 'OWNER', 'STORE_MANAGER'];
const ALL = '__all';
// The dashboard keeps its Import / Template buttons hidden ("per owner preference");
// the import flow is built, so flipping this shows both.
const SHOW_IMPORT = false;
type Tab = 'products' | 'drafts' | 'items-out';

export default function InventoryScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { status: permStatus, hasTab, tabMode } = usePermissions();
  const role = user?.role ?? '';
  const mode = tabMode('inventory');
  const isViewOnly = mode === 'view_only';
  const allowed = IO_ROLES.includes(role) || hasTab('inventory');
  const canWrite = !isViewOnly && (IO_ROLES.includes(role) || mode === 'full_access');
  const canManageIO = IO_ROLES.includes(role);

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;
  const [tab, setTab] = useState<Tab>('products');

  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [drafts, setDrafts] = useState<DraftReceipt[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [itemsOutCount, setItemsOutCount] = useState(0);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filterCat, setFilterCat] = useState(ALL);
  const [filterStatus, setFilterStatus] = useState(ALL);

  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<InventoryListItem | null>(null);
  const [addStockItem, setAddStockItem] = useState<InventoryListItem | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [reconcileItem, setReconcileItem] = useState<InventoryListItem | null>(null);
  const [barcodeSheet, setBarcodeSheet] = useState<{ barcode: string; label: string; storeLocation?: string } | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedReceipts, setSelectedReceipts] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; name: string } | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = useCallback((type: 'success' | 'error', msg: string) => setToast({ type, msg }), []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadItems = useCallback(async () => {
    setLoadError('');
    try {
      setItems(await fetchInventoryList({
        category: filterCat === ALL ? undefined : filterCat,
        status: filterStatus === ALL ? undefined : filterStatus,
        q: debounced || undefined,
      }));
    } catch (e: unknown) {
      setLoadError(getErrorMessage(e, "Couldn't load items. Check your connection and try again."));
    } finally {
      setLoading(false);
    }
  }, [filterCat, filterStatus, debounced]);

  const loadDrafts = useCallback(async () => {
    try {
      setDrafts(await fetchIncomingReceipts());
    } catch { /* the tab shows its empty state */ } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    if (allowed) loadItems();
  }, [allowed, loadItems]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    if (allowed) loadDrafts();
  }, [allowed, loadDrafts]);

  const refreshAll = useCallback(() => { loadItems(); loadDrafts(); }, [loadItems, loadDrafts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadItems(), loadDrafts()]);
    setRefreshing(false);
  };

  const confirmDelete = useCallback((item: InventoryListItem) => {
    Alert.alert(`Delete "${item.product}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteInventoryItem(item.id);
            notify('success', 'Product deleted');
            loadItems();
          } catch (e: unknown) {
            notify('error', getErrorMessage(e, 'Delete failed'));
          }
        },
      },
    ]);
  }, [loadItems, notify]);

  const actions: ProductActions = {
    canWrite,
    onAddStock: setAddStockItem,
    onEdit: setEditItem,
    onDelete: confirmDelete,
    onImages: (i) => { if (i.imageUrls?.length) setLightbox({ images: i.imageUrls, index: 0, name: i.product }); },
    onHistory: (i) => setHistoryId(i.id),
    onReconcile: setReconcileItem,
    onBarcode: (barcode, label, storeLocation) => setBarcodeSheet({ barcode, label, storeLocation }),
    canSelect: !isViewOnly,
    selectedItems: selected,
    selectedReceipts,
    onToggleItem: (id) => setSelected((cur) => toggle(cur, id)),
    onToggleReceipt: (id) => setSelectedReceipts((cur) => toggle(cur, id)),
    onChanged: loadItems,
    notify,
  };

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  const runPrint = async (labels: PrintLabel[], emptyMsg: string) => {
    if (labels.length === 0) { notify('error', emptyMsg); return; }
    try { await printBarcodes(labels, 1); } catch (e: unknown) { notify('error', getErrorMessage(e, 'Could not open the label page.')); }
  };
  const printSelectedProducts = () => {
    const labels: PrintLabel[] = [];
    items.filter((i) => selected.has(i.id)).forEach((item) => (item.receipts || []).forEach((r) => {
      if (r.barcode?.trim()) labels.push({ barcode: r.barcode, product: item.product, category: item.category });
    }));
    return runPrint(labels, 'No selected products have receipt barcodes');
  };
  const printSelectedReceipts = () => {
    const labels: PrintLabel[] = [];
    items.forEach((item) => (item.receipts || []).forEach((r) => {
      if (selectedReceipts.has(r.id) && r.barcode) labels.push({ barcode: r.barcode, product: item.product, category: item.category });
    }));
    return runPrint(labels, 'No selected receipts have barcodes');
  };

  const exportProducts = async () => {
    try {
      const rows = [['Name', 'Category', 'MRP', 'Stock', 'Unit', 'Status', 'Verified'].join(',')];
      items.forEach((item) => {
        const v = verifyState(item.lastVerifiedAt);
        rows.push([
          csvCell(item.product), item.category || '', item.sellingPrice ?? '', item.totalStock ?? 0, item.unit || '',
          STATUS_CFG[item.effectiveStatus].label, v === 'unverified' ? 'Unverified' : v === 'verified' ? 'Verified' : 'Verify Soon',
        ].join(','));
      });
      const suffix = search ? `-${search.trim().replace(/\s+/g, '-').toLowerCase()}` : '';
      await shareCsv(`inventory${suffix}-${todayYmd()}.csv`, rows);
    } catch (e: unknown) {
      notify('error', getErrorMessage(e, 'Could not export the list.'));
    }
  };

  const outOfStock = items.filter((i) => i.effectiveStatus === 'OUT_OF_STOCK');
  const copyOutOfStock = async () => {
    await Clipboard.setStringAsync(outOfStock.map((it, idx) => `${idx + 1}. ${it.product}`).join('\n'));
    notify('success', 'Out-of-stock list copied');
  };

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Inventory' }} />
      {children}
    </ThemedView>
  );

  if (permStatus !== 'ready') {
    return shell(<View style={[styles.page, { padding: 16 }]}><Skeleton height={64} /></View>);
  }
  if (!allowed) {
    return shell(
      <View style={[styles.page, { padding: wide ? 24 : 16 }]}>
        <ThemedText themeColor="textMuted" style={styles.body}>Inventory is only available to Owner, Store Manager, or Inventory Manager accounts.</ThemedText>
      </View>,
    );
  }

  const tabs: [Tab, string][] = [['products', 'Products'], ['drafts', 'Drafts'], ['items-out', 'Items Out']];
  const visibleTabs = tabs.filter(([k]) => !isViewOnly || k === 'products');
  const badge = (k: Tab) => (k === 'drafts' ? drafts.length : k === 'items-out' ? itemsOutCount : 0);
  const filtersOn = filterCat !== ALL || filterStatus !== ALL || !!search;

  const head = (
    <View style={styles.headerWrap}>
      <View style={[styles.headRow, wide && styles.headRowWide]}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Inventory</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Manage products and stock receipts</ThemedText>
        </View>
        <View style={styles.headBtns}>
          {SHOW_IMPORT && canWrite ? <Button variant="outline" onPress={() => downloadTemplate().catch((e: unknown) => notify('error', getErrorMessage(e, 'Could not create the template.')))}>Template</Button> : null}
          {SHOW_IMPORT && canWrite ? <Button variant="outline" onPress={() => setShowImport(true)}>Import</Button> : null}
          {!isViewOnly && canWrite ? <Button onPress={() => setShowAdd(true)}>+ Add Product</Button> : null}
        </View>
      </View>

      {toast ? (toast.type === 'success' ? <SuccessBanner message={toast.msg} /> : <ErrorBanner message={toast.msg} />) : null}
      {loadError ? <ErrorBanner message={loadError} onRetry={refreshAll} /> : null}

      <View style={[styles.tabs, { backgroundColor: theme.backgroundElement }]}>
        {visibleTabs.map(([key, label]) => {
          const on = tab === key;
          const n = badge(key);
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
              <ThemedText style={[styles.tabText, { color: on ? theme.text : theme.textMuted }]}>{label}</ThemedText>
              {n > 0 ? <View style={styles.count}><ThemedText style={styles.countText}>{n}</ThemedText></View> : null}
            </Pressable>
          );
        })}
      </View>

      {tab === 'products' ? (
        <View style={styles.filters}>
          <View style={[styles.filterRow, wide && styles.filterRowWide]}>
            <View style={wide ? styles.fSearch : undefined}><Input value={search} onChangeText={setSearch} placeholder="Search by name…" autoCorrect={false} /></View>
            <View style={wide ? styles.fSelect : undefined}>
              <Select value={filterCat} onChange={setFilterCat} options={[{ value: ALL, label: 'All Categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]} />
            </View>
            <View style={wide ? styles.fSelect : undefined}>
              <Select value={filterStatus} onChange={setFilterStatus} options={[{ value: ALL, label: 'All Statuses' }, ...Object.entries(STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }))]} />
            </View>
          </View>
          <View style={styles.btnRow}>
            {filtersOn ? <Button variant="outline" size="sm" onPress={() => { setFilterCat(ALL); setFilterStatus(ALL); setSearch(''); }}>Clear</Button> : null}
            <Button variant="outline" size="sm" onPress={exportProducts}>{`Export${items.length > 0 ? ` (${items.length})` : ''}`}</Button>
            {outOfStock.length > 0 ? (
              <Button variant="outline" size="sm" onPress={copyOutOfStock}>{`Copy out-of-stock list (${outOfStock.length})`}</Button>
            ) : null}
          </View>
          {selected.size > 0 ? (
            <View style={[styles.bulk, { backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)' }]}>
              <ThemedText style={[styles.bulkText, { color: theme.primary }]}>{selected.size + ' selected'}</ThemedText>
              <Button size="sm" onPress={printSelectedProducts}>Print Selected Barcodes</Button>
              <Button size="sm" variant="ghost" onPress={() => setSelected(new Set())}>Clear</Button>
            </View>
          ) : null}
          {selectedReceipts.size > 0 ? (
            <View style={[styles.bulk, { backgroundColor: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' }]}>
              <ThemedText style={[styles.bulkText, { color: '#d97706' }]}>{selectedReceipts.size + ' receipt' + (selectedReceipts.size > 1 ? 's' : '')}</ThemedText>
              <Button size="sm" onPress={printSelectedReceipts}>Print Receipt Barcodes</Button>
              <Button size="sm" variant="ghost" onPress={() => setSelectedReceipts(new Set())}>Clear</Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  const historyItem = historyId ? items.find((i) => i.id === historyId) ?? null : null;

  const sheets = (
    <>
      {showAdd ? <AddProductWizard onClose={() => setShowAdd(false)} onSaved={refreshAll} notify={notify} /> : null}
      {editItem ? <EditProductSheet item={editItem} onClose={() => setEditItem(null)} onSaved={loadItems} notify={notify} /> : null}
      {addStockItem ? <AddStockSheet item={addStockItem} onClose={() => setAddStockItem(null)} onSaved={refreshAll} notify={notify} /> : null}
      {historyItem ? <HistorySheet item={historyItem} canWrite={canWrite} onClose={() => setHistoryId(null)} onRefresh={loadItems} /> : null}
      {reconcileItem ? <ReconcileSheet item={reconcileItem} onClose={() => setReconcileItem(null)} onSaved={loadItems} notify={notify} /> : null}
      {barcodeSheet ? <BarcodeSheet barcode={barcodeSheet.barcode} label={barcodeSheet.label} storeLocation={barcodeSheet.storeLocation} onClose={() => setBarcodeSheet(null)} /> : null}
      {showImport ? <ImportSheet items={items} onClose={() => setShowImport(false)} onImported={refreshAll} /> : null}
      {lightbox ? (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          name={lightbox.name}
          onClose={() => setLightbox(null)}
          onNavigate={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
        />
      ) : null}
    </>
  );

  const pad = { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 };

  if (tab !== 'products') {
    return shell(
      <>
        <ScrollView contentContainerStyle={[styles.page, pad]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} keyboardShouldPersistTaps="handled">
          {head}
          {tab === 'drafts' ? (
            <DraftsTab
              drafts={drafts}
              loading={draftsLoading}
              canConfirm={canManageIO}
              canDelete={IO_ROLES.includes(role)}
              wide={wide}
              notify={notify}
              onChanged={refreshAll}
            />
          ) : (
            <ItemsOutTab canManage={canManageIO} items={items} wide={wide} notify={notify} onLogged={loadItems} onCount={setItemsOutCount} />
          )}
        </ScrollView>
        {sheets}
      </>,
    );
  }

  const empty = loading ? (
    <View style={styles.gap}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={wide ? 56 : 120} />)}</View>
  ) : loadError ? null : (
    <View style={[styles.emptyBox, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText style={styles.emptyTitle}>No products yet</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.small}>Add your first product to get started</ThemedText>
      {canWrite ? <Button onPress={() => setShowAdd(true)}>+ Add Product</Button> : null}
    </View>
  );

  return shell(
    <>
      <FlatList
        data={loading ? [] : items}
        keyExtractor={(i) => i.id}
        renderItem={({ item, index }) => (wide
          ? <ProductTableRow item={item} a={actions} last={index === items.length - 1} />
          : <ProductCard item={item} a={actions} />)}
        ListHeaderComponent={<>{head}{wide && items.length > 0 && !loading ? <TableHeader canSelect={!isViewOnly} allSelected={selected.size === items.length && items.length > 0} onToggleAll={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)))} /> : null}</>}
        ListEmptyComponent={empty}
        ListFooterComponent={items.length > 0 ? <ThemedText themeColor="textMuted" style={styles.count2}>{`${items.length} product(s)`}</ThemedText> : null}
        ItemSeparatorComponent={wide ? undefined : Sep}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.page, pad]}
      />
      {sheets}
    </>,
  );
}

function Sep() {
  return <View style={{ height: 12 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 1280, alignSelf: 'center' },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 13, lineHeight: 18 },
  gap: { gap: 12 },
  headerWrap: { gap: 16, marginBottom: 16 },
  headRow: { gap: 12 },
  headBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bulk: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: 10, borderWidth: 1, borderRadius: Radii.sm },
  bulkText: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  headRowWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 10, alignSelf: 'flex-start' },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 16, borderRadius: 7, borderWidth: 1, borderColor: 'transparent' },
  tabText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  count: { backgroundColor: '#d97706', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1 },
  countText: { color: '#ffffff', fontSize: 11, lineHeight: 15 },
  filters: { gap: 10 },
  filterRow: { gap: 10 },
  filterRowWide: { flexDirection: 'row', alignItems: 'center' },
  fSearch: { width: 240 },
  fSelect: { width: 190 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 16, borderWidth: 1, borderRadius: Radii.md },
  emptyTitle: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.semiBold },
  count2: { fontSize: 12, lineHeight: 16, marginTop: 10 },
});
