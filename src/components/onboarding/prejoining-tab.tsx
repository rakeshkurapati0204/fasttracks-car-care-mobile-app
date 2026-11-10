import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fmtDateTime } from '@/components/applications/application-format';
import { DateField } from '@/components/call-tracker/date-field';
import { FormGrid, PersonSelect, SuccessBanner, TimeField, useCandidates } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { approvePreJoiningTerms, fetchPreJoiningTerms, getErrorMessage, savePreJoiningTerms } from '@/lib/api';
import type { EmploymentType, OnboardingEmployee, PreJoiningTerms } from '@/types/api';

const TYPE_OPTIONS: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];

// Working hours are picked as an In and Out time but stored as free text
// ("9:30 AM - 6:30 PM"), so the candidate page and older records keep working.
// workingHoursLegacy holds a saved value that can't be parsed back into two times.
type Form = {
  monthlySalary: string; salaryType: string; employmentType: EmploymentType | ''; jobLocation: string;
  dateOfJoining: string; probationMonths: string; workingIn: string; workingOut: string; workingHoursLegacy: string; roster: string;
};
const EMPTY: Form = {
  monthlySalary: '', salaryType: '', employmentType: '', jobLocation: '',
  dateOfJoining: '', probationMonths: '', workingIn: '', workingOut: '', workingHoursLegacy: '', roster: '',
};

