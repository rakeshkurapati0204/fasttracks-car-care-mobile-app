import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { BRANCH_OPTIONS, normalizePhone, ROLE_OPTIONS } from '@/components/employees/employee-format';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createEmployee, getErrorMessage } from '@/lib/api';

type Props = { onClose: () => void; onCreated: () => void };

const EMPTY = {
  name: '', username: '', phone: '', designation: '', role: 'STAFF', branch: '', personalEmail: '',
  monthlySalary: '', joiningDate: '', deviceUserId: '',
};

// Dashboard AddEmployeeModal. Mount it only while open (state starts fresh).
export function AddEmployeeSheet({ onClose, onCreated }: Props) {
  const theme = useTheme();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const set = (patch: Partial<typeof EMPTY>) => setForm((p) => ({ ...p, ...patch }));

  // Phone no longer fills Device User ID: the biometric matches on its EnNo,
  // never on a phone number.
  const onPhone = (value: string) => {
    const { value: normalized, error } = normalizePhone(value);
    setPhoneError(error ?? undefined);
    set({ phone: normalized });
  };

  const ftPrefix = (branch: string) => (branch === 'Jubilee Hills' ? 'FTJH' : branch === 'Minister Road' ? 'FTMR' : 'FT');

  // EnNo -> FT ID (username): FTJH052 / FTMR052 / FT052
  const onEnNo = (val: string) => {
    const num = parseInt(val.trim(), 10);
    setForm((p) => ({
      ...p,
      deviceUserId: val,
      username: !isNaN(num) && val.trim() ? (ftPrefix(p.branch) + String(num).padStart(3, '0')).toLowerCase() : p.username,
    }));
  };

  const onBranch = (branch: string) => {
    setForm((p) => {
      const num = parseInt(p.deviceUserId.trim(), 10);
      return {
        ...p,
        branch,
        username: !isNaN(num) && p.deviceUserId.trim() ? (ftPrefix(branch) + String(num).padStart(3, '0')).toLowerCase() : p.username,
      };
    });
  };

  const enNoLooksLikePhone = /^\d{10}$/.test(form.deviceUserId.trim());

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.username.trim()) errs.username = 'Username is required';
    else if (!/^[a-z0-9_]{3,20}$/.test(form.username)) errs.username = 'Lowercase letters, numbers, underscore (3–20 chars)';
    if (form.deviceUserId.trim() && !/^\d{1,6}$/.test(form.deviceUserId.trim())) errs.deviceUserId = 'Device User ID must be the biometric EnNo (numbers only, e.g. 79)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    if (form.phone) {
      const { error } = normalizePhone(form.phone);
      if (error) { setPhoneError(error); return; }
    }
    setLoading(true);
    try {
      const res = await createEmployee({
        name: form.name,
        username: form.username,
        phone: form.phone || undefined,
        designation: form.designation || undefined,
        role: form.role,
        salaryType: 'MONTHLY',
        monthlySalary: form.monthlySalary ? parseFloat(form.monthlySalary) : undefined,
        joiningDate: form.joiningDate || undefined,
        deviceUserId: form.deviceUserId || undefined,
        branch: form.branch || undefined,
        personalEmail: form.personalEmail.trim() || undefined,
      });
      setNewPassword(res.temporaryPassword);
    } catch (err: unknown) {
      setErrors({ submit: getErrorMessage(err, 'Failed to create employee') });
    } finally {
      setLoading(false);
    }
  };

  if (newPassword) {
    return (
      <Sheet
        visible
        onClose={() => { onCreated(); onClose(); }}
        title="Employee Created"
        footer={<Button fullWidth onPress={() => { onCreated(); onClose(); }}>Done</Button>}>
        <View style={[styles.success, { backgroundColor: 'rgba(54,200,126,0.1)', borderColor: 'rgba(54,200,126,0.3)' }]}>
          <ThemedText style={[styles.successTitle, { color: theme.success }]}>Account created!</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.small}>Temporary password (save this now):</ThemedText>
          <ThemedText style={styles.password} selectable>{newPassword}</ThemedText>
        </View>
        <ThemedText themeColor="textMuted" style={styles.small}>Share this password with the employee. They should change it on first login.</ThemedText>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={loading}
      title="Add Employee"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={loading}>Cancel</Button>
          <Button style={styles.flex1} loading={loading} onPress={submit}>Create</Button>
        </>
      }>
      <Input label="Full Name" value={form.name} onChangeText={(v) => set({ name: v })} error={errors.name} />
      <Input label="Username" value={form.username} onChangeText={(v) => set({ username: v.toLowerCase() })} error={errors.username} autoCapitalize="none" autoCorrect={false} />
      <Input label="Designation (optional)" value={form.designation} onChangeText={(v) => set({ designation: v })} />
      <Input
        label="Phone (optional)"
        value={form.phone}
        onChangeText={onPhone}
        keyboardType="phone-pad"
        placeholder="9876543210"
        error={phoneError}
        hint="10-digit number without +91"
      />
      <Select label="Branch" options={BRANCH_OPTIONS} value={form.branch} onChange={onBranch} placeholder="— Select Branch —" />

      <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <ThemedText themeColor="textMuted" style={styles.boxTitle}>PERSONAL CONTACT (FOR PASSWORD RESET)</ThemedText>
        <Input label="Personal Email" value={form.personalEmail} onChangeText={(v) => set({ personalEmail: v })} keyboardType="email-address" autoCapitalize="none" placeholder="personal@gmail.com" />
      </View>

      <Select label="Role" options={ROLE_OPTIONS} value={form.role} onChange={(v) => set({ role: v })} />

      <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <ThemedText themeColor="textMuted" style={styles.boxTitle}>PAYROLL &amp; DEVICE (OPTIONAL)</ThemedText>
        <Input label="Monthly Salary (₹)" value={form.monthlySalary} onChangeText={(v) => set({ monthlySalary: v })} keyboardType="decimal-pad" placeholder="e.g. 25000" />
        <DateField label="Joining Date" value={form.joiningDate} onChange={(v) => set({ joiningDate: v })} />
        <Input
          label="Device User ID"
          value={form.deviceUserId}
          onChangeText={onEnNo}
          placeholder="e.g. 52"
          error={errors.deviceUserId ?? (enNoLooksLikePhone ? 'This looks like a phone number. Use the EnNo from the biometric device, or punches won’t link.' : undefined)}
          hint="EnNo from Salary Box device (the number shown next to the employee name)"
        />
        {form.deviceUserId.trim() && form.username && !enNoLooksLikePhone ? (
          <ThemedText style={styles.ftId}>FT ID: {form.username.toUpperCase()}</ThemedText>
        ) : null}
      </View>

      {errors.submit ? <ThemedText themeColor="danger" style={styles.small}>{errors.submit}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  small: { fontSize: 12, lineHeight: 18 },
  box: { borderWidth: 1, borderRadius: Radii.md, padding: 16, gap: 12 },
  boxTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  ftId: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.medium },
  success: { padding: 16, borderWidth: 1, borderRadius: Radii.md, alignItems: 'center', gap: 4 },
  successTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  password: { fontSize: 18, lineHeight: 26, fontFamily: FontWeights.bold, letterSpacing: 0.5 },
});
