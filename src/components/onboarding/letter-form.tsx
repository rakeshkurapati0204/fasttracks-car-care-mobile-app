import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fmtDateTime } from '@/components/applications/application-format';
import { Sheet } from '@/components/customers/sheet';
import { DateField } from '@/components/call-tracker/date-field';
import { LETTER_TYPE_LABELS } from '@/components/onboarding/onboarding-format';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input, Select } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { emailLetter, fetchPreJoiningTermsLite, generateLetter, getErrorMessage } from '@/lib/api';
import type { HRLetter, HRLetterType, PreJoiningTermsLite } from '@/types/api';

// Employees and pre-hire candidates share one picker; only the fields the
// forms prefill from are carried (dashboard PickableEmployee).
export type PickableEmployee = {
  id: string;
  name: string;
  employeeId?: string | null;
  role?: string;
  designation?: string | null;
  joiningDate?: string | null;
  department?: string | null;
  address?: string | null;
  phone?: string | null;
  personalPhone?: string | null;
  emergencyContactPhone?: string | null;
};

type FieldKind = 'text' | 'date' | 'number' | 'multiline';
type Field = { key: string; label: string; required?: boolean; kind?: FieldKind; placeholder?: string };

// Same fields, labels, required marks and order as each dashboard form.
const EMERGENCY_PLACEHOLDER = 'e.g. Jane Doe - 9876543210';
const FIELDS: Record<HRLetterType, Field[]> = {
  LETTER_OF_INTENT: [
    { key: 'candidateName', label: 'Candidate Name', required: true },
    { key: 'role', label: 'Role', required: true },
    { key: 'department', label: 'Department' },
    { key: 'proposedJoiningDate', label: 'Proposed Joining Date', kind: 'date' },
    { key: 'proposedLocation', label: 'Proposed Location' },
    { key: 'validTill', label: 'Letter Valid Till', kind: 'date' },
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'letterDate', label: 'Letter Date', kind: 'date' },
  ],
  LETTER_OF_ONBOARDING: [
    { key: 'employeeName', label: 'Employee Name', required: true },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'reportingTo', label: 'Reporting Manager' },
    { key: 'workLocation', label: 'Work Location' },
    { key: 'dateOfJoining', label: 'Date of Joining', kind: 'date' },
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'emergencyContactNumber', label: 'Emergency Contact Number', placeholder: EMERGENCY_PLACEHOLDER },
    { key: 'letterDate', label: 'Letter Date', kind: 'date' },
  ],
  OFFER: [
    { key: 'candidateName', label: 'Candidate Name', required: true },
    { key: 'jobTitle', label: 'Job Title', required: true },
    { key: 'candidateAddress', label: 'Candidate Address' },
    { key: 'department', label: 'Department' },
    { key: 'reportingTo', label: 'Reporting To' },
    { key: 'employmentType', label: 'Employment Type' },
    { key: 'dateOfJoining', label: 'Date of Joining', kind: 'date' },
    { key: 'placeOfPosting', label: 'Place of Posting' },
    { key: 'probationPeriod', label: 'Probation Period' },
    { key: 'offerValidTill', label: 'Offer Valid Till', kind: 'date' },
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'emergencyContactNumber', label: 'Emergency Contact Number', placeholder: EMERGENCY_PLACEHOLDER },
    { key: 'letterDate', label: 'Letter Date', kind: 'date' },
  ],
  EXPERIENCE: [
    { key: 'employeeName', label: 'Employee Name', required: true },
    { key: 'designationAtExit', label: 'Designation at Exit', required: true },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'department', label: 'Department' },
    { key: 'dateOfJoining', label: 'Date of Joining', kind: 'date' },
    { key: 'lastWorkingDay', label: 'Last Working Day', required: true, kind: 'date' },
    { key: 'totalExperience', label: 'Total Experience', placeholder: 'e.g. 2 years 8 months' },
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'emergencyContactNumber', label: 'Emergency Contact Number', placeholder: EMERGENCY_PLACEHOLDER },
    { key: 'letterDate', label: 'Letter Date', kind: 'date' },
    { key: 'keyResponsibilities', label: 'Key Responsibilities', kind: 'multiline', placeholder: 'Renders as a bulleted list — one responsibility per line, e.g.\nMaintaining financial records\nPreparing monthly reports' },
    { key: 'conductPerformance', label: 'Conduct & Performance', kind: 'multiline' },
  ],
  RELIEVING: [
    { key: 'employeeName', label: 'Employee Name', required: true },
    { key: 'designation', label: 'Designation', required: true },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'department', label: 'Department' },
    { key: 'dateOfJoining', label: 'Date of Joining', kind: 'date' },
    { key: 'resignationSubmissionDate', label: 'Resignation Submission Date', kind: 'date' },
    { key: 'lastWorkingDay', label: 'Last Working Day', required: true, kind: 'date' },
    { key: 'contactNumber', label: 'Contact Number' },
    { key: 'emergencyContactNumber', label: 'Emergency Contact Number', placeholder: EMERGENCY_PLACEHOLDER },
    { key: 'letterDate', label: 'Letter Date', kind: 'date' },
    { key: 'employeeAddress', label: 'Employee Address', kind: 'multiline' },
  ],
};

