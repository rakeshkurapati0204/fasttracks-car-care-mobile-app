import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Children, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Select } from '@/components/ui';
import { FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCandidates } from '@/lib/api';
import type { Candidate, OnboardingEmployee } from '@/types/api';

const WIDE_MIN = 560;

// Dashboard `grid grid-cols-1 sm:grid-cols-N`: N columns once the container
// (the area beside the sidebar, measured here) is wide, otherwise one.
export function FormGrid({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  const [width, setWidth] = useState(0);
  const n = width >= WIDE_MIN ? cols : 1;
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += n) rows.push(items.slice(i, i + n));
  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((item, c) => <View key={c} style={styles.cell}>{item}</View>)}
          {Array.from({ length: n - row.length }).map((_, k) => <View key={`p${k}`} style={styles.cell} />)}
        </View>
      ))}
    </View>
  );
}

// Pre-hire candidates aren't in the active-employee list; the pickers on the
// Employment, Pre-Joining, Documents and Letters tabs merge them in.
export function useCandidates(refreshKey = 0) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  useEffect(() => {
    fetchCandidates().then(setCandidates).catch(() => {});
  }, [refreshKey]);
  return candidates;
}

type PersonSelectProps = {
  employees: OnboardingEmployee[];
  candidates?: Candidate[];
  userId: string;
  onChange: (id: string) => void;
};

// The dashboard's "Employee *" dropdown: "Name (EMP-ID or role)", candidates tagged "Candidate".
export function PersonSelect({ employees, candidates = [], userId, onChange }: PersonSelectProps) {
  const options = useMemo(
    () => [
      ...employees.map((e) => ({ value: e.id, label: `${e.name} (${e.employeeId || e.role})` })),
      ...candidates.map((c) => ({ value: c.id, label: `${c.name} (Candidate)` })),
    ],
    [employees, candidates],
  );
  return <Select label="Employee" required placeholder="Select employee…" options={options} value={userId} onChange={onChange} />;
}

// Dashboard's green "Saved." strip.
export function SuccessBanner({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: withAlpha(theme.success, 0.1), borderColor: withAlpha(theme.success, 0.3) }]}>
      <ThemedText type="small" style={{ color: theme.success }}>{message}</ThemedText>
    </View>
  );
}

// Small uppercase muted heading ("EMERGENCY CONTACT").
export function GroupTitle({ children }: { children: string }) {
  return <ThemedText themeColor="textMuted" style={styles.groupTitle}>{children.toUpperCase()}</ThemedText>;
}

// "HH:MM" (24h) time field for Pre-Joining's In / Out time.
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (hhmm: string) => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [h, m] = value ? value.split(':').map(Number) : [9, 0];
  const shown = value ? `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` : '--:--';
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return (
    <View>
      <ThemedText themeColor="textMuted" style={styles.timeLabel}>{label}</ThemedText>
      <View style={[styles.timeField, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label} style={styles.timePick}>
          <ThemedText style={[styles.timeValue, !value && { color: theme.textMuted }]}>{shown}</ThemedText>
          <Ionicons name="time-outline" size={16} color={theme.textSecondary} />
        </Pressable>
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={Spacing.two} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_e, selected) => {
            setOpen(Platform.OS === 'ios');
            if (selected) onChange(`${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`);
          }}
        />
      ) : null}
      {open && Platform.OS === 'ios' ? (
        <Pressable onPress={() => setOpen(false)} style={styles.done}><ThemedText type="small">Done</ThemedText></Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12 },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  cell: { flex: 1, minWidth: 0 },
  banner: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: Radii.md },
  groupTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  timeLabel: { fontSize: 11, lineHeight: 16, marginBottom: 2 },
  timeField: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14 },
  timePick: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  timeValue: { fontSize: 14, lineHeight: 20 },
  done: { alignSelf: 'flex-end', padding: Spacing.two },
});
