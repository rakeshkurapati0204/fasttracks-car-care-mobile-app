import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAvatarColor, getInitials } from '@/components/employees/employee-format';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui';
import { Fonts, FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchMyLateRecords, fetchMyOvertime, fetchMyPayroll, fetchMyWarnings } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { LateRecord, PayrollResult } from '@/types/api';

const WIDE_MIN = 560;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// One payroll month; fetchFailed marks a month whose request failed, whose
// other fields are placeholders and must never be shown as real figures.
interface PayrollMonth extends PayrollResult {
  month: number;
  year: number;
  fetchFailed?: boolean;
}

// ₹45,000: Indian grouping, no decimals.
function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
// Parse a UTC date string without a timezone shift.
function localDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmtShort(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtFull(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const PENALTY_COLOR: Record<string, string> = { WARNING: '#f59e0b', HALF_DAY: '#ef4444', FULL_DAY: '#dc2626', ONE_HALF_DAY: '#991b1b' };
const PENALTY_LABEL: Record<string, string> = { WARNING: 'Warning', HALF_DAY: '½ Day Deducted', FULL_DAY: '1 Day Deducted', ONE_HALF_DAY: '1.5 Days Deducted' };

const GREEN = '#22c55e';
const RED = '#ef4444';
const AMBER = '#f59e0b';
const BLUE = '#3b82f6';

const HEAD = ['Month', 'Cycle', 'Present', 'Deductions', 'Net Salary', 'Status'];
const FLEX = [1.3, 1.25, 0.8, 1.1, 1.15, 0.9];

export default function MySalaryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuth();

  const [width, setWidth] = useState(0);
  const [history, setHistory] = useState<PayrollMonth[]>([]);
  const [currentPayroll, setCurrentPayroll] = useState<PayrollMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalWarnings, setTotalWarnings] = useState(0);
  const [lateCountMonth, setLateCountMonth] = useState(0);
  const [lateRecords, setLateRecords] = useState<LateRecord[]>([]);
  const [overtimeThisMonth, setOvertimeThisMonth] = useState({ count: 0, totalPay: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const now = new Date();
  const todayDate = now.getDate();
  const curMonth = now.getMonth() + 1;
  const curYear = now.getFullYear();

  // Salary basics come from the signed-in user (/auth/me): this screen is self-only.
  const monthlySalary = user?.monthlySalary ?? 0;
  const salaryType = user?.salaryType ?? 'MONTHLY';
  const joiningDateStr = user?.joiningDate ?? null;

  // The cycle is the calendar month (the backend queries calendar months).
  const cycleStart = new Date(curYear, curMonth - 1, 1);
  const cycleEnd = new Date(curYear, curMonth, 0);
  // Next salary date is the 1st of every month; on payday itself show today.
  const nextSalaryDate = todayDate === 1
    ? new Date(curYear, curMonth - 1, 1)
    : new Date(curMonth === 12 ? curYear + 1 : curYear, curMonth === 12 ? 0 : curMonth, 1);
  const dailyRateFallback = monthlySalary > 0 ? monthlySalary / new Date(curYear, curMonth, 0).getDate() : 0;

  const load = useCallback(async () => {
    // Salary not configured: skip the payroll calls, the backend returns null anyway.
    if (!monthlySalary || !joiningDateStr) { setLoading(false); return; }
    setLoading(true);

    try {
      const [warnings, lates, overtime] = await Promise.all([fetchMyWarnings(), fetchMyLateRecords(curMonth, curYear), fetchMyOvertime(curMonth, curYear)]);
      setTotalWarnings(warnings.length);
      setLateCountMonth(lates.length);
      setLateRecords(lates);
      const approved = overtime.filter((r) => r.status === 'APPROVED');
      setOvertimeThisMonth({ count: approved.length, totalPay: approved.reduce((s, r) => s + (r.overtimePay ?? 0), 0) });
    } catch {
      // non-fatal: payroll still shows
    }

    // The current cycle month plus the 5 before it.
    const targets: { month: number; year: number }[] = [];
    for (let i = 0; i < 6; i++) {
      let m = curMonth - i;
      let y = curYear;
      if (m <= 0) { m += 12; y -= 1; }
      targets.push({ month: m, year: y });
    }

    const months = await Promise.all(
      targets.map(async ({ month, year }): Promise<PayrollMonth> => {
        try {
          const d = await fetchMyPayroll(user!.id, month, year);
          return { ...d, month, year };
        } catch {
          // Never fabricate a plausible row for a failed month: mark it failed.
          const start = new Date(year, month - 1, 1);
          const end = new Date(year, month, 0);
          return {
            month, year,
            monthlySalary: 0, presentDays: 0, absentDays: 0, halfDays: 0, leaveDays: 0,
            earnedSalary: 0, absentDeduction: 0, halfDayDeduction: 0, lateDeduction: 0,
            lateCount: 0, carriedLates: 0, lateFullDays: 0, lateHalfDays: 0, lateCarryForward: 0,
            carriedLateDeduction: 0, totalOvertimePay: 0, totalLoanDeduction: 0, loanDeductions: [],
            totalDeductions: 0, netSalary: 0, finalSalaryOverride: null,
            cycleStart: start.toISOString().split('T')[0], cycleEnd: end.toISOString().split('T')[0],
            dailyRate: 0, payableDays: 0, fetchFailed: true,
          };
        }
      }),
    );
    months.sort((a, b) => (b.year !== a.year ? b.year - a.year : b.month - a.month));
    setHistory(months);
    setCurrentPayroll(months.find((m) => m.month === curMonth && m.year === curYear) ?? null);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const cur = currentPayroll;
  const curFetchFailed = cur?.fetchFailed === true;
  // Fall back to the raw salary only while no row exists yet; never when the
  // row exists but its fetch failed (that would look like real data).
  const curDeductions = cur && !curFetchFailed ? cur.totalDeductions : 0;
  const curNet = cur && !curFetchFailed ? cur.netSalary : monthlySalary;
  const curPresent = cur?.presentDays ?? 0;
  const curAbsent = cur?.absentDays ?? 0;
  const curHalf = cur?.halfDays ?? 0;
  const curLeave = cur?.leaveDays ?? 0;
  const curLoanDeductions = cur?.loanDeductions ?? [];
  const curDailyRate = cur?.dailyRate ?? dailyRateFallback;

  const wide = width >= WIDE_MIN;
  const card = { backgroundColor: theme.surface, borderColor: theme.border };
  const name = user?.name ?? '';

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'My Salary' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* ── HERO SALARY CARD ─────────────────────────────────────────── */}
        <View style={[styles.hero, { backgroundColor: theme.primary, padding: wide ? 32 : 24 }]}>
          <View style={[styles.circle, styles.circleTop]} />
          <View style={[styles.circle, styles.circleBottom]} />

          <View style={styles.heroBody}>
            <View style={styles.heroHead}>
              <View style={[styles.avatar, { backgroundColor: getAvatarColor(name) }]}>
                <ThemedText style={styles.avatarText}>{getInitials(name)}</ThemedText>
              </View>
              <View style={styles.flex1}>
                <ThemedText style={styles.heroName}>{user?.name ?? '—'}</ThemedText>
                {user?.designation ? <ThemedText style={styles.heroSub}>{user.designation}</ThemedText> : null}
                <View style={styles.typeBadge}><ThemedText style={styles.typeText}>{salaryType}</ThemedText></View>
              </View>
            </View>

            <View>
              <ThemedText style={styles.heroLabel}>MONTHLY SALARY</ThemedText>
              {monthlySalary > 0 ? (
                <ThemedText style={[styles.heroSalary, { fontSize: wide ? 56 : 44, lineHeight: wide ? 60 : 48 }]} numberOfLines={1} adjustsFontSizeToFit>{fmt(monthlySalary)}</ThemedText>
              ) : (
                <ThemedText style={styles.notConfigured}>Not configured</ThemedText>
              )}
            </View>

            <View style={styles.heroStats}>
              <View style={styles.statBox}>
                <ThemedText style={styles.statLabel}>CURRENT CYCLE</ThemedText>
                {joiningDateStr ? (
                  <>
                    <ThemedText style={styles.statValue}>{`${fmtShort(cycleStart)} – ${fmtShort(cycleEnd)}`}</ThemedText>
                    <ThemedText style={styles.statSub}>{`Joined ${fmtFull(localDate(joiningDateStr))}`}</ThemedText>
                  </>
                ) : (
                  <ThemedText style={styles.statNone}>No joining date</ThemedText>
                )}
              </View>
              <View style={styles.statBox}>
                <ThemedText style={styles.statLabel}>NEXT SALARY DATE</ThemedText>
                {joiningDateStr ? (
                  <>
                    <ThemedText style={[styles.statValue, { color: '#86efac' }]}>{fmtFull(nextSalaryDate)}</ThemedText>
                    <ThemedText style={styles.statSub}>{`${Math.max(0, Math.ceil((nextSalaryDate.getTime() - now.getTime()) / 86400000))} days away`}</ThemedText>
                  </>
                ) : (
                  <ThemedText style={styles.statNone}>—</ThemedText>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* ── CURRENT MONTH BREAKDOWN ──────────────────────────────────── */}
        <View style={[styles.panel, card]}>
          <View style={styles.panelHead}>
            <ThemedText style={styles.h2}>{`${MONTH_NAMES[curMonth - 1]} ${curYear}`}</ThemedText>
          </View>

          <View style={styles.boxes}>
            {[
              { label: 'Present', value: curPresent, color: GREEN, bg: 'rgba(34,197,94,0.1)' },
              { label: 'Absent', value: curAbsent, color: RED, bg: 'rgba(239,68,68,0.1)' },
              { label: 'Half Day', value: curHalf, color: AMBER, bg: 'rgba(245,158,11,0.1)' },
              { label: 'Leave', value: curLeave, color: BLUE, bg: 'rgba(59,130,246,0.1)' },
            ].map((s) => (
              <View key={s.label} style={[styles.box, { backgroundColor: s.bg }]}>
                <ThemedText style={[styles.boxValue, { color: s.color }]} numberOfLines={1} adjustsFontSizeToFit>{s.value}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.boxLabel} numberOfLines={1}>{s.label}</ThemedText>
              </View>
            ))}
          </View>

          {curFetchFailed ? (
            <View style={styles.fail}>
              <ThemedText style={styles.failText}>Couldn’t load this month’s payroll — the figures below are not real. Refresh to try again.</ThemedText>
              <Pressable onPress={load} accessibilityRole="button" hitSlop={8}><ThemedText style={styles.failRetry}>Retry</ThemedText></Pressable>
            </View>
          ) : null}

          <View style={[styles.netRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.flex1}>
              <ThemedText themeColor="textMuted" style={styles.upper}>DEDUCTIONS</ThemedText>
              <ThemedText style={[styles.money, { fontSize: 22, color: curDeductions > 0 ? RED : theme.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
                {curDeductions > 0 ? `– ${fmt(curDeductions)}` : '₹0'}
              </ThemedText>
              <ThemedText themeColor="textMuted" style={styles.tiny}>
                {`${fmt(curDailyRate)}/day${curDeductions > 0 ? ` × ${curAbsent + curHalf * 0.5} deducted days` : ''}`}
              </ThemedText>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={[styles.flex1, styles.right]}>
              <ThemedText themeColor="textMuted" style={styles.upper}>NET PAYABLE</ThemedText>
              <ThemedText style={[styles.money, { fontSize: 28, color: GREEN }]} numberOfLines={1} adjustsFontSizeToFit>{fmt(curNet)}</ThemedText>
              {cur?.earnedSalary != null && cur.earnedSalary !== monthlySalary ? (
                <ThemedText themeColor="textMuted" style={[styles.tiny, styles.rightText]}>
                  {`earned ${fmt(cur.earnedSalary)} (${cur.payableDays ?? '?'} days) · gross ${fmt(monthlySalary)}${overtimeThisMonth.totalPay > 0 ? ` + ${fmt(overtimeThisMonth.totalPay)} OT` : ''}`}
                </ThemedText>
              ) : (
                <ThemedText themeColor="textMuted" style={[styles.tiny, styles.rightText]}>
                  {`of ${fmt(monthlySalary)} gross${overtimeThisMonth.totalPay > 0 ? ` + ${fmt(overtimeThisMonth.totalPay)} OT` : ''}`}
                </ThemedText>
              )}
              {cur?.absentDeduction != null && cur.absentDeduction > 0 ? <ThemedText style={styles.deduct}>{`-${fmt(cur.absentDeduction)} absent`}</ThemedText> : null}
              {cur?.halfDayDeduction != null && cur.halfDayDeduction > 0 ? <ThemedText style={styles.deduct}>{`-${fmt(cur.halfDayDeduction)} half days`}</ThemedText> : null}
              {cur?.lateDeduction != null && cur.lateDeduction > 0 ? <ThemedText style={styles.deduct}>{`-${fmt(cur.lateDeduction)} lates`}</ThemedText> : null}
            </View>
          </View>
        </View>

        {/* ── TOWARD YOUR ADVANCES ─────────────────────────────────────── */}
        {curLoanDeductions.length > 0 ? (
          <View style={[styles.advances, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText themeColor="textMuted" style={styles.upperBold}>TOWARD YOUR ADVANCES</ThemedText>
            {curLoanDeductions.map((d) => (
              <Pressable key={d.loanId} onPress={() => router.push('/more/my-finance' as never)} accessibilityRole="link" style={[styles.loan, { backgroundColor: theme.surface }]}>
                <ThemedText themeColor="textMuted" style={styles.mono}>{`Remaining after this: ${fmt(d.remainingAfter)}`}</ThemedText>
                <ThemedText style={[styles.mono, styles.bold, { color: RED }]}>{`-${fmt(d.amount)}`}</ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ── OVERTIME + WARNINGS ───────────────────────────────────────── */}
        <View style={styles.pair}>
          <View style={[styles.mini, card]}>
            <ThemedText themeColor="textMuted" style={styles.upperBold}>OVERTIME THIS MONTH</ThemedText>
            <ThemedText style={[styles.money, { fontSize: 24, color: overtimeThisMonth.totalPay > 0 ? GREEN : theme.textMuted }]} numberOfLines={1} adjustsFontSizeToFit>
              {overtimeThisMonth.totalPay > 0 ? `+ ${fmt(overtimeThisMonth.totalPay)}` : '₹0'}
            </ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>{`${overtimeThisMonth.count} approved session${overtimeThisMonth.count !== 1 ? 's' : ''}`}</ThemedText>
          </View>
          <View
            style={[styles.mini, { backgroundColor: totalWarnings >= 5 ? 'rgba(239,68,68,0.06)' : theme.surface, borderColor: totalWarnings >= 5 ? '#fca5a5' : theme.border }]}>
            <ThemedText themeColor="textMuted" style={styles.upperBold}>TOTAL WARNINGS</ThemedText>
            <ThemedText style={[styles.money, { fontSize: 24, color: totalWarnings >= 5 ? RED : totalWarnings > 0 ? AMBER : theme.textMuted }]}>{totalWarnings}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>
              {totalWarnings === 0 ? 'No warnings on record' : totalWarnings >= 5 ? 'High — manager alerted' : 'Cumulative, never reset'}
            </ThemedText>
          </View>
        </View>

        {/* ── LATE ARRIVALS THIS CYCLE ─────────────────────────────────── */}
        {lateCountMonth > 0 ? (
          <View style={[styles.table, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={[styles.tableHead, { borderBottomColor: theme.border }]}>
              <ThemedText style={styles.h3}>Late Arrivals This Cycle</ThemedText>
              <View style={styles.lateBadge}><ThemedText style={styles.lateBadgeText}>{`${lateCountMonth}× late`}</ThemedText></View>
            </View>
            {lateRecords.map((lr, i) => {
              const color = PENALTY_COLOR[lr.penaltyApplied] ?? '#991b1b';
              const label = PENALTY_LABEL[lr.penaltyApplied] ?? '1.5 Days Deducted';
              return (
                <View key={lr.id} style={[styles.lateRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                  <View>
                    <ThemedText style={styles.lateTitle}>{`Late #${i + 1}`}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.small}>{fmtFull(localDate(lr.date))}</ThemedText>
                  </View>
                  <View style={[styles.penalty, { backgroundColor: `${color}18` }]}><ThemedText style={[styles.penaltyText, { color }]}>{label}</ThemedText></View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* ── SALARY HISTORY ───────────────────────────────────────────── */}
        <View style={[styles.table, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={[styles.historyHead, { borderBottomColor: theme.border }]}>
            <ThemedText style={styles.h2}>Salary History</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>Last 6 months</ThemedText>
          </View>

          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.skelRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <Skeleton width={112} height={16} />
                <Skeleton width={80} height={16} />
              </View>
            ))
          ) : wide ? (
            <>
              <View style={[styles.tr, { borderBottomColor: theme.border }]}>
                {HEAD.map((h, i) => <ThemedText key={h} themeColor="textMuted" style={[styles.th, { flex: FLEX[i] }]}>{h.toUpperCase()}</ThemedText>)}
              </View>
              {history.map((row, i) => {
                const active = row.month === curMonth && row.year === curYear;
                return (
                  <View key={`${row.year}-${row.month}`} style={[styles.tr, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, active && styles.activeRow]}>
                    <View style={{ flex: FLEX[0] }}>
                      <ThemedText style={styles.cellStrong}>{`${MONTH_NAMES[row.month - 1]} ${row.year}`}</ThemedText>
                      {active ? <ThemedText style={[styles.current, { color: theme.primary }]}>Current</ThemedText> : null}
                    </View>
                    <ThemedText themeColor="textMuted" style={[styles.cycle, { flex: FLEX[1] }]}>{`${fmtShort(localDate(row.cycleStart))} – ${fmtShort(localDate(row.cycleEnd))}`}</ThemedText>
                    <ThemedText style={[styles.presentCell, { flex: FLEX[2], color: GREEN }]}>
                      {row.presentDays}
                      {row.halfDays > 0 ? <ThemedText style={styles.halfNote}>{` +${row.halfDays}½`}</ThemedText> : null}
                    </ThemedText>
                    <ThemedText style={[styles.deductCell, { flex: FLEX[3], color: row.totalDeductions > 0 ? RED : theme.textMuted }]}>
                      {row.fetchFailed ? '—' : row.totalDeductions > 0 ? `– ${fmt(row.totalDeductions)}` : '—'}
                    </ThemedText>
                    <View style={{ flex: FLEX[4] }}>
                      {row.fetchFailed ? (
                        <ThemedText style={styles.failedCell}>Couldn’t load</ThemedText>
                      ) : (
                        <ThemedText style={[styles.netCell, { color: GREEN }]} numberOfLines={1} adjustsFontSizeToFit>{fmt(row.netSalary)}</ThemedText>
                      )}
                    </View>
                    <View style={[styles.statusCell, { flex: FLEX[5] }]}>
                      {active ? <View style={styles.pending}><ThemedText style={styles.pendingText}>Pending</ThemedText></View> : <ThemedText themeColor="textMuted" style={styles.small}>—</ThemedText>}
                    </View>
                  </View>
                );
              })}
            </>
          ) : (
            history.map((row, i) => {
              const active = row.month === curMonth && row.year === curYear;
              return (
                <View key={`${row.year}-${row.month}`} style={[styles.card, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, active && styles.activeRow]}>
                  <View style={styles.cardTop}>
                    <View style={styles.flex1}>
                      <ThemedText style={styles.cellStrong}>{`${MONTH_NAMES[row.month - 1]} ${row.year}`}</ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.cardCycle}>{`${fmtShort(localDate(row.cycleStart))} – ${fmtShort(localDate(row.cycleEnd))}`}</ThemedText>
                      {active ? <ThemedText style={[styles.current, { color: theme.primary }]}>Current</ThemedText> : null}
                    </View>
                    <View style={styles.right}>
                      {row.fetchFailed ? <ThemedText style={styles.failedCell}>Couldn’t load</ThemedText> : <ThemedText style={[styles.netCell, { color: GREEN, fontSize: 16 }]}>{fmt(row.netSalary)}</ThemedText>}
                      {active ? <View style={styles.pendingSm}><ThemedText style={styles.pendingSmText}>Pending</ThemedText></View> : <ThemedText themeColor="textMuted" style={styles.tiny}>—</ThemedText>}
                    </View>
                  </View>
                  <View style={styles.cardMeta}>
                    <View style={styles.metaItem}>
                      <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
                      <ThemedText themeColor="textMuted" style={styles.small}>{`${row.presentDays} present`}</ThemedText>
                    </View>
                    {row.halfDays > 0 ? <ThemedText themeColor="textMuted" style={styles.small}>{`${row.halfDays} half`}</ThemedText> : null}
                    {row.totalDeductions > 0 ? <ThemedText style={[styles.small, { color: RED }]}>{`– ${fmt(row.totalDeductions)}`}</ThemedText> : null}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { gap: 24, width: '100%', maxWidth: 768, alignSelf: 'center' },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 10, lineHeight: 14 },
  bold: { fontFamily: FontWeights.semiBold },
  right: { alignItems: 'flex-end' },
  rightText: { textAlign: 'right' },
  mono: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono },
  money: { fontFamily: Fonts?.mono, fontWeight: '900', lineHeight: undefined },
  h2: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.semiBold },
  h3: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  upper: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  upperBold: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },

  hero: { borderRadius: 16, overflow: 'hidden' },
  circle: { position: 'absolute', backgroundColor: '#fff', opacity: 0.1, borderRadius: 999 },
  circleTop: { width: 192, height: 192, top: -40, right: -40 },
  circleBottom: { width: 224, height: 224, bottom: -64, left: -32 },
  heroBody: { gap: 20 },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  avatarText: { color: '#fff', fontSize: 20, lineHeight: 26, fontFamily: FontWeights.bold },
  heroName: { color: '#fff', fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 20, marginTop: 2 },
  typeBadge: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)' },
  typeText: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, letterSpacing: 1, marginBottom: 4 },
  heroSalary: { color: '#fff', fontFamily: Fonts?.mono, fontWeight: '900' },
  notConfigured: { color: 'rgba(255,255,255,0.5)', fontSize: 30, lineHeight: 36, fontFamily: FontWeights.bold },
  heroStats: { flexDirection: 'row', gap: 16, paddingTop: 8 },
  statBox: { flex: 1, minWidth: 0, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, lineHeight: 14, letterSpacing: 0.6, marginBottom: 2 },
  statValue: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  statSub: { color: 'rgba(255,255,255,0.5)', fontSize: 10, lineHeight: 14, marginTop: 2 },
  statNone: { color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 20 },

  panel: { borderRadius: 16, borderWidth: 1, padding: 20, gap: 16 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  boxes: { flexDirection: 'row', gap: 12 },
  box: { flex: 1, minWidth: 0, borderRadius: 12, paddingVertical: 12, alignItems: 'center', paddingHorizontal: 4 },
  boxValue: { fontSize: 24, lineHeight: 30, fontFamily: Fonts?.mono, fontWeight: '900' },
  boxLabel: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium, marginTop: 2 },
  fail: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: 'rgba(239,68,68,0.15)', gap: 8 },
  failText: { color: '#fca5a5', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  failRetry: { color: '#fca5a5', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, textDecorationLine: 'underline' },
  netRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  divider: { width: 1, height: 40 },
  deduct: { color: '#dc2626', fontSize: 10, lineHeight: 14 },

  advances: { borderRadius: 12, borderWidth: 1, padding: 16, gap: 8 },
  loan: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },

  pair: { flexDirection: 'row', gap: 12 },
  mini: { flex: 1, minWidth: 0, borderRadius: 16, borderWidth: 1, padding: 16, gap: 4 },

  table: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  tableHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  lateBadge: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.12)' },
  lateBadgeText: { color: '#b45309', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  lateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  lateTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  penalty: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  penaltyText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },

  historyHead: { paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  skelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0 },
  th: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },
  activeRow: { backgroundColor: 'rgba(128,19,34,0.04)' },
  cellStrong: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  current: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  cycle: { fontSize: 12, lineHeight: 16, fontFamily: Fonts?.mono },
  presentCell: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono, fontWeight: '700' },
  halfNote: { color: AMBER, fontSize: 10, lineHeight: 14, fontWeight: '400' },
  deductCell: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono, fontWeight: '600' },
  netCell: { fontSize: 16, lineHeight: 22, fontFamily: Fonts?.mono, fontWeight: '900' },
  failedCell: { color: RED, fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  statusCell: { alignItems: 'flex-start' },
  pending: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.15)' },
  pendingText: { color: '#b45309', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },

  card: { paddingHorizontal: 20, paddingVertical: 16, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardCycle: { fontSize: 10, lineHeight: 14, fontFamily: Fonts?.mono },
  pendingSm: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.12)', marginTop: 2 },
  pendingSmText: { color: '#a16207', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
