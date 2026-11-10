import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { REMARK_CATEGORIES } from '@/components/employees/employee-format';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createStaffRemark, deactivateEmployeeWithDetails, getErrorMessage, permanentlyDeleteEmployee, resetEmployeePassword } from '@/lib/api';
import type { EmployeeCardItem, RemarkCategory, RemarkRating, RemarkVisibility } from '@/types/api';

type Person = Pick<EmployeeCardItem, 'id' | 'name'>;

// Dashboard "Reset Password" confirm, then the "Password Reset" result.
export function ResetPasswordSheet({ employee, onClose }: { employee: Person; onClose: () => void }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState<string | null>(null);

  const confirm = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await resetEmployeePassword(employee.id);
      setPassword(res.temporaryPassword ?? '');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not reset the password.'));
    } finally {
      setLoading(false);
    }
  };

  if (password !== null) {
    return (
      <Sheet visible onClose={onClose} title="Password Reset" footer={<Button fullWidth onPress={onClose}>Done</Button>}>
        <View style={[styles.success, { backgroundColor: 'rgba(54,200,126,0.1)', borderColor: 'rgba(54,200,126,0.3)' }]}>
          <ThemedText style={[styles.successTitle, { color: theme.success }]}>✓ Password Reset</ThemedText>
          <ThemedText themeColor="textSecondary" style={[styles.small, styles.center]}>
            <ThemedText style={[styles.small, styles.bold]}>{employee.name}</ThemedText>&apos;s password has been reset to <ThemedText style={[styles.small, styles.mono]} selectable>{password}</ThemedText>
          </ThemedText>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={loading}
      title="Reset Password"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={loading}>Cancel</Button>
          <Button style={styles.flex1} loading={loading} onPress={confirm}>Reset Password</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        Reset <ThemedText style={[styles.body, styles.bold]}>{employee.name}</ThemedText>&apos;s password to default?
      </ThemedText>
      <View style={[styles.indigoBox, { backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.2)' }]}>
        <ThemedText style={[styles.body, styles.center, { color: '#6366f1', opacity: 0.7 }]}>A new temporary password will be generated.</ThemedText>
      </View>
      <ThemedText themeColor="textMuted" style={styles.small}>They will be notified via WhatsApp/email if contact info is on file.</ThemedText>
      {error ? <ThemedText themeColor="danger" style={styles.small}>{error}</ThemedText> : null}
    </Sheet>
  );
}

// Dashboard "Deactivate Employee": confirm text plus the optional departure
// date and reason (captured now, never editable later).
export function DeactivateSheet({ employee, onClose, onDone }: { employee: Person; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await deactivateEmployeeWithDetails(employee.id, { departureDate: date || undefined, departureReason: reason.trim() || undefined });
      onDone();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to deactivate employee. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={loading}
      title="Deactivate Employee"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" style={styles.flex1} loading={loading} onPress={submit}>Deactivate</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        Are you sure you want to deactivate <ThemedText style={[styles.body, styles.bold]}>{employee.name}</ThemedText>? They will lose access to the system.
      </ThemedText>
      <DateField label="Departure date (optional)" value={date} onChange={setDate} />
      <Input label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. Resigned, End of contract, Performance…" />
      <ThemedText themeColor="textMuted" style={styles.small}>Captured now for retention reporting — this can&apos;t be added or edited later.</ThemedText>
      {error ? <ThemedText style={[styles.small, styles.bold, { color: '#dc2626' }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

// Dashboard "Permanently Delete Employee".
export function DeleteSheet({ employee, onClose, onDone }: { employee: Person; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await permanentlyDeleteEmployee(employee.id);
      onDone();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to delete employee. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={loading}
      title="Permanently Delete Employee"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={loading}>Cancel</Button>
          <Button variant="danger" style={styles.flex1} loading={loading} onPress={submit}>Yes, Delete Permanently</Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        Are you sure you want to permanently delete <ThemedText style={[styles.body, styles.bold]}>{employee.name}</ThemedText>? This cannot be undone.
      </ThemedText>
      <View style={[styles.dangerBox, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
        <ThemedText style={[styles.small, { color: '#dc2626' }]}>
          All attendance records, leave history, timesheets, and payroll data for this employee will be permanently removed. Jobs and conversations will be reassigned to you.
        </ThemedText>
      </View>
      {error ? <ThemedText style={[styles.small, styles.bold, { color: '#dc2626' }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

// Dashboard AddRemarkModal (create only): rating, category, visibility, note.
export function AddRemarkSheet({ employee, onClose }: { employee: Person; onClose: () => void }) {
  const theme = useTheme();
  const [rating, setRating] = useState<RemarkRating>('POSITIVE');
  const [category, setCategory] = useState<RemarkCategory>('ATTENDANCE');
  const [visibility, setVisibility] = useState<RemarkVisibility>('VISIBLE_TO_EMPLOYEE');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!note.trim()) { setError('Write a note.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await createStaffRemark({ employeeId: employee.id, rating, category, visibility, note: note.trim() });
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not save the remark.'));
    } finally {
      setSubmitting(false);
    }
  };

  const toggle = (label: string, active: boolean, onPress: () => void, tone?: 'good' | 'bad') => {
    const good = '#15803d';
    const bad = '#b91c1c';
    const activeStyle = tone
      ? { backgroundColor: tone === 'good' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', borderColor: tone === 'good' ? good : bad }
      : { backgroundColor: theme.primary, borderColor: theme.primary };
    return (
      <Pressable
        key={label}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [styles.toggle, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, active && activeStyle, pressed && { opacity: 0.7 }]}>
        <ThemedText style={[styles.toggleText, { color: active ? (tone ? (tone === 'good' ? good : bad) : '#fff') : theme.textMuted }]}>{label}</ThemedText>
      </Pressable>
    );
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={submitting}
      title="Add remark"
      subtitle={employee.name}
      footer={
        <>
          <Button variant="secondary" style={styles.flex1} onPress={onClose} disabled={submitting}>Cancel</Button>
          <Button style={styles.flex1} loading={submitting} onPress={submit}>Save remark</Button>
        </>
      }>
      <View style={styles.block}>
        <ThemedText themeColor="textMuted" style={styles.label}>Rating</ThemedText>
        <View style={styles.pair}>
          {toggle('Positive', rating === 'POSITIVE', () => setRating('POSITIVE'), 'good')}
          {toggle('Negative', rating === 'NEGATIVE', () => setRating('NEGATIVE'), 'bad')}
        </View>
      </View>

      <Select label="Category" options={REMARK_CATEGORIES} value={category} onChange={(v) => setCategory(v as RemarkCategory)} />

      <View style={styles.block}>
        <ThemedText themeColor="textMuted" style={styles.label}>Visibility</ThemedText>
        <View style={styles.pair}>
          {toggle('Private (only you)', visibility === 'PRIVATE', () => setVisibility('PRIVATE'))}
          {toggle('Visible to employee', visibility === 'VISIBLE_TO_EMPLOYEE', () => setVisibility('VISIBLE_TO_EMPLOYEE'))}
        </View>
        {visibility === 'VISIBLE_TO_EMPLOYEE' ? <ThemedText themeColor="textMuted" style={styles.small}>{employee.name} will be notified.</ThemedText> : null}
      </View>

      <View style={styles.block}>
        <ThemedText themeColor="textMuted" style={styles.label}>Note</ThemedText>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          placeholder="What happened?"
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
        />
      </View>

      {error ? <ThemedText style={[styles.small, { color: '#b91c1c' }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 21 },
  small: { fontSize: 12, lineHeight: 18 },
  bold: { fontFamily: FontWeights.semiBold },
  mono: { fontFamily: FontWeights.bold },
  center: { textAlign: 'center' },
  success: { padding: 16, borderWidth: 1, borderRadius: Radii.md, alignItems: 'center', gap: 8 },
  successTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  indigoBox: { padding: 12, borderWidth: 1, borderRadius: Radii.md },
  dangerBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  block: { gap: 6 },
  label: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  pair: { flexDirection: 'row', gap: 8 },
  toggle: { flex: 1, minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm, borderWidth: 1 },
  toggleText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, textAlign: 'center' },
  input: { minHeight: 96, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
});
