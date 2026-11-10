import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { cancelInvoice, fetchOpenInvoices } from '@/lib/api';
import type { OpenInvoiceRow } from '@/types/api';

import { STATUS_META, fmtINR } from './helpers';

// Dashboard Open Invoices (invoices/open/page.tsx): DRAFT / ISSUED / PARTIAL invoices that still need action,
// grouped "Balance Due" and "Draft — Incomplete", client-side search, "Copy unpaid list", Refresh,
// Complete Invoice (draft), Collect Payment + Edit (issued / partial), and a cancel ✕ with confirmation.
export function OpenInvoices({ wide, onBack, onComplete, onCollect, onEdit, notify }: {
  wide: boolean; onBack: () => void;
  onComplete: (id: string) => void; onCollect: (id: string) => void; onEdit: (id: string) => void;
  notify: (ok: boolean, msg: string) => void;
}) {
  const theme = useTheme();
  const [rows, setRows] = useState<OpenInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await fetchOpenInvoices()); } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  const q = search.toLowerCase();
  const filtered = rows.filter((r) => !q
    || (r.customerName ?? '').toLowerCase().includes(q) || (r.customerPhone ?? '').includes(q)
    || (r.vehicleNumber ?? '').toLowerCase().includes(q) || r.invoiceNumber.toLowerCase().includes(q));
  const drafts = filtered.filter((r) => r.status === 'DRAFT');
  const balance = filtered.filter((r) => r.status !== 'DRAFT');
  const unpaid = rows.filter((r) => r.status !== 'DRAFT' && r.balanceDue > 0);
  const totalOutstanding = unpaid.reduce((s, r) => s + r.balanceDue, 0);

  const copyUnpaid = async () => {
    const text = unpaid.map((r, i) => `${i + 1}. ${r.customerName ?? '—'} - ₹${Math.round(r.balanceDue).toLocaleString('en-IN')}`).join('\n');
    try { await Clipboard.setStringAsync(text); notify(true, 'Copied!'); } catch { /* clipboard unavailable */ }
  };

  const cancel = (r: OpenInvoiceRow) => {
    Alert.alert(`Cancel invoice ${r.invoiceNumber}? This cannot be undone.`, undefined, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes', style: 'destructive',
        onPress: async () => {
          try { await cancelInvoice(r.id); await load(); } catch (e) {
            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
            Alert.alert(msg || 'Cannot cancel');
          }
        },
      },
    ]);
  };

  const card = (r: OpenInvoiceRow) => {
    const st = STATUS_META[r.status] ?? STATUS_META.DRAFT;
    const vehicle = [r.vehicleNumber, r.vehicleBrand, r.vehicleModel].filter(Boolean).join(' · ');
    const tiles: [string, string, string?][] = [
      ['GRAND TOTAL', fmtINR(r.grandTotal)],
      [r.paidAmount > 0 && r.balanceDue > 0 ? 'ADVANCE' : 'PAID', fmtINR(r.paidAmount)],
      ['BALANCE DUE', fmtINR(r.balanceDue), r.balanceDue > 0 ? '#dc2626' : undefined],
    ];
    return (
      <View key={r.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.cardWide]}>
        <View style={styles.top}>
          <View style={styles.flex1}>
            <ThemedText style={styles.name}>{r.customerName || '—'}</ThemedText>
            {r.customerPhone ? <ThemedText themeColor="textMuted" style={styles.small}>{r.customerPhone}</ThemedText> : null}
            {vehicle ? <ThemedText themeColor="textSecondary" style={styles.small}>{vehicle}</ThemedText> : null}
          </View>
          <View style={styles.right}>
            <View style={[styles.badge, { backgroundColor: st.bg }]}><ThemedText style={[styles.badgeText, { color: st.color }]}>{r.status}</ThemedText></View>
            <ThemedText themeColor="textMuted" style={styles.small}>#{r.invoiceNumber}</ThemedText>
          </View>
        </View>
        <View style={styles.tiles}>
          {tiles.map(([label, value, color]) => (
            <View key={label} style={[styles.tile, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText themeColor="textMuted" style={styles.tileLabel}>{label}</ThemedText>
              <ThemedText style={[styles.tileValue, color ? { color } : null]}>{value}</ThemedText>
            </View>
          ))}
        </View>
        <ThemedText themeColor="textMuted" style={styles.small}>
          {new Date(r.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
        </ThemedText>
        <View style={styles.actions}>
          {r.status === 'DRAFT' ? (
            <Button size="sm" onPress={() => onComplete(r.id)}>Complete Invoice</Button>
          ) : (
            <>
              <Button size="sm" icon="cash-outline" onPress={() => onCollect(r.id)} style={{ backgroundColor: '#16a34a' }}>Collect Payment</Button>
              <Button size="sm" variant="outline" onPress={() => onEdit(r.id)}>Edit</Button>
            </>
          )}
          <Pressable onPress={() => cancel(r)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cancel invoice" style={styles.x}>
            <Ionicons name="close" size={18} color="#dc2626" />
          </Pressable>
        </View>
      </View>
    );
  };

  const section = (title: string, list: OpenInvoiceRow[]) => list.length > 0 ? (
    <View style={styles.gap}>
      <ThemedText style={styles.sectionTitle}>{title} ({list.length})</ThemedText>
      <View style={styles.grid}>{list.map(card)}</View>
    </View>
  ) : null;

  return (
    <View style={styles.gap}>
      <View style={styles.header}>
        <View style={styles.flex1}>
          <ThemedText style={styles.title}>Open Invoices</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.sub}>
            {rows.length} open invoice{rows.length === 1 ? '' : 's'} · requires action{unpaid.length > 0 ? ` · ${fmtINR(totalOutstanding)} outstanding across ${unpaid.length}` : ''}
          </ThemedText>
        </View>
      </View>
      <View style={styles.btns}>
        {unpaid.length > 0 ? <Button variant="outline" size="sm" icon="copy-outline" onPress={copyUnpaid}>Copy unpaid list</Button> : null}
        <Button variant="outline" size="sm" onPress={load}>↻ Refresh</Button>
        <Button variant="outline" size="sm" onPress={onBack}>← All Invoices</Button>
      </View>

      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search by name, phone, vehicle number, invoice #…" placeholderTextColor={theme.textMuted} autoCorrect={false} autoCapitalize="none" style={[styles.searchInput, { color: theme.text }]} />
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}
      {loading ? (
        <View style={styles.gap}><Skeleton height={150} /><Skeleton height={150} /></View>
      ) : !error && filtered.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name={search ? 'search-outline' : 'checkmark-circle-outline'} size={40} color={search ? theme.textMuted : '#16a34a'} />
          <ThemedText style={styles.name}>{search ? 'No results' : 'All clear — no open invoices'}</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.small}>{search ? 'Try a different search term' : 'All invoices are paid or cancelled'}</ThemedText>
        </View>
      ) : (
        <>
          {section('Balance Due', balance)}
          {section('Draft — Incomplete', drafts)}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '100%', borderWidth: 1, borderRadius: Radii.lg, padding: 14, gap: 10 },
  cardWide: { width: '48.5%', flexGrow: 1 },
  top: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 16 },
  right: { alignItems: 'flex-end', gap: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, borderRadius: Radii.sm, padding: 8 },
  tileLabel: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  tileValue: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  x: { marginLeft: 'auto', padding: 6 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 48 },
});
