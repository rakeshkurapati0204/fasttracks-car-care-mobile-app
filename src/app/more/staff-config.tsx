import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/home/glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchEmployees,
  fetchSalaryHistory,
  fetchShiftTimingConfig,
  getErrorMessage,
  resetShiftTimingConfig,
  setEmployeeSalary,
  updateShiftTimingConfig,
  updateStaffConfigAttendanceDefaults,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { EmployeeListItem, SalaryHistoryEntry, ShiftTimingConfig } from '@/types/api';

import { roleLabel } from '@/lib/labels';
// Staff Config is a separate Prisma model (ShiftConfig/SalaryHistory) from
// Employees/User — backend/src/routes/staffConfig.ts, re-verified in full
// 2026-09-21. ADMIN_ROLES=[OWNER,STORE_MANAGER] gate GET/PUT/DELETE shift
// timing config and PUT attendance-defaults; PUT /:userId/salary additionally
// allows CASHIER (requireRoles('OWNER','STORE_MANAGER','CASHIER')). Both
// match this screen's original comment exactly — confirmed, not just trusted.
//
// BUG FIXED 2026-09-21: this screen previously sent customClockIn/
// customClockOut/workingDaysPerMonth to PUT /staff-config/:userId, which is
// actually the arrival-timing-cutoffs endpoint (onTimeBeforeH/M, lateBeforeH/M,
// halfDayBeforeH/M, minFullDayMins — all required). Every save silently 400'd.
// Timing cutoffs and attendance defaults are now correctly split into two
// separate calls/sections, matching what the backend actually expects.
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER'];
const SALARY_ROLES = ['OWNER', 'STORE_MANAGER', 'CASHIER'];

const DEFAULT_TIMING: Omit<ShiftTimingConfig, 'userId'> = {
  onTimeBeforeH: 9, onTimeBeforeM: 30,
  lateBeforeH: 10, lateBeforeM: 0,
  halfDayBeforeH: 13, halfDayBeforeM: 0,
  minFullDayMins: 240,
};