// "9:30 AM", "9am", "9.30 pm", "18:30" → "HH:MM" (24h), or null.
function parseClockTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])?\.?\s*m?\.?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3]?.toLowerCase();
  if (min > 59) return null;
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    if (meridiem === 'p' && h !== 12) h += 12;
    if (meridiem === 'a' && h === 12) h = 0;
  } else if (h > 23 || !m[2]) {
    return null; // a bare "9" is too ambiguous to guess AM/PM
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
function parseWorkingHours(value: string): { in: string; out: string } | null {
  const parts = value.split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(Boolean);
  if (parts.length !== 2) return null;
  const [inT, outT] = parts.map(parseClockTime);
  return inT && outT ? { in: inT, out: outT } : null;
}
function formatClockTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
const ymd = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

type Props = {
  employees: OnboardingEmployee[];
  userId: string;
  onUserIdChange: (id: string) => void;
  /** Called after approval: the page jumps to Letters for the same person. */
  onApproved: (userId: string) => void;
  refreshKey: number;
};

// Dashboard PreJoiningTermsTab. HR drafts freely (every save resets to DRAFT);
// nothing reaches the candidate's invite page until the explicit Approve.
export function PreJoiningTab({ employees, userId, onUserIdChange, onApproved, refreshKey }: Props) {
  const candidates = useCandidates(refreshKey);
  const [terms, setTerms] = useState<PreJoiningTerms | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  // Approved terms show read-only behind one "Edit" action.
  const [editingApproved, setEditingApproved] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setTerms(null); setForm(EMPTY); return; }
    setLoading(true);
    setSaved(false);
    setError('');
    setEditingApproved(false);
    try {
      const data = await fetchPreJoiningTerms(userId);
      setTerms(data);
      const hours = data?.workingHours ? parseWorkingHours(data.workingHours) : null;
      setForm(data ? {
        monthlySalary: data.monthlySalary != null ? String(data.monthlySalary) : '',
        salaryType: data.salaryType || '',
        employmentType: data.employmentType || '',
        jobLocation: data.jobLocation || '',
        dateOfJoining: ymd(data.dateOfJoining),
        probationMonths: data.probationMonths != null ? String(data.probationMonths) : '',
        workingIn: hours?.in ?? '',
        workingOut: hours?.out ?? '',
        workingHoursLegacy: !hours && data.workingHours ? data.workingHours : '',
        roster: data.roster || '',
      } : EMPTY);
    } catch {
      setError('Failed to load Pre-Joining terms.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on pick / pull-to-refresh
    load();
  }, [load, refreshKey]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!userId) return;
    if (!!form.workingIn !== !!form.workingOut) { setError('Pick both an In time and an Out time (or leave both empty).'); return; }
    const workingHours = form.workingIn && form.workingOut
      ? `${formatClockTime(form.workingIn)} - ${formatClockTime(form.workingOut)}`
      : form.workingHoursLegacy.trim() || null;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      setTerms(await savePreJoiningTerms(userId, {
        monthlySalary: form.monthlySalary.trim() || null,
        salaryType: form.salaryType.trim() || null,
        employmentType: form.employmentType || null,
        jobLocation: form.jobLocation.trim() || null,
        dateOfJoining: form.dateOfJoining || null,
        probationMonths: form.probationMonths.trim() || null,
        workingHours,
        roster: form.roster.trim() || null,
      }));
      setSaved(true);
      setEditingApproved(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save Pre-Joining terms.'));
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!userId) return;
    setApproving(true);
    setError('');
    try {
      setTerms(await approvePreJoiningTerms(userId));
      onApproved(userId); // next step is Letters, for the same person
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to approve Pre-Joining terms.'));
    } finally {
      setApproving(false);
    }
  };

  const readOnly = terms?.status === 'APPROVED' && !editingApproved;

  return (
    <View style={styles.stack}>
      <PersonSelect employees={employees} candidates={candidates} userId={userId} onChange={onUserIdChange} />

      {!userId ? null : loading ? (
        <Card padding="md"><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></Card>
      ) : (
        <Card padding="md">
          <View style={styles.stack}>
            {error ? <ErrorBanner message={error} onRetry={error.startsWith('Failed to load') ? load : undefined} /> : null}
            {saved ? <SuccessBanner message="Saved as draft." /> : null}

            <View style={styles.statusRow}>
              <ThemedText themeColor="textMuted" style={styles.groupTitle}>STATUS</ThemedText>
              <Badge variant={terms?.status === 'APPROVED' ? 'success' : 'warning'} size="sm">{terms?.status || 'NOT DRAFTED'}</Badge>
            </View>
            {terms?.status === 'APPROVED' ? (
              <ThemedText themeColor="textMuted" style={styles.small}>
                {`Approved by ${terms.approvedBy?.name || '—'} on ${fmtDateTime(terms.approvedAt)}. The candidate can now see these terms on their onboarding-invite page.${
                  editingApproved
                    ? ' Saving your changes resets this to draft — approve again before the candidate sees them.'
                    : ' Use Edit to change them (they go back to draft until approved again).'}`}
              </ThemedText>
            ) : null}

            <View pointerEvents={readOnly ? 'none' : 'auto'} style={readOnly ? styles.readOnly : undefined}>
              <FormGrid>
                <Input label="Monthly Salary" required keyboardType="numeric" value={form.monthlySalary} onChangeText={(v) => set('monthlySalary', v)} />
                <Input label="Salary Type" placeholder="e.g. MONTHLY" value={form.salaryType} onChangeText={(v) => set('salaryType', v)} />
                <Select
                  label="Employment Type"
                  required
                  options={[{ value: '', label: '—' }, ...TYPE_OPTIONS.map((t) => ({ value: t, label: t.replace('_', ' ') }))]}
                  value={form.employmentType}
                  onChange={(v) => set('employmentType', v as EmploymentType | '')}
                />
                <Input label="Job Location" required value={form.jobLocation} onChangeText={(v) => set('jobLocation', v)} />
                <DateField label="Date of Joining *" value={form.dateOfJoining} onChange={(v) => set('dateOfJoining', v)} />
                <Input label="Probation Period (months)" keyboardType="numeric" value={form.probationMonths} onChangeText={(v) => set('probationMonths', v)} />
                <View style={styles.stack}>
                  <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>Working Time</ThemedText>
                  <View style={styles.timeRow}>
                    <View style={styles.flex1}><TimeField label="In time" value={form.workingIn} onChange={(v) => set('workingIn', v)} /></View>
                    <View style={styles.flex1}><TimeField label="Out time" value={form.workingOut} onChange={(v) => set('workingOut', v)} /></View>
                  </View>
                  {form.workingHoursLegacy && !form.workingIn && !form.workingOut ? (
                    <ThemedText themeColor="textMuted" style={styles.small}>{`Currently saved as “${form.workingHoursLegacy}” — kept as-is unless you pick an In and Out time.`}</ThemedText>
                  ) : null}
                </View>
                <Input label="Roster / Shift" placeholder="e.g. Rotational, 6 days/week" value={form.roster} onChangeText={(v) => set('roster', v)} />
              </FormGrid>
            </View>

            {/* Approved → one "Edit". Draft (or editing) → save, then approve. */}
            <View style={styles.actions}>
              {readOnly ? (
                <Button variant="secondary" onPress={() => { setSaved(false); setEditingApproved(true); }}>Edit</Button>
              ) : editingApproved ? (
                <>
                  <Button loading={saving} onPress={save}>{saving ? 'Saving…' : 'Save as Draft'}</Button>
                  <Button variant="secondary" disabled={saving} onPress={load}>Cancel</Button>
                </>
              ) : (
                <>
                  <Button loading={saving} onPress={save}>{saving ? 'Saving…' : 'Save Draft'}</Button>
                  <Button variant="secondary" loading={approving} disabled={!terms} onPress={approve}>{approving ? 'Approving…' : 'Approve Terms'}</Button>
                </>
              )}
            </View>
          </View>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  flex1: { flex: 1, minWidth: 0 },
  small: { fontSize: 12, lineHeight: 18 },
  groupTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium, marginBottom: -8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeRow: { flexDirection: 'row', gap: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  readOnly: { opacity: 0.7 },
});
