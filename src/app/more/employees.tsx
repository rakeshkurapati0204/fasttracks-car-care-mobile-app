import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddEmployeeSheet } from '@/components/employees/add-employee-sheet';
import { EditEmployeeSheet } from '@/components/employees/edit-employee-sheet';
import { EmployeeDetailPanel } from '@/components/employees/employee-detail-panel';
import { AddRemarkSheet, DeactivateSheet, DeleteSheet, ResetPasswordSheet } from '@/components/employees/employee-action-sheets';
import { EmployeeCard, type CardFlags } from '@/components/employees/employee-card';
import { GlassCard } from '@/components/home/glass-card';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Skeleton } from '@/components/ui';
import { FontWeights, MaxContentWidth, Radii, Spacing, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createRecurringTask,
  deactivateEmployee,
  deleteRecurringTask,
  fetchEmployee,
  fetchEmployeePermissions,
  fetchEmployeeCards,
  fetchRecurringTasks,
  fetchTabRegistry,
  getErrorMessage,
  permanentlyDeleteEmployee,
  resetEmployeePassword,
  updateEmployee,
  updateEmployeePermissions,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useContentWidth } from '@/lib/drawer-context';
import { usePermissions } from '@/lib/permissions-context';
import type {
  EmployeeCardItem,
  EmployeeDetail,
  EmployeePermissions,
  RecurrenceType,
  RecurringTaskDefinition,
  TabAccess,
  TabDef,
} from '@/types/api';

// PUT /permissions/:employeeId is OWNER/STORE_MANAGER-only server-side
// (backend/src/routes/permissions_route.ts, re-verified 2026-09-24) —
// dashboard nests this "Configure" permissions editor inside the employee's
// own detail/edit view (not a standalone page), so it's mounted here rather
// than as its own screen. An earlier standalone src/app/more/configure.tsx
// was orphaned (unreachable, no nav link) and has been removed in favor of
// this embedded section.
const PERMISSIONS_ADMIN_ROLES = ['OWNER', 'STORE_MANAGER'];
const GROUP_LABEL: Record<string, string> = {
  general: 'General',
  hr: 'HR',
  finance: 'Finance',
  operations: 'Operations',
  devices: 'Devices',
};

function isTabAccess(v: boolean | TabAccess | undefined): v is TabAccess {
  return typeof v === 'object' && v !== null;
}

// Access mirrors the dashboard Team page's canAccess: OWNER, STORE_MANAGER, HR,
// TECH_TEAM, or anyone with the employees tab granted (that last group gets
// the "restricted" edit sheet: name, phone and email only). The backend gates
// every route with requireManagerOrOwner and decides in the end.
// Role field is OWNER-only; salary fields are SALARY_EDIT_ROLES=[OWNER,
// STORE_MANAGER,CASHIER]; DELETE /:id/permanent is OWNER-only
// (backend/src/routes/employees.ts).
const SALARY_EDIT_ROLES = ['OWNER', 'STORE_MANAGER', 'CASHIER'];

