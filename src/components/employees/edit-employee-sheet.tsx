import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { BRANCH_OPTIONS, ftIdFor, normalizePhone, ROLE_OPTIONS } from '@/components/employees/employee-format';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage, saveEmployee } from '@/lib/api';
import type { EmployeeCardItem } from '@/types/api';

type Props = {
  employee: EmployeeCardItem;
  /** Permission-based callers (not a full manager) may only change name, phone and email. */
  restricted: boolean;
  onClose: () => void;
  onSaved: () => void;
};

// Dashboard EditEmployeeModal. Mount it only while open (state starts fresh).
export function EditEmployeeSheet({ employee, restricted, onClose, onSaved }: Props) {
  const theme = useTheme();
  const initialPersonalEmail = employee.personalEmail ?? '';
  const [form, setForm] = useState({
    name: employee.name ?? '',
    username: employee.username ?? '',
    phone: employee.phone ?? '',
    designation: employee.designation ?? '',
    role: employee.role ?? 'STAFF',
    isActive: employee.isActive ?? true,
    monthlySalary: employee.monthlySalary != null ? String(employee.monthlySalary) : '',
    joiningDate: employee.joiningDate ? employee.joiningDate.slice(0, 10) : '',
    deviceUserId: employee.deviceUserId ?? '',
    email: employee.email ?? '',
    branch: employee.branch ?? '',
    personalEmail: initialPersonalEmail,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const set = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));
  const suggestedFtId = ftIdFor(form.branch, form.deviceUserId);
  const enNoLooksLikePhone = /^\d{10}$/.test(form.deviceUserId.trim());
  const isOwnerRow = employee.role === 'OWNER';

  const onPhone = (value: string) => {
    const { value: normalized, error: pe } = normalizePhone(value);
    setPhoneError(pe ?? undefined);
    set({ phone: normalized });
  };

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (form.deviceUserId.trim() && !/^\d{1,6}$/.test(form.deviceUserId.trim())) {
      setError('Device User ID must be the biometric EnNo (numbers only, e.g. 79)');
      return;
    }
    if (form.phone.trim()) {
      const { error: pe } = normalizePhone(form.phone.trim());
      if (pe) { setPhoneError(pe); return; }
    }

    setLoading(true);
    setError('');
    try {
      // personalEmail goes in only when non-empty or actually changed, so a save
      // can't null a value the user never re-typed.
      const pEmailChanged = form.personalEmail !== initialPersonalEmail;
      const payload: Record<string, unknown> = restricted
        ? { name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null }
        : {
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            designation: form.designation.trim() || null,
            isActive: form.isActive,
            deviceUserId: form.deviceUserId.trim() || null,
            email: form.email.trim() || null,
            branch: form.branch || null,
            ...(form.personalEmail.trim() || pEmailChanged ? { personalEmail: form.personalEmail.trim() || null } : {}),
          };
      if (!restricted) {
        // Only the OWNER can change a role, and the Founder's own role is never sent.
        if (form.role !== 'OWNER') payload.role = form.role;
        if (form.monthlySalary) payload.monthlySalary = parseFloat(form.monthlySalary);
        if (form.joiningDate) payload.joiningDate = form.joiningDate;
        if (form.username.trim().toLowerCase() !== String(employee.username ?? '').toLowerCase()) {
          payload.username = form.username.trim().toLowerCase();
        }
      }

      await saveEmployee(employee.id, payload);
      setSuccess(true);
      closeTimer.current = setTimeout(() => { onSaved(); onClose(); }, 800);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update employee'));
    } finally {
      setLoading(false);
    }
  };

  const phoneHint = restricted ? '10-digit number without +91' : '10-digit number without +91 — used for the call button in Team Chat';

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={loading}
      title={`Edit — ${employee.name}`}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={loading}>Cancel</Button>
          <Button style={styles.flex1} loading={loading} onPress={submit}>{success ? '✓ Saved' : 'Save Changes'}</Button>
        </>
      }>
      <Input label="Full Name" value={form.name} onChangeText={(v) => set({ name: v })} />

      {restricted ? (
        <>
          <Input label="Phone" value={form.phone} onChangeText={onPhone} keyboardType="phone-pad" placeholder="9876543210" error={phoneError} hint={phoneHint} />
          <Input label="Work Email" value={form.email} onChangeText={(v) => set({ email: v })} keyboardType="email-address" autoCapitalize="none" placeholder="e.g. name@company.com" />
        </>
      ) : null}

      {!restricted && !isOwnerRow ? (
        <>
          <Select label="Role" options={ROLE_OPTIONS} value={form.role} onChange={(v) => set({ role: v })} />
          <View style={[styles.toggleRow, { backgroundColor: theme.surface }]}>
            <View style={styles.flex1}>
              <ThemedText style={styles.toggleTitle}>Account Active</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.small}>Inactive employees cannot log in</ThemedText>
            </View>
            <Switch value={form.isActive} onValueChange={(v) => set({ isActive: v })} trackColor={{ true: theme.success }} accessibilityLabel="Account active" />
          </View>
        </>
      ) : null}

      {!restricted ? (
        <>
          <View>
            <ThemedText themeColor="textSecondary" style={styles.label}>Username (login handle)</ThemedText>
            <View style={[styles.readonly, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText style={styles.readonlyText}>@{employee.username}</ThemedText>
            </View>
            <ThemedText themeColor="textMuted" style={styles.hint}>Login handle — set at creation, change via a separate admin flow</ThemedText>
          </View>

          <Select label="Branch" options={BRANCH_OPTIONS} value={form.branch} onChange={(v) => set({ branch: v })} placeholder="— Select Branch —" />
          <Input label="Phone" value={form.phone} onChangeText={onPhone} keyboardType="phone-pad" placeholder="9876543210" error={phoneError} hint={phoneHint} />

          <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <ThemedText themeColor="textMuted" style={styles.boxTitle}>PERSONAL CONTACT (FOR PASSWORD RESET)</ThemedText>
            <Input label="Personal Email" value={form.personalEmail} onChangeText={(v) => set({ personalEmail: v })} keyboardType="email-address" autoCapitalize="none" placeholder="personal@gmail.com" />
          </View>

          <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <ThemedText themeColor="textMuted" style={styles.boxTitle}>PAYROLL &amp; DEVICE</ThemedText>
            <Input label="Monthly Salary (₹)" value={form.monthlySalary} onChangeText={(v) => set({ monthlySalary: v })} keyboardType="decimal-pad" placeholder="e.g. 25000" />
            <DateField label="Joining Date" value={form.joiningDate} onChange={(v) => set({ joiningDate: v })} />
            <Input
              label="Device User ID"
              value={form.deviceUserId}
              onChangeText={(v) => set({ deviceUserId: v })}
              placeholder="e.g. 52"
              error={enNoLooksLikePhone ? 'This looks like a phone number. Use the EnNo from the biometric device, or punches won’t link.' : undefined}
              hint="EnNo from Salary Box device (the number shown next to the employee name)"
            />
            {!isOwnerRow ? (
              <View style={styles.ftBlock}>
                <Input
                  label="FT ID (login username) — Owner only"
                  value={form.username}
                  onChangeText={(v) => set({ username: v.toLowerCase() })}
                  autoCapitalize="none"
                  autoCorrect={false}
                  hint="Changing this changes the employee's login. Tell them the new FT ID."
                />
                {suggestedFtId && suggestedFtId !== form.username.trim().toLowerCase() ? (
                  <Button size="sm" variant="outline" onPress={() => set({ username: suggestedFtId })}>{`Use ${suggestedFtId.toUpperCase()}`}</Button>
                ) : null}
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      {error ? <ThemedText themeColor="danger" style={styles.small}>{error}</ThemedText> : null}
      {success ? <ThemedText themeColor="success" style={styles.small}>Saved successfully!</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  small: { fontSize: 12, lineHeight: 18 },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium, marginBottom: 4 },
  hint: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  readonly: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderRadius: Radii.sm, opacity: 0.7 },
  readonlyText: { fontSize: 14, fontFamily: FontWeights.bold },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radii.md },
  toggleTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  box: { borderWidth: 1, borderRadius: Radii.md, padding: 16, gap: 12 },
  boxTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  ftBlock: { gap: 8 },
});
