import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DAY_SHORT, S, statusLabel } from '@/components/attendance/attendance-format';
import { ThemedText } from '@/components/themed-text';
import { Card, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AttendanceRegisterEmployee, AttendanceRegisterResponse } from '@/lib/api';

const GREEN = '#22c55e';
const RED = '#ef4444';
// Attendance counts only start from go-live; earlier days are shown but not totalled.
const GO_LIVE = '2026-05-28';

const NAME_W = 140;
const DAY_W = 32;
const PRESENT_W = 80;
const ABSENT_W = 60;
const HEAD_H = 46;
const TOTAL_H = 46;
const ROW_H = 52;

// ── Month navigation bar ─────────────────────────────────────────────────────
export function MonthNav({ title, subtitle, isCurrentMonth, wide, onPrev, onNext }: {
  title: string; subtitle?: string; isCurrentMonth: boolean; wide: boolean; onPrev: () => void; onNext: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.nav, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Pressable onPress={onPrev} accessibilityRole="button" accessibilityLabel="Previous month" style={[styles.navBtn, { backgroundColor: theme.backgroundElement }]}>
        <Ionicons name="chevron-back" size={16} color={theme.textMuted} />
        {wide ? <ThemedText themeColor="textMuted" style={styles.navText}>Prev</ThemedText> : null}
      </Pressable>
      <View style={styles.navTitle}>
        <ThemedText style={styles.navTitleText}>{title}</ThemedText>
        {subtitle ? <ThemedText themeColor="textMuted" style={styles.navSub}>{subtitle}</ThemedText> : null}
      </View>
      <Pressable
        onPress={onNext}
        disabled={isCurrentMonth}
        accessibilityRole="button"
        accessibilityLabel={isCurrentMonth ? 'Already on current month' : 'Next month'}
        style={[styles.navBtn, { backgroundColor: theme.backgroundElement }]}>
        {wide ? <ThemedText style={[styles.navText, { color: isCurrentMonth ? theme.border : theme.textMuted }]}>Next</ThemedText> : null}
        <Ionicons name="chevron-forward" size={16} color={isCurrentMonth ? theme.border : theme.textMuted} />
      </Pressable>
    </View>
  );
}

// ── Legend chips (P / LT / HD / A / LV) ──────────────────────────────────────
export function Legend() {
  return (
    <View style={styles.legend}>
      {Object.values(S).map((v) => (
        <View key={v.label} style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: v.bg }]}><ThemedText style={styles.legendCode}>{v.label}</ThemedText></View>
          <ThemedText themeColor="textMuted" style={styles.legendText}>{statusLabel(v.label)}</ThemedText>
        </View>
      ))}
    </View>
  );
}

// The coloured status pill inside a register cell.
function StatusPill({ bg, label }: { bg: string; label: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <ThemedText style={styles.pillText}>{label}</ThemedText>
    </View>
  );
}

type Row = { emp: AttendanceRegisterEmployee; present: number; absent: number; workingDays: number };

type Props = {
  regData: AttendanceRegisterResponse | null;
  loading: boolean;
  wide: boolean;
  /** The Today's Attendance search also filters the register, as on the dashboard. */
  search: string;
  canOverride: boolean;
  onOpenOverride: (empId: string, empName: string, date: string, currentStatus: string) => void;
  onOpenDay: (date: string) => void;
};

