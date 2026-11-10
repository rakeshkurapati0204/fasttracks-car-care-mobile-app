import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, MonthYearRow } from '@/components/employees/tab-parts';
import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui';
import { Fonts, FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchEmployeePunchHistory, type PunchHistoryRow } from '@/lib/employee-tabs-api';

// Dashboard employees/page.tsx → Scans tab (state ~1492–1511, UI ~2630–2709): the month's face scans from
// GET /attendance/punch-history/:userId, newest first, with the backend's derived interpretation as the badge
// (IN / OUT / IGNORED). Date is the IST calendar day; the time is shown in IST.
function punchBadge(interpretation?: string) {
  if (interpretation === 'CLOCK_IN') return { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', arrow: '→', label: 'IN' };
  if (interpretation === 'CLOCK_OUT') return { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626', arrow: '←', label: 'OUT' };
  return { bg: 'rgba(148,163,184,0.14)', fg: '#64748b', arrow: '·', label: 'IGNORED' };
}

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

export function EmployeeScansTab({ employeeId, now }: { employeeId: string; now: Date }) {
  const theme = useTheme();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [scans, setScans] = useState<PunchHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (m: number, y: number) => {
    setLoading(true);
    try { setScans(await fetchEmployeePunchHistory(employeeId, m, y)); }
    catch { setScans([]); }
    finally { setLoading(false); }
  }, [employeeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on month/year change
    load(month, year);
  }, [load, month, year]);

  return (
    <View style={styles.gap}>
      <MonthYearRow month={month} year={year} onMonth={setMonth} onYear={setYear} nowYear={now.getFullYear()} />

      {loading ? (
        <View style={styles.gapSm}>{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={44} />)}</View>
      ) : scans.length === 0 ? (
        <Card style={styles.empty}>
          <Ionicons name="scan-outline" size={40} color={theme.textMuted} style={{ opacity: 0.4 }} />
          <ThemedText themeColor="textMuted" style={styles.p}>No face scans recorded for this month</ThemedText>
        </Card>
      ) : (
        <Card padded={false} style={{ overflow: 'hidden' }}>
          <View style={[styles.head, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <ThemedText themeColor="textMuted" style={[styles.th, styles.c1]}>DATE</ThemedText>
            <ThemedText themeColor="textMuted" style={[styles.th, styles.c2]}>TIME</ThemedText>
            <ThemedText themeColor="textMuted" style={[styles.th, styles.c3]}>DIRECTION</ThemedText>
          </View>
          {scans.map((scan, i) => {
            const b = punchBadge(scan.interpretation);
            return (
              <View key={scan.id} style={[styles.tr, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <ThemedText themeColor="textSecondary" style={[styles.mono, styles.c1]}>
                  {new Date(`${scan.date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC' })}
                </ThemedText>
                <ThemedText style={[styles.mono, styles.c2, { fontWeight: '600' }]}>{scan.time ? formatTime(scan.time) : '—'}</ThemedText>
                <View style={styles.c3}>
                  <View style={[styles.pill, { backgroundColor: b.bg }]}>
                    <ThemedText style={[styles.pillText, { color: b.fg }]}>{b.arrow} {b.label}</ThemedText>
                  </View>
                </View>
              </View>
            );
          })}
          <View style={[styles.foot, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
            <ThemedText themeColor="textMuted" style={styles.footText}>{scans.length} scan{scans.length !== 1 ? 's' : ''} this month</ThemedText>
          </View>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 16 },
  gapSm: { gap: 8 },
  empty: { padding: 40, alignItems: 'center', gap: 8 },
  p: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  head: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  th: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  c1: { flex: 1.1 },
  c2: { flex: 1 },
  c3: { flex: 1, alignItems: 'flex-start' },
  mono: { fontSize: 12, lineHeight: 16, fontFamily: Fonts?.mono },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  foot: { paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1 },
  footText: { fontSize: 10, lineHeight: 14 },
});
