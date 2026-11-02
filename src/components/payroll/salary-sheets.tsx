import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { Fonts, FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchSalaryHistory, getErrorMessage, setEmployeeSalary, updateEmployee } from '@/lib/api';
import type { PayrollResult, SalaryHistoryEntry } from '@/types/api';

import { formatINR } from './helpers';

function ErrorBox({ message }: { message: string }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View style={styles.errorBox}>
      <ThemedText style={[styles.body, { color: theme.danger }]}>{message}</ThemedText>
    </View>
  );
}

// ─── Initial salary for an employee with none configured ───────────────────
// Only OWNER / STORE_MANAGER / CASHIER (the backend's SALARY_ADMIN_ROLES) can
// save this; the caller only offers the button to them.
export function SetSalarySheet({ employee, onClose, onSaved }: { employee: PayrollResult; onClose: () => void; onSaved: () => void }) {
  const [salary, setSalary] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [salaryType, setSalaryType] = useState('MONTHLY');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!salary || !joiningDate) { setError('Salary and joining date are required.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateEmployee(employee.userId!, { monthlySalary: parseFloat(salary), joiningDate, salaryType });
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save salary.'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Set Salary — ${employee.userName}`}
      footer={
        <>
          <Button variant="outline" size="sm" onPress={onClose} style={styles.flex1}>Cancel</Button>
          <Button size="sm" onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Save Salary'}</Button>
        </>
      }>
      <ErrorBox message={error} />
      <Input label="Monthly Salary (₹)" required value={salary} onChangeText={setSalary} placeholder="e.g. 18000" keyboardType="decimal-pad" />
      <DateField label="Joining Date *" value={joiningDate} onChange={setJoiningDate} />
      <Select
        label="Salary Type"
        value={salaryType}
        onChange={setSalaryType}
        options={[
          { value: 'MONTHLY', label: 'Monthly' },
          { value: 'FIXED', label: 'Fixed (no attendance deduction)' },
        ]}
      />
    </Sheet>
  );
}

// ─── Edit salary for an already-configured employee ────────────────────────
// Uses the staff-config salary endpoint, which also writes the salary history
// ("effective 1st of next month") shown under "Recent changes".
export function EditSalarySheet({ employee, onClose, onSaved }: { employee: PayrollResult; onClose: () => void; onSaved: () => void }) {
  const [salary, setSalary] = useState(String(employee.monthlySalary ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);

  useEffect(() => {
    fetchSalaryHistory(employee.userId!).then((h) => setHistory(h ?? [])).catch(() => {});
  }, [employee.userId]);

  const save = async () => {
    const parsed = parseFloat(salary);
    if (!salary || isNaN(parsed) || parsed < 0) { setError('Enter a valid salary amount.'); return; }
    setSaving(true);
    setError('');
    try {
      await setEmployeeSalary(employee.userId!, parsed);
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to update salary.'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Edit Salary — ${employee.userName}`}
      footer={
        <>
          <Button variant="outline" size="sm" onPress={onClose} style={styles.flex1}>Cancel</Button>
          <Button size="sm" onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }>
      <ErrorBox message={error} />
      <Input
        label="Monthly Salary (₹)"
        required
        value={salary}
        onChangeText={setSalary}
        keyboardType="decimal-pad"
        hint={`Current: ${formatINR(employee.monthlySalary ?? 0)}`}
      />
      {history.length > 0 ? (
        <View style={styles.history}>
          <ThemedText themeColor="textMuted" style={styles.historyTitle}>Recent changes</ThemedText>
          {history.slice(0, 5).map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <ThemedText themeColor="textSecondary" style={[styles.small, styles.flex1]}>
                {`${formatINR(h.oldSalary ?? 0)} → ${formatINR(h.newSalary)} by ${h.changedBy?.name ?? 'Unknown'}`}
              </ThemedText>
              <ThemedText themeColor="textMuted" style={[styles.small, styles.mono]}>
                {h.createdAt ? new Date(h.createdAt).toLocaleDateString('en-IN') : ''}
              </ThemedText>
            </View>
          ))}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16 },
  mono: { fontFamily: Fonts?.mono },
  errorBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(224,104,104,0.1)' },
  history: { gap: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(127,127,127,0.3)' },
  historyTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
});
