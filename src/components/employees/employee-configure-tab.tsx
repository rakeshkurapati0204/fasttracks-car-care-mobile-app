import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card, Flash, SectionTitle, useFlash } from '@/components/employees/tab-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  clearPayrollOverride,
  fetchEmployeePermissions,
  fetchShiftTimingConfig,
  fetchTabRegistry,
  setEmployeeSalary,
  setPayrollOverride,
  updateEmployeePermissions,
  updateShiftTimingConfig,
  updateStaffConfigAttendanceDefaults,
} from '@/lib/api';
import { fetchPermissionHistory, type PermissionChangeLogRow } from '@/lib/employee-tabs-api';
import type { EmployeeAttendanceDefaultsFields, EmployeeCardItem, TabDef } from '@/types/api';

// Dashboard employees/page.tsx → Configure tab (logic ~1273–1440 and 1642–1670, tab-registry groups ~1095–1190, UI
// ~2064–2508). Sections in the dashboard's order: Monthly Salary, Attendance Defaults, Shift Timings, Payroll
// Override, Tab Access Permissions (+ history). The tab is shown only when canEdit (OWNER, or STORE_MANAGER for
// someone who is neither OWNER nor STORE_MANAGER), which is also what keeps salary and the secret verification
// remarks hidden from everyone else. Server gates: staff-config shift/attendance-defaults OWNER/STORE_MANAGER,
// salary also CASHIER, permissions PUT OWNER/STORE_MANAGER.

const PERMISSION_GROUP_LABELS: Record<string, string> = {
  general: 'General',
  hr: 'HR & Attendance',
  finance: 'Finance',
  operations: 'Operations',
  devices: 'Device Management',
};
const GROUP_ORDER = ['general', 'hr', 'finance', 'operations', 'devices'];

type PermValue = boolean | { enabled: boolean; mode: string };
type Perms = Record<string, PermValue>;

function buildPermissionGroups(tabDefs: TabDef[]) {
  const byGroup = new Map<string, { key: string; label: string; tabs: { key: string; label: string }[] }>();
  for (const t of tabDefs) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, { key: t.group, label: PERMISSION_GROUP_LABELS[t.group] ?? t.group, tabs: [] });
    byGroup.get(t.group)!.tabs.push({ key: t.key, label: t.label });
  }
  return GROUP_ORDER.map((k) => byGroup.get(k)).filter((g): g is NonNullable<typeof g> => !!g);
}

// Tabs that have sub-modes when enabled (copied from the dashboard, same labels and descriptions).
const TABS_WITH_MODES: Record<string, { label: string; options: { value: string; label: string; description: string }[] }> = {
  customers_jobs: { label: 'Access Mode', options: [
    { value: 'view_only', label: 'View Only', description: 'All customers, read-only' },
    { value: 'sales_mode', label: 'Sales Mode', description: 'Own customers only, can create & edit' },
    { value: 'full_access', label: 'Full Access', description: 'All customers, full create/edit/delete' },
  ] },
  invoices: { label: 'Access Mode', options: [
    { value: 'view_only', label: 'View Only', description: 'See all invoices, no create/edit' },
    { value: 'create_collect', label: 'Create & Collect', description: 'Create invoices, record payments, no delete/void' },
    { value: 'full_access', label: 'Full Access', description: 'Create, edit, delete, void' },
  ] },
  employees: { label: 'Access Mode', options: [
    { value: 'view_only', label: 'View Only', description: 'Employee list and details, read-only' },
    { value: 'hr_edit', label: 'HR Edit', description: 'Edit personal details (phone, email, DOB, salary) — not role' },
    { value: 'full_access', label: 'Full Access', description: 'Edit all details except Role (always locked to Founder/Manager)' },
  ] },
  attendance: { label: 'Access Mode', options: [
    { value: 'own_only', label: 'Own Only', description: 'Only own attendance records' },
    { value: 'full_access', label: 'Full Access', description: 'All employees, can use manual override' },
  ] },
  payroll: { label: 'Access Mode', options: [
    { value: 'view_only', label: 'View Only', description: 'See payroll calculations, no actions' },
    { value: 'full_access', label: 'Full Access', description: 'Can mark paid, disburse salaries' },
  ] },
  financial: { label: 'Access Mode', options: [
    { value: 'view_only', label: 'View Only', description: 'Read-only access' },
    { value: 'full_access', label: 'Full Access', description: 'Full access' },
  ] },
  inventory: { label: 'Access Mode', options: [
    { value: 'view_only', label: 'View Only', description: 'Search & browse only, no add/edit/delete' },
    { value: 'full_access', label: 'Full Access', description: 'Add, edit, delete, restock' },
  ] },
  settings_company: { label: 'Access Mode', options: [
    { value: 'view_only', label: 'View Only', description: 'View company details only, no editing' },
    { value: 'full_access', label: 'Full Access', description: 'Edit and save company details' },
  ] },
  expenses: { label: 'Access Mode', options: [
    { value: 'add', label: 'Add', description: 'Can file own expenses' },
    { value: 'verify', label: 'Verify', description: "Can see and approve/reject everyone's expenses" },
    { value: 'both', label: 'Both', description: "Can file own expenses and verify everyone's" },
  ] },
};