// Offer Letter's compensation block (shown under its own heading).
const COMPENSATION: Field[] = [
  { key: 'grossSalary', label: 'Gross Salary (Per Month)', kind: 'number' },
  { key: 'annualCTC', label: 'Annual CTC', kind: 'number' },
  { key: 'otherAllowances', label: 'Other Allowances', kind: 'number' },
];

const TYPE_OPTIONS = [
  { value: 'LETTER_OF_INTENT', label: 'Letter of Intent' },
  { value: 'OFFER', label: 'Offer Letter' },
  { value: 'LETTER_OF_ONBOARDING', label: 'Letter of Onboarding' },
  { value: 'EXPERIENCE', label: 'Experience Letter' },
  { value: 'RELIEVING', label: 'Relieving / Leaving Letter' },
];

const REQUIRED_MESSAGE: Record<HRLetterType, string> = {
  OFFER: 'Candidate name and job title are required.',
  EXPERIENCE: 'Employee name, designation and last working day are required.',
  RELIEVING: 'Employee name, designation and last working day are required.',
  LETTER_OF_INTENT: 'Candidate name and role are required.',
  LETTER_OF_ONBOARDING: 'Employee name is required.',
};

type Values = Record<string, string>;
const ALL_TYPES = Object.keys(FIELDS) as HRLetterType[];

const todayStr = () => new Date().toISOString().slice(0, 10);
const dateInputStr = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

// A blank form for one type, seeded from the picked person.
function emptyValues(type: HRLetterType, e?: PickableEmployee): Values {
  const v: Values = {};
  for (const f of [...FIELDS[type], ...(type === 'OFFER' ? COMPENSATION : [])]) v[f.key] = '';
  v.letterDate = todayStr();
  if (type === 'OFFER') { v.employmentType = 'Full-time'; v.probationPeriod = '3 months'; }
  if (type === 'EXPERIENCE' || type === 'RELIEVING') v.lastWorkingDay = todayStr();
  return fillBlanks(type, v, e, null, null);
}

