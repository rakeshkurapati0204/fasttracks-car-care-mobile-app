import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import {
  ageFromDob, emptyPersonalInfo, fmtDateTime, saveErrorMessage, toTenDigitPhone, validatePersonalInfo,
  type PersonalInfoValue, type ShareLink,
} from '@/components/applications/application-format';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createApplication, inviteApplicant, updateApplication } from '@/lib/api';
import type { ApplicationFormInput, ApplicationRowData } from '@/types/api';

// ── ShareLinkModal ───────────────────────────────────────────────────────────
// Popup shown right after any invite action, with the link to copy: the only
// way the candidate gets it when the email failed.
export function ShareLinkSheet({ share, onClose }: { share: ShareLink; onClose: () => void }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(share.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={share.title}
      footer={
        <>
          <Button variant="secondary" icon={copied ? 'checkmark' : 'copy-outline'} onPress={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
          <Button style={styles.flex1} onPress={onClose}>Done</Button>
        </>
      }>
      <View style={share.warning ? [styles.warn, { backgroundColor: withAlpha(theme.danger, 0.1) }] : undefined}>
        <ThemedText style={[styles.small, { color: share.warning ? theme.danger : theme.textMuted }]}>{share.message}</ThemedText>
      </View>
      <View style={[styles.code, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText style={styles.codeText} selectable>{share.link}</ThemedText>
      </View>
      <ThemedText themeColor="textMuted" style={styles.small}>Expires {fmtDateTime(share.expiresAt)}.</ThemedText>
    </Sheet>
  );
}

// ── InviteCandidateModal ─────────────────────────────────────────────────────
// HR only needs a name + email; the candidate fills in everything else
// themselves via the link this creates (POST /applications/invite).
export function InviteCandidateSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (result: { application: ApplicationRowData; inviteLink: string; expiresAt: string; emailSent: boolean }) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Please enter a valid email address.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await inviteApplicant({ name: name.trim(), email: email.trim() });
      onCreated({ application: res.application as ApplicationRowData, inviteLink: res.inviteLink, expiresAt: res.expiresAt, emailSent: res.emailSent });
    } catch (err: unknown) {
      setError(saveErrorMessage(err, 'Failed to create invite'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="Invite Candidate to Apply"
      footer={
        <>
          <Button variant="secondary" onPress={onClose} disabled={saving}>Cancel</Button>
          <Button style={styles.flex1} loading={saving} onPress={submit}>{saving ? 'Sending…' : 'Send Invite'}</Button>
        </>
      }>
      <ErrorStrip message={error} />
      <ThemedText themeColor="textMuted" style={styles.small}>
        We&apos;ll email the candidate a link to fill in their own application — role, personal info, and résumé. (Aadhaar, PAN and bank details are collected later, in onboarding.)
      </ThemedText>
      <Input label="Name" required value={name} onChangeText={setName} />
      <Input label="Email" required value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
    </Sheet>
  );
}

// ── LinkExpiryModal ──────────────────────────────────────────────────────────
// Shown BEFORE a link is generated, so HR decides how long it stays usable.
// The backend accepts 1 hour to 30 days.
const EXPIRY_PRESETS = [
  { value: '24', label: '24 hours' },
  { value: '72', label: '3 days' },
  { value: '168', label: '7 days' },
  { value: 'custom', label: 'Custom…' },
];
const MAX_EXPIRY_HOURS = 24 * 30;

export function LinkExpirySheet({ title, description, confirmLabel, onConfirm, onClose }: {
  title: string; description: string; confirmLabel: string; onConfirm: (hours: number) => void; onClose: () => void;
}) {
  const theme = useTheme();
  const [choice, setChoice] = useState('72');
  const [customValue, setCustomValue] = useState('2');
  const [customUnit, setCustomUnit] = useState('days');
  const [openedAt] = useState(() => Date.now());

  const customHours = (Number(customValue) || 0) * (customUnit === 'days' ? 24 : 1);
  const hours = choice === 'custom' ? customHours : Number(choice);
  const valid = Number.isInteger(hours) && hours >= 1 && hours <= MAX_EXPIRY_HOURS;
  const expiresAt = valid ? new Date(openedAt + hours * 3600_000) : null;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>Cancel</Button>
          <Button style={styles.flex1} disabled={!valid} onPress={() => valid && onConfirm(hours)}>{confirmLabel}</Button>
        </>
      }>
      <ThemedText themeColor="textMuted" style={styles.small}>{description}</ThemedText>
      <Select label="Link expires after" required options={EXPIRY_PRESETS} value={choice} onChange={setChoice} />
      {choice === 'custom' ? (
        <View style={styles.pair}>
          <View style={styles.flex1}><Input value={customValue} onChangeText={setCustomValue} keyboardType="number-pad" accessibilityLabel="Custom expiry amount" /></View>
          <View style={styles.flex1}><Select options={[{ value: 'hours', label: 'hours' }, { value: 'days', label: 'days' }]} value={customUnit} onChange={setCustomUnit} /></View>
        </View>
      ) : null}
      <ThemedText style={[styles.small, { color: valid ? theme.textSecondary : theme.danger }]}>
        {valid ? `The link will stop working on ${fmtDateTime(expiresAt!.toISOString())}.` : 'Choose between 1 hour and 30 days.'}
      </ThemedText>
    </Sheet>
  );
}

// ── ApplicationFormModal ─────────────────────────────────────────────────────
// Two steps: (1) role / department, (2) personal info. Same fields for create
// and edit; edit just pre-fills and PATCHes.
type RoleProps = { roleApplied: string; department: string };

export function ApplicationFormSheet({ application, liveRoleNames, onClose, onSaved }: {
  application: ApplicationRowData | null; liveRoleNames: string[]; onClose: () => void; onSaved: (a: ApplicationRowData) => void;
}) {
  const theme = useTheme();
  const [step, setStep] = useState<1 | 2>(1);
  const [roleDept, setRoleDept] = useState<RoleProps>({ roleApplied: application?.roleApplied ?? '', department: application?.department ?? '' });
  const [personal, setPersonal] = useState<PersonalInfoValue>({
    ...emptyPersonalInfo,
    name: application?.name ?? '',
    dateOfBirth: application?.dateOfBirth ? String(application.dateOfBirth).slice(0, 10) : '',
    email: application?.email ?? '',
    phone: application?.phone ?? '',
    currentAddress: application?.currentAddress ?? '',
    permanentAddress: application?.permanentAddress ?? '',
    sameAsCurrent: !!application?.currentAddress && application.currentAddress === application.permanentAddress,
    fresher: !!application?.fresher,
    notes: application?.notes ?? '',
  });
  const [resume, setResume] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [roleFocused, setRoleFocused] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const typed = roleDept.roleApplied.trim();
  const hasLiveTemplate = !typed || liveRoleNames.some((r) => r.trim().toLowerCase() === typed.toLowerCase());
  const suggestions = typed ? liveRoleNames.filter((r) => r.toLowerCase().includes(typed.toLowerCase())).slice(0, 8) : [];
  const showSuggestions = roleFocused && suggestions.length > 0 && !suggestions.some((r) => r === roleDept.roleApplied);

  const setP = <K extends keyof PersonalInfoValue>(key: K, v: PersonalInfoValue[K]) => setPersonal((p) => ({ ...p, [key]: v }));

  const goNext = () => {
    if (!roleDept.roleApplied.trim()) { setError('Role applied for is required.'); return; }
    setError('');
    setStep(2);
  };

  const pickResume = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    setResume({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream' });
  };

  const submit = async () => {
    // Editing an existing application must not get stuck behind the stricter new-intake rule.
    const validationError = validatePersonalInfo(personal, { requireContact: !application });
    if (validationError) { setError(validationError); return; }
    if (!roleDept.roleApplied.trim()) { setError('Role applied for is required.'); return; }

    setSaving(true);
    setError('');
    try {
      const fields: ApplicationFormInput = {
        name: personal.name.trim(),
        email: personal.email.trim() || undefined,
        phone: personal.phone.trim() || undefined,
        roleApplied: roleDept.roleApplied.trim(),
        department: roleDept.department.trim() || undefined,
        notes: personal.notes.trim() || undefined,
        dateOfBirth: personal.dateOfBirth.trim() || undefined,
        currentAddress: personal.currentAddress.trim() || undefined,
        permanentAddress: personal.permanentAddress.trim() || undefined,
        fresher: personal.fresher,
      };
      const saved = application ? await updateApplication(application.id, fields) : await createApplication(fields, resume);
      onSaved(saved);
    } catch (err: unknown) {
      setError(saveErrorMessage(err, application ? 'Failed to update application' : 'Failed to create application'));
    } finally {
      setSaving(false);
    }
  };

  const age = ageFromDob(personal.dateOfBirth);

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`${application ? 'Edit Application' : 'New Application'} — Step ${step} of 2`}
      footer={
        step === 1 ? (
          <>
            <Button variant="secondary" onPress={onClose}>Cancel</Button>
            <Button style={styles.flex1} onPress={goNext}>Next</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={() => setStep(1)} disabled={saving}>Back</Button>
            <Button variant="secondary" onPress={onClose} disabled={saving}>Cancel</Button>
            <Button style={styles.flex1} loading={saving} onPress={submit}>{saving ? 'Saving…' : application ? 'Save Changes' : 'Create Application'}</Button>
          </>
        )
      }>
      <ErrorStrip message={error} />

      {step === 1 ? (
        <>
          <ThemedText themeColor="textMuted" style={styles.stepTitle}>STEP 1 · DEPARTMENT &amp; ROLE</ThemedText>
          <View>
            <Input
              label="Role Applied For"
              required
              value={roleDept.roleApplied}
              onChangeText={(v) => setRoleDept((p) => ({ ...p, roleApplied: v }))}
              onFocus={() => setRoleFocused(true)}
              onBlur={() => setTimeout(() => setRoleFocused(false), 150)}
              autoCorrect={false}
            />
            {showSuggestions ? (
              <View style={[styles.suggestions, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {suggestions.map((r) => (
                  <Pressable key={r} onPress={() => { setRoleDept((p) => ({ ...p, roleApplied: r })); setRoleFocused(false); }} style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.6 }]}>
                    <ThemedText style={styles.small}>{r}</ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {typed && !hasLiveTemplate ? (
              <ThemedText style={[styles.small, styles.templateWarn, { color: theme.warning }]}>No competency template for this role yet. The AI interview can&apos;t run until one is created.</ThemedText>
            ) : null}
          </View>
          <Input label="Department" value={roleDept.department} onChangeText={(v) => setRoleDept((p) => ({ ...p, department: v }))} />
        </>
      ) : (
        <>
          <ThemedText themeColor="textMuted" style={styles.stepTitle}>STEP 2 · PERSONAL INFORMATION</ThemedText>
          <Input label="Name" required value={personal.name} onChangeText={(v) => setP('name', v)} />
          <View>
            <DateField label="Date of Birth" value={personal.dateOfBirth} onChange={(v) => setP('dateOfBirth', v)} />
            {age !== null ? <ThemedText themeColor="textMuted" style={[styles.small, styles.ageLine]}>Age: {age} years</ThemedText> : null}
          </View>
          <Input label="Email" required={!application} value={personal.email} onChangeText={(v) => setP('email', v)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Input label="Phone" required={!application} value={personal.phone} onChangeText={(v) => setP('phone', toTenDigitPhone(v))} keyboardType="phone-pad" placeholder="10-digit mobile number" />
          <Input
            label="Current Address"
            value={personal.currentAddress}
            onChangeText={(v) => setPersonal((p) => ({ ...p, currentAddress: v, permanentAddress: p.sameAsCurrent ? v : p.permanentAddress }))}
            multiline
            numberOfLines={2}
          />
          <ToggleRow label="Same as Current Address" value={personal.sameAsCurrent} onChange={(checked) => setPersonal((p) => ({ ...p, sameAsCurrent: checked, permanentAddress: checked ? p.currentAddress : p.permanentAddress }))} />
          <View style={personal.sameAsCurrent ? styles.disabled : undefined} pointerEvents={personal.sameAsCurrent ? 'none' : 'auto'}>
            <Input label="Permanent Address" value={personal.permanentAddress} onChangeText={(v) => setP('permanentAddress', v)} multiline numberOfLines={2} />
          </View>
          <ToggleRow label="Fresher (no prior work experience)" value={personal.fresher} onChange={(v) => setP('fresher', v)} />
          <Input label="Notes" value={personal.notes} onChangeText={(v) => setP('notes', v)} multiline numberOfLines={3} />
          {!application ? (
            <View style={styles.resume}>
              <ThemedText themeColor="textSecondary" style={styles.resumeLabel}>Résumé (optional)</ThemedText>
              <View style={styles.pair}>
                <Button size="sm" variant="secondary" icon="document-attach-outline" onPress={pickResume}>{resume ? 'Change file' : 'Choose file'}</Button>
                {resume ? <ThemedText style={[styles.small, styles.flex1]} numberOfLines={1}>{resume.name}</ThemedText> : null}
              </View>
            </View>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={styles.toggleRow}>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.primary }} />
      <ThemedText themeColor="textSecondary" style={[styles.body, styles.flex1]}>{label}</ThemedText>
    </Pressable>
  );
}

function ErrorStrip({ message }: { message: string }) {
  const theme = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.warn, { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
      <ThemedText style={[styles.body, { color: theme.danger }]}>{message}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  small: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 20 },
  warn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  code: { padding: 8, borderWidth: 1, borderRadius: Radii.sm },
  codeText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.regular },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.8 },
  suggestions: { marginTop: 4, borderWidth: 1, borderRadius: Radii.sm, overflow: 'hidden' },
  suggestion: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  templateWarn: { marginTop: 4 },
  ageLine: { marginTop: 4 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  disabled: { opacity: 0.5 },
  resume: { gap: 6 },
  resumeLabel: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium },
});
