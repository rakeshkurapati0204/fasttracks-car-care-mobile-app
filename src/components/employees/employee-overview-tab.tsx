import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MiniBarChart } from '@/components/employees/mini-bar-chart';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { clearPayrollOverride, getErrorMessage, setPayrollOverride } from '@/lib/api';
import type { EmployeeCardItem, EmployeePerformancePoint, EmployeePunch, PayrollResult } from '@/types/api';

export type OverviewStats = {
  totalJobs: number;
  totalRevenue: number;
  conversionRate: number;
  avgDealSize: number;
  walkOutRate: number;
  topService: string;
  attendance: { present: number; late: number; absent: number; halfDay: number };
};

type Props = {
  employee: EmployeeCardItem;
  canEdit: boolean;
  loading: boolean;
  stats: OverviewStats | null;
  performance: EmployeePerformancePoint[];
  payroll: (PayrollResult & { overrideNote?: string | null }) | null;
  punches: EmployeePunch[];
  todayDate: string;
  now: Date;
  onReload: () => Promise<void> | void;
  wide: boolean;
};

const money = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

// Dashboard punchBadgeStyle: colours and labels by the backend's interpretation.
function punchLook(interpretation: string | undefined) {
  if (interpretation === 'CLOCK_IN') return { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', border: 'rgba(34,197,94,0.3)', arrow: '→', label: 'IN' };
  if (interpretation === 'CLOCK_OUT') return { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626', border: 'rgba(239,68,68,0.3)', arrow: '←', label: 'OUT' };
  return { bg: 'rgba(148,163,184,0.14)', fg: '#64748b', border: 'rgba(148,163,184,0.3)', arrow: '·', label: 'IGNORED' };
}

// Dashboard formatTime: "10:21 am", in IST.
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

const MONO = { fontFamily: Fonts?.mono };

// Dashboard EmployeeDetailPanel > Overview tab, top to bottom.
export function EmployeeOverviewTab({ employee, canEdit, loading, stats, performance, payroll, punches, todayDate, now, onReload, wide }: Props) {
  const theme = useTheme();
  const [showOverride, setShowOverride] = useState(false);
  const [overrideAmt, setOverrideAmt] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const monthLabel = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };

  const save = async () => {
    const amt = parseFloat(overrideAmt);
    if (isNaN(amt) || amt < 0) { flash('Enter a valid amount'); return; }
    setSaving(true);
    try {
      await setPayrollOverride({ userId: employee.id, month, year, finalSalary: amt, note: overrideNote || undefined });
      flash('✓ Override saved');
      setShowOverride(false);
      await onReload();
    } catch (err: unknown) {
      flash(getErrorMessage(err, 'Failed to save override'));
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await clearPayrollOverride({ userId: employee.id, month, year });
      flash('✓ Override cleared');
      setShowOverride(false);
      await onReload();
    } catch (err: unknown) {
      flash(getErrorMessage(err, 'Failed to clear override'));
    } finally {
      setSaving(false);
    }
  };

  const salary = employee.monthlySalary ?? null;
  const joiningDate = employee.joiningDate ?? null;
  const salaryType = employee.salaryType ?? 'MONTHLY';

  let cycleLabel = '';
  if (joiningDate) {
    const joinDay = new Date(joiningDate).getUTCDate() || 1;
    const cs = new Date(Date.UTC(year, now.getMonth(), joinDay));
    const nextM = now.getMonth() === 11 ? 0 : now.getMonth() + 1;
    const nextY = now.getMonth() === 11 ? year + 1 : year;
    const ce = new Date(Date.UTC(nextY, nextM, joinDay - 1));
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    cycleLabel = `${fmt(cs)} – ${fmt(ce)}`;
  }

  const tile = [styles.tile, { backgroundColor: theme.surface }];
  const okMsg = msg.startsWith('✓');

  const metrics = stats
    ? [
        { label: 'Jobs This Month', value: String(stats.totalJobs) },
        { label: 'Revenue Generated', value: money(stats.totalRevenue) },
        { label: 'Conversion Rate', value: `${stats.conversionRate}%` },
        { label: 'Avg Deal Size', value: money(stats.avgDealSize) },
        { label: 'Walk-out Rate', value: `${stats.walkOutRate}%` },
        { label: 'Top Service', value: stats.topService || 'N/A' },
      ]
    : [];
  const metricCols = wide ? 3 : 2;

  return (
    <View style={styles.stack}>
      {msg ? (
        <View style={[styles.msg, { backgroundColor: okMsg ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderColor: okMsg ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }]}>
          <ThemedText style={[styles.msgText, { color: okMsg ? '#16a34a' : '#dc2626' }]}>{msg}</ThemedText>
        </View>
      ) : null}

      {/* Salary */}
      {!salary ? (
        <Card padding="md">
          <ThemedText themeColor="textMuted" style={styles.centerText}>No salary configured — go to Configure tab to set salary.</ThemedText>
        </Card>
      ) : (
        <Card padding="md" titleVariant="label" title={`Salary — ${monthLabel}`} style={styles.cardGap}>
          <View style={styles.pair}>
            <View style={[tile, styles.flex1]}>
              <ThemedText themeColor="textMuted" style={styles.tileLabel}>MONTHLY SALARY</ThemedText>
              <ThemedText style={[styles.salary, MONO]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{money(salary)}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.tiny}>{salaryType}</ThemedText>
            </View>
            <View style={[tile, styles.flex1]}>
              <ThemedText themeColor="textMuted" style={styles.tileLabel}>{cycleLabel ? 'CURRENT CYCLE' : 'JOINING DATE'}</ThemedText>
              {cycleLabel ? (
                <>
                  <ThemedText style={styles.cycle}>{cycleLabel}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.tiny}>
                    Joined {new Date(joiningDate!).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </ThemedText>
                </>
              ) : (
                <ThemedText themeColor="textMuted" style={styles.cycle}>Not set</ThemedText>
              )}
            </View>
          </View>

          {payroll ? (
            <>
              <View style={styles.triple}>
                {[
                  { label: 'Present', value: payroll.presentDays, color: '#22c55e' },
                  { label: 'Half Day', value: payroll.halfDays, color: '#f59e0b' },
                  { label: 'Absent', value: payroll.absentDays, color: '#ef4444' },
                ].map((a) => (
                  <View key={a.label} style={[styles.count, styles.flex1, { backgroundColor: theme.surface }]}>
                    <ThemedText style={[styles.countValue, MONO, { color: a.color }]}>{a.value}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.tiny}>{a.label}</ThemedText>
                  </View>
                ))}
              </View>

              <View style={[styles.deductions, { backgroundColor: theme.surface, borderLeftColor: theme.primary }]}>
                <View style={styles.between}>
                  <View style={styles.flex1}>
                    <ThemedText themeColor="textMuted" style={styles.tileLabel}>DEDUCTIONS</ThemedText>
                    <ThemedText style={[styles.deduct, MONO, { color: theme.danger }]}>– {money(payroll.totalDeductions)}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.tiny}>
                      ₹{Math.round(payroll.dailyRate).toLocaleString('en-IN')}/day × {payroll.absentDays + payroll.halfDays * 0.5} days
                    </ThemedText>
                  </View>
                  <View style={styles.net}>
                    <View style={styles.netLabelRow}>
                      <ThemedText themeColor="textMuted" style={styles.tileLabel}>
                        {payroll.finalSalaryOverride != null ? 'FINAL (OVERRIDDEN)' : 'EXPECTED NET'}
                      </ThemedText>
                      {payroll.finalSalaryOverride != null ? (
                        <View style={styles.custom}><ThemedText style={styles.customText}>CUSTOM</ThemedText></View>
                      ) : null}
                    </View>
                    <ThemedText style={[styles.netValue, MONO, { color: theme.success }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{money(payroll.netSalary)}</ThemedText>
                    {canEdit ? (
                      <Pressable
                        hitSlop={8}
                        accessibilityRole="button"
                        onPress={() => {
                          setOverrideAmt(String(payroll.finalSalaryOverride ?? Math.round(payroll.netSalary)));
                          setOverrideNote(payroll.overrideNote ?? '');
                          setShowOverride((v) => !v);
                        }}>
                        <ThemedText themeColor="textMuted" style={[styles.tiny, styles.underline]}>
                          {payroll.finalSalaryOverride != null ? 'Edit override' : 'Override final salary'}
                        </ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {showOverride && canEdit ? (
                  <View style={[styles.overrideForm, { borderColor: theme.primary, backgroundColor: theme.backgroundElement }]}>
                    <ThemedText style={styles.overrideTitle}>Set Final Salary for {monthLabel}</ThemedText>
                    <Input label="Amount (₹)" value={overrideAmt} onChangeText={setOverrideAmt} keyboardType="decimal-pad" />
                    <Input label="Note (optional)" value={overrideNote} onChangeText={setOverrideNote} placeholder="e.g. Bonus month" />
                    <View style={styles.row}>
                      <Button size="sm" variant="ghost" onPress={() => setShowOverride(false)}>Cancel</Button>
                      <Button size="sm" loading={saving} onPress={save}>Save</Button>
                      {payroll.finalSalaryOverride != null ? <Button size="sm" variant="danger" loading={saving} onPress={clear}>Clear</Button> : null}
                    </View>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
          {loading && !payroll ? <Skeleton height={32} /> : null}
        </Card>
      )}

      {/* Today's punch log */}
      <Card padding="md" titleVariant="label" title={`Today's Punch Log — ${todayDate}`} style={styles.cardGap}>
        {loading ? (
          <Skeleton height={32} />
        ) : punches.length === 0 ? (
          <ThemedText themeColor="textMuted" style={styles.body}>No scans recorded today</ThemedText>
        ) : (
          <View style={styles.chips}>
            {punches.map((p, i) => {
              const look = punchLook(p.interpretation);
              return (
                <View key={p.id ?? i} style={[styles.chip, { backgroundColor: look.bg, borderColor: look.border }]}>
                  <ThemedText style={[styles.chipText, { color: look.fg }]}>{look.arrow}</ThemedText>
                  <ThemedText style={[styles.chipText, { color: look.fg }]}>{p.time ? formatTime(p.time) : '—'}</ThemedText>
                  <ThemedText style={[styles.chipLabel, { color: look.fg }]}>{look.label}</ThemedText>
                </View>
              );
            })}
          </View>
        )}
      </Card>

      {stats ? (
        <>
          <View style={styles.grid}>
            {metrics.map((m) => (
              <View key={m.label} style={{ width: `${100 / metricCols}%`, padding: 6 }}>
                <Card padding="md" style={styles.metricCard}>
                  <ThemedText themeColor="textMuted" style={styles.small}>{m.label}</ThemedText>
                  <ThemedText style={[styles.metricValue, MONO]} numberOfLines={2}>{m.value}</ThemedText>
                </Card>
              </View>
            ))}
          </View>

          <Card padding="md" titleVariant="label" title="Attendance This Month" style={styles.cardGap}>
            <View style={styles.quad}>
              {[
                { label: 'Present', value: stats.attendance.present, color: theme.success },
                { label: 'Late', value: stats.attendance.late, color: theme.warning },
                { label: 'Half Day', value: stats.attendance.halfDay, color: '#f97316' },
                { label: 'Absent', value: stats.attendance.absent, color: theme.danger },
              ].map((a) => (
                <View key={a.label} style={styles.flex1}>
                  <ThemedText style={[styles.countValue, MONO, styles.centerText, { color: a.color }]}>{a.value ?? 0}</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.tiny, styles.centerText]}>{a.label}</ThemedText>
                </View>
              ))}
            </View>
          </Card>
        </>
      ) : null}

      {/* Charts */}
      <Card padding="md" titleVariant="label" title="Jobs Per Month" style={styles.cardGap}>
        {loading ? (
          <Skeleton height={140} />
        ) : performance.length === 0 ? (
          <View style={styles.chartEmpty}><ThemedText themeColor="textMuted" style={styles.body}>No data yet</ThemedText></View>
        ) : (
          <MiniBarChart name="Jobs" color="#6AA4CC" data={performance.map((p) => ({ label: p.label, value: p.jobCount ?? 0 }))} tick={(v) => String(v)} tip={(v) => String(v)} />
        )}
      </Card>
      <Card padding="md" titleVariant="label" title="Revenue Per Month" style={styles.cardGap}>
        {loading ? (
          <Skeleton height={140} />
        ) : performance.length === 0 ? (
          <View style={styles.chartEmpty}><ThemedText themeColor="textMuted" style={styles.body}>No data yet</ThemedText></View>
        ) : (
          <MiniBarChart name="Revenue" color="#36C87E" data={performance.map((p) => ({ label: p.label, value: p.revenue ?? 0 }))} tick={(v) => `₹${(v / 1000).toFixed(0)}k`} tip={money} />
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  stack: { gap: 16 },
  cardGap: { gap: 12 },
  msg: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radii.md, borderWidth: 1 },
  msgText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  centerText: { textAlign: 'center', fontSize: 12, lineHeight: 18 },
  pair: { flexDirection: 'row', gap: 12 },
  tile: { padding: 12, borderRadius: Radii.md },
  tileLabel: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium, letterSpacing: 0.5, marginBottom: 4 },
  salary: { fontSize: 20, lineHeight: 26, fontWeight: '700' },
  cycle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  tiny: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  small: { fontSize: 12, lineHeight: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  triple: { flexDirection: 'row', gap: 8 },
  count: { alignItems: 'center', paddingVertical: 10, borderRadius: Radii.md },
  countValue: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  deductions: { padding: 16, gap: 12, borderRadius: Radii.md, borderLeftWidth: 3 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  deduct: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  net: { alignItems: 'flex-end', flexShrink: 1 },
  netLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  netValue: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  custom: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radii.pill, backgroundColor: 'rgba(245,158,11,0.2)' },
  customText: { fontSize: 9, lineHeight: 12, fontFamily: FontWeights.bold, color: '#d97706' },
  underline: { textDecorationLine: 'underline' },
  overrideForm: { padding: 12, gap: 10, borderWidth: 1, borderRadius: Radii.md },
  overrideTitle: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill, borderWidth: 1 },
  chipText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  chipLabel: { fontSize: 10, lineHeight: 14, opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  metricCard: { gap: 4, flexGrow: 1 },
  metricValue: { fontSize: 16, lineHeight: 22, fontWeight: '700' },
  quad: { flexDirection: 'row', gap: 12 },
  chartEmpty: { height: 140, alignItems: 'center', justifyContent: 'center' },
});