// Non-destructive prefill: only fills a field that is still blank (or still its
// untouched default), so switching person or type never clobbers typed text.
// OFFER only quotes an APPROVED terms row; Letter of Intent may quote a DRAFT one.
function fillBlanks(type: HRLetterType, f: Values, e: PickableEmployee | undefined, approved: PreJoiningTermsLite | null, terms: PreJoiningTermsLite | null): Values {
  const out = { ...f };
  const put = (k: string, val: string) => { if (k in out && !out[k]) out[k] = val; };
  const contact = e?.phone || e?.personalPhone || '';
  const emergency = e?.emergencyContactPhone || '';
  const name = e?.name || '';
  const joined = dateInputStr(e?.joiningDate);

  if (type === 'OFFER') {
    const empType = approved?.employmentType
      ? approved.employmentType.replace('_', '-').toLowerCase().replace(/(^|-)\w/g, (c) => c.toUpperCase())
      : '';
    const probation = approved?.probationMonths != null ? `${approved.probationMonths} month${approved.probationMonths === 1 ? '' : 's'}` : '';
    put('candidateName', name);
    put('candidateAddress', e?.address || '');
    put('jobTitle', e?.designation || '');
    put('department', e?.department || '');
    put('dateOfJoining', joined || dateInputStr(approved?.dateOfJoining));
    put('placeOfPosting', approved?.jobLocation || '');
    if (out.employmentType === 'Full-time' && empType) out.employmentType = empType;
    if (out.probationPeriod === '3 months' && probation) out.probationPeriod = probation;
    put('grossSalary', approved?.monthlySalary != null ? String(approved.monthlySalary) : '');
    put('annualCTC', approved?.monthlySalary != null ? String(Math.round(approved.monthlySalary * 12)) : '');
    put('contactNumber', contact);
    put('emergencyContactNumber', emergency);
  } else if (type === 'EXPERIENCE') {
    put('employeeName', name); put('employeeId', e?.employeeId || ''); put('designationAtExit', e?.designation || '');
    put('department', e?.department || ''); put('dateOfJoining', joined); put('contactNumber', contact); put('emergencyContactNumber', emergency);
  } else if (type === 'RELIEVING') {
    put('employeeName', name); put('employeeId', e?.employeeId || ''); put('employeeAddress', e?.address || ''); put('designation', e?.designation || '');
    put('department', e?.department || ''); put('dateOfJoining', joined); put('contactNumber', contact); put('emergencyContactNumber', emergency);
  } else if (type === 'LETTER_OF_INTENT') {
    put('candidateName', name); put('role', e?.designation || ''); put('department', e?.department || '');
    put('proposedJoiningDate', joined || dateInputStr(terms?.dateOfJoining)); put('proposedLocation', terms?.jobLocation || ''); put('contactNumber', contact);
  } else {
    put('employeeName', name); put('employeeId', e?.employeeId || ''); put('designation', e?.designation || ''); put('department', e?.department || '');
    put('dateOfJoining', joined); put('contactNumber', contact); put('emergencyContactNumber', emergency);
  }
  return out;
}

const numOrUndef = (v: string) => (v.trim() === '' ? undefined : Number(v));
const strOrUndef = (v: string) => (v.trim() === '' ? undefined : v);

