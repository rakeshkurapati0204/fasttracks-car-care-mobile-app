import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Input } from '@/components/ui';
import { Fonts, FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { searchQuotationItems } from '@/lib/api';
import type { QuotationItemSearchResult, QuotationStaffOption, QuotationStatus } from '@/types/api';

import { STATUS_META, calcLineAmount, emptyLine, fmt, type QLine } from './helpers';

export function StatusPill({ status }: { status: QuotationStatus }) {
  const st = STATUS_META[status] ?? STATUS_META.DRAFT;
  return (
    <View style={[styles.pill, { backgroundColor: st.bg }]}>
      <ThemedText style={[styles.pillText, { color: st.color }]}>{st.label}</ThemedText>
    </View>
  );
}

/** Money / label row of a totals box (dashboard `flex justify-between`). */
export function TotalRow({ label, value, color, bold, top }: { label: string; value: string; color?: string; bold?: boolean; top?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.totalRow, top && { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6, marginTop: 4 }]}>
      <ThemedText style={[styles.totalLabel, bold ? styles.bold : { color: color ?? theme.textMuted }]}>{label}</ThemedText>
      <ThemedText style={[styles.money, bold && styles.bold, color ? { color } : null]}>{value}</ThemedText>
    </View>
  );
}

export function Panel({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>{children}</View>;
}

/** Number input that keeps what is being typed ("1.") while the parent only holds the parsed value. */
export function NumField({ value, onChange, placeholder, label, width }: { value: number; onChange: (n: number) => void; placeholder?: string; label?: string; width?: number }) {
  const [text, setText] = useState(value ? String(value) : '');
  const shown = (parseFloat(text) || 0) === value ? text : (value ? String(value) : '');
  return (
    <View style={width ? { width } : styles.flex1}>
      <Input
        label={label}
        value={shown}
        onChangeText={(t) => { setText(t); onChange(parseFloat(t) || 0); }}
        placeholder={placeholder}
        keyboardType="decimal-pad"
      />
    </View>
  );
}

// Salesperson: shows the chosen staff member; tapping opens a searchable list (name or phone).
export function SalespersonField({ staff, value, onChange }: { staff: QuotationStaffOption[]; value: string | null; onChange: (id: string | null) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = staff.find((s) => s.id === value) ?? null;
  const needle = q.toLowerCase();
  const list = q.trim() ? staff.filter((s) => s.name.toLowerCase().includes(needle) || (s.phone || '').includes(q)) : staff;
  return (
    <View>
      <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Salesperson</ThemedText>
      <Pressable onPress={() => { setQ(''); setOpen(true); }} accessibilityRole="button" style={[styles.pick, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText numberOfLines={1} style={[styles.flex1, { color: selected ? theme.text : theme.textMuted, fontSize: 14 }]}>
          {selected ? `${selected.name}${selected.phone ? ` (${selected.phone})` : ''}` : 'Search staff by name or phone…'}
        </ThemedText>
        {selected ? (
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityLabel="Clear salesperson">
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        ) : <Ionicons name="chevron-down" size={16} color={theme.textMuted} />}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Salesperson" fullHeight>
        <Input value={q} onChangeText={setQ} placeholder="Search staff by name or phone…" autoCorrect={false} />
        {list.length === 0 ? <ThemedText themeColor="textMuted" style={styles.none}>No matching staff</ThemedText> : null}
        {list.map((s) => (
          <Pressable key={s.id} onPress={() => { onChange(s.id); setOpen(false); }} accessibilityRole="button"
            style={[styles.staffRow, { borderColor: s.id === value ? withAlpha(theme.primary, 0.4) : theme.border, backgroundColor: s.id === value ? withAlpha(theme.primary, 0.08) : 'transparent' }]}>
            <ThemedText style={[styles.flex1, { fontSize: 14 }]} numberOfLines={1}>{s.name}</ThemedText>
            {s.phone ? <ThemedText themeColor="textMuted" style={{ fontSize: 13 }}>{s.phone}</ThemedText> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

// QuotationLineItemPicker: search local inventory (2+ characters), add a free-text manual line, edit
// description / HSN / qty / rate / discount (% or ₹), see each line's total, remove a line.
export function LineItemPicker({ items, onChange, wide }: { items: QLine[]; onChange: (items: QLine[]) => void; wide: boolean }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuotationItemSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [show, setShow] = useState(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const search = (q: string) => {
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { seq.current++; setShow(false); setResults([]); setSearching(false); return; }
    setSearching(true);
    setShow(true);
    const mine = ++seq.current;
    timer.current = setTimeout(async () => {
      try {
        const r = await searchQuotationItems(q.trim());
        if (mine !== seq.current) return;
        setResults(r);
      } catch {
        if (mine === seq.current) { setResults([]); setShow(false); }
      }
      if (mine === seq.current) setSearching(false);
    }, 300);
  };

  const addFromSearch = (item: QuotationItemSearchResult) => {
    const idx = items.findIndex((li) => li.inventoryItemId === item.id);
    if (idx >= 0) {
      onChange(items.map((li, i) => (i === idx ? { ...li, quantity: (Number(li.quantity) || 0) + 1 } : li)));
    } else {
      const gstPercent = item.gstApplicable ? (item.gstPercent || 18) : 0;
      onChange([...items, { description: item.name, hsnSacCode: '998714', quantity: 1, unitPrice: item.sellingPrice || 0, discountAmount: 0, discountMode: 'PERCENT', gstPercent, inventoryItemId: item.id }]);
    }
    seq.current++;
    setQuery(''); setResults([]); setShow(false); setSearching(false);
  };

  const update = (idx: number, patch: Partial<QLine>) => onChange(items.map((li, i) => (i === idx ? { ...li, ...patch } : li)));

  return (
    <View style={styles.gap}>
      <View>
        <Input label="Search items" value={query} onChangeText={search} placeholder="Type item name..." autoCorrect={false} />
        {show && (searching || results.length > 0) ? (
          <View style={[styles.results, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {searching ? <View style={styles.searching}><ActivityIndicator size="small" /><ThemedText themeColor="textMuted" style={{ fontSize: 13 }}>Searching…</ThemedText></View> : null}
            {results.map((item) => (
              <Pressable key={item.id} onPress={() => addFromSearch(item)} accessibilityRole="button" style={[styles.resultRow, { borderBottomColor: theme.border }]}>
                <ThemedText style={[styles.flex1, { fontSize: 14 }]} numberOfLines={2}>{item.name}</ThemedText>
                <ThemedText themeColor="textMuted" style={{ fontSize: 12 }}>{item.quantity ?? 0} {item.unit ?? ''} · ₹{item.sellingPrice || 0}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {items.map((item, idx) => {
        const fromInventory = !!item.inventoryItemId;
        return (
          <View key={idx} style={[styles.lineCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.lineHead}>
              <View style={styles.flex1}>
                <Input label="Item" value={item.description} placeholder="Description" onChangeText={(t) => update(idx, { description: t })} />
              </View>
              <Pressable onPress={() => onChange(items.filter((_, i) => i !== idx))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Remove line" style={styles.remove}>
                <Ionicons name="close" size={20} color={theme.textMuted} />
              </Pressable>
            </View>
            <View style={[styles.lineRow, wide && styles.lineRowWide]}>
              <View style={styles.flex1}>
                {fromInventory ? (
                  <View>
                    <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>HSN/SAC</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.plain}>{item.hsnSacCode}</ThemedText>
                  </View>
                ) : (
                  <Input label="HSN/SAC" value={item.hsnSacCode} placeholder="HSN/SAC" onChangeText={(t) => update(idx, { hsnSacCode: t })} />
                )}
              </View>
              <NumField label="Qty" value={item.quantity} onChange={(n) => update(idx, { quantity: n })} />
              <NumField label="Rate" value={item.unitPrice} onChange={(n) => update(idx, { unitPrice: n })} />
            </View>
            <View style={styles.lineRow}>
              <View style={styles.gstBox}>
                <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>GST%</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.plain}>{item.gstPercent != null ? `${item.gstPercent}%` : '—'}</ThemedText>
              </View>
              <View style={styles.discBox}>
                <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Disc</ThemedText>
                <View style={styles.discRow}>
                  <Pressable
                    onPress={() => update(idx, { discountMode: item.discountMode === 'PERCENT' ? 'FIXED' : 'PERCENT', discountAmount: 0 })}
                    accessibilityRole="button" accessibilityLabel="Toggle discount mode"
                    style={[styles.modeBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                    <ThemedText themeColor="textMuted" style={styles.modeText}>{item.discountMode === 'PERCENT' ? '%' : '₹'}</ThemedText>
                  </Pressable>
                  <NumField value={item.discountAmount} onChange={(n) => update(idx, { discountAmount: n })} placeholder="0" />
                </View>
              </View>
              <View style={styles.totalBox}>
                <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Total</ThemedText>
                <ThemedText style={[styles.money, styles.bold, styles.plain]}>₹{fmt(calcLineAmount(item))}</ThemedText>
              </View>
            </View>
          </View>
        );
      })}

      <Pressable onPress={() => onChange([...items, emptyLine()])} accessibilityRole="button" hitSlop={8}>
        <ThemedText style={[styles.addManual, { color: theme.primary }]}>+ Add manual line</ThemedText>
      </Pressable>
    </View>
  );
}


const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  bold: { fontFamily: FontWeights.bold },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 2 },
  totalLabel: { fontSize: 14, lineHeight: 20 },
  money: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono, fontVariant: ['tabular-nums'] },
  panel: { borderWidth: 1, borderRadius: Radii.md, padding: 12 },
  fieldLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium, marginBottom: 4 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14 },
  none: { textAlign: 'center', paddingVertical: 16, fontSize: 13 },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 12 },
  results: { marginTop: 4, borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  searching: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  lineCard: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 8 },
  lineHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  remove: { height: 44, width: 32, alignItems: 'center', justifyContent: 'center' },
  lineRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  lineRowWide: { gap: 12 },
  plain: { fontSize: 14, lineHeight: 20, paddingVertical: 10 },
  gstBox: { width: 56 },
  discBox: { flex: 1.4, minWidth: 0 },
  discRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  modeBtn: { width: 36, height: 44, borderWidth: 1, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  modeText: { fontSize: 14 },
  totalBox: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
  addManual: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
});