// Dashboard "Monthly Register": a sticky Name column (min 140) beside a
// sideways-scrolling block of one coloured status code per day, then Present
// and Absent totals. Tap a header day for that day's sheet; tap a cell to
// override (Owner / Store Manager) or open the day (everyone else).
export function RegisterGrid({ regData, loading, wide, search, canOverride, onOpenOverride, onOpenDay }: Props) {
  const theme = useTheme();

  const { rows, perDay } = useMemo(() => {
    if (!regData) return { rows: [] as Row[], perDay: [] as number[] };
    const countable = regData.dates.filter((d) => d >= GO_LIVE);
    const q = search.trim().toLowerCase();
    const sorted = [...regData.employees].sort((a, b) => a.name.localeCompare(b.name));
    const built: Row[] = sorted
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .map((emp) => {
        let present = 0;
        let absent = 0;
        for (const d of countable) {
          const s = emp.attendance[d]?.status;
          if (s === 'PRESENT' || s === 'LATE' || s === 'HALF_DAY') present++;
          else if (s === 'ABSENT') absent++;
        }
        return { emp, present, absent, workingDays: countable.length };
      });
    const day = regData.dates.map((d) => regData.employees.filter((e) => {
      const s = e.attendance[d]?.status;
      return s === 'PRESENT' || s === 'LATE' || s === 'HALF_DAY';
    }).length);
    return { rows: built, perDay: day };
  }, [regData, search]);

  return (
    <View>
      <View style={styles.head}>
        <ThemedText style={styles.h2}>Monthly Register</ThemedText>
        {wide ? <Legend /> : null}
      </View>
      {!wide ? <View style={styles.mobileLegend}><Legend /></View> : null}

      {loading || !regData ? (
        <Card padding="md"><Skeleton height={256} /></Card>
      ) : regData.employees.length === 0 ? (
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.empty}>No employee data yet.</ThemedText></Card>
      ) : (
        <Card padding="none" style={styles.clip}>
          <View style={styles.tableRow}>
            {/* Sticky name column */}
            <View style={[styles.nameCol, { borderRightColor: theme.border, backgroundColor: theme.surface }]}>
              <View style={[styles.nameHead, { backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
                <ThemedText style={styles.nameHeadText}>Name</ThemedText>
              </View>
              <View style={[styles.nameTotal, { backgroundColor: 'rgba(104,15,26,0.08)', borderBottomColor: theme.border }]}>
                <ThemedText themeColor="textMuted" style={styles.totalLabel}>Total present</ThemedText>
              </View>
              {rows.map(({ emp }, idx) => (
                <View key={emp.id} style={[styles.nameCell, { backgroundColor: idx % 2 === 0 ? theme.surface : theme.backgroundElement, borderBottomColor: theme.border }]}>
                  <ThemedText style={styles.empName} numberOfLines={1}>{emp.name}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.empRole} numberOfLines={1}>{emp.role.replace(/_/g, ' ')}</ThemedText>
                </View>
              ))}
            </View>

            {/* Day columns + totals scroll sideways */}
            <ScrollView horizontal showsHorizontalScrollIndicator style={styles.flex1} nestedScrollEnabled>
              <View>
                <View style={[styles.line, { height: HEAD_H, backgroundColor: theme.backgroundElement, borderBottomColor: theme.border }]}>
                  {regData.dates.map((d) => {
                    const dObj = new Date(`${d}T00:00:00Z`);
                    return (
                      <Pressable key={d} onPress={() => onOpenDay(d)} accessibilityRole="button" accessibilityLabel={d} style={[styles.dayHead, { borderRightColor: theme.border }]}>
                        <ThemedText themeColor="textMuted" style={styles.dayNum}>{dObj.getUTCDate()}</ThemedText>
                        <ThemedText themeColor="textMuted" style={styles.dayDow}>{DAY_SHORT[dObj.getUTCDay()]}</ThemedText>
                      </Pressable>
                    );
                  })}
                  <View style={[styles.sumHead, { width: PRESENT_W, borderLeftColor: theme.border }]}><ThemedText themeColor="textMuted" style={styles.sumHeadText}>Present</ThemedText></View>
                  <View style={[styles.sumHead, { width: ABSENT_W }]}><ThemedText themeColor="textMuted" style={styles.sumHeadText}>Absent</ThemedText></View>
                </View>

                <View style={[styles.line, { height: TOTAL_H, backgroundColor: 'rgba(104,15,26,0.06)', borderBottomColor: theme.border, borderBottomWidth: 2 }]}>
                  {regData.dates.map((d, i) => (
                    <View key={d} style={[styles.dayCell, { borderRightColor: theme.border }]}>
                      <ThemedText style={[styles.totalNum, { color: GREEN }]}>{perDay[i]}</ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.totalOf}>{`/${regData.totalEmployees ?? regData.employees.length}`}</ThemedText>
                    </View>
                  ))}
                  <View style={{ width: PRESENT_W + ABSENT_W }} />
                </View>

                {rows.map((row, idx) => (
                  <RegisterRow
                    key={row.emp.id}
                    row={row}
                    dates={regData.dates}
                    alt={idx % 2 === 1}
                    canOverride={canOverride}
                    onOpenOverride={onOpenOverride}
                    onOpenDay={onOpenDay}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        </Card>
      )}
    </View>
  );
}

const RegisterRow = memo(function RegisterRow({ row, dates, alt, canOverride, onOpenOverride, onOpenDay }: {
  row: Row; dates: string[]; alt: boolean; canOverride: boolean;
  onOpenOverride: Props['onOpenOverride']; onOpenDay: Props['onOpenDay'];
}) {
  const theme = useTheme();
  const { emp, present, absent, workingDays } = row;
  return (
    <View style={[styles.line, { height: ROW_H, borderBottomColor: theme.border, backgroundColor: alt ? theme.backgroundElement : 'transparent' }]}>
      {dates.map((d) => {
        const rec = emp.attendance[d];
        const sc = rec ? S[rec.status] : null;
        return (
          <Pressable
            key={d}
            onPress={() => (canOverride ? onOpenOverride(emp.id, emp.name, d, rec?.status || 'ABSENT') : onOpenDay(d))}
            accessibilityRole="button"
            accessibilityLabel={`${emp.name}, ${d}, ${rec ? rec.status : canOverride ? 'set attendance' : 'no record'}`}
            style={[styles.dayCell, { borderRightColor: theme.border }]}>
            {sc ? <StatusPill bg={sc.bg} label={sc.label} /> : <ThemedText style={[styles.dot, { color: theme.border }]}>·</ThemedText>}
            {rec?.isOverridden ? <ThemedText style={styles.pencil}>✏️</ThemedText> : null}
          </Pressable>
        );
      })}
      <View style={[styles.sumCell, { width: PRESENT_W, borderLeftColor: theme.border }]}>
        <ThemedText style={[styles.totalNum, { color: GREEN }]}>{present}</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.totalOfBig}>{`/${workingDays}`}</ThemedText>
      </View>
      <View style={[styles.sumCell, { width: ABSENT_W }]}>
        <ThemedText style={[styles.totalNum, { color: absent > 0 ? RED : theme.textMuted }]}>{absent}</ThemedText>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  clip: { overflow: 'hidden', borderRadius: Radii.md },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm, minHeight: 40, minWidth: 40, justifyContent: 'center' },
  navText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  navTitle: { alignItems: 'center' },
  navTitleText: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  navSub: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' },
  h2: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.bold },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  mobileLegend: { marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendBox: { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  legendCode: { color: '#fff', fontSize: 10, lineHeight: 12, fontFamily: FontWeights.bold },
  legendText: { fontSize: 12, lineHeight: 16 },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20 },
  tableRow: { flexDirection: 'row' },
  nameCol: { width: NAME_W, borderRightWidth: 1 },
  nameHead: { height: HEAD_H, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  nameHeadText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold },
  nameTotal: { height: TOTAL_H, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 2 },
  totalLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  nameCell: { height: ROW_H, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  empName: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  empRole: { fontSize: 10, lineHeight: 14, opacity: 0.6 },
  line: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1 },
  dayHead: { width: DAY_W, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1 },
  dayNum: { fontSize: 10, lineHeight: 13, fontFamily: FontWeights.bold },
  dayDow: { fontSize: 9, lineHeight: 12, opacity: 0.6 },
  dayCell: { width: DAY_W, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1 },
  sumHead: { alignItems: 'center', justifyContent: 'center', borderLeftWidth: 0 },
  sumHeadText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold },
  sumCell: { alignItems: 'center', justifyContent: 'center' },
  totalNum: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  totalOf: { fontSize: 9, lineHeight: 12, opacity: 0.5 },
  totalOfBig: { fontSize: 10, lineHeight: 14 },
  pill: { minWidth: 20, height: 18, paddingHorizontal: 2, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: '#fff', fontSize: 9, lineHeight: 12, fontFamily: FontWeights.bold },
  dot: { fontSize: 10, lineHeight: 14 },
  pencil: { position: 'absolute', top: 1, right: 2, fontSize: 8, lineHeight: 10 },
});
