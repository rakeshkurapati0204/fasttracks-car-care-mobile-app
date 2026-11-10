import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';

import { todayStr } from '@/components/attendance/attendance-format';
import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { TimeField } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bulkMarkAttendance, fetchEmployees, getErrorMessage } from '@/lib/api';

const BULK_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT'].map((s) => ({ value: s, label: s }));
const WIDE_MIN = 560;

type Emp = { id: string; name: string; role: string };

type Props = { onClose: () => void; onSuccess: () => void };

// Dashboard BulkMarkModal as a bottom sheet: Date, Status and (for Present /
// Late / Half Day) Clock-in time in a 2-column grid (3 once the content is
// wide), then a searchable employee list with Select All and a selected count.
export function BulkMarkSheet({ onClose, onSuccess }: Props) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [loadingEmps, setLoadingEmps] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('PRESENT');
  const [date, setDate] = useState(todayStr);
  const [clockIn, setClockIn] = useState('09:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchEmployees()
      .then((list) => setEmployees(list.filter((e) => e.isActive && e.role !== 'OWNER').map((e) => ({ id: e.id, name: e.name, role: e.role }))))
      .catch(() => setError('Failed to load employees.'))
      .finally(() => setLoadingEmps(false));
  }, []);

  const filtered = useMemo(() => employees.filter((e) => e.name.toLowerCase().includes(search.toLowerCase())), [employees, search]);
  const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id));
  const showClockIn = status === 'PRESENT' || status === 'LATE' || status === 'HALF_DAY';

  const toggleAll = () => setSelected((prev) => {
    const s = new Set(prev);
    if (allSelected) filtered.forEach((e) => s.delete(e.id));
    else filtered.forEach((e) => s.add(e.id));
    return s;
  });
  const toggleOne = (id: string) => setSelected((prev) => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });

  const submit = async () => {
    if (selected.size === 0) { setError('Select at least one employee.'); return; }
    if (!date) { setError('Pick a date.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await bulkMarkAttendance({ userIds: Array.from(selected), date, status, ...(showClockIn && clockIn ? { clockIn } : {}) });
      onSuccess();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to mark attendance.'));
    } finally {
      setSubmitting(false);
    }
  };

  const cols = width >= WIDE_MIN ? 3 : 2;
  const fields = [
    <DateField key="d" label="Date" value={date} onChange={setDate} />,
    <Select key="s" label="Status" options={BULK_STATUSES} value={status} onChange={setStatus} />,
    ...(showClockIn ? [<TimeField key="c" label="Clock-in Time (IST)" value={clockIn} onChange={setClockIn} />] : []),
  ];
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < fields.length; i += cols) rows.push(fields.slice(i, i + cols));

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={submitting}
      title="Bulk Mark Attendance"
      footer={
        <>
          <Button style={styles.flex1} variant="ghost" disabled={submitting} onPress={onClose}>Cancel</Button>
          <Button style={styles.flex1} loading={submitting} onPress={submit}>
            {`Mark ${selected.size > 0 ? `${selected.size} Employee${selected.size > 1 ? 's' : ''}` : 'Attendance'}`}
          </Button>
        </>
      }>
      <View style={styles.stack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.stack}>
          {rows.map((row, r) => (
            <View key={r} style={styles.gridRow}>
              {row.map((f, i) => <View key={i} style={styles.cell}>{f}</View>)}
              {Array.from({ length: cols - row.length }).map((_, k) => <View key={`p${k}`} style={styles.cell} />)}
            </View>
          ))}
        </View>

        <View style={styles.stack}>
          <View style={styles.searchRow}>
            <View style={styles.flex1}><Input value={search} onChangeText={setSearch} placeholder="Search employees..." autoCapitalize="none" /></View>
            <ThemedText themeColor="textMuted" style={styles.count}>{`${selected.size} selected`}</ThemedText>
          </View>

          {loadingEmps ? (
            <View style={styles.stack}><Skeleton height={36} /><Skeleton height={36} /><Skeleton height={36} /></View>
          ) : (
            <View style={[styles.listBox, { borderColor: theme.border }]}>
              <Pressable onPress={toggleAll} accessibilityRole="checkbox" accessibilityState={{ checked: allSelected }} style={[styles.selectAll, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
                <Check on={allSelected} />
                <ThemedText themeColor="textMuted" style={styles.selectAllText}>{`${allSelected ? 'DESELECT ALL' : 'SELECT ALL'} (${filtered.length})`}</ThemedText>
              </Pressable>
              <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filtered.length === 0 ? (
                  <ThemedText themeColor="textMuted" style={styles.none}>No employees found.</ThemedText>
                ) : (
                  filtered.map((emp, i) => {
                    const on = selected.has(emp.id);
                    return (
                      <Pressable
                        key={emp.id}
                        onPress={() => toggleOne(emp.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={[styles.empRow, i < filtered.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }, on && { backgroundColor: withAlpha(theme.primary, 0.06) }]}>
                        <Check on={on} />
                        <ThemedText style={[styles.empName, styles.flex1]} numberOfLines={1}>{emp.name}</ThemedText>
                        <View style={[styles.role, { backgroundColor: theme.backgroundElement }]}>
                          <ThemedText themeColor="textMuted" style={styles.roleText}>{emp.role.replace('_', ' ')}</ThemedText>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      </View>
    </Sheet>
  );
}

function Check({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
      {on ? <ThemedText style={styles.tick}>✓</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  stack: { gap: 16 },
  gridRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cell: { flex: 1, minWidth: 0 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  listBox: { borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  selectAllText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.5 },
  list: { maxHeight: 240 },
  none: { fontSize: 14, lineHeight: 20, textAlign: 'center', padding: 16 },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 44 },
  empName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  role: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.pill },
  roleText: { fontSize: 12, lineHeight: 16 },
  box: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 12, lineHeight: 14, fontFamily: FontWeights.bold },
  error: { color: '#dc2626', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
});
