import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Card, Flash, MonthYearRow, useFlash } from '@/components/employees/tab-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchEmployeeMonthAttendance, pardonAttendanceDay, type MonthAttendanceRow } from '@/lib/employee-tabs-api';

// Dashboard employees/page.tsx → Pardon tab (state ~1440–1490, UI ~2513–2627, sticky footer ~2903). Lists the month's
// ABSENT / HALF_DAY days, multi-select, then PATCH /attendance/pardon { userId, date, newStatus: 'PRESENT' } for each.
// The backend allows OWNER / STORE_MANAGER / ACCOUNTING / CASHIER; anyone else gets "Some pardons failed", as on the dashboard.
const STATUS_COLORS: Record<string, { bg: string; label: string }> = {
  PRESENT: { bg: '#22c55e', label: 'P' },
  LATE: { bg: '#f59e0b', label: 'L' },
  HALF_DAY: { bg: '#f97316', label: 'HD' },
  ABSENT: { bg: '#ef4444', label: 'A' },
  LEAVE: { bg: '#ef4444', label: 'A' },
};

type Props = {
  employeeId: string;
  now: Date;
  /** Reloads Overview payroll after a successful pardon (the dashboard's pardonVersion). */
  onPardoned: () => void;
  bottomInset: number;
};

export function EmployeePardonTab({ employeeId, now, onPardoned, bottomInset }: Props) {
  const theme = useTheme();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<MonthAttendanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pardoning, setPardoning] = useState(false);
  const { msg, flash } = useFlash(3000);

  const load = useCallback(async (m: number, y: number) => {
    setLoading(true);
    setSelected(new Set());
    try { setRows(await fetchEmployeeMonthAttendance(employeeId, m, y)); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }, [employeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on month/year change
    load(month, year);
  }, [load, month, year]);

  const absences = rows.filter((r) => r.status === 'ABSENT' || r.status === 'HALF_DAY');
  const allSelected = absences.length > 0 && absences.every((r) => selected.has(r.date));

  const toggle = (date: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });

  const pardonSelected = async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    setPardoning(true);
    try {
      await Promise.all(Array.from(selected).map((date) => pardonAttendanceDay(employeeId, date, 'PRESENT')));
      flash(`✓ ${count} day${count > 1 ? 's' : ''} pardoned`);
      setSelected(new Set());
      await load(month, year);
      onPardoned();
    } catch {
      flash('Some pardons failed');
    } finally {
      setPardoning(false);
    }
  };

  return (
    <View style={styles.flex1}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.gap}>
          <Flash msg={msg} />
          <MonthYearRow month={month} year={year} onMonth={setMonth} onYear={setYear} nowYear={now.getFullYear()} />

          {loading ? (
            <View style={styles.gapSm}><Skeleton height={48} /><Skeleton height={48} /><Skeleton height={48} /></View>
          ) : absences.length === 0 ? (
            <Card style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={40} color={theme.textMuted} style={{ opacity: 0.4 }} />
              <ThemedText themeColor="textMuted" style={styles.emptyTitle}>No absences this month</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.small}>Nothing to pardon for this period.</ThemedText>
            </Card>
          ) : (
            <View style={styles.gapSm}>
              <View style={styles.between}>
                <Pressable onPress={() => setSelected(allSelected ? new Set() : new Set(absences.map((r) => r.date)))} hitSlop={8} accessibilityRole="button">
                  <ThemedText style={[styles.selectAll, { color: theme.primary }]}>{allSelected ? 'Deselect All' : 'Select All'}</ThemedText>
                </Pressable>
                <ThemedText themeColor="textMuted" style={styles.small}>{selected.size} of {absences.length} selected</ThemedText>
              </View>
              {absences.map((rec) => {
                const sc = STATUS_COLORS[rec.status] ?? { bg: '#6b7280', label: '?' };
                const checked = selected.has(rec.date);
                const label = new Date(`${rec.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
                return (
                  <Pressable
                    key={rec.date}
                    onPress={() => toggle(rec.date)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    style={[styles.day, { backgroundColor: checked ? 'rgba(104,15,26,0.08)' : theme.surface, borderColor: checked ? theme.primary : 'transparent' }]}>
                    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? theme.primary : theme.textMuted} />
                    <View style={[styles.badge, { backgroundColor: sc.bg }]}><ThemedText style={styles.badgeText}>{sc.label}</ThemedText></View>
                    <ThemedText style={styles.dayLabel}>{label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}

          <ThemedText themeColor="textMuted" style={styles.small}>Pardoning marks selected days as PRESENT, automatically updating payroll deductions.</ThemedText>
        </View>
      </ScrollView>

      {selected.size > 0 ? (
        <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.backgroundElement, paddingBottom: 12 + bottomInset }]}>
          <View style={styles.flex1}>
            <Button fullWidth loading={pardoning} onPress={pardonSelected}>{`Pardon ${selected.size} Day${selected.size > 1 ? 's' : ''} → Mark as PRESENT`}</Button>
          </View>
          <Button variant="ghost" onPress={() => setSelected(new Set())} disabled={pardoning}>Clear</Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { padding: 20, paddingTop: 16 },
  gap: { gap: 16 },
  gapSm: { gap: 8 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 16 },
  selectAll: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, textDecorationLine: 'underline' },
  day: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radii.lg, borderWidth: 2 },
  badge: { width: 32, height: 24, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  dayLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: 1 },
});
