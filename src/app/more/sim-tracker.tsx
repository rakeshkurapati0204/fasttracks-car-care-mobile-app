import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteSim, fetchSimStats, fetchSims, getErrorMessage, saveSimRaw } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { SimCard, SimStats, SimStatus } from '@/types/api';

// Mirrors the dashboard's SIM Tracker page (sim-tracker/page.tsx). The dashboard shows the page to OWNER and
// STORE_MANAGER only (nav roles), and those same two roles may add / edit / delete (simRoutes ADMIN_ROLES); the
// server does not mask SIM or mobile numbers for them, so the numbers are shown in full, as on the dashboard.
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER'];
const OPERATORS = ['Airtel', 'Jio', 'Vi', 'BSNL', 'Other'];
const PAGE_SIZE = 15;
const WIDE_MIN = 560;

const STATUS_STYLE: Record<SimStatus, { bg: string; color: string; label: string }> = {
  ACTIVE: { bg: 'rgba(34,197,94,0.15)', color: '#15803d', label: 'Active' },
  INACTIVE: { bg: 'rgba(100,116,139,0.15)', color: '#64748b', label: 'Inactive' },
  LOST: { bg: 'rgba(239,68,68,0.15)', color: '#b91c1c', label: 'Lost' },
  EXPIRED: { bg: 'rgba(239,68,68,0.15)', color: '#b91c1c', label: 'Expired' },
  SPARE: { bg: 'rgba(59,130,246,0.15)', color: '#2563eb', label: 'Spare' },
};
const STATUS_FILTER = [
  { value: '', label: 'All Statuses' }, { value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' },
  { value: 'EXPIRED', label: 'Expired' }, { value: 'LOST', label: 'Lost' }, { value: 'SPARE', label: 'Spare' },
];
const STATUS_FORM = ['ACTIVE', 'INACTIVE', 'LOST', 'EXPIRED', 'SPARE'].map((k) => ({ value: k, label: STATUS_STYLE[k as SimStatus].label }));

interface SimForm {
  simNumber: string; mobileNumber: string; operator: string; dataPlan: string; monthlyRent: string; planExpiry: string;
  assignedTo: string; purpose: string; deviceName: string; status: SimStatus; notes: string;
}
const EMPTY_FORM: SimForm = {
  simNumber: '', mobileNumber: '', operator: '', dataPlan: '', monthlyRent: '', planExpiry: '', assignedTo: '', purpose: '', deviceName: '', status: 'ACTIVE', notes: '',
};

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
function isExpiringSoon(iso?: string | null) {
  if (!iso) return false;
  const diff = new Date(iso).getTime() - Date.now();
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
}

const COLS = [
  { label: 'SIM Number', w: 170 }, { label: 'Mobile', w: 120 }, { label: 'Operator', w: 90 }, { label: 'Plan', w: 120 }, { label: 'Expiry', w: 120 },
  { label: 'Assigned To', w: 130 }, { label: 'Purpose', w: 120 }, { label: 'Device', w: 120 }, { label: 'Status', w: 100 }, { label: 'Actions', w: 90 },
];

export default function SimTrackerScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;

  const [sims, setSims] = useState<SimCard[]>([]);
  const [stats, setStats] = useState<SimStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterOperator, setFilterOperator] = useState('');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SimCard | null>(null);
  const [form, setForm] = useState<SimForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, st] = await Promise.all([
        fetchSims({ search: search || undefined, status: (filterStatus || undefined) as SimStatus | undefined, operator: filterOperator || undefined }),
        fetchSimStats(),
      ]);
      setSims(list); setStats(st); setPage(1);
    } catch { showToast(false, "Couldn't load SIM data. Check your connection and try again."); }
    finally { setLoading(false); }
  }, [search, filterStatus, filterOperator, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on filter change
    load();
  }, [load]);

  // Search runs 400 ms after the last keystroke (the dashboard searches on every keystroke).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const set = <K extends keyof SimForm>(k: K) => (v: SimForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(''); setModalOpen(true); };
  const openEdit = (sim: SimCard) => {
    setEditing(sim);
    setForm({
      simNumber: sim.simNumber, mobileNumber: sim.mobileNumber ?? '', operator: sim.operator, dataPlan: sim.dataPlan ?? '',
      monthlyRent: sim.monthlyRent != null ? String(sim.monthlyRent) : '', planExpiry: sim.planExpiry ? sim.planExpiry.slice(0, 10) : '',
      assignedTo: sim.assignedTo ?? '', purpose: sim.purpose ?? '', deviceName: sim.deviceName ?? '', status: sim.status, notes: sim.notes ?? '',
    });
    setFormError(''); setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); };

  const handleSave = async () => {
    setFormError('');
    if (!form.simNumber.trim()) { setFormError('SIM Number is required.'); return; }
    if (!form.operator.trim()) { setFormError('Operator is required.'); return; }
    setSaving(true);
    try {
      // Blank optional fields go out as null so an edit really clears them (the server only updates present fields).
      await saveSimRaw(editing ? editing.id : null, {
        simNumber: form.simNumber.trim(),
        mobileNumber: form.mobileNumber.trim() || null,
        operator: form.operator.trim(),
        dataPlan: form.dataPlan.trim() || null,
        monthlyRent: form.monthlyRent ? parseFloat(form.monthlyRent) : null,
        planExpiry: form.planExpiry || null,
        assignedTo: form.assignedTo.trim() || null,
        purpose: form.purpose.trim() || null,
        deviceName: form.deviceName.trim() || null,
        status: form.status,
        notes: form.notes.trim() || null,
      });
      showToast(true, editing ? 'SIM updated successfully.' : 'SIM added successfully.');
      closeModal();
      load();
    } catch (e) { setFormError(getErrorMessage(e, 'Failed to save SIM.')); }
    finally { setSaving(false); }
  };

  const confirmDelete = (sim: SimCard) => {
    Alert.alert('Delete SIM?', `${sim.simNumber} — ${sim.operator}\n\nThis action cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await deleteSim(sim.id); showToast(true, 'SIM deleted.'); load(); } catch { showToast(false, 'Failed to delete SIM.'); }
        },
      },
    ]);
  };

  const expiring = sims.filter((s) => isExpiringSoon(s.planExpiry));
  const copyExpiring = async () => {
    const text = expiring.map((s, i) => `${i + 1}. ${s.simNumber} — ${s.assignedTo || 'Unassigned'} — expires ${fmtDate(s.planExpiry)}`).join('\n');
    try { await Clipboard.setStringAsync(text); showToast(true, 'Copied!'); } catch { /* clipboard unavailable */ }
  };

  const totalPages = Math.ceil(sims.length / PAGE_SIZE);
  const paginated = sims.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const statCards = [
    { label: 'Total SIMs', value: stats?.total ?? 0, color: theme.text },
    { label: 'Active', value: stats?.active ?? 0, color: '#15803d' },
    { label: 'Expiring Soon', value: stats?.expiringSoon ?? 0, color: '#d97706' },
    { label: 'Inactive / Spare', value: (stats?.inactive ?? 0) + (stats?.spare ?? 0), color: '#64748b' },
  ];

  const badge = (status: SimStatus) => { const st = STATUS_STYLE[status] ?? STATUS_STYLE.INACTIVE; return <View style={[styles.badge, { backgroundColor: st.bg }]}><ThemedText style={[styles.badgeText, { color: st.color }]}>{st.label}</ThemedText></View>; };
  const expiryText = (sim: SimCard) => {
    const exp = isExpiringSoon(sim.planExpiry);
    return <ThemedText style={[styles.small, { color: exp ? '#d97706' : theme.textSecondary, fontFamily: exp ? FontWeights.semiBold : FontWeights.regular }]}>{fmtDate(sim.planExpiry)}{exp ? ' ⚠️' : ''}</ThemedText>;
  };
  const actions = (sim: SimCard) => isAdmin ? (
    <View style={styles.actions}>
      <Pressable onPress={() => openEdit(sim)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Edit"><Ionicons name="create-outline" size={18} color={theme.textMuted} /></Pressable>
      <Pressable onPress={() => confirmDelete(sim)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete"><Ionicons name="trash-outline" size={18} color="#ef4444" /></Pressable>
    </View>
  ) : null;

  const table = (
    <View style={[styles.table, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={[styles.tr, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
        {COLS.map((c) => <ThemedText key={c.label} themeColor="textMuted" style={[styles.th, { width: c.w }]}>{c.label}</ThemedText>)}
      </View>
      {paginated.map((sim) => (
        <View key={sim.id} style={[styles.tr, { borderBottomColor: theme.border }]}>
          <ThemedText selectable style={[styles.mono, { width: COLS[0].w }]}>{sim.simNumber}</ThemedText>
          <ThemedText selectable themeColor="textSecondary" style={[styles.small, { width: COLS[1].w }]}>{sim.mobileNumber || '—'}</ThemedText>
          <ThemedText style={[styles.small, styles.semi, { width: COLS[2].w }]}>{sim.operator}</ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.small, { width: COLS[3].w }]}>{sim.dataPlan || '—'}</ThemedText>
          <View style={{ width: COLS[4].w }}>{expiryText(sim)}</View>
          <ThemedText themeColor="textSecondary" style={[styles.small, { width: COLS[5].w }]}>{sim.assignedTo || '—'}</ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.small, { width: COLS[6].w }]}>{sim.purpose || '—'}</ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.small, { width: COLS[7].w }]}>{sim.deviceName || '—'}</ThemedText>
          <View style={{ width: COLS[8].w }}>{badge(sim.status)}</View>
          <View style={{ width: COLS[9].w }}>{actions(sim)}</View>
        </View>
      ))}
    </View>
  );

  const rows: [string, (s: SimCard) => string][] = [
    ['Mobile', (s) => s.mobileNumber || '—'], ['Plan', (s) => s.dataPlan || '—'], ['Assigned To', (s) => s.assignedTo || '—'],
    ['Purpose', (s) => s.purpose || '—'], ['Device', (s) => s.deviceName || '—'],
  ];
  const cards = (
    <View style={styles.gap}>
      {paginated.map((sim) => (
        <View key={sim.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.between}>
            <ThemedText selectable style={[styles.mono, { flex: 1 }]}>{sim.simNumber}</ThemedText>
            {badge(sim.status)}
          </View>
          <ThemedText style={[styles.small, styles.semi]}>{sim.operator}</ThemedText>
          {rows.map(([label, fn]) => (
            <View key={label} style={styles.between}>
              <ThemedText themeColor="textMuted" style={styles.small}>{label}</ThemedText>
              <ThemedText themeColor="textSecondary" style={[styles.small, styles.right]}>{fn(sim)}</ThemedText>
            </View>
          ))}
          <View style={styles.between}>
            <ThemedText themeColor="textMuted" style={styles.small}>Expiry</ThemedText>
            {expiryText(sim)}
          </View>
          {isAdmin ? <View style={[styles.cardFoot, { borderTopColor: theme.border }]}>{actions(sim)}</View> : null}
        </View>
      ))}
    </View>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'SIM Tracker' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>SIM Tracker</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.sub}>Manage all company SIM cards and assignments</ThemedText>
          </View>
          <View style={styles.headBtns}>
            {expiring.length > 0 ? <Button variant="outline" icon="copy-outline" onPress={copyExpiring}>{`Copy expiring soon (${expiring.length})`}</Button> : null}
            {isAdmin ? <Button icon="add" onPress={openAdd}>Add SIM</Button> : null}
          </View>
        </View>

        <View style={styles.stats}>
          {statCards.map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.statWide]}>
              <ThemedText themeColor="textMuted" style={styles.small}>{s.label}</ThemedText>
              {loading && !stats ? <Skeleton height={28} /> : <ThemedText style={[styles.statValue, { color: s.color }]}>{s.value}</ThemedText>}
            </View>
          ))}
        </View>

        <View style={[styles.filters, wide && styles.filtersWide]}>
          <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.flex1]}>
            <Ionicons name="search" size={16} color={theme.textMuted} />
            <TextInput value={searchInput} onChangeText={setSearchInput} placeholder="Search SIM, mobile, person, device…" placeholderTextColor={theme.textMuted} autoCapitalize="none" autoCorrect={false} style={[styles.searchInput, { color: theme.text }]} />
          </View>
          <View style={wide ? styles.w176 : undefined}><Select value={filterStatus} onChange={setFilterStatus} options={STATUS_FILTER} /></View>
          <View style={wide ? styles.w176 : undefined}><Select value={filterOperator} onChange={setFilterOperator} options={[{ value: '', label: 'All Operators' }, ...OPERATORS.map((o) => ({ value: o, label: o }))]} /></View>
        </View>

        {loading && sims.length === 0 ? (
          <View style={styles.gap}><Skeleton height={wide ? 44 : 150} /><Skeleton height={wide ? 44 : 150} /><Skeleton height={wide ? 44 : 150} /></View>
        ) : paginated.length === 0 ? (
          <View style={[styles.empty, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Ionicons name="call-outline" size={32} color={theme.textMuted} />
            <ThemedText themeColor="textMuted" style={[styles.p, styles.semi]}>No SIM cards found.</ThemedText>
            {isAdmin ? <ThemedText themeColor="textMuted" style={styles.small}>Click &quot;Add SIM&quot; to get started.</ThemedText> : null}
          </View>
        ) : (
          <View style={loading ? styles.dim : undefined}>{wide ? <ScrollView horizontal showsHorizontalScrollIndicator={false}>{table}</ScrollView> : cards}</View>
        )}

        {!loading && totalPages > 1 ? (
          <View style={[styles.pager, wide && styles.pagerWide]}>
            <ThemedText themeColor="textMuted" style={styles.small}>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sims.length)} of {sims.length}</ThemedText>
            <View style={styles.row}>
              <Button variant="outline" size="sm" disabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>← Prev</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onPress={() => setPage((p) => Math.min(totalPages, p + 1))}>Next →</Button>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 16, backgroundColor: toast.ok ? '#22c55e' : '#ef4444' }]}>
          <ThemedText style={styles.toastText}>{toast.msg}</ThemedText>
        </View>
      ) : null}

      {modalOpen ? (
        <Sheet visible fullHeight onClose={closeModal} locked={saving} title={editing ? 'Edit SIM' : 'Add SIM'} footer={
          <View style={styles.footer}>
            <View style={styles.flex1}><Button variant="outline" onPress={closeModal} disabled={saving} fullWidth>Cancel</Button></View>
            <View style={styles.flex1}><Button onPress={handleSave} loading={saving} fullWidth>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Add SIM'}</Button></View>
          </View>
        }>
          <View style={[styles.two, wide && styles.twoWide]}>
            <View style={styles.flex1}><Input label="SIM Number" required value={form.simNumber} onChangeText={set('simNumber')} placeholder="e.g. 89914XXXXXXXXXXXX" autoCapitalize="none" autoCorrect={false} /></View>
            <View style={styles.flex1}><Input label="Mobile Number" value={form.mobileNumber} onChangeText={set('mobileNumber')} placeholder="e.g. 9876543210" keyboardType="phone-pad" /></View>
          </View>
          <View style={[styles.two, wide && styles.twoWide]}>
            <View style={styles.flex1}><Select label="Operator" required value={form.operator} onChange={set('operator')} placeholder="Select operator…" options={OPERATORS.map((o) => ({ value: o, label: o }))} /></View>
            <View style={styles.flex1}><Select label="Status" required value={form.status} onChange={(v) => set('status')(v as SimStatus)} options={STATUS_FORM} /></View>
          </View>
          <View style={[styles.two, wide && styles.twoWide]}>
            <View style={styles.flex1}><Input label="Data Plan" value={form.dataPlan} onChangeText={set('dataPlan')} placeholder="e.g. 2GB/day, Unlimited" /></View>
            <View style={styles.flex1}><Input label="Monthly Rent (₹)" value={form.monthlyRent} onChangeText={set('monthlyRent')} placeholder="e.g. 299" keyboardType="decimal-pad" /></View>
          </View>
          <View style={[styles.two, wide && styles.twoWide]}>
            <View style={styles.flex1}><DateField label="Plan Expiry" value={form.planExpiry} onChange={set('planExpiry')} /></View>
            <View style={styles.flex1}><Input label="Assigned To" value={form.assignedTo} onChangeText={set('assignedTo')} placeholder="Employee name or vehicle ID" /></View>
          </View>
          <View style={[styles.two, wide && styles.twoWide]}>
            <View style={styles.flex1}><Input label="Purpose" value={form.purpose} onChangeText={set('purpose')} placeholder="e.g. GPS Tracker, Staff Phone" /></View>
            <View style={styles.flex1}><Input label="Device Name" value={form.deviceName} onChangeText={set('deviceName')} placeholder="e.g. iPhone 13, Teltonika FMB920" /></View>
          </View>
          <Input label="Notes" value={form.notes} onChangeText={set('notes')} placeholder="Any additional notes…" multiline numberOfLines={3} />
          {formError ? <ThemedText themeColor="danger" style={styles.p}>{formError}</ThemedText> : null}
        </Sheet>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  content: { padding: 16, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  headBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: Radii.lg, padding: 16, gap: 4 },
  statWide: { flexBasis: '22%' },
  statValue: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  filters: { gap: 12 },
  filtersWide: { flexDirection: 'row', alignItems: 'center' },
  w176: { width: 176 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: Radii.md, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  table: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  th: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  mono: { fontSize: 12, lineHeight: 16, fontFamily: Fonts?.mono, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 16 },
  p: { fontSize: 14, lineHeight: 20 },
  semi: { fontFamily: FontWeights.semiBold },
  right: { textAlign: 'right', flexShrink: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  actions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 14, gap: 6 },
  cardFoot: { borderTopWidth: 1, paddingTop: 10, marginTop: 4, alignItems: 'flex-end' },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 48, borderWidth: 1, borderRadius: Radii.lg },
  dim: { opacity: 0.6 },
  pager: { gap: 8 },
  pagerWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { flexDirection: 'row', gap: 8, flex: 1 },
  two: { gap: 16 },
  twoWide: { flexDirection: 'row' },
  toast: { position: 'absolute', left: 16, right: 16, zIndex: 50, borderRadius: Radii.md, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
