import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fmtDate } from '@/components/applications/application-format';
import { DateField } from '@/components/call-tracker/date-field';
import { FormGrid, PersonSelect } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addDisciplineRecord, fetchDisciplineRecords, getErrorMessage } from '@/lib/api';
import type { DisciplineRecord, DisciplineRecordType, OnboardingEmployee } from '@/types/api';

const TYPE_LABELS: Record<DisciplineRecordType, string> = {
  WARNING: 'Warning', POLICY_ACKNOWLEDGEMENT: 'Policy Acknowledgement', DISCIPLINARY_ACTION: 'Disciplinary Action', OTHER: 'Other',
};
const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as DisciplineRecordType[]).map((t) => ({ value: t, label: TYPE_LABELS[t] }));
const todayStr = () => new Date().toISOString().slice(0, 10);

type Props = {
  employees: OnboardingEmployee[];
  userId: string;
  onUserIdChange: (id: string) => void;
  refreshKey: number;
};

// Dashboard DisciplineTab: employees only (no candidates), an add form, then
// the person's records.
export function DisciplineTab({ employees, userId, onUserIdChange, refreshKey }: Props) {
  const theme = useTheme();
  const [records, setRecords] = useState<DisciplineRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<DisciplineRecordType>('WARNING');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!userId) { setRecords([]); return; }
    setLoading(true);
    setLoadError(null);
    try {
      setRecords(await fetchDisciplineRecords(userId));
    } catch (err: unknown) {
      setRecords([]);
      setLoadError(getErrorMessage(err, 'Could not load discipline records.'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on pick / pull-to-refresh
    load();
  }, [load, refreshKey]);

  const submit = async () => {
    if (!userId) { setError('Select an employee.'); return; }
    if (!description.trim()) { setError('Description is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await addDisciplineRecord(userId, { type, description: description.trim(), date });
      setDescription('');
      load();
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to add record.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.stack}>
      <PersonSelect employees={employees} userId={userId} onChange={onUserIdChange} />

      {!userId ? null : (
        <>
          <Card padding="md">
            <View style={styles.stack}>
              {error ? <ErrorBanner message={error} /> : null}
              <FormGrid>
                <Select label="Type" required options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v as DisciplineRecordType)} />
                <DateField label="Date *" value={date} onChange={setDate} />
              </FormGrid>
              <Input label="Description" required value={description} onChangeText={setDescription} multiline numberOfLines={3} />
              <Button loading={saving} onPress={submit}>{saving ? 'Adding…' : 'Add Record'}</Button>
            </View>
          </Card>

          {loadError ? <ErrorBanner message={loadError} onRetry={load} /> : null}
          {loading ? (
            <Card padding="md"><Skeleton height={16} width="40%" /><Skeleton height={16} /></Card>
          ) : records.length === 0 && !loadError ? (
            <Card padding="md"><ThemedText themeColor="textMuted" style={styles.body}>No discipline or policy records for this employee.</ThemedText></Card>
          ) : (
            <View style={styles.list}>
              {records.map((r) => (
                <View key={r.id} style={[styles.record, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                  <View style={styles.recordHead}>
                    <Badge variant={r.type === 'DISCIPLINARY_ACTION' ? 'danger' : r.type === 'WARNING' ? 'warning' : 'secondary'} size="sm">{TYPE_LABELS[r.type]}</Badge>
                    <ThemedText themeColor="textMuted" style={styles.small}>{`${fmtDate(r.date)} · issued by ${r.issuedBy.name}`}</ThemedText>
                  </View>
                  <ThemedText style={styles.body}>{r.description}</ThemedText>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  list: { gap: 8 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18, flexShrink: 1 },
  record: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 8 },
  recordHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
});
