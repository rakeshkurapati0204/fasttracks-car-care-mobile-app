import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { DAY_SHORT, S, fmt, fmtIST, totalHours } from '@/components/attendance/attendance-format';
import { SearchBar } from '@/components/attendance/search-bar';
import { ThemedText } from '@/components/themed-text';
import { Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AttendanceDailyLogPerson, AttendanceDailyLogResponse, AttendanceRegisterResponse } from '@/lib/api';

const GREEN = '#22c55e';
const RED = '#ef4444';

// ── Header ───────────────────────────────────────────────────────────────────
type HeaderProps = {
  wide: boolean;
  /** Bulk Mark / Import buttons (Phase 2 owns their behaviour; passed in). */
  primaryActions: ReactNode;
  canDownload: boolean;
  monthTitle: string;
  dlLoading: string | null;
  dlMsg: { ok: boolean; text: string } | null;
  onDownload: (kind: 'daily' | 'monthly', format: 'pdf' | 'excel') => void;
};

// "Attendance" + today's date, the action buttons, and the Daily / Monthly
// PDF / Excel download groups (PDF red-tinted, Excel green-tinted).
export function AdminHeader({ wide, primaryActions, canDownload, monthTitle, dlLoading, dlMsg, onDownload }: HeaderProps) {
  const theme = useTheme();
  const now = new Date();
  return (
    <View style={styles.stack}>
      <View style={[styles.headRow, !wide && styles.headCol]}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Attendance</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </ThemedText>
        </View>
        <View style={styles.actions}>
          {primaryActions}
          {canDownload ? (
            <>
              {(['daily', 'monthly'] as const).map((kind) => (
                <View key={kind} style={[styles.group, { borderColor: theme.border }]}>
                  <ThemedText themeColor="textMuted" style={[styles.groupLabel, { backgroundColor: theme.surface }]}>{kind === 'daily' ? 'Daily' : 'Monthly'}</ThemedText>
                  {(['pdf', 'excel'] as const).map((format) => {
                    const key = `${kind}-${format}`;
                    const color = format === 'pdf' ? RED : GREEN;
                    const loading = dlLoading === key;
                    return (
                      <Pressable
                        key={format}
                        onPress={() => onDownload(kind, format)}
                        disabled={dlLoading !== null}
                        accessibilityRole="button"
                        accessibilityLabel={kind === 'daily' ? `Download today's daily attendance ${format.toUpperCase()}` : `Download ${monthTitle} monthly ${format.toUpperCase()}`}
                        style={[styles.dl, { backgroundColor: format === 'pdf' ? `rgba(239,68,68,${loading ? 0.15 : 0.08})` : `rgba(34,197,94,${loading ? 0.15 : 0.08})` }, dlLoading !== null && !loading && { opacity: 0.5 }]}>
                        {loading ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={format === 'pdf' ? 'download-outline' : 'grid-outline'} size={14} color={color} />}
                        <ThemedText style={[styles.dlText, { color }]}>{format === 'pdf' ? 'PDF' : 'Excel'}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </>
          ) : null}
        </View>
      </View>

      {dlMsg ? (
        <View
          style={[
            styles.msg,
            { backgroundColor: dlMsg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderColor: dlMsg.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' },
          ]}>
          <ThemedText style={[styles.msgText, { color: dlMsg.ok ? GREEN : RED }]}>{dlMsg.text}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

// ── Absent Today ─────────────────────────────────────────────────────────────
type AbsentProps = {
  data: AttendanceDailyLogResponse | null;
  loading: boolean;
  copied: boolean;
  onCopy: () => void;
};

export function AbsentToday({ data, loading, copied, onCopy }: AbsentProps) {
  const theme = useTheme();
  return (
    <View>
      <View style={styles.sectionHead}>
        <ThemedText style={styles.h2}>
          Absent Today
          {data ? <ThemedText style={[styles.h2Note, { color: RED }]}>{`  (${data.absentees.length})`}</ThemedText> : null}
        </ThemedText>
        {data && data.absentees.length > 0 ? (
          <Pressable
            onPress={onCopy}
            accessibilityRole="button"
            style={[styles.copy, { backgroundColor: copied ? 'rgba(34,197,94,0.15)' : theme.surface, borderColor: theme.border }]}>
            {copied ? (
              <ThemedText style={[styles.copyText, { color: GREEN }]}>✓ Copied!</ThemedText>
            ) : (
              <>
                <Ionicons name="copy-outline" size={14} color={theme.textMuted} />
                <ThemedText themeColor="textMuted" style={styles.copyText}>Copy</ThemedText>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.chips}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} width={112} height={40} />)}</View>
      ) : !data || data.absentees.length === 0 ? (
        <Card padding="md">
          <View style={styles.fullHouse}>
            <ThemedText style={styles.emoji}>🎉</ThemedText>
            <ThemedText style={styles.fullHouseText}>No absentees today — full house!</ThemedText>
          </View>
        </Card>
      ) : (
        <View style={styles.chips}>
          {data.absentees.map((p) => (
            <View key={p.id} style={styles.person}>
              <View style={styles.dot} />
              <ThemedText style={styles.personName}>{p.name}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.personRole}>{p.role.replace(/_/g, ' ')}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Today's Attendance ───────────────────────────────────────────────────────
type TodayProps = {
  data: AttendanceDailyLogResponse | null;
  regData: AttendanceRegisterResponse | null;
  loading: boolean;
  today: string;
  search: string;
  onSearch: (v: string) => void;
  expandedId: string | null;
  expandedLoading: boolean;
  expandedPunches: { direction: 'IN' | 'OUT'; time: string }[];
  onToggle: (id: string) => void;
};

export function TodayAttendance({ data, regData, loading, today, search, onSearch, expandedId, expandedLoading, expandedPunches, onToggle }: TodayProps) {
  const theme = useTheme();
  const q = search.trim().toLowerCase();

  const all: AttendanceDailyLogPerson[] = data
    ? [...[...data.presentees].sort((a, b) => (a.clockIn ?? '').localeCompare(b.clockIn ?? '')), ...data.absentees]
    : [];
  const rows = all.filter((p) => !q || p.name.toLowerCase().includes(q));
  const shown = q ? [...(data?.presentees ?? []), ...(data?.absentees ?? [])].filter((p) => p.name.toLowerCase().includes(q)).length : undefined;

  return (
    <View>
      <View style={styles.sectionHead}>
        <ThemedText style={[styles.h2, styles.flex1]}>
          {"Today's Attendance"}
          {data ? (
            <ThemedText themeColor="textMuted" style={styles.h2Note}>
              {`  ${data.counts.present}/${data.counts.totalEmployees ?? data.counts.total} present${data.counts.late > 0 ? ` (${data.counts.late} late)` : ''} · ${data.counts.absent} absent`}
            </ThemedText>
          ) : null}
        </ThemedText>
      </View>

      {!loading && data ? (
        <View style={styles.search}>
          <SearchBar value={search} onChange={onSearch} placeholder="Search by name…" shown={shown} total={data.presentees.length + data.absentees.length} />
        </View>
      ) : null}

      {loading ? (
        <Card padding="none">{Array.from({ length: 5 }).map((_, i) => <View key={i} style={[styles.skelRow, { borderBottomColor: theme.border }]}><Skeleton height={20} width="60%" /></View>)}</Card>
      ) : !data || data.counts.total === 0 ? (
        <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No records yet for today.</ThemedText></Card>
      ) : (
        <Card padding="none" style={styles.clip}>
          <View style={[styles.tr, styles.th, { borderBottomColor: theme.border }]}>
            <ThemedText themeColor="textMuted" style={[styles.thText, styles.flex1]}>NAME</ThemedText>
            <ThemedText themeColor="textMuted" style={[styles.thText, styles.colStatus]}>STATUS</ThemedText>
            <ThemedText themeColor="textMuted" style={[styles.thText, styles.colTime]}>IN</ThemedText>
            <ThemedText themeColor="textMuted" style={[styles.thText, styles.colTime]}>OUT</ThemedText>
            <View style={styles.chev} />
          </View>

          {rows.map((p, i) => {
            const sc = S[p.status];
            const isExpanded = expandedId === p.id;
            const last = i === rows.length - 1;
            return (
              <View key={p.id}>
                <Pressable
                  onPress={() => onToggle(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  style={[styles.tr, { borderBottomColor: theme.border, borderBottomWidth: last && !isExpanded ? 0 : 1, backgroundColor: isExpanded ? 'rgba(104,15,26,0.06)' : 'transparent' }]}>
                  <View style={styles.flex1}>
                    <ThemedText style={styles.name} numberOfLines={1}>{p.name}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.small}>{p.role.replace(/_/g, ' ')}</ThemedText>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: sc?.bg ?? '#6b7280' }]}>
                    <ThemedText style={styles.statusText}>{sc?.label ?? '?'}</ThemedText>
                  </View>
                  <ThemedText style={[styles.mono, styles.colTime, { color: p.clockIn ? GREEN : theme.textMuted }]}>{fmt(p.clockIn)}</ThemedText>
                  <ThemedText style={[styles.mono, styles.colTime, { color: p.clockOut ? theme.text : theme.textMuted }]}>{fmt(p.clockOut)}</ThemedText>
                  <Ionicons name="chevron-down" size={16} color={theme.textMuted} style={[styles.chev, isExpanded && styles.flip]} />
                </Pressable>

                {isExpanded ? (
                  <View style={[styles.expanded, { borderBottomColor: theme.border, borderBottomWidth: last ? 0 : 1, backgroundColor: theme.backgroundElement }]}>
                    <View style={styles.summary}>
                      {[
                        { label: 'Clock In', value: fmt(p.clockIn), color: GREEN },
                        { label: 'Clock Out', value: fmt(p.clockOut), color: theme.text },
                        { label: 'Total Hours', value: totalHours(p.clockIn, p.clockOut) + (p.clockOut ? '' : ' ⏳'), color: theme.primary },
                      ].map((s) => (
                        <View key={s.label} style={[styles.summaryBox, { backgroundColor: theme.surface }]}>
                          <ThemedText themeColor="textMuted" style={styles.boxLabel}>{s.label.toUpperCase()}</ThemedText>
                          <ThemedText style={[styles.summaryValue, { color: s.color }]} numberOfLines={1} adjustsFontSizeToFit>{s.value}</ThemedText>
                        </View>
                      ))}
                    </View>

                    <View>
                      <ThemedText themeColor="textMuted" style={styles.groupTitle}>FACE SCANS TODAY</ThemedText>
                      {expandedLoading ? (
                        <Skeleton height={32} />
                      ) : expandedPunches.length > 0 ? (
                        <View style={styles.chips}>
                          {expandedPunches.map((punch, idx) => <ScanChip key={idx} direction={punch.direction} time={fmtIST(punch.time)} />)}
                        </View>
                      ) : p.clockIn ? (
                        // No raw punch log entries: fall back to the attendance record times.
                        <View style={styles.chips}>
                          <ScanChip direction="IN" time={fmt(p.clockIn)} />
                          {p.clockOut ? <ScanChip direction="OUT" time={fmt(p.clockOut)} /> : null}
                          <ThemedText themeColor="textMuted" style={styles.fallbackNote}>From attendance record (no raw biometric log)</ThemedText>
                        </View>
                      ) : (
                        <ThemedText themeColor="textMuted" style={styles.small}>No scans recorded today</ThemedText>
                      )}
                    </View>

                    {regData ? (
                      <View>
                        <ThemedText themeColor="textMuted" style={styles.groupTitle}>THIS MONTH</ThemedText>
                        <View style={styles.monthChips}>
                          {regData.dates.map((d) => {
                            const emp = regData.employees.find((e) => e.id === p.id);
                            const rec = (emp?.attendance ?? {})[d];
                            const sc2 = rec ? S[rec.status] : null;
                            const isToday2 = d === today;
                            return (
                              <View key={d} style={[styles.dayBox, { backgroundColor: theme.surface, borderColor: isToday2 ? theme.primary : 'transparent' }]}>
                                <ThemedText themeColor="textMuted" style={styles.dayShort}>{DAY_SHORT[new Date(`${d}T00:00:00Z`).getUTCDay()]}</ThemedText>
                                <ThemedText themeColor="textSecondary" style={styles.dayNum}>{d.slice(8)}</ThemedText>
                                {sc2 ? (
                                  <View style={[styles.dayTag, { backgroundColor: sc2.bg }]}><ThemedText style={styles.dayTagText}>{sc2.label}</ThemedText></View>
                                ) : (
                                  <View style={[styles.dayTag, { backgroundColor: theme.backgroundElement }]}><ThemedText themeColor="textMuted" style={styles.dayDot}>·</ThemedText></View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>
      )}
    </View>
  );
}

function ScanChip({ direction, time }: { direction: 'IN' | 'OUT'; time: string }) {
  const isIn = direction === 'IN';
  return (
    <View
      style={[
        styles.scan,
        { backgroundColor: isIn ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderColor: isIn ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)' },
      ]}>
      <ThemedText style={[styles.scanText, { color: isIn ? '#15803d' : '#dc2626' }]}>{isIn ? '→' : '←'}</ThemedText>
      <ThemedText style={[styles.scanText, { color: isIn ? '#15803d' : '#dc2626' }]}>{time}</ThemedText>
      <ThemedText style={[styles.scanDir, { color: isIn ? '#15803d' : '#dc2626' }]}>{direction}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  stack: { gap: 16 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  headCol: { flexDirection: 'column' },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  group: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  groupLabel: { paddingHorizontal: 8, paddingVertical: 10, fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  dl: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 40 },
  dlText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  msg: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  msgText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  h2: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.bold },
  h2Note: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.regular },
  copy: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm, borderWidth: 1, minHeight: 36 },
  copyText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fullHouse: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 24, lineHeight: 30 },
  fullHouseText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  personName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  personRole: { fontSize: 12, lineHeight: 16 },
  search: { marginBottom: 12 },
  skelRow: { height: 56, justifyContent: 'center', paddingHorizontal: 16, borderBottomWidth: 1 },
  clip: { overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  th: { borderBottomWidth: 1, paddingVertical: 8 },
  thText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  colStatus: { width: 40, textAlign: 'center' },
  colTime: { width: 52, textAlign: 'right' },
  chev: { width: 16 },
  flip: { transform: [{ rotate: '180deg' }] },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  statusBadge: { width: 32, height: 28, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  statusText: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  mono: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono, fontWeight: '700' },
  expanded: { paddingHorizontal: 16, paddingVertical: 16, gap: 20 },
  summary: { flexDirection: 'row', gap: 12 },
  summaryBox: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
  boxLabel: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, marginBottom: 4 },
  summaryValue: { fontSize: 16, lineHeight: 22, fontFamily: Fonts?.mono, fontWeight: '700' },
  groupTitle: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6, marginBottom: 8 },
  scan: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.pill, borderWidth: 1 },
  scanText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  scanDir: { fontSize: 10, lineHeight: 14, opacity: 0.6 },
  fallbackNote: { width: '100%', fontSize: 10, lineHeight: 14, marginTop: 4 },
  monthChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayBox: { alignItems: 'center', gap: 2, borderRadius: 12, paddingHorizontal: 6, paddingVertical: 6, borderWidth: 2, minWidth: 42 },
  dayShort: { fontSize: 9, lineHeight: 12, fontFamily: FontWeights.semiBold },
  dayNum: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  dayTag: { width: 24, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  dayTagText: { color: '#fff', fontSize: 9, lineHeight: 12, fontFamily: FontWeights.bold },
  dayDot: { fontSize: 9, lineHeight: 12 },
});