function formatCurrency(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function StaffConfigScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');
  const canEditSalary = SALARY_ROLES.includes(user?.role ?? '');
  const isAuthorized = isAdmin || canEditSalary;

  const [employees, setEmployees] = useState<EmployeeListItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingTiming, setIsSavingTiming] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [isSavingSalary, setIsSavingSalary] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [hasTimingRow, setHasTimingRow] = useState(false);
  const [timing, setTiming] = useState(DEFAULT_TIMING);

  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [workingDays, setWorkingDays] = useState('');
  const [leaves, setLeaves] = useState('');

  const [newSalary, setNewSalary] = useState('');
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistoryEntry[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    setError(null);
    try {
      setEmployees(await fetchEmployees());
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load employees.'));
    }
  }, [isAuthorized]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const onSelect = async (id: string) => {
    setSelectedId(id);
    setIsLoadingDetail(true);
    setError(null);
    setNotice(null);
    setNewSalary('');
    setShowHistory(false);
    setSalaryHistory(null);
    try {
      const emp = employees?.find((e) => e.id === id);
      setClockIn(emp?.customClockIn ?? '');
      setClockOut(emp?.customClockOut ?? '');
      setWorkingDays(emp?.workingDaysPerMonth != null ? String(emp.workingDaysPerMonth) : '');
      setLeaves(emp?.defaultLeaves != null ? String(emp.defaultLeaves) : '');
      if (isAdmin) {
        const cfg = await fetchShiftTimingConfig(id);
        setHasTimingRow(!!cfg);
        setTiming(cfg ?? DEFAULT_TIMING);
      }
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load shift config.'));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const onSaveTiming = async () => {
    if (!selectedId) return;
    setIsSavingTiming(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await updateShiftTimingConfig(selectedId, timing);
      setTiming(saved);
      setHasTimingRow(true);
      setNotice('Timing cutoffs saved. Current month attendance recalculated.');
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not save timing cutoffs.'));
    } finally {
      setIsSavingTiming(false);
    }
  };

  const onResetTiming = () => {
    if (!selectedId) return;
    Alert.alert(
      'Reset to default timings?',
      'This removes the custom arrival-timing cutoffs for this employee, reverting to the company defaults.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setIsResetting(true);
            setError(null);
            setNotice(null);
            try {
              await resetShiftTimingConfig(selectedId);
              setHasTimingRow(false);
              setTiming(DEFAULT_TIMING);
              setNotice('Reset to default timings.');
            } catch (err: any) {
              setError(getErrorMessage(err, 'Could not reset timing cutoffs.'));
            } finally {
              setIsResetting(false);
            }
          },
        },
      ],
    );
  };

  const onSaveDefaults = async () => {
    if (!selectedId) return;
    setIsSavingDefaults(true);
    setError(null);
    setNotice(null);
    try {
      await updateStaffConfigAttendanceDefaults(selectedId, {
        customClockIn: clockIn.trim() || null,
        customClockOut: clockOut.trim() || null,
        workingDaysPerMonth: workingDays.trim() ? Number(workingDays) : null,
        defaultLeaves: leaves.trim() ? Number(leaves) : null,
      });
      setNotice('Attendance defaults saved.');
      await load();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not save attendance defaults.'));
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const onSaveSalary = async () => {
    if (!selectedId || !newSalary.trim()) return;
    setIsSavingSalary(true);
    setError(null);
    setNotice(null);
    try {
      await setEmployeeSalary(selectedId, Number(newSalary));
      setNotice('Salary updated — effective from the 1st of next month.');
      setNewSalary('');
      if (showHistory) setSalaryHistory(await fetchSalaryHistory(selectedId));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not update salary.'));
    } finally {
      setIsSavingSalary(false);
    }
  };

  const onToggleHistory = async () => {
    if (!selectedId) return;
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    if (salaryHistory !== null) return;
    setError(null);
    try {
      setSalaryHistory(await fetchSalaryHistory(selectedId));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load salary history.'));
    }
  };

  if (!isAuthorized) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">
          Staff Config is only available to Owner, Store Manager, or Cashier accounts.
        </ThemedText>
      </ThemedView>
    );
  }

  if (selectedId) {
    const emp = employees?.find((e) => e.id === selectedId);
    return (
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
        <Stack.Screen options={{ title: emp?.name ?? 'Staff Config' }} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}>
          <Pressable onPress={() => setSelectedId(null)} style={styles.backButton} accessibilityLabel="Back to staff list">
            <ThemedText type="link">‹ Back to list</ThemedText>
          </Pressable>
          {isLoadingDetail && <ActivityIndicator style={styles.spinner} />}
          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
          {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}

          {isAdmin && (
            <GlassCard style={styles.card}>
              <ThemedText type="smallBold">Arrival timing cutoffs</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {hasTimingRow ? 'Custom cutoffs set for this employee.' : 'Using company defaults — save to set custom cutoffs.'}
              </ThemedText>
              <TimingRow label="On-time before" h={timing.onTimeBeforeH} m={timing.onTimeBeforeM}
                onH={(v) => setTiming((t) => ({ ...t, onTimeBeforeH: v }))} onM={(v) => setTiming((t) => ({ ...t, onTimeBeforeM: v }))} theme={theme} />
              <TimingRow label="Late before" h={timing.lateBeforeH} m={timing.lateBeforeM}
                onH={(v) => setTiming((t) => ({ ...t, lateBeforeH: v }))} onM={(v) => setTiming((t) => ({ ...t, lateBeforeM: v }))} theme={theme} />
              <TimingRow label="Half-day before" h={timing.halfDayBeforeH} m={timing.halfDayBeforeM}
                onH={(v) => setTiming((t) => ({ ...t, halfDayBeforeH: v }))} onM={(v) => setTiming((t) => ({ ...t, halfDayBeforeM: v }))} theme={theme} />
              <TextInput
                value={String(timing.minFullDayMins)}
                onChangeText={(v) => setTiming((t) => ({ ...t, minFullDayMins: Number(v) || 0 }))}
                placeholder="Minimum minutes for a full day"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <View style={styles.buttonRow}>
                <Pressable onPress={onSaveTiming} disabled={isSavingTiming} style={styles.button}>
                  {isSavingTiming ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Save timings</ThemedText>}
                </Pressable>
                {hasTimingRow && (
                  <Pressable onPress={onResetTiming} disabled={isResetting} style={[styles.button, styles.buttonSecondary]}>
                    {isResetting ? <ActivityIndicator /> : <ThemedText type="smallBold">Reset</ThemedText>}
                  </Pressable>
                )}
              </View>
            </GlassCard>
          )}

          {isAdmin && (
            <GlassCard style={styles.card}>
              <ThemedText type="smallBold">Attendance defaults</ThemedText>
              <TextInput
                value={clockIn}
                onChangeText={setClockIn}
                placeholder="Custom clock-in (HH:mm)"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <TextInput
                value={clockOut}
                onChangeText={setClockOut}
                placeholder="Custom clock-out (HH:mm)"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <TextInput
                value={workingDays}
                onChangeText={setWorkingDays}
                placeholder="Working days per month"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <TextInput
                value={leaves}
                onChangeText={setLeaves}
                placeholder="Default leaves"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <Pressable onPress={onSaveDefaults} disabled={isSavingDefaults} style={styles.button}>
                {isSavingDefaults ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Save defaults</ThemedText>}
              </Pressable>
            </GlassCard>
          )}

          {canEditSalary && (
            <GlassCard style={styles.card}>
              <ThemedText type="smallBold">Salary</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Changes take effect from the 1st of next month.
              </ThemedText>
              <TextInput
                value={newSalary}
                onChangeText={setNewSalary}
                placeholder="New monthly salary"
                placeholderTextColor={theme.textSecondary}
                keyboardType="decimal-pad"
                style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
              />
              <Pressable onPress={onSaveSalary} disabled={isSavingSalary} style={styles.button}>
                {isSavingSalary ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Update salary</ThemedText>}
              </Pressable>
              <Pressable onPress={onToggleHistory} style={styles.historyToggle}>
                <ThemedText type="link">{showHistory ? 'Hide history' : 'View salary history'}</ThemedText>
              </Pressable>
              {showHistory && (
                salaryHistory === null ? (
                  <ActivityIndicator style={styles.spinner} />
                ) : salaryHistory.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">No salary changes on record.</ThemedText>
                ) : (
                  salaryHistory.map((h) => (
                    <View key={h.id} style={styles.historyRow}>
                      <ThemedText type="small" numberOfLines={1} ellipsizeMode="tail">
                        {formatCurrency(h.oldSalary ?? 0)} → {formatCurrency(h.newSalary)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {new Date(h.effectiveFrom).toLocaleDateString('en-IN')} · {h.changedBy.name}
                      </ThemedText>
                    </View>
                  ))
                )
              )}
            </GlassCard>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Staff Config' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {employees === null ? (
          <ActivityIndicator style={styles.spinner} />
        ) : employees.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">No employees found.</ThemedText>
        ) : (
          employees.map((e) => (
            <Pressable key={e.id} onPress={() => onSelect(e.id)}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <View style={styles.flex1}>
                  <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail">{e.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{roleLabel(e.role)}</ThemedText>
                </View>
                <ThemedText type="link">Configure ›</ThemedText>
              </ThemedView>
            </Pressable>
          ))
        )}
      </ScrollView>
    </>
  );
}

