import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage, overrideAttendance } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { PayrollAttendanceDetail } from '@/types/api';

import { MONTH_NAMES } from './helpers';

const OVERRIDE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE'] as const;

function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Day-by-day attendance cells (P / L / H / A / Lv) with the per-day override.
// Override is OWNER / STORE_MANAGER only, a UI-local check on the dashboard;
// the backend enforces its own gate on PATCH /attendance/:userId/:date/override.
export function AttendanceGrid({
  details, userId, month, year, onRefresh,
}: { details: PayrollAttendanceDetail[]; userId: string; month: number; year: number; onRefresh: () => void }) {
  const theme = useTheme();
  const { user } = useAuth();
  const canOverride = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER';

  const STATUS: Record<string, { bg: string; text: string; label: string }> = {
    PRESENT: { bg: 'rgba(54,200,126,0.15)', text: theme.success, label: 'P' },
    LATE: { bg: 'rgba(232,168,40,0.15)', text: theme.warning, label: 'L' },
    HALF_DAY: { bg: 'rgba(249,115,22,0.15)', text: '#f97316', label: 'H' },
    ABSENT: { bg: 'rgba(224,104,104,0.15)', text: theme.danger, label: 'A' },
    LEAVE: { bg: 'rgba(104,15,26,0.15)', text: theme.primary, label: 'Lv' },
    WEEKEND: { bg: 'transparent', text: theme.textMuted, label: '—' },
  };

  const [activeDay, setActiveDay] = useState<PayrollAttendanceDetail | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const tap = (d: PayrollAttendanceDetail) => {
    if (d.status === 'WEEKEND') return;
    setActiveDay(d);
    setEditStatus(d.status);
    setEditReason('');
  };

  const save = async () => {
    if (!activeDay || !editReason.trim()) return;
    setSaving(true);
    try {
      await overrideAttendance(userId, activeDay.date, { status: editStatus, reason: editReason.trim() });
      const prev = STATUS[activeDay.status]?.label ?? activeDay.status;
      const next = STATUS[editStatus]?.label ?? editStatus;
      const dayNum = parseInt(activeDay.date.split('-')[2], 10);
      showToast(`✓ ${MONTH_NAMES[month - 1]} ${dayNum} updated: ${prev} → ${next}`);
      setActiveDay(null);
      onRefresh();
    } catch (e: unknown) {
      showToast(`✗ ${getErrorMessage(e, 'Failed to save.')}`);
    } finally {
      setSaving(false);
    }
  };

  const overridden = details.filter((d) => d.isOverridden);
  const ok = toast?.startsWith('✓');

  return (
    <View style={styles.wrap}>
      <ThemedText themeColor="textMuted" style={styles.heading}>DAY-BY-DAY BREAKDOWN</ThemedText>

      {toast ? (
        <View style={[styles.toast, { backgroundColor: ok ? 'rgba(34,197,94,0.12)' : 'rgba(224,104,104,0.12)' }]}>
          <ThemedText style={[styles.toastText, { color: ok ? '#15803d' : theme.danger }]}>{toast}</ThemedText>
        </View>
      ) : null}

      <View style={styles.cells}>
        {details.map((d) => {
          const st = STATUS[d.status] ?? STATUS.WEEKEND;
          const dayNum = parseInt(d.date.split('-')[2], 10);
          const active = activeDay?.date === d.date;
          const weekend = d.status === 'WEEKEND';
          return (
            <Pressable
              key={d.date}
              onPress={() => tap(d)}
              disabled={weekend}
              accessibilityRole="button"
              accessibilityLabel={`${MONTH_NAMES[month - 1]} ${dayNum} ${d.status}`}
              style={[styles.cell, { backgroundColor: active ? st.text : st.bg }, active && { borderWidth: 2, borderColor: st.text }]}>
              <ThemedText style={[styles.cellDay, { color: active ? '#ffffff' : st.text }]}>{dayNum}</ThemedText>
              <ThemedText style={[styles.cellLabel, { color: active ? '#ffffff' : st.text }]}>{st.label}</ThemedText>
              {d.isOverridden ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        })}
      </View>

      {activeDay ? (() => {
        const dayNum = parseInt(activeDay.date.split('-')[2], 10);
        const inTime = fmtTime(activeDay.clockIn);
        const outTime = fmtTime(activeDay.clockOut);
        return (
          <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.panelHead}>
              <View style={styles.flex1}>
                <ThemedText style={styles.panelTitle}>{`📅 ${MONTH_NAMES[month - 1]} ${dayNum} — ${activeDay.status.replace(/_/g, ' ')}`}</ThemedText>
                {activeDay.isOverridden ? (
                  <ThemedText style={styles.overriddenNote}>
                    {`● Manually overridden${activeDay.overriddenByName ? ` by ${activeDay.overriddenByName}` : ''}${activeDay.overrideReason ? ` · "${activeDay.overrideReason}"` : ''}`}
                  </ThemedText>
                ) : null}
              </View>
              <Pressable onPress={() => setActiveDay(null)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
                <ThemedText themeColor="textMuted" style={styles.close}>×</ThemedText>
              </Pressable>
            </View>

            <View style={[styles.punch, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText themeColor="textSecondary" style={styles.small}>
                <ThemedText style={styles.smallBold}>IN: </ThemedText>
                {inTime ?? 'No punch recorded'}
                {inTime ? ' (from biometric)' : ''}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.small}>
                <ThemedText style={styles.smallBold}>OUT: </ThemedText>
                {outTime ?? '—'}
              </ThemedText>
              <ThemedText themeColor="textMuted" style={styles.tiny}>Threshold: before 10:30 = Present</ThemedText>
            </View>

            {canOverride ? (
              <>
                <View style={[styles.changeTo, { borderTopColor: theme.border }]}>
                  <ThemedText themeColor="textMuted" style={styles.changeLabel}>CHANGE TO:</ThemedText>
                  <View style={styles.chips}>
                    {OVERRIDE_STATUSES.map((s) => {
                      const sc = STATUS[s];
                      const sel = editStatus === s;
                      return (
                        <Pressable
                          key={s}
                          onPress={() => setEditStatus(s)}
                          accessibilityRole="button"
                          style={[styles.chip, { backgroundColor: sel ? sc.text : sc.bg, borderColor: sc.text }]}>
                          <ThemedText style={[styles.chipText, { color: sel ? '#ffffff' : sc.text }]}>
                            {`${sc.label} ${s === 'HALF_DAY' ? 'Half Day' : s === 'LEAVE' ? 'Leave' : s.charAt(0) + s.slice(1).toLowerCase()}`}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Input
                    value={editReason}
                    onChangeText={setEditReason}
                    placeholder="e.g. Employee showed biometric slip, device lag confirmed"
                    multiline
                    error={editReason.trim() ? undefined : 'Reason is required'}
                  />
                </View>
                <View style={styles.btns}>
                  <Button variant="outline" size="sm" onPress={() => setActiveDay(null)} style={styles.flex1}>Cancel</Button>
                  <Button size="sm" onPress={save} disabled={saving || !editReason.trim()} loading={saving} style={styles.flex1}>
                    {saving ? 'Saving…' : 'Save'}
                  </Button>
                </View>
              </>
            ) : (
              <ThemedText themeColor="textMuted" style={styles.small}>Read-only view</ThemedText>
            )}
          </View>
        );
      })() : null}

      <View style={styles.legend}>
        {[
          { label: 'Present', key: 'PRESENT' },
          { label: 'Late', key: 'LATE' },
          { label: 'Half Day', key: 'HALF_DAY' },
          { label: 'Absent', key: 'ABSENT' },
          { label: 'Leave', key: 'LEAVE' },
          { label: 'Weekend / —', key: 'WEEKEND' },
        ].map((l) => (
          <View key={l.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: STATUS[l.key].bg }]}>
              <ThemedText style={[styles.swatchText, { color: STATUS[l.key].text }]}>{STATUS[l.key].label}</ThemedText>
            </View>
            <ThemedText themeColor="textMuted" style={styles.tiny}>{l.label}</ThemedText>
          </View>
        ))}
        {overridden.length > 0 ? (
          <View style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: theme.backgroundElement }]}><View style={styles.legendDot} /></View>
            <ThemedText themeColor="textMuted" style={styles.tiny}>Overridden</ThemedText>
          </View>
        ) : null}
      </View>

      {overridden.length > 0 ? (
        <View style={styles.overrides}>
          <Pressable onPress={() => setShowOverrides((v) => !v)} accessibilityRole="button" style={styles.overridesBtn}>
            <ThemedText themeColor="textMuted" style={styles.overridesText}>
              {`${showOverrides ? '▾' : '▸'} OVERRIDES THIS MONTH (${overridden.length})`}
            </ThemedText>
          </Pressable>
          {showOverrides ? (
            <View style={styles.overrideList}>
              {overridden.map((d) => {
                const dayNum = parseInt(d.date.split('-')[2], 10);
                const sc = STATUS[d.status];
                return (
                  <View key={d.date} style={[styles.overrideRow, { backgroundColor: theme.surface }]}>
                    <ThemedText themeColor="textMuted" style={styles.overrideDate}>{`${MONTH_NAMES[month - 1].slice(0, 3)} ${dayNum}`}</ThemedText>
                    <ThemedText style={[styles.small, styles.flex1]}>
                      <ThemedText style={[styles.small, { color: sc?.text, fontFamily: FontWeights.semiBold }]}>{d.status.replace(/_/g, ' ')}</ThemedText>
                      {d.overrideReason ? <ThemedText themeColor="textSecondary" style={[styles.small, { fontStyle: 'italic' }]}>{` · "${d.overrideReason}"`}</ThemedText> : null}
                      {d.overriddenByName ? <ThemedText themeColor="textMuted" style={styles.small}>{` · by ${d.overriddenByName}`}</ThemedText> : null}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  wrap: { marginTop: 16 },
  heading: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8, marginBottom: 12 },
  toast: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginBottom: 12 },
  toastText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cellDay: { fontSize: 8, lineHeight: 9, opacity: 0.7, fontFamily: FontWeights.bold },
  cellLabel: { fontSize: 9, lineHeight: 10, fontFamily: FontWeights.bold },
  dot: { position: 'absolute', bottom: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: '#60a5fa' },
  panel: { marginTop: 12, padding: 16, borderWidth: 1, borderRadius: Radii.lg, gap: 12 },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  panelTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  overriddenNote: { fontSize: 10, lineHeight: 14, color: '#60a5fa', fontFamily: FontWeights.medium, marginTop: 2 },
  close: { fontSize: 20, lineHeight: 22 },
  punch: { padding: 12, borderRadius: 8, gap: 4 },
  small: { fontSize: 12, lineHeight: 18 },
  smallBold: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  tiny: { fontSize: 10, lineHeight: 14 },
  changeTo: { borderTopWidth: 1, paddingTop: 12, gap: 8 },
  changeLabel: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 32, paddingHorizontal: 10, borderWidth: 1.5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold },
  btns: { flexDirection: 'row', gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  swatchText: { fontSize: 9, lineHeight: 11, fontFamily: FontWeights.bold },
  legendDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#60a5fa' },
  overrides: { marginTop: 16 },
  overridesBtn: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  overridesText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.5 },
  overrideList: { gap: 6, marginTop: 8 },
  overrideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  overrideDate: { minWidth: 44, fontSize: 12, lineHeight: 18, fontFamily: Fonts?.mono, fontWeight: '500' },
});