const isOn = (v: PermValue | undefined) => (typeof v === 'object' && v !== null ? v.enabled : Boolean(v));
const modeOf = (key: string, v: PermValue | undefined) => (typeof v === 'object' && v !== null ? v.mode : TABS_WITH_MODES[key].options[0].value);

const toHHMM = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
const parseHHMM = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { h: Number.isNaN(h) ? 0 : h, m: Number.isNaN(m) ? 0 : m };
};
const validHHMM = (s: string) => /^\d{1,2}:\d{2}$/.test(s) && parseHHMM(s).h < 24 && parseHHMM(s).m < 60;
// Phone stand-in for <input type="time">: digits only, the colon goes in by itself.
const timeText = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
};

type Props = {
  employee: EmployeeCardItem;
  now: Date;
  canEdit: boolean;
  /** Reloads Overview payroll after an override is saved or cleared. */
  onReload: () => Promise<void> | void;
};

function Chevron({ open }: { open: boolean }) {
  const theme = useTheme();
  return <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={theme.textMuted} />;
}

export function EmployeeConfigureTab({ employee, now, canEdit, onReload }: Props) {
  const theme = useTheme();
  const isTech = employee.role === 'TECHNICIAN';
  const defaultConf = useMemo(() => ({
    onTimeBefore: isTech ? '11:30' : '10:30',
    lateBefore: isTech ? '12:00' : '11:00',
    halfDayBefore: isTech ? '13:30' : '12:30',
    minFullDayMins: isTech ? 570 : 630,
  }), [isTech]);
  const att = employee as EmployeeCardItem & EmployeeAttendanceDefaultsFields;

  const { msg: configMsg, flash: flashConfig } = useFlash(2500);
  const [newSalary, setNewSalary] = useState(String(employee.monthlySalary || ''));
  const [savingSalary, setSavingSalary] = useState(false);

  const [attDefaults, setAttDefaults] = useState({
    defaultLeaves: String(att.defaultLeaves ?? 0),
    workingDaysPerMonth: String(att.workingDaysPerMonth ?? ''),
    customClockIn: String(att.customClockIn ?? ''),
    customClockOut: String(att.customClockOut ?? ''),
  });
  const [savingAtt, setSavingAtt] = useState(false);

  const [shiftConf, setShiftConf] = useState(defaultConf);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [savingTimings, setSavingTimings] = useState(false);

  // Payroll override (this month)
  const [showOverride, setShowOverride] = useState(false);
  const [overrideAmt, setOverrideAmt] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const { msg: overrideMsg, flash: flashOverride } = useFlash(3000);

  // Permissions
  const [perms, setPerms] = useState<Perms>({});
  const [tabRegistry, setTabRegistry] = useState<TabDef[]>([]);
  const permissionGroups = useMemo(() => buildPermissionGroups(tabRegistry), [tabRegistry]);
  const [permsLoading, setPermsLoading] = useState(false);
  const [permsSaving, setPermsSaving] = useState(false);
  const [permsLoadError, setPermsLoadError] = useState('');
  const { msg: permsSaveMsg, flash: flashPerms } = useFlash(3000);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({ general: true, hr: false, finance: false, operations: false, devices: false });
  const [permHistory, setPermHistory] = useState<PermissionChangeLogRow[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const registryLoaded = useRef(false);

  // ── Shift timings load (once per open; "Reset to defaults" reloads, like the dashboard) ──
  useEffect(() => {
    if (configLoaded) return;
    let alive = true;
    (async () => {
      try {
        const d = await fetchShiftTimingConfig(employee.id);
        if (alive && d) {
          setShiftConf({
            onTimeBefore: toHHMM(d.onTimeBeforeH, d.onTimeBeforeM),
            lateBefore: toHHMM(d.lateBeforeH, d.lateBeforeM),
            halfDayBefore: toHHMM(d.halfDayBeforeH, d.halfDayBeforeM),
            minFullDayMins: d.minFullDayMins,
          });
        }
      } catch { /* keep the defaults */ }
      if (alive) setConfigLoaded(true);
    })();
    return () => { alive = false; };
  }, [configLoaded, employee.id]);

  // ── Permissions load ──
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open
    setPermsLoading(true);
    Promise.all([
      fetchEmployeePermissions(employee.id),
      registryLoaded.current ? Promise.resolve(null) : fetchTabRegistry(),
    ])
      .then(([p, registry]) => {
        if (!alive) return;
        setPerms((p?.permissions ?? {}) as Perms);
        if (registry) { setTabRegistry(registry ?? []); registryLoaded.current = true; }
      })
      .catch(() => { if (alive) setPermsLoadError('Failed to load permissions — please try again'); })
      .finally(() => { if (alive) setPermsLoading(false); });
    return () => { alive = false; };
  }, [employee.id]);

  const togglePermHistory = async () => {
    setHistoryOpen((v) => !v);
    if (permHistory === null) {
      try { setPermHistory(await fetchPermissionHistory(employee.id)); }
      catch { setPermHistory([]); }
    }
  };

  const saveSalary = async () => {
    const amt = parseFloat(newSalary);
    if (Number.isNaN(amt) || amt < 0) { flashConfig('Invalid salary amount'); return; }
    setSavingSalary(true);
    try {
      await setEmployeeSalary(employee.id, amt);
      flashConfig(`✓ Salary updated to ₹${amt.toLocaleString('en-IN')}`);
    } catch { flashConfig('Failed to update salary'); }
    finally { setSavingSalary(false); }
  };

  const saveAttDefaults = async () => {
    if ((attDefaults.customClockIn && !validHHMM(attDefaults.customClockIn)) || (attDefaults.customClockOut && !validHHMM(attDefaults.customClockOut))) {
      flashConfig('Enter clock times as HH:MM'); return;
    }
    setSavingAtt(true);
    try {
      await updateStaffConfigAttendanceDefaults(employee.id, {
        defaultLeaves: attDefaults.defaultLeaves !== '' ? Number(attDefaults.defaultLeaves) : null,
        workingDaysPerMonth: attDefaults.workingDaysPerMonth !== '' ? Number(attDefaults.workingDaysPerMonth) : null,
        customClockIn: attDefaults.customClockIn || null,
        customClockOut: attDefaults.customClockOut || null,
      });
      flashConfig('✓ Attendance defaults saved');
    } catch { flashConfig('Failed to save attendance defaults'); }
    finally { setSavingAtt(false); }
  };

  const saveTimings = async () => {
    if (!validHHMM(shiftConf.onTimeBefore) || !validHHMM(shiftConf.lateBefore) || !validHHMM(shiftConf.halfDayBefore)) {
      flashConfig('Enter shift times as HH:MM'); return;
    }
    setSavingTimings(true);
    try {
      const ot = parseHHMM(shiftConf.onTimeBefore);
      const lb = parseHHMM(shiftConf.lateBefore);
      const hd = parseHHMM(shiftConf.halfDayBefore);
      await updateShiftTimingConfig(employee.id, {
        onTimeBeforeH: ot.h, onTimeBeforeM: ot.m,
        lateBeforeH: lb.h, lateBeforeM: lb.m,
        halfDayBeforeH: hd.h, halfDayBeforeM: hd.m,
        minFullDayMins: Number(shiftConf.minFullDayMins),
      });
      flashConfig('✓ Timings saved');
    } catch { flashConfig('Failed to save timings'); }
    finally { setSavingTimings(false); }
  };

  const saveOverride = async () => {
    const amt = parseFloat(overrideAmt);
    if (Number.isNaN(amt) || amt < 0) { flashOverride('Enter a valid amount'); return; }
    setSavingOverride(true);
    try {
      await setPayrollOverride({ userId: employee.id, month: now.getMonth() + 1, year: now.getFullYear(), finalSalary: amt, note: overrideNote || undefined });
      flashOverride('✓ Override saved');
      setShowOverride(false);
      await onReload();
    } catch { flashOverride('Failed to save override'); }
    finally { setSavingOverride(false); }
  };

  const clearOverride = async () => {
    setSavingOverride(true);
    try {
      await clearPayrollOverride({ userId: employee.id, month: now.getMonth() + 1, year: now.getFullYear() });
      flashOverride('✓ Override cleared');
      setShowOverride(false);
      await onReload();
    } catch { flashOverride('Failed to clear override'); }
    finally { setSavingOverride(false); }
  };

  const savePerms = async () => {
    setPermsSaving(true);
    setPermsLoadError('');
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setPermsSaving(false);
      flashPerms('Request timed out — please try again');
    }, 15000);
    try {
      await updateEmployeePermissions(employee.id, perms);
      if (!timedOut) flashPerms('✓ Permissions saved');
    } catch { if (!timedOut) flashPerms('Failed to save permissions'); }
    finally {
      clearTimeout(timer);
      if (!timedOut) setPermsSaving(false);
    }
  };

  const toggleTab = (key: string) => setPerms((p) => {
    const cur = p[key];
    if (key in TABS_WITH_MODES) return { ...p, [key]: { enabled: !isOn(cur), mode: modeOf(key, cur) } };
    return { ...p, [key]: !cur };
  });

  const toggleGroup = useCallback((tabs: { key: string }[], val: boolean) => setPerms((p) => {
    const next = { ...p };
    tabs.forEach((t) => {
      if (t.key in TABS_WITH_MODES) next[t.key] = { enabled: val, mode: modeOf(t.key, next[t.key]) };
      else next[t.key] = val;
    });
    return next;
  }), []);

  const permsMsg = permsSaveMsg || permsLoadError;
  const monthLabel = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const trackColor = { false: theme.border, true: theme.primary };

  return (
    <View style={styles.gap}>
      <Flash msg={configMsg} />

      {/* Salary */}
      <Card style={styles.gapSm}>
        <SectionTitle>Monthly Salary</SectionTitle>
        <View style={styles.salaryRow}>
          <View style={styles.flex1}>
            <Input label="New Monthly Salary (₹)" value={newSalary} onChangeText={setNewSalary} keyboardType="decimal-pad" placeholder="e.g. 25000" />
          </View>
          <Button loading={savingSalary} onPress={saveSalary}>Save Salary</Button>
        </View>
        <ThemedText themeColor="textMuted" style={styles.hint}>Salary is effective from the 1st of next month and logged in history.</ThemedText>
      </Card>

      {/* Attendance Defaults */}
      <Card style={styles.gapMd}>
        <SectionTitle>Attendance Defaults</SectionTitle>
        <View style={styles.grid}>
          <View style={styles.cell}>
            <Input label="Default Leaves / Month" value={attDefaults.defaultLeaves} onChangeText={(v) => setAttDefaults((p) => ({ ...p, defaultLeaves: v.replace(/\D/g, '').slice(0, 2) }))} keyboardType="number-pad" placeholder="0" hint="Paid leave days not deducted from salary" />
          </View>
          <View style={styles.cell}>
            <Input label="Working Days / Month" value={attDefaults.workingDaysPerMonth} onChangeText={(v) => setAttDefaults((p) => ({ ...p, workingDaysPerMonth: v.replace(/\D/g, '').slice(0, 2) }))} keyboardType="number-pad" placeholder="Calendar days" hint="Leave blank to use calendar days" />
          </View>
          <View style={styles.cell}>
            <Input label="Expected Clock-In (HH:MM)" value={attDefaults.customClockIn} onChangeText={(v) => setAttDefaults((p) => ({ ...p, customClockIn: timeText(v) }))} keyboardType="number-pad" placeholder="HH:MM" hint="Display reference only" />
          </View>
          <View style={styles.cell}>
            <Input label="Expected Clock-Out (HH:MM)" value={attDefaults.customClockOut} onChangeText={(v) => setAttDefaults((p) => ({ ...p, customClockOut: timeText(v) }))} keyboardType="number-pad" placeholder="HH:MM" hint="Display reference only" />
          </View>
        </View>
        <Button fullWidth loading={savingAtt} onPress={saveAttDefaults}>Save Attendance Defaults</Button>
      </Card>

      {/* Shift Timings */}
      <Card style={styles.gapMd}>
        <View style={styles.between}>
          <SectionTitle>Shift Timings</SectionTitle>
          <Pressable onPress={() => { setShiftConf(defaultConf); setConfigLoaded(false); }} hitSlop={8} accessibilityRole="button">
            <ThemedText themeColor="textMuted" style={styles.small}>Reset to defaults</ThemedText>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {([
            { key: 'onTimeBefore', label: 'On-Time before (HH:MM)', hint: 'Before this → PRESENT' },
            { key: 'lateBefore', label: 'Late before (HH:MM)', hint: 'Before this → LATE' },
            { key: 'halfDayBefore', label: 'Half-Day before (HH:MM)', hint: 'Before this → HALF DAY' },
          ] as const).map((f) => (
            <View key={f.key} style={styles.cell}>
              <Input label={f.label} value={shiftConf[f.key]} onChangeText={(v) => setShiftConf((p) => ({ ...p, [f.key]: timeText(v) }))} keyboardType="number-pad" placeholder="HH:MM" hint={f.hint} />
            </View>
          ))}
          <View style={styles.cell}>
            <Input
              label="Min Full-Day (minutes)"
              value={String(shiftConf.minFullDayMins)}
              onChangeText={(v) => setShiftConf((p) => ({ ...p, minFullDayMins: parseInt(v, 10) || 0 }))}
              keyboardType="number-pad"
              hint={`${Math.floor(shiftConf.minFullDayMins / 60)}h ${shiftConf.minFullDayMins % 60}m required for full day`}
            />
          </View>
        </View>
        <Button fullWidth loading={savingTimings} onPress={saveTimings}>Save Timings</Button>
      </Card>

      {/* Payroll Override */}
      <Card style={styles.gapSm}>
        <Pressable
          onPress={() => { if (!showOverride) { setOverrideAmt(''); setOverrideNote(''); } setShowOverride((v) => !v); }}
          accessibilityRole="button"
          style={styles.between}>
          <SectionTitle>Payroll Override</SectionTitle>
          <Chevron open={showOverride} />
        </Pressable>
        {showOverride ? (
          <View style={styles.gapSm}>
            <ThemedText themeColor="textMuted" style={styles.small}>
              Manually set the final salary for <ThemedText style={[styles.small, { fontFamily: FontWeights.semiBold }]}>{monthLabel}</ThemedText>. This overrides the calculated net salary.
            </ThemedText>
            <Flash msg={overrideMsg} small />
            <View style={styles.grid}>
              <View style={styles.cell}><Input label="Override Amount (₹)" value={overrideAmt} onChangeText={setOverrideAmt} keyboardType="decimal-pad" placeholder="e.g. 28000" /></View>
              <View style={styles.cell}><Input label="Reason (optional)" value={overrideNote} onChangeText={setOverrideNote} placeholder="e.g. Bonus month" /></View>
            </View>
            <View style={styles.row}>
              <View style={styles.flex1}><Button size="sm" fullWidth loading={savingOverride} onPress={saveOverride}>Apply Override</Button></View>
              <Button size="sm" variant="danger" loading={savingOverride} onPress={clearOverride}>Clear</Button>
            </View>
          </View>
        ) : overrideMsg ? <Flash msg={overrideMsg} small /> : null}
      </Card>

      {/* Tab Permissions */}
      {canEdit ? (
        <Card style={styles.gapSm}>
          <SectionTitle>Tab Access Permissions</SectionTitle>
          <Flash msg={permsMsg} small />
          {permsLoading ? (
            <Skeleton height={96} />
          ) : (
            <View style={styles.gapXs}>
              {permissionGroups.map((group) => {
                const allOn = group.tabs.every((t) => isOn(perms[t.key]));
                const open = groupOpen[group.key];
                const count = group.tabs.filter((t) => isOn(perms[t.key])).length;
                return (
                  <View key={group.key} style={[styles.group, { borderColor: theme.border }]}>
                    <Pressable onPress={() => setGroupOpen((p) => ({ ...p, [group.key]: !p[group.key] }))} accessibilityRole="button" style={[styles.groupHead, { backgroundColor: theme.backgroundElement }]}>
                      <View style={[styles.row, styles.flex1]}>
                        <ThemedText style={styles.groupName} numberOfLines={1}>{group.label}</ThemedText>
                        <ThemedText themeColor="textMuted" style={styles.small}>{count}/{group.tabs.length}</ThemedText>
                      </View>
                      <View style={styles.row}>
                        <Pressable onPress={() => toggleGroup(group.tabs, !allOn)} hitSlop={8} accessibilityRole="button">
                          <ThemedText style={[styles.selectAll, { color: theme.primary }]}>{allOn ? 'Deselect All' : 'Select All'}</ThemedText>
                        </Pressable>
                        <Chevron open={open} />
                      </View>
                    </Pressable>
                    {open ? group.tabs.map((t) => {
                      const on = isOn(perms[t.key]);
                      const modeDef = TABS_WITH_MODES[t.key];
                      return (
                        <View key={t.key} style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
                          <View style={styles.permRow}>
                            <ThemedText style={[styles.perm, styles.flex1]}>{t.label}</ThemedText>
                            <Switch value={on} onValueChange={() => toggleTab(t.key)} trackColor={trackColor} thumbColor="#fff" />
                          </View>
                          {modeDef && on ? (
                            <View style={styles.modes}>
                              <View style={styles.chips}>
                                {modeDef.options.map((opt) => {
                                  const sel = modeOf(t.key, perms[t.key]) === opt.value;
                                  return (
                                    <Pressable
                                      key={opt.value}
                                      onPress={() => setPerms((p) => ({ ...p, [t.key]: { enabled: true, mode: opt.value } }))}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected: sel }}
                                      style={[styles.chip, { backgroundColor: sel ? theme.primary : theme.backgroundElement, borderColor: sel ? theme.primary : theme.border }]}>
                                      <ThemedText style={[styles.chipText, { color: sel ? '#fff' : theme.textMuted }]}>{opt.label}</ThemedText>
                                    </Pressable>
                                  );
                                })}
                              </View>
                              <ThemedText themeColor="textMuted" style={styles.tiny}>{modeDef.options.find((o) => o.value === modeOf(t.key, perms[t.key]))?.description ?? ''}</ThemedText>
                            </View>
                          ) : null}
                          {/* Verification remarks — an independent grant (customer_remarks), not part of the mode radio. */}
                          {t.key === 'customers_jobs' ? (
                            <View style={[styles.permRow, styles.remarks, { borderTopColor: theme.border }]}>
                              <View style={styles.flex1}>
                                <ThemedText style={styles.perm}>Verification Remarks (secret)</ThemedText>
                                <ThemedText themeColor="textMuted" style={styles.tiny}>Can view/add the secret verification-remarks thread on customers &amp; jobs</ThemedText>
                              </View>
                              <Switch value={Boolean(perms.customer_remarks)} onValueChange={() => setPerms((p) => ({ ...p, customer_remarks: !p.customer_remarks }))} trackColor={trackColor} thumbColor="#fff" />
                            </View>
                          ) : null}
                        </View>
                      );
                    }) : null}
                  </View>
                );
              })}

              <Button fullWidth loading={permsSaving} onPress={savePerms} style={{ marginTop: 8 }}>Save Permissions</Button>

              <Pressable onPress={togglePermHistory} hitSlop={8} accessibilityRole="button" style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                <ThemedText themeColor="textMuted" style={[styles.perm, { textDecorationLine: 'underline' }]}>{historyOpen ? 'Hide History' : 'View History'}</ThemedText>
              </Pressable>
              {historyOpen ? (
                <View style={[styles.history, { borderColor: theme.border }]}>
                  {permHistory === null ? (
                    <ThemedText themeColor="textMuted" style={styles.histRow}>Loading…</ThemedText>
                  ) : permHistory.length === 0 ? (
                    <ThemedText themeColor="textMuted" style={styles.histRow}>No permission changes recorded yet.</ThemedText>
                  ) : permHistory.map((row, i) => {
                    const tabLabel = tabRegistry.find((t) => t.key === row.tabKey)?.label ?? row.tabKey;
                    return (
                      <View key={row.id} style={[styles.histRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                        <ThemedText style={styles.perm}>
                          <ThemedText style={[styles.perm, { fontFamily: FontWeights.semiBold }]}>{row.changedBy?.name ?? 'Unknown'}</ThemedText>
                          {' changed '}
                          <ThemedText style={[styles.perm, { fontFamily: FontWeights.semiBold }]}>{tabLabel}</ThemedText>
                          {row.field === 'enabled' ? ' access ' : ' mode '}
                          from <ThemedText style={[styles.perm, { fontFamily: Fonts?.mono }]}>{row.oldValue ?? '—'}</ThemedText> to{' '}
                          <ThemedText style={[styles.perm, { fontFamily: Fonts?.mono }]}>{row.newValue ?? '—'}</ThemedText>
                        </ThemedText>
                        <ThemedText themeColor="textMuted" style={styles.small}>{new Date(row.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</ThemedText>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          )}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 20 },
  gapMd: { gap: 16 },
  gapSm: { gap: 12 },
  gapXs: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  salaryRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  cell: { width: '47%', flexGrow: 1 },
  hint: { fontSize: 11, lineHeight: 15 },
  small: { fontSize: 12, lineHeight: 16 },
  tiny: { fontSize: 10, lineHeight: 14 },
  group: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  groupName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, flexShrink: 1 },
  selectAll: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  permRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  perm: { fontSize: 14, lineHeight: 20 },
  modes: { paddingHorizontal: 16, paddingBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  remarks: { paddingLeft: 32, borderTopWidth: 1, borderStyle: 'dashed' },
  history: { marginTop: 8, borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  histRow: { padding: 12, fontSize: 14, lineHeight: 20 },
});