// ── Copy-to-clipboard button ─────────────────────────────────────────────────
export function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={copied ? 'checkmark' : 'copy-outline'}
      onPress={async () => {
        await Clipboard.setStringAsync(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}>
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

// ── "Share ▾": email to the person on file, or the device share sheet ───────
export function LetterShareMenu({ letterId, onDeviceShare }: { letterId: string; onDeviceShare: () => void }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const email = async () => {
    setOpen(false);
    setSending(true);
    setResult(null);
    try {
      const sentTo = await emailLetter(letterId);
      setResult({ ok: true, text: sentTo ? `Emailed to ${sentTo}` : 'Emailed' });
    } catch (err: unknown) {
      setResult({ ok: false, text: getErrorMessage(err, 'Failed to email the letter.') });
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.shareWrap}>
      <Button size="sm" variant="secondary" loading={sending} onPress={() => setOpen(true)}>{sending ? 'Sending…' : 'Share ▾'}</Button>
      {result ? <ThemedText style={[styles.small, { color: result.ok ? theme.success : theme.danger }]} numberOfLines={2}>{result.text}</ThemedText> : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Share letter" footer={<Button style={styles.flex1} variant="secondary" onPress={() => setOpen(false)}>Cancel</Button>}>
        <Button variant="secondary" icon="mail-outline" onPress={email}>Email to candidate</Button>
        <Button variant="secondary" icon="share-outline" onPress={() => { setOpen(false); onDeviceShare(); }}>Share via device…</Button>
      </Sheet>
    </View>
  );
}

// ── Generation form (inline on the Letters tab) ──────────────────────────────
type Props = {
  employees: PickableEmployee[];
  userId: string;
  onUserIdChange: (id: string) => void;
  onGenerated: (letter: HRLetter) => void;
  onView: (letterId: string, type: HRLetterType) => void;
  onShare: (letterId: string, type: HRLetterType) => void;
};

export function LetterGenerateForm({ employees, userId, onUserIdChange, onGenerated, onView, onShare }: Props) {
  const theme = useTheme();
  const [type, setType] = useState<HRLetterType>('OFFER');
  const [forms, setForms] = useState<Record<HRLetterType, Values>>(() => {
    const o = {} as Record<HRLetterType, Values>;
    for (const t of ALL_TYPES) o[t] = emptyValues(t);
    return o;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [justGenerated, setJustGenerated] = useState<HRLetter | null>(null);
  const [width, setWidth] = useState(0);
  const [terms, setTerms] = useState<PreJoiningTermsLite | null>(null);

  const selected = employees.find((e) => e.id === userId);
  const approved = terms?.status === 'APPROVED' ? terms : null;

  // The just-generated banner belongs to one person + type.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on pick
    setJustGenerated(null);
  }, [userId, type]);

  // Pre-Joining Terms: fetched whatever their status; OFFER uses only APPROVED.
  useEffect(() => {
    let alive = true;
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear when nobody is picked
      setTerms(null);
      return;
    }
    fetchPreJoiningTermsLite(userId).then((t) => { if (alive) setTerms(t); }).catch(() => { if (alive) setTerms(null); });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- non-destructive prefill from the picked person / terms
    setForms((prev) => {
      const next = {} as Record<HRLetterType, Values>;
      for (const t of ALL_TYPES) next[t] = fillBlanks(t, prev[t], selected, approved, terms);
      return next;
    });
  }, [selected, approved, terms]);

  const values = forms[type];
  const setField = (key: string, v: string) => setForms((prev) => ({ ...prev, [type]: { ...prev[type], [key]: v } }));

  const employeeOptions = useMemo(
    () => employees.map((e) => ({ value: e.id, label: `${e.name} (${e.employeeId || e.role})` })),
    [employees],
  );

  const submit = async () => {
    if (!userId) { setError('Select an employee.'); return; }
    setError('');
    const required = FIELDS[type].filter((f) => f.required);
    if (required.some((f) => !values[f.key]?.trim())) { setError(REQUIRED_MESSAGE[type]); return; }
    const fields: Record<string, unknown> = {};
    for (const f of [...FIELDS[type], ...(type === 'OFFER' ? COMPENSATION : [])]) {
      const v = values[f.key] ?? '';
      if (f.required) fields[f.key] = f.kind === 'date' ? v : v.trim();
      else if (f.kind === 'number') fields[f.key] = numOrUndef(v);
      else if (f.key === 'letterDate') fields[f.key] = v || undefined;
      else fields[f.key] = strOrUndef(v);
    }
    setSaving(true);
    try {
      const letter = await generateLetter(userId, type, fields);
      onGenerated(letter);
      setJustGenerated(letter);
      // Blank forms again (re-seeded from the still-picked person) for the next letter.
      setForms(() => {
        const o = {} as Record<HRLetterType, Values>;
        for (const t of ALL_TYPES) o[t] = emptyValues(t, selected);
        return o;
      });
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to generate letter.'));
    } finally {
      setSaving(false);
    }
  };

  const cols = width >= 560 ? 2 : 1;
  const renderGrid = (list: Field[], gridCols: number) => {
    const rows: Field[][] = [];
    let row: Field[] = [];
    for (const f of list) {
      if (f.kind === 'multiline') { if (row.length) { rows.push(row); row = []; } rows.push([f]); continue; }
      row.push(f);
      if (row.length === gridCols) { rows.push(row); row = []; }
    }
    if (row.length) rows.push(row);
    return rows.map((r, i) => (
      <View key={i} style={styles.fieldRow}>
        {r.map((f) => (
          <View key={f.key} style={styles.flex1}>
            {f.kind === 'date' ? (
              <DateField label={f.required ? `${f.label} *` : f.label} value={values[f.key] ?? ''} onChange={(v) => setField(f.key, v)} />
            ) : (
              <Input
                label={f.label}
                required={f.required}
                value={values[f.key] ?? ''}
                onChangeText={(v) => setField(f.key, v)}
                placeholder={f.placeholder}
                keyboardType={f.kind === 'number' ? 'numeric' : 'default'}
                multiline={f.kind === 'multiline'}
                numberOfLines={f.kind === 'multiline' ? 3 : 1}
              />
            )}
          </View>
        ))}
        {r.length < gridCols && r[0].kind !== 'multiline' ? <View style={styles.flex1} /> : null}
      </View>
    ));
  };

  const invite = justGenerated?.letterInvite;
  const inviteType = justGenerated && (justGenerated.type === 'OFFER' || justGenerated.type === 'LETTER_OF_INTENT');

  return (
    <Card padding="md">
      <View style={styles.stack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {error ? <ErrorBanner message={error} /> : null}

        <View style={styles.fieldRow}>
          <View style={styles.flex1}><Select label="Employee" required placeholder="Select employee…" options={employeeOptions} value={userId} onChange={onUserIdChange} /></View>
          {cols === 2 ? <View style={styles.flex1}><Select label="Letter Type" required options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v as HRLetterType)} /></View> : null}
        </View>
        {cols === 1 ? <Select label="Letter Type" required options={TYPE_OPTIONS} value={type} onChange={(v) => setType(v as HRLetterType)} /> : null}

        {renderGrid(FIELDS[type], cols)}

        {type === 'OFFER' ? (
          <View style={styles.stack}>
            <ThemedText themeColor="textMuted" style={styles.sectionTitle}>COMPENSATION (MONTHLY)</ThemedText>
            {renderGrid(COMPENSATION, width >= 560 ? 3 : 1)}
          </View>
        ) : null}

        <View style={styles.end}>
          <Button size="sm" loading={saving} onPress={submit}>{saving ? 'Generating…' : 'Generate'}</Button>
        </View>

        {justGenerated ? (
          <View style={[styles.generated, { borderColor: theme.success, backgroundColor: withAlpha(theme.success, 0.08) }]}>
            <ThemedText style={styles.name}>{`✓ ${LETTER_TYPE_LABELS[justGenerated.type]} generated.`}</ThemedText>
            <View style={styles.actions}>
              <Button size="sm" variant="secondary" onPress={() => onView(justGenerated.id, justGenerated.type)}>View PDF</Button>
              <LetterShareMenu letterId={justGenerated.id} onDeviceShare={() => onShare(justGenerated.id, justGenerated.type)} />
            </View>
            {inviteType ? (
              invite?.emailSent ? (
                <ThemedText style={[styles.small, { color: theme.success }]}>✓ A link to view and download it was emailed to the candidate.</ThemedText>
              ) : invite ? (
                <View style={styles.stack}>
                  <ThemedText style={[styles.small, { color: theme.warning }]}>
                    Share Link Manually — the email with the candidate&apos;s view link couldn&apos;t be sent. Copy it and send it to them yourself (shown only once):
                  </ThemedText>
                  <ThemedText selectable style={[styles.code, { backgroundColor: theme.surface, borderColor: theme.border }]}>{invite.inviteLink}</ThemedText>
                  <View style={styles.actions}><CopyTextButton text={invite.inviteLink} /></View>
                  <ThemedText themeColor="textMuted" style={styles.small}>{`Expires ${fmtDateTime(invite.expiresAt)}.`}</ThemedText>
                </View>
              ) : (
                <ThemedText themeColor="textMuted" style={styles.small}>No personal email on file, so no view link was emailed — use Share to send the PDF.</ThemedText>
              )
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  flex1: { flex: 1, minWidth: 0 },
  fieldRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  end: { alignItems: 'flex-end' },
  small: { fontSize: 12, lineHeight: 18 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  actions: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' },
  shareWrap: { alignItems: 'flex-end', gap: 4 },
  generated: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 8 },
  code: { fontSize: 12, lineHeight: 18, padding: 8, borderWidth: 1, borderRadius: Radii.sm },
});