// Role list + display labels copied verbatim from the dashboard's own
// role <select> (frontend/src/app/(dashboard)/dashboard/employees/
// page.tsx), field-level parity pass 2026-09-25. Cashier is create-only
// on the dashboard's select (absent from its edit-form role list) —
// mirrored the same way below via EDIT_ROLE_OPTIONS. HOUSEKEEPING isn't
// one of the dashboard's role-select options at all — kept available
// here since the backend's ASSIGNABLE_ROLES accepts it and removing a
// real, working option isn't what "match the dashboard" means when the
// dashboard's own list is simply incomplete relative to the backend.
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'STORE_MANAGER', label: 'Store Manager — Full access except billing' },
  { value: 'SALES', label: 'Sales — Manage jobs & customers' },
  { value: 'TECHNICIAN', label: 'Technician — Jobs + attendance (1h grace)' },
  { value: 'TECH_TEAM', label: 'Tech Team — Timesheets only' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media — Conversations & timesheets' },
  { value: 'STAFF', label: 'Staff — Basic access (maid / watchman)' },
  { value: 'INVENTORY_MANAGER', label: 'Inventory Manager — Inventory access' },
  { value: 'ACCOUNTING', label: 'Accounting — Financial & payroll access' },
  { value: 'CASHIER', label: 'Cashier — Financial & payroll access' },
  { value: 'HR', label: 'HR' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping' },
];
const EDIT_ROLE_OPTIONS = ROLE_OPTIONS.filter((r) => r.value !== 'CASHIER');
const BRANCH_OPTIONS = [
  { value: '', label: '— Select Branch —' },
  { value: 'Jubilee Hills', label: 'Jubilee Hills' },
  { value: 'Minister Road', label: 'Minister Road' },
];
export default function EmployeesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const { hasTab } = usePermissions();
  const isOwner = user?.role === 'OWNER';
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const hasEmployeesPerm = !isOwner && !isStoreManager && hasTab('employees');
  const isAuthorized = isOwner || isStoreManager || user?.role === 'HR' || user?.role === 'TECH_TEAM' || hasEmployeesPerm;
  const canEditSalaryFields = SALARY_EDIT_ROLES.includes(user?.role ?? '');

  const [employees, setEmployees] = useState<EmployeeCardItem[] | null>(null);
  const contentWidth = useContentWidth();
  const [listWidth, setListWidth] = useState(contentWidth);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<EmployeeCardItem | null>(null);
  const [remarkEmp, setRemarkEmp] = useState<EmployeeCardItem | null>(null);
  const [resetEmp, setResetEmp] = useState<EmployeeCardItem | null>(null);
  const [deactivateEmp, setDeactivateEmp] = useState<EmployeeCardItem | null>(null);
  const [deleteEmp, setDeleteEmp] = useState<EmployeeCardItem | null>(null);
  const [detailEmp, setDetailEmp] = useState<EmployeeCardItem | null>(null);
  const [selected, setSelected] = useState<EmployeeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Configure (permissions) state
  const canManagePermissions = PERMISSIONS_ADMIN_ROLES.includes(user?.role ?? '');
  const [showConfigure, setShowConfigure] = useState(false);
  const [registry, setRegistry] = useState<TabDef[] | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [perms, setPerms] = useState<EmployeePermissions | null>(null);
  const [permsError, setPermsError] = useState<string | null>(null);
  const [isLoadingPerms, setIsLoadingPerms] = useState(false);
  const [savingPermKey, setSavingPermKey] = useState<string | null>(null);
  const [permSaveError, setPermSaveError] = useState<string | null>(null);

  // Standing (recurring) tasks — OWNER/STORE_MANAGER only, same gate as Configure
  const [standingTasks, setStandingTasks] = useState<RecurringTaskDefinition[] | null>(null);
  const [standingTasksError, setStandingTasksError] = useState<string | null>(null);
  const [showNewStanding, setShowNewStanding] = useState(false);
  const [standingTitle, setStandingTitle] = useState('');
  const [standingDescription, setStandingDescription] = useState('');
  const [standingRecurrence, setStandingRecurrence] = useState<RecurrenceType>('DAILY');
  const [standingApplyToRole, setStandingApplyToRole] = useState(false);
  const [isSavingStanding, setIsSavingStanding] = useState(false);
  const [deletingStandingId, setDeletingStandingId] = useState<string | null>(null);

  // Edit form state — order matches dashboard's Edit form exactly: Full
  // Name, Role, Account Active, Username (read-only), Branch, Phone,
  // Personal Email, Monthly Salary, Joining Date, Device User ID.
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [branch, setBranch] = useState('');
  const [phone, setPhone] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [salary, setSalary] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [deviceUserId, setDeviceUserId] = useState('');
  const [designation, setDesignation] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [createdCredential, setCreatedCredential] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    setError(null);
    try {
      setEmployees(await fetchEmployeeCards());
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
    setIsLoadingDetail(true);
    setError(null);
    setNotice(null);
    setShowConfigure(false);
    setPerms(null);
    setPermsError(null);
    setStandingTasks(null);
    setStandingTasksError(null);
    setShowNewStanding(false);
    try {
      const detail = await fetchEmployee(id);
      setSelected(detail);
      setName(detail.name);
      setRole(detail.role);
      setIsActive(detail.isActive);
      // GET /employees/:id doesn't return branch/personalEmail/monthlySalary/
      // joiningDate/deviceUserId (backend select clause omits them) — these
      // start blank on edit, same data gap the dashboard's own edit form has;
      // not fabricated.
      setBranch('');
      setPhone(detail.phone ?? '');
      setPersonalEmail('');
      setSalary('');
      setJoiningDate('');
      setDeviceUserId('');
      setDesignation(detail.designation ?? '');
      setEmail('');
      if (canManagePermissions) await loadStandingTasks(detail.id, detail.role);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load this employee.'));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const loadStandingTasks = async (employeeId: string, employeeRole: string) => {
    setStandingTasksError(null);
    try {
      const [individual, roleWide] = await Promise.all([
        fetchRecurringTasks({ scope: 'INDIVIDUAL', assignedToId: employeeId }),
        fetchRecurringTasks({ scope: 'ROLE', targetRole: employeeRole }),
      ]);
      setStandingTasks([...individual, ...roleWide]);
    } catch (err: any) {
      setStandingTasksError(getErrorMessage(err, 'Could not load standing tasks.'));
    }
  };

  const resetStandingForm = () => {
    setShowNewStanding(false);
    setStandingTitle('');
    setStandingDescription('');
    setStandingRecurrence('DAILY');
    setStandingApplyToRole(false);
  };

  const onCreateStandingTask = async () => {
    if (!selected || !standingTitle.trim()) {
      setStandingTasksError('A title is required.');
      return;
    }
    setIsSavingStanding(true);
    setStandingTasksError(null);
    try {
      await createRecurringTask({
        title: standingTitle.trim(),
        description: standingDescription.trim() || undefined,
        recurrence: standingRecurrence,
        scope: standingApplyToRole ? 'ROLE' : 'INDIVIDUAL',
        targetRole: standingApplyToRole ? selected.role : undefined,
        assignedToId: standingApplyToRole ? undefined : selected.id,
      });
      resetStandingForm();
      await loadStandingTasks(selected.id, selected.role);
    } catch (err: any) {
      setStandingTasksError(getErrorMessage(err, 'Could not create this standing task.'));
    } finally {
      setIsSavingStanding(false);
    }
  };

  const onDeleteStandingTask = (task: RecurringTaskDefinition) => {
    if (!selected) return;
    Alert.alert('Remove standing task', `Delete "${task.title}"? Past completion history is kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingStandingId(task.id);
          try {
            await deleteRecurringTask(task.id);
            await loadStandingTasks(selected.id, selected.role);
          } catch (err: any) {
            setStandingTasksError(getErrorMessage(err, 'Could not delete this standing task.'));
          } finally {
            setDeletingStandingId(null);
          }
        },
      },
    ]);
  };

  const loadPerms = useCallback(async (employeeId: string) => {
    setIsLoadingPerms(true);
    setPermsError(null);
    setRegistryError(null);
    try {
      const [reg, p] = await Promise.all([registry ?? fetchTabRegistry(), fetchEmployeePermissions(employeeId)]);
      setRegistry(reg);
      setPerms(p);
    } catch (err: any) {
      setPermsError(getErrorMessage(err, 'Could not load this employee’s permissions.'));
    } finally {
      setIsLoadingPerms(false);
    }
  }, [registry]);

  const onToggleConfigure = () => {
    const next = !showConfigure;
    setShowConfigure(next);
    if (next && selected && !perms) loadPerms(selected.id);
  };

  const onTogglePermission = async (tab: TabDef, nextEnabled: boolean) => {
    if (!selected || !perms) return;
    setSavingPermKey(tab.key);
    setPermSaveError(null);
    const current = perms.permissions[tab.key];
    const payloadValue = tab.mode
      ? { enabled: nextEnabled, mode: isTabAccess(current) ? current.mode : tab.mode.options[0] }
      : nextEnabled;
    try {
      await updateEmployeePermissions(selected.id, { [tab.key]: payloadValue });
      await loadPerms(selected.id);
    } catch (err: any) {
      setPermSaveError(getErrorMessage(err, `Could not update ${tab.label}.`));
    } finally {
      setSavingPermKey(null);
    }
  };

  const onSetPermissionMode = async (tab: TabDef, mode: string) => {
    if (!selected) return;
    setSavingPermKey(tab.key);
    setPermSaveError(null);
    try {
      await updateEmployeePermissions(selected.id, { [tab.key]: { enabled: true, mode } });
      await loadPerms(selected.id);
    } catch (err: any) {
      setPermSaveError(getErrorMessage(err, `Could not update ${tab.label}'s mode.`));
    } finally {
      setSavingPermKey(null);
    }
  };

  const onSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const input: Parameters<typeof updateEmployee>[1] = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        designation: designation.trim() || undefined,
      };
      if (email.trim()) input.email = email.trim();
      if (personalEmail.trim()) input.personalEmail = personalEmail.trim();
      if (isOwner && role) input.role = role;
      if (isOwner) {
        input.isActive = isActive;
        if (branch) input.branch = branch;
        if (deviceUserId.trim()) input.deviceUserId = deviceUserId.trim();
      }
      if (canEditSalaryFields) {
        if (salary.trim()) input.monthlySalary = Number(salary);
        if (joiningDate.trim()) input.joiningDate = joiningDate.trim();
      }
      await updateEmployee(selected.id, input);
      setNotice('Saved successfully!');
      await load();
      await onSelect(selected.id);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not update this employee.'));
    } finally {
      setIsSaving(false);
    }
  };

  const onResetPassword = () => {
    if (!selected) return;
    Alert.alert(
      'Reset password?',
      `This resets ${selected.name}'s password to a new temporary one and notifies them by WhatsApp/email.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            setIsResettingPassword(true);
            setError(null);
            setNotice(null);
            try {
              const result = await resetEmployeePassword(selected.id);
              setCreatedCredential({ username: selected.username, password: result.temporaryPassword });
              setNotice('Password reset. Temporary password shown below — also sent to the employee.');
            } catch (err: any) {
              setError(getErrorMessage(err, 'Could not reset the password.'));
            } finally {
              setIsResettingPassword(false);
            }
          },
        },
      ],
    );
  };

  const onDeactivate = () => {
    if (!selected) return;
    Alert.alert(
      'Deactivate this account?',
      `${selected.name} will no longer be able to sign in. This can be reversed by an Owner.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            setIsDeactivating(true);
            setError(null);
            setNotice(null);
            try {
              await deactivateEmployee(selected.id);
              setNotice('Employee deactivated.');
              await load();
              await onSelect(selected.id);
            } catch (err: any) {
              setError(getErrorMessage(err, 'Could not deactivate this employee.'));
            } finally {
              setIsDeactivating(false);
            }
          },
        },
      ],
    );
  };

  const onPermanentDelete = () => {
    if (!selected) return;
    Alert.alert(
      'Permanently delete this employee?',
      `This cannot be undone. ${selected.name}'s attendance, leave, and salary records are removed; shared records (customers, jobs, invoices) are reassigned to you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete permanently',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            setError(null);
            try {
              await permanentlyDeleteEmployee(selected.id);
              setSelected(null);
              await load();
            } catch (err: any) {
              setError(getErrorMessage(err, 'Could not permanently delete this employee.'));
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  const cardFlags = useMemo<CardFlags>(() => ({ isOwner, isStoreManager, hasEmployeesPerm }), [isOwner, isStoreManager, hasEmployeesPerm]);
  const cell = useMemo(() => ({ width: `${100 / (listWidth >= 900 ? 3 : listWidth >= 560 ? 2 : 1)}%` as `${number}%`, paddingHorizontal: listWidth >= 560 ? 8 : 0, marginBottom: Spacing.three }), [listWidth]);
  const openEdit = useCallback((e: EmployeeCardItem) => setEditEmp(e), []);
  const openRemark = useCallback((e: EmployeeCardItem) => setRemarkEmp(e), []);
  const openReset = useCallback((e: EmployeeCardItem) => setResetEmp(e), []);
  const openDeactivate = useCallback((e: EmployeeCardItem) => setDeactivateEmp(e), []);
  const openDelete = useCallback((e: EmployeeCardItem) => setDeleteEmp(e), []);
  const openDetails = useCallback((e: EmployeeCardItem) => setDetailEmp(e), []);
  const renderCard = useCallback(({ item }: { item: EmployeeCardItem }) => (
    <View style={cell}>
      <EmployeeCard emp={item} flags={cardFlags} onEdit={openEdit} onDetails={openDetails} onRemark={openRemark} onReset={openReset} onDeactivate={openDeactivate} onDelete={openDelete} />
    </View>
  ), [cell, cardFlags, openEdit, openDetails, openRemark, openReset, openDeactivate, openDelete]);

  if (!isAuthorized) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">
          Employees is only available to Owner, Store Manager, HR, and Tech Team accounts, or anyone granted the Employees tab.
        </ThemedText>
      </ThemedView>
    );
  }

  if (selected) {
    return (
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
        <Stack.Screen options={{ title: selected.name }} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}>
          <Pressable onPress={() => { setSelected(null); setCreatedCredential(null); }} style={styles.backButton} accessibilityLabel="Back to employees list">
            <ThemedText type="link">‹ Back to list</ThemedText>
          </Pressable>
          <GlassCard style={styles.card}>
            <ThemedText type="smallBold">Edit — {selected.name}</ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Full Name</ThemedText>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            {isOwner && selected.role !== 'OWNER' && (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Role</ThemedText>
                <View style={styles.chipRow}>
                  {EDIT_ROLE_OPTIONS.map((r) => (
                    <Pressable
                      key={r.value}
                      onPress={() => setRole(r.value)}
                      style={[styles.chip, { backgroundColor: role === r.value ? theme.primary : theme.backgroundElement }]}>
                      <ThemedText type="small" style={role === r.value ? styles.chipLabelActive : undefined}>{r.label}</ThemedText>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.configureHeader}>
                  <View>
                    <ThemedText type="small">Account Active</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Inactive employees cannot log in</ThemedText>
                  </View>
                  <Switch value={isActive} onValueChange={setIsActive} />
                </View>
              </>
            )}

            <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Username (login handle)</ThemedText>
            <ThemedText type="small">@{selected.username}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Login handle — set at creation, change via a separate admin flow</ThemedText>

            {isOwner && (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Branch</ThemedText>
                <View style={styles.chipRow}>
                  {BRANCH_OPTIONS.map((b) => (
                    <Pressable key={b.value} onPress={() => setBranch(b.value)} style={[styles.chip, { backgroundColor: branch === b.value ? theme.primary : theme.backgroundElement }]}>
                      <ThemedText type="small" style={branch === b.value ? styles.chipLabelActive : undefined}>{b.label}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Phone</ThemedText>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholderTextColor={theme.textSecondary}
              keyboardType="phone-pad"
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <ThemedText type="small" themeColor="textSecondary">10-digit number without +91 — used for the call button in Team Chat</ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Personal Email</ThemedText>
            <TextInput
              value={personalEmail}
              onChangeText={setPersonalEmail}
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            {canEditSalaryFields && (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Monthly Salary (₹)</ThemedText>
                <TextInput
                  value={salary}
                  onChangeText={setSalary}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="decimal-pad"
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                />

                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Joining Date</ThemedText>
                <TextInput
                  value={joiningDate}
                  onChangeText={setJoiningDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                />
              </>
            )}

            {isOwner && (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Device User ID</ThemedText>
                <TextInput
                  value={deviceUserId}
                  onChangeText={setDeviceUserId}
                  placeholder="e.g. 9876543210"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                />
              </>
            )}

            <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Designation</ThemedText>
            <TextInput
              value={designation}
              onChangeText={setDesignation}
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Work Email</ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. name@company.com"
              placeholderTextColor={theme.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />

            {error && <ThemedText style={styles.error}>{error}</ThemedText>}
            {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}
            <Pressable onPress={onSave} disabled={isSaving} style={styles.button}>
              {isSaving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Save Changes</ThemedText>}
            </Pressable>
          </GlassCard>

          {createdCredential && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Temporary password</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {createdCredential.username} · {createdCredential.password}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Share this with the employee — it expires in 72 hours.</ThemedText>
            </ThemedView>
          )}

          {canManagePermissions && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.configureHeader}>
                <ThemedText type="smallBold">Standing tasks</ThemedText>
                <Pressable onPress={() => (showNewStanding ? resetStandingForm() : setShowNewStanding(true))} accessibilityLabel="Add standing task">
                  <ThemedText type="link">{showNewStanding ? 'Cancel' : '+ Add'}</ThemedText>
                </Pressable>
              </View>
              {showNewStanding && (
                <View style={styles.section}>
                  <TextInput
                    value={standingTitle}
                    onChangeText={setStandingTitle}
                    placeholder="Title"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                  />
                  <TextInput
                    value={standingDescription}
                    onChangeText={setStandingDescription}
                    placeholder="Description (optional)"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                  />
                  <View style={styles.chipRow}>
                    {(['DAILY', 'TWICE_DAILY', 'WEEKLY'] as RecurrenceType[]).map((r) => (
                      <Pressable
                        key={r}
                        onPress={() => setStandingRecurrence(r)}
                        style={[styles.chip, { backgroundColor: standingRecurrence === r ? theme.primary : theme.background }]}>
                        <ThemedText type="small" style={standingRecurrence === r ? styles.chipLabelActive : undefined}>
                          {r === 'TWICE_DAILY' ? 'Twice daily' : r === 'DAILY' ? 'Daily' : 'Weekly'}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={() => setStandingApplyToRole((v) => !v)} style={styles.configureHeader}>
                    <ThemedText type="small">Apply to all {selected.role} employees</ThemedText>
                    <Switch value={standingApplyToRole} onValueChange={setStandingApplyToRole} accessibilityLabel="Apply to all employees with this role" />
                  </Pressable>
                  {standingTasksError && <ThemedText style={styles.error}>{standingTasksError}</ThemedText>}
                  <Pressable onPress={onCreateStandingTask} disabled={isSavingStanding} style={styles.button}>
                    {isSavingStanding ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Save standing task</ThemedText>}
                  </Pressable>
                </View>
              )}
              {!showNewStanding && standingTasksError && <ThemedText style={styles.error}>{standingTasksError}</ThemedText>}
              {!showNewStanding && standingTasks === null && !standingTasksError && <ActivityIndicator style={styles.spinner} />}
              {!showNewStanding && standingTasks && standingTasks.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">No standing tasks for {selected.name}.</ThemedText>
              )}
              {!showNewStanding && standingTasks && standingTasks.length > 0 && (
                <View style={styles.section}>
                  {standingTasks.map((t) => (
                    <View key={t.id} style={styles.permRow}>
                      <View style={styles.permRowHeader}>
                        <ThemedText style={styles.flex1} numberOfLines={1} ellipsizeMode="tail">{t.title}</ThemedText>
                        <Pressable onPress={() => onDeleteStandingTask(t)} disabled={deletingStandingId === t.id}>
                          {deletingStandingId === t.id ? <ActivityIndicator size="small" /> : <ThemedText style={styles.error}>Delete</ThemedText>}
                        </Pressable>
                      </View>
                      <ThemedText type="small" themeColor="textSecondary">
                        {t.recurrence === 'TWICE_DAILY' ? 'Twice daily' : t.recurrence === 'DAILY' ? 'Daily' : 'Weekly'}
                        {t.scope === 'ROLE' ? ` · Applies to all ${t.role}` : ''}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              )}
            </ThemedView>
          )}

          {canManagePermissions && (
            <ThemedView type="backgroundElement" style={styles.card}>
              <Pressable onPress={onToggleConfigure} style={styles.configureHeader} accessibilityLabel="Configure access permissions">
                <ThemedText type="smallBold">Configure access</ThemedText>
                <ThemedText type="link">{showConfigure ? 'Hide' : 'Show'}</ThemedText>
              </Pressable>
              {showConfigure && (
                <>
                  {registryError && (
                    <View style={styles.errorBlock}>
                      <ThemedText style={styles.error}>{registryError}</ThemedText>
                      <Pressable onPress={() => selected && loadPerms(selected.id)} style={styles.retryButton}>
                        <ThemedText style={styles.buttonLabel}>Retry</ThemedText>
                      </Pressable>
                    </View>
                  )}
                  {isLoadingPerms || !registry ? (
                    <ActivityIndicator style={styles.spinner} />
                  ) : permsError ? (
                    <View style={styles.errorBlock}>
                      <ThemedText style={styles.error}>{permsError}</ThemedText>
                      <Pressable onPress={() => selected && loadPerms(selected.id)} style={styles.retryButton}>
                        <ThemedText style={styles.buttonLabel}>Retry</ThemedText>
                      </Pressable>
                    </View>
                  ) : perms ? (
                    <>
                      {permSaveError && <ThemedText style={styles.error}>{permSaveError}</ThemedText>}
                      {perms.hasOverrides && (
                        <ThemedText type="small" themeColor="textSecondary">
                          This employee has custom overrides — tabs without an override use {perms.role}&apos;s role defaults.
                        </ThemedText>
                      )}
                      {Array.from(new Set(registry.map((t) => t.group))).map((group) => (
                        <View key={group} style={styles.section}>
                          <ThemedText type="small" themeColor="textSecondary" style={styles.groupTitle}>{GROUP_LABEL[group] ?? group}</ThemedText>
                          {registry
                            .filter((t) => t.group === group)
                            .map((tab, i, arr) => {
                              const value = perms.permissions[tab.key];
                              const enabled = isTabAccess(value) ? value.enabled : !!value;
                              const mode = isTabAccess(value) ? value.mode : undefined;
                              const isSaving = savingPermKey === tab.key;
                              return (
                                <View key={tab.key} style={[styles.permRow, i < arr.length - 1 && styles.permRowDivider]}>
                                  <View style={styles.permRowHeader}>
                                    <ThemedText style={styles.flex1} numberOfLines={1} ellipsizeMode="tail">{tab.label}</ThemedText>
                                    {isSaving ? (
                                      <ActivityIndicator size="small" />
                                    ) : (
                                      <Switch
                                        value={enabled}
                                        onValueChange={(v) => onTogglePermission(tab, v)}
                                        accessibilityLabel={`Toggle ${tab.label} access for ${selected.name}`}
                                      />
                                    )}
                                  </View>
                                  {tab.mode && enabled && (
                                    <View style={styles.chipRow}>
                                      {tab.mode.options.map((opt) => (
                                        <Pressable
                                          key={opt}
                                          onPress={() => onSetPermissionMode(tab, opt)}
                                          disabled={isSaving}
                                          style={[styles.chip, { backgroundColor: mode === opt ? theme.primary : theme.backgroundElement }]}>
                                          <ThemedText type="small" style={mode === opt ? styles.chipLabelActive : undefined}>
                                            {opt.replace(/_/g, ' ')}
                                          </ThemedText>
                                        </Pressable>
                                      ))}
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                        </View>
                      ))}
                    </>
                  ) : null}
                </>
              )}
            </ThemedView>
          )}

          <View style={styles.dangerZone}>
            <Pressable onPress={onResetPassword} disabled={isResettingPassword} style={[styles.button, styles.buttonSecondary]}>
              {isResettingPassword ? <ActivityIndicator /> : <ThemedText type="smallBold">Reset password</ThemedText>}
            </Pressable>
            {selected.isActive && (
              <Pressable onPress={onDeactivate} disabled={isDeactivating} style={[styles.button, styles.buttonWarn]}>
                {isDeactivating ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Deactivate</ThemedText>}
              </Pressable>
            )}
            {isOwner && (
              <Pressable onPress={onPermanentDelete} disabled={isDeleting} style={[styles.button, styles.buttonDanger]}>
                {isDeleting ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Delete permanently</ThemedText>}
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Team list (dashboard Team page) ──
  const columns = listWidth >= 900 ? 3 : listWidth >= 560 ? 2 : 1;
  const halfGap = columns > 1 ? 8 : 0;
  const pad = listWidth >= 560 ? Spacing.four : Spacing.three;
  const q = search.trim().toLowerCase();
  const filteredEmployees = q
    ? (employees ?? []).filter((emp) => (
        emp.name.toLowerCase().includes(q) ||
        emp.username.toLowerCase().includes(q) ||
        emp.role.toLowerCase().includes(q) ||
        (emp.designation ?? '').toLowerCase().includes(q)
      ))
    : (employees ?? []);

  const listHeader = (
    <View style={[styles.headerWrap, { paddingHorizontal: halfGap }]}>
      <View style={styles.headerRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.title}>Team</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            {q ? `${filteredEmployees.length} result${filteredEmployees.length !== 1 ? 's' : ''}` : `${(employees ?? []).filter((e) => e.isActive).length} active members`}
          </ThemedText>
        </View>
        <Button icon="add" onPress={() => setAddOpen(true)}>Add Employee</Button>
      </View>

      {error ? <ErrorBanner message={error} onRetry={onRefresh} /> : null}
      {notice ? <ThemedText style={styles.notice}>{notice}</ThemedText> : null}

      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, username, role or designation…"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search team"
          style={[styles.searchInput, { color: theme.text }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close" size={16} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {isLoadingDetail ? <ActivityIndicator /> : null}
    </View>
  );

  const emptyState = employees === null ? (
    <View style={[styles.skeletons, { paddingHorizontal: halfGap }]}>
      {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={170} style={styles.skeleton} />)}
    </View>
  ) : employees.length === 0 ? (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={48} color={theme.textMuted} style={{ opacity: 0.4 }} />
      <ThemedText themeColor="textMuted" style={styles.emptyText}>No employees yet</ThemedText>
    </View>
  ) : (
    <View style={styles.empty}>
      <Ionicons name="search" size={40} color={theme.textMuted} style={{ opacity: 0.4 }} />
      <ThemedText themeColor="textMuted" style={[styles.emptyText, styles.bold]}>No results for “{search}”</ThemedText>
      <Button size="sm" variant="ghost" onPress={() => setSearch('')}>Clear search</Button>
    </View>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setListWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Employees' }} />
      <FlatList
        style={{ backgroundColor: theme.background }}
        key={`team-${columns}`}
        numColumns={columns}
        data={employees === null ? [] : filteredEmployees}
        keyExtractor={(e) => e.id}
        renderItem={renderCard}
        refreshing={isRefreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        windowSize={7}
        contentContainerStyle={{ padding: pad - halfGap, paddingBottom: insets.bottom + Spacing.four }}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyState}
      />

      {addOpen ? <AddEmployeeSheet onClose={() => setAddOpen(false)} onCreated={load} /> : null}
      {editEmp ? <EditEmployeeSheet employee={editEmp} restricted={hasEmployeesPerm} onClose={() => setEditEmp(null)} onSaved={load} /> : null}
      {remarkEmp ? <AddRemarkSheet employee={remarkEmp} onClose={() => setRemarkEmp(null)} /> : null}
      {resetEmp ? <ResetPasswordSheet employee={resetEmp} onClose={() => setResetEmp(null)} /> : null}
      {deactivateEmp ? <DeactivateSheet employee={deactivateEmp} onClose={() => setDeactivateEmp(null)} onDone={load} /> : null}
      {detailEmp ? (
        <EmployeeDetailPanel
          employee={detailEmp}
          // Dashboard rule: the Owner, or a store manager looking at someone who is neither Owner nor store manager.
          canEdit={isOwner || (isStoreManager && detailEmp.role !== 'OWNER' && detailEmp.role !== 'STORE_MANAGER')}
          onClose={() => setDetailEmp(null)}
        />
      ) : null}
      {deleteEmp ? <DeleteSheet employee={deleteEmp} onClose={() => setDeleteEmp(null)} onDone={load} /> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Layout.cardGap, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  error: { color: '#B83030', marginTop: Spacing.one },
  notice: { color: '#167A48', marginTop: Spacing.one },
  spinner: { marginTop: Spacing.three },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: Spacing.three, padding: Spacing.three, minHeight: Layout.minTouchTarget, gap: Spacing.two },
  flex1: { flex: 1 },
  card: { gap: Spacing.one, marginBottom: Spacing.two },
  input: { height: 46, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15, marginTop: Spacing.two },
  button: { marginTop: Spacing.two, height: 48, borderRadius: Spacing.two, backgroundColor: '#7A1C2E', alignItems: 'center', justifyContent: 'center' },
  buttonSecondary: { backgroundColor: 'rgba(127,127,127,0.2)' },
  buttonWarn: { backgroundColor: '#A86018' },
  buttonDanger: { backgroundColor: '#B83030' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  backButton: { marginBottom: Spacing.one, minHeight: 44, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.two },
  chip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: Spacing.four },
  chipLabelActive: { color: '#ffffff', fontWeight: '600' },
  headerWrap: { gap: Spacing.three, marginBottom: Spacing.three },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20 },
  search: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: Radii.md },
  searchInput: { flex: 1, minHeight: 44, fontSize: 14, paddingVertical: 0 },
  skeletons: { gap: Spacing.three },
  skeleton: { borderRadius: Radii.lg },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.six },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  bold: { fontFamily: FontWeights.medium },
  dangerZone: { gap: Spacing.two, marginTop: Spacing.two },
  configureHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: Layout.minTouchTarget },
  errorBlock: { gap: Spacing.two, alignItems: 'flex-start' },
  retryButton: { height: 40, paddingHorizontal: Spacing.three, borderRadius: Spacing.two, backgroundColor: '#7A1C2E', alignItems: 'center', justifyContent: 'center' },
  section: { gap: Spacing.one, marginTop: Spacing.two },
  groupTitle: { marginBottom: Spacing.half },
  permRow: { paddingVertical: Spacing.two, gap: Spacing.one },
  permRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(127,127,127,0.2)' },
  permRowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  fieldLabel: { marginTop: Spacing.two },
});