function TimingRow({ label, h, m, onH, onM, theme }: {
  label: string; h: number; m: number; onH: (v: number) => void; onM: (v: number) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.timingRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.timingLabel} numberOfLines={1} ellipsizeMode="tail">{label}</ThemedText>
      <TextInput
        value={String(h)}
        onChangeText={(v) => onH(Number(v) || 0)}
        placeholder="H"
        placeholderTextColor={theme.textSecondary}
        keyboardType="number-pad"
        style={[styles.input, styles.timingInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <ThemedText type="small">:</ThemedText>
      <TextInput
        value={String(m)}
        onChangeText={(v) => onM(Number(v) || 0)}
        placeholder="M"
        placeholderTextColor={theme.textSecondary}
        keyboardType="number-pad"
        style={[styles.input, styles.timingInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  content: { padding: Spacing.three, gap: Layout.cardGap, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  error: { color: '#B83030', marginTop: Spacing.one },
  notice: { color: '#167A48', marginTop: Spacing.one },
  spinner: { marginTop: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: Spacing.three, padding: Spacing.three, minHeight: Layout.minTouchTarget, gap: Spacing.two },
  card: { gap: Spacing.one, marginBottom: Spacing.two },
  input: { height: 46, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15, marginTop: Spacing.two },
  buttonRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  button: { flex: 1, height: 48, borderRadius: Spacing.two, backgroundColor: '#7A1C2E', alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: 'rgba(127,127,127,0.2)' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  backButton: { marginBottom: Spacing.one, minHeight: 44, justifyContent: 'center' },
  timingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, marginTop: Spacing.two },
  timingLabel: { width: 110 },
  timingInput: { flex: 1, marginTop: 0 },
  historyToggle: { marginTop: Spacing.two, minHeight: 44, justifyContent: 'center' },
  historyRow: { marginTop: Spacing.one, gap: 2 },
});
