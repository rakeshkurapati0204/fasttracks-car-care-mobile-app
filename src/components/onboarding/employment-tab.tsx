import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fmtDate } from '@/components/applications/application-format';
import { DateField } from '@/components/call-tracker/date-field';
import { FormGrid, GroupTitle, PersonSelect, SuccessBanner, useCandidates } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchEmploymentDetails, getErrorMessage, updateEmploymentDetails } from '@/lib/api';
import type { EmploymentDetails, EmploymentStatus, EmploymentType, OnboardingEmployee } from '@/types/api';

const TYPE_OPTIONS: EmploymentType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];
const STATUS_OPTIONS: EmploymentStatus[] = ['PROBATION', 'CONFIRMED', 'NOTICE_PERIOD', 'EXITED'];
const DASH = { value: '', label: '—' };
const ymd = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

function fmtMonth(ym?: string) {
  if (!ym) return 'Present';
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

type Props = {
  employees: OnboardingEmployee[];
  userId: string;
  onUserIdChange: (id: string) => void;
  refreshKey: number;
};

// Dashboard EmploymentTab: pick a person, edit their employment snapshot and
// emergency contact; education / experience / passport are read-only (the
// candidate enters them on the onboarding portal).
export function EmploymentTab({ employees, userId, onUserIdChange, refreshKey }: Props) {
  const candidates = useCandidates(refreshKey);
  const [form, setForm] = useState<EmploymentDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setForm(null); return; }
    setLoading(true);
    setSaved(false);
    setError('');
    try {
      setForm(await fetchEmploymentDetails(userId));
    } catch {
      setError('Failed to load employment details.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on pick / pull-to-refresh
    load();
  }, [load, refreshKey]);

  const set = <K extends keyof EmploymentDetails>(key: K, value: EmploymentDetails[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const managerOptions = useMemo(
    () => [DASH, ...employees.filter((e) => e.id !== userId).map((e) => ({ value: e.id, label: `${e.name} (${e.designation || e.role})` }))],
    [employees, userId],
  );

  const submit = async () => {
    if (!userId || !form) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      setForm(await updateEmploymentDetails(userId, {
        designation: form.designation ?? null,
        department: form.department ?? null,
        branch: form.branch ?? null,
        joiningDate: form.joiningDate ? form.joiningDate.slice(0, 10) : null,
        employmentType: form.employmentType ?? null,
        employmentStatus: form.employmentStatus ?? null,
        probationEndDate: form.probationEndDate ? form.probationEndDate.slice(0, 10) : null,
        reportingManagerId: form.reportingManagerId ?? null,
        coreResponsibilities: form.coreResponsibilities ?? null,
        emergencyContactName: form.emergencyContactName ?? null,
        emergencyContactRelationship: form.emergencyContactRelationship ?? null,
        emergencyContactPhone: form.emergencyContactPhone ?? null,
      }));
      setSaved(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save employment details.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.stack}>
      <PersonSelect employees={employees} candidates={candidates} userId={userId} onChange={onUserIdChange} />

      {!userId ? null : loading || !form ? (
        error ? <ErrorBanner message={error} onRetry={load} /> : <Card padding="md"><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></Card>
      ) : (
        <Card padding="md">
          <View style={styles.stack}>
            {error ? <ErrorBanner message={error} /> : null}
            {saved ? <SuccessBanner message="Saved." /> : null}

            <FormGrid>
              <Input label="Designation" value={form.designation ?? ''} onChangeText={(v) => set('designation', v)} />
              <Input label="Department" value={form.department ?? ''} onChangeText={(v) => set('department', v)} />
              <Input label="Work Location / Branch" value={form.branch ?? ''} onChangeText={(v) => set('branch', v)} />
              <DateField label="Date of Joining" value={ymd(form.joiningDate)} onChange={(v) => set('joiningDate', v)} />
              <Select label="Employment Type" options={[DASH, ...TYPE_OPTIONS.map((t) => ({ value: t, label: t.replace('_', ' ') }))]} value={form.employmentType ?? ''} onChange={(v) => set('employmentType', (v || null) as EmploymentType | null)} />
              <Select label="Employment Status" options={[DASH, ...STATUS_OPTIONS.map((s) => ({ value: s, label: s.replace('_', ' ') }))]} value={form.employmentStatus ?? ''} onChange={(v) => set('employmentStatus', (v || null) as EmploymentStatus | null)} />
              <DateField label="Probation End Date" value={ymd(form.probationEndDate)} onChange={(v) => set('probationEndDate', v)} />
              <Select label="Reporting Manager" options={managerOptions} value={form.reportingManagerId ?? ''} onChange={(v) => set('reportingManagerId', v || null)} />
            </FormGrid>

            <Input
              label="Core Responsibilities"
              value={form.coreResponsibilities ?? ''}
              onChangeText={(v) => set('coreResponsibilities', v)}
              placeholder="Describe this employee's core role duties…"
              multiline
              numberOfLines={4}
            />

            <View style={styles.stack}>
              <GroupTitle>Emergency Contact</GroupTitle>
              <FormGrid cols={3}>
                <Input label="Name" value={form.emergencyContactName ?? ''} onChangeText={(v) => set('emergencyContactName', v)} />
                <Input label="Relationship" placeholder="e.g. Spouse, Parent" value={form.emergencyContactRelationship ?? ''} onChangeText={(v) => set('emergencyContactRelationship', v)} />
                <Input label="Phone" placeholder="10-digit mobile number" keyboardType="phone-pad" value={form.emergencyContactPhone ?? ''} onChangeText={(v) => set('emergencyContactPhone', v)} />
              </FormGrid>
            </View>

            <BackgroundSection user={form} />

            <Button loading={saving} onPress={submit}>{saving ? 'Saving…' : 'Save Employment Details'}</Button>
          </View>
        </Card>
      )}
    </View>
  );
}

// Read-only for HR: the candidate enters these on the onboarding portal.
function BackgroundSection({ user }: { user: EmploymentDetails }) {
  const theme = useTheme();
  const education = user.educationDetails ?? null;
  const experience = user.workExperience ?? null;
  const passportBits = [
    user.passportPlaceOfIssue && `issued at ${user.passportPlaceOfIssue}`,
    user.passportExpiryDate && `expires ${fmtDate(user.passportExpiryDate)}`,
  ].filter(Boolean);
  const box = [styles.box, { borderColor: theme.border }];
  return (
    <View style={styles.stack}>
      <ThemedText themeColor="textMuted" style={styles.groupTitle}>
        {'EDUCATION, EXPERIENCE & PASSPORT '}
        <ThemedText themeColor="textMuted" style={styles.groupNote}>(entered by the candidate)</ThemedText>
      </ThemedText>
      <FormGrid>
        <View style={box}>
          <ThemedText themeColor="textSecondary" style={styles.boxTitle}>Education</ThemedText>
          {!education || education.length === 0 ? <ThemedText themeColor="textMuted" style={styles.small}>Not provided.</ThemedText> : education.map((e, i) => (
            <View key={i}>
              <ThemedText style={styles.body}>{e.qualification} <ThemedText themeColor="textMuted" style={styles.body}>{`· ${e.yearOfPassing}`}</ThemedText></ThemedText>
              <ThemedText themeColor="textMuted" style={styles.small}>{`${e.institution}${e.score ? ` · ${e.score}` : ''}`}</ThemedText>
            </View>
          ))}
        </View>
        <View style={box}>
          <ThemedText themeColor="textSecondary" style={styles.boxTitle}>Previous Work Experience</ThemedText>
          {experience === null ? <ThemedText themeColor="textMuted" style={styles.small}>Not provided.</ThemedText>
            : experience.length === 0 ? <ThemedText themeColor="textMuted" style={styles.small}>No previous work experience (fresher).</ThemedText>
            : experience.map((e, i) => (
              <View key={i}>
                <ThemedText style={styles.body}>{`${e.designation} `}<ThemedText themeColor="textMuted" style={styles.body}>at</ThemedText>{` ${e.company}`}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.small}>{`${fmtMonth(e.fromDate)} – ${fmtMonth(e.toDate)}${e.reasonForLeaving ? ` · Left: ${e.reasonForLeaving}` : ''}`}</ThemedText>
              </View>
            ))}
        </View>
      </FormGrid>
      <ThemedText themeColor="textMuted" style={styles.small}>
        {`Passport: ${passportBits.length ? passportBits.join(', ') : 'not provided'} — the number, scan and any certificates are in the Documents tab.`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  groupTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  groupNote: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.regular },
  box: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 6 },
  boxTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
});
