import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { fmtDateTime, saveErrorMessage } from '@/components/applications/application-format';
import { CollapseToggle } from '@/components/applications/scorecard-panel';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { cancelInterview, fetchInterviewDefaults, rescheduleInterview, resendInterviewScheduleInvite, scheduleInterview } from '@/lib/api';
import type { ApplicationRowData, InterviewLocationType, InterviewSchedule } from '@/types/api';

export type ScheduleResult = { candidateEmailed: boolean; interviewerEmailed: boolean; candidateHasEmail: boolean; interviewerHasEmail: boolean };

// "emailed" / "email failed" / "has no email on file".
const emailOutcome = (sent: boolean, hasEmail: boolean) => (sent ? 'emailed' : hasEmail ? 'email failed' : 'has no email on file');

const pad2 = (n: number) => String(n).padStart(2, '0');
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180];

function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad2(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr${h > 1 ? 's' : ''}`;
}

// Every 15 minutes, 7:00 AM to 9:45 PM, plus the schedule's own time when
// editing one that doesn't sit on a 15-minute boundary.
function timeSlots(extra?: string): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 21; h++) for (const m of [0, 15, 30, 45]) slots.push(`${pad2(h)}:${pad2(m)}`);
  if (extra && !slots.includes(extra)) slots.push(extra);
  return slots.sort();
}

const toLocalDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const toLocalTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// Prefers the saved locationType; falls back to a text-based guess for rows
// saved before that field existed.
function inferLocationKind(location: string | null | undefined, companyLocation: string | null, locationType?: string | null): InterviewLocationType {
  if (locationType === 'COMPANY' || locationType === 'ONLINE' || locationType === 'OTHER') return locationType;
  if (location && companyLocation && location === companyLocation) return 'COMPANY';
  if (location && /^https?:\/\//i.test(location)) return 'ONLINE';
  if (!location && companyLocation) return 'COMPANY';
  return 'OTHER';
}

function initialMeetingLink(existing: InterviewSchedule | null): string {
  if (!existing?.location) return '';
  if (existing.locationType) return existing.locationType === 'ONLINE' ? existing.location : '';
  return /^https?:\/\//i.test(existing.location) ? existing.location : '';
}

function initialAddress(existing: InterviewSchedule | null): string {
  if (!existing?.location) return '';
  if (existing.locationType) return existing.locationType === 'OTHER' ? existing.location : '';
  return /^https?:\/\//i.test(existing.location) ? '' : existing.location;
}

// COMPANY_INTERVIEW_LOCATION may be a Maps link already, or a plain address.
function mapUrl(location: string): string {
  return /^https?:\/\//i.test(location) ? location : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

// "Meeting Link" for an online interview, "Location" for an in-person one.
function interviewLocationLabel(schedule: { location?: string | null; locationType?: string | null }): string {
  if (schedule.locationType === 'ONLINE') return 'Meeting Link';
  if (schedule.locationType === 'COMPANY' || schedule.locationType === 'OTHER') return 'Location';
  return /^https?:\/\//i.test(schedule.location || '') ? 'Meeting Link' : 'Location';
}

// Plain-text interview details HR can paste into WhatsApp / SMS / email.
export function buildInterviewShareText(application: ApplicationRowData, schedule: InterviewSchedule): string {
  const start = new Date(schedule.scheduledStart);
  const end = new Date(schedule.scheduledEnd);
  const day = start.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const clock = (d: Date) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
  return [
    `Interview — ${application.name}${application.roleApplied ? ` for ${application.roleApplied}` : ''}`,
    `Date: ${day}`,
    `Time: ${clock(start)} – ${clock(end)} (IST)`,
    `Interviewer: ${schedule.interviewer.name}`,
    `${interviewLocationLabel(schedule)}: ${schedule.location || 'To be confirmed'}`,
    schedule.notes ? `Notes: ${schedule.notes}` : null,
    '— Fasttracks Car Care',
  ].filter(Boolean).join('\n');
}

type FormProps = {
  application: ApplicationRowData;
  employees: { id: string; name: string }[];
  existing: InterviewSchedule | null;
  onDone: (a: ApplicationRowData, result: ScheduleResult) => void;
  onCancel: () => void;
};

// Dashboard InterviewScheduleForm: date, start-time slot, duration, interviewer,
// location type with its address / link, notes. Mount only while open.
export function InterviewScheduleSheet({ application, employees, existing, onDone, onCancel }: FormProps) {
  const theme = useTheme();
  const existingDuration = existing ? Math.round((new Date(existing.scheduledEnd).getTime() - new Date(existing.scheduledStart).getTime()) / 60000) : 30;
  const [date, setDate] = useState(existing ? toLocalDate(existing.scheduledStart) : '');
  const [time, setTime] = useState(existing ? toLocalTime(existing.scheduledStart) : '');
  const [duration, setDuration] = useState(existingDuration);
  const [useCustomDuration, setUseCustomDuration] = useState(false);
  // Raw text of the custom-minutes box, validated on submit rather than clamped per keystroke.
  const [customDuration, setCustomDuration] = useState('');
  const [interviewerId, setInterviewerId] = useState(existing?.interviewerId ?? '');
  const [companyLocation, setCompanyLocation] = useState<string | null>(null);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [locationKind, setLocationKind] = useState<InterviewLocationType>(inferLocationKind(existing?.location, null, existing?.locationType));
  const [meetingLink, setMeetingLink] = useState(initialMeetingLink(existing));
  const [address, setAddress] = useState(initialAddress(existing));
  // The office address shown for "Company office": starts as this schedule's own
  // saved address, or the org default once that loads, and can be edited for this interview.
  const [companyLocationInput, setCompanyLocationInput] = useState(existing?.locationType === 'COMPANY' ? (existing.location ?? '') : '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchInterviewDefaults()
      .then((res) => {
        const loc = res?.companyLocation ?? null;
        setCompanyLocation(loc);
        setLocationKind(inferLocationKind(existing?.location, loc, existing?.locationType));
        setCompanyLocationInput((prev) => prev || loc || '');
        if (loc && existing?.location === loc && !existing?.locationType) setAddress('');
      })
      .catch(() => setCompanyLocation(null))
      .finally(() => setDefaultsLoaded(true));
  }, [existing?.location, existing?.locationType]);

  const durations = DURATION_OPTIONS.includes(duration) ? DURATION_OPTIONS : [...DURATION_OPTIONS, duration].sort((a, b) => a - b);
  const customMinutes = Number(customDuration);
  const customValid = /^\d+$/.test(customDuration) && customMinutes >= 5 && customMinutes <= 1440;
  const effectiveDuration = useCustomDuration ? (customValid ? customMinutes : null) : duration;
  const endLabel = date && time && effectiveDuration
    ? new Date(new Date(`${date}T${time}`).getTime() + effectiveDuration * 60000).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
    : null;

  const submit = async () => {
    if (!date || !time) { setError('Pick a date and a start time.'); return; }
    if (!effectiveDuration) { setError('Enter a custom duration between 5 and 1440 minutes.'); return; }
    if (!interviewerId) { setError('Pick an interviewer.'); return; }
    const start = new Date(`${date}T${time}`);
    if (Number.isNaN(start.getTime())) { setError('That date/time is not valid.'); return; }
    const location = locationKind === 'COMPANY' ? companyLocationInput.trim() : locationKind === 'ONLINE' ? meetingLink.trim() : address.trim();
    if (locationKind === 'COMPANY' && !location) { setError('Enter the office address, or choose another location type.'); return; }
    if (locationKind === 'ONLINE' && !/^https?:\/\/\S+$/i.test(location ?? '')) { setError('Paste the full meeting link, starting with https://'); return; }
    if (locationKind === 'OTHER' && !location) { setError('Enter the interview address.'); return; }

    setSaving(true);
    setError('');
    try {
      const fields = {
        scheduledStart: start.toISOString(),
        scheduledEnd: new Date(start.getTime() + effectiveDuration * 60000).toISOString(),
        interviewerId,
        locationType: locationKind,
        location,
        notes: notes.trim() || undefined,
      };
      const res = existing ? await rescheduleInterview(application.id, existing.id, fields) : await scheduleInterview(application.id, fields);
      onDone((res.application ?? application) as ApplicationRowData, {
        candidateEmailed: res.candidateEmailed, interviewerEmailed: res.interviewerEmailed, candidateHasEmail: res.candidateHasEmail, interviewerHasEmail: res.interviewerHasEmail,
      });
    } catch (err: unknown) {
      setError(saveErrorMessage(err, 'Failed to save interview schedule'));
    } finally {
      setSaving(false);
    }
  };

  const kindButton = (kind: InterviewLocationType, label: string, disabled = false) => {
    const active = locationKind === kind;
    return (
      <Pressable
        key={kind}
        disabled={disabled}
        onPress={() => setLocationKind(kind)}
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled }}
        style={[styles.kind, active && { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }, disabled && { opacity: 0.4 }]}>
        <ThemedText style={[styles.kindText, { color: active ? theme.primary : theme.textMuted }]} numberOfLines={1}>{label}</ThemedText>
      </Pressable>
    );
  };

  return (
    <Sheet
      visible
      onClose={onCancel}
      locked={saving}
      title={`${existing ? 'Reschedule' : 'Schedule'} Interview — ${application.name}`}
      footer={
        <>
          <Button variant="secondary" onPress={onCancel} disabled={saving}>Cancel</Button>
          <Button style={styles.flex1} loading={saving} onPress={submit}>{saving ? 'Sending…' : existing ? 'Save & Resend Invite' : 'Send Invite'}</Button>
        </>
      }>
      {error ? <View style={[styles.errorBox, { backgroundColor: 'rgba(224,104,104,0.1)' }]}><ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText></View> : null}

      <DateField label="Date" value={date} onChange={setDate} />
      <Select
        label="Start time"
        required
        placeholder="Select…"
        options={timeSlots(time || undefined).map((t) => ({ value: t, label: fmtClock(t) }))}
        value={time}
        onChange={setTime}
      />
      {useCustomDuration ? (
        <View>
          <Input
            label="Duration (minutes)"
            required
            value={customDuration}
            onChangeText={(v) => setCustomDuration(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            placeholder="Minutes"
            error={customDuration && !customValid ? 'Enter 5 to 1440 minutes.' : undefined}
          />
          <Pressable onPress={() => setUseCustomDuration(false)} hitSlop={8} style={styles.linkRow}>
            <ThemedText themeColor="textMuted" style={[styles.small, styles.underline]}>Use presets</ThemedText>
          </Pressable>
        </View>
      ) : (
        <Select
          label="Duration"
          required
          options={[...durations.map((d) => ({ value: String(d), label: fmtDuration(d) })), { value: 'custom', label: 'Custom…' }]}
          value={String(duration)}
          onChange={(v) => {
            if (v === 'custom') { setCustomDuration(String(duration)); setUseCustomDuration(true); return; }
            setDuration(Number(v));
          }}
        />
      )}
      {endLabel ? <ThemedText themeColor="textMuted" style={styles.small}>Ends at {endLabel}.</ThemedText> : null}

      <Select
        label="Interviewer"
        required
        placeholder="Select interviewer…"
        options={employees.map((e) => ({ value: e.id, label: e.name }))}
        value={interviewerId}
        onChange={setInterviewerId}
      />

      <View style={styles.block}>
        <ThemedText themeColor="textMuted" style={styles.label}>LOCATION<ThemedText style={[styles.label, { color: theme.danger }]}> *</ThemedText></ThemedText>
        <View style={[styles.kinds, { backgroundColor: theme.background }]}>
          {kindButton('COMPANY', 'Company office', !companyLocation)}
          {kindButton('ONLINE', 'Online meeting')}
          {kindButton('OTHER', 'Other address')}
        </View>
        {locationKind === 'COMPANY' ? (
          companyLocation ? (
            <View style={styles.block}>
              <Input value={companyLocationInput} onChangeText={setCompanyLocationInput} placeholder="Office address, or a Google Maps link" />
              <Pressable onPress={() => Linking.openURL(mapUrl(companyLocationInput.trim() || companyLocation))} hitSlop={8} accessibilityRole="link">
                <ThemedText themeColor="primary" style={[styles.small, styles.underline, styles.medium]}>View on map</ThemedText>
              </Pressable>
              {companyLocationInput.trim() !== companyLocation ? (
                <Pressable onPress={() => setCompanyLocationInput(companyLocation)} hitSlop={8}>
                  <ThemedText themeColor="textMuted" style={[styles.tiny, styles.underline]}>Reset to default office address</ThemedText>
                </Pressable>
              ) : null}
            </View>
          ) : defaultsLoaded ? (
            <ThemedText themeColor="textMuted" style={styles.tiny}>No default office location is configured (COMPANY_INTERVIEW_LOCATION).</ThemedText>
          ) : null
        ) : null}
        {locationKind === 'ONLINE' ? <Input value={meetingLink} onChangeText={setMeetingLink} keyboardType="url" autoCapitalize="none" autoCorrect={false} placeholder="https://meet.google.com/…" /> : null}
        {locationKind === 'OTHER' ? <Input value={address} onChangeText={setAddress} placeholder="Full address, or a Google Maps link" /> : null}
      </View>

      <Input label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={2} />
    </Sheet>
  );
}

type PanelProps = {
  application: ApplicationRowData;
  onChanged: (a: ApplicationRowData) => void;
  onOpenForm: () => void;
  lastResult: ScheduleResult | null;
  onResult: (r: ScheduleResult | null) => void;
};

// Dashboard InterviewSchedulePanel: the active manager interview with its
// share text and Resend / Reschedule / Cancel. Only at the MANAGER_INTERVIEW stage.
export function InterviewSchedulePanel({ application, onChanged, onOpenForm, lastResult, onResult }: PanelProps) {
  const theme = useTheme();
  const active = (application.interviewSchedules ?? []).find((s) => s.status === 'SCHEDULED') ?? null;
  const [expanded, setExpanded] = useState(!!lastResult);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // A fresh schedule / reschedule result opens the details it describes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open on new result
    if (lastResult) setExpanded(true);
  }, [lastResult]);

  if (application.status !== 'MANAGER_INTERVIEW') return null;

  const resend = async () => {
    if (!active) return;
    setBusy(true);
    setError('');
    onResult(null);
    try {
      onResult(await resendInterviewScheduleInvite(application.id, active.id));
    } catch (err: unknown) {
      setError(saveErrorMessage(err, 'Failed to resend invite'));
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!active) return;
    setBusy(true);
    setError('');
    try {
      const res = await cancelInterview(application.id, active.id);
      if (res.application) onChanged(res.application as ApplicationRowData);
    } catch (err: unknown) {
      setError(saveErrorMessage(err, 'Failed to cancel interview'));
    } finally {
      setBusy(false);
    }
  };

  const cancelInterviewPrompt = () => {
    Alert.alert('Cancel this interview?', 'A cancellation notice will be sent to both the candidate and interviewer.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel Interview', style: 'destructive', onPress: doCancel },
    ]);
  };

  if (!active) {
    return (
      <View style={[styles.panel, styles.panelRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText themeColor="textMuted" style={[styles.small, styles.flex1]}>No interview scheduled yet.</ThemedText>
        <Button size="sm" variant="secondary" onPress={onOpenForm}>Schedule Interview</Button>
      </View>
    );
  }

  const shareText = buildInterviewShareText(application, active);
  const unreachable = [!application.email && 'the candidate', !active.interviewer.email && 'the interviewer'].filter(Boolean);

  const copy = async () => {
    await Clipboard.setStringAsync(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText themeColor="textMuted" style={styles.title}>MANAGER INTERVIEW SCHEDULED</ThemedText>
      <ThemedText style={styles.body}>
        {fmtDateTime(active.scheduledStart)} – {new Date(active.scheduledEnd).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
      </ThemedText>
      <CollapseToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
      {expanded ? (
        <View style={styles.block}>
          <ThemedText themeColor="textSecondary" style={styles.body}>Interviewer: {active.interviewer.name}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.body}>
            {interviewLocationLabel(active)}: {active.location || 'Not set — reschedule to add one'}
          </ThemedText>
          {active.notes ? <ThemedText themeColor="textMuted" style={styles.small}>{active.notes}</ThemedText> : null}

          <View style={[styles.share, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <View style={styles.shareHead}>
              <ThemedText themeColor="textSecondary" style={[styles.small, styles.semibold, styles.flex1]}>Share details</ThemedText>
              <Button size="sm" variant="secondary" icon={copied ? 'checkmark' : 'copy-outline'} onPress={copy}>{copied ? 'Copied' : 'Copy details'}</Button>
            </View>
            <ThemedText style={styles.small} selectable>{shareText}</ThemedText>
            <ThemedText style={[styles.tiny, { color: unreachable.length ? theme.warning : theme.textMuted }]}>
              {unreachable.length
                ? `No email on file for ${unreachable.join(' or ')} — copy these details and send them by WhatsApp or SMS.`
                : 'Paste into WhatsApp, SMS or email if anyone needs the details again.'}
            </ThemedText>
          </View>

          <View style={styles.actions}>
            <Button size="sm" variant="secondary" disabled={busy} onPress={resend}>Resend Invite</Button>
            <Button size="sm" variant="secondary" disabled={busy} onPress={onOpenForm}>Reschedule</Button>
            <Button size="sm" variant="danger" disabled={busy} onPress={cancelInterviewPrompt}>Cancel Interview</Button>
          </View>
        </View>
      ) : null}
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
      {lastResult ? (
        <ThemedText themeColor="textMuted" style={styles.small}>
          Invite sent — candidate {emailOutcome(lastResult.candidateEmailed, lastResult.candidateHasEmail)}, interviewer {emailOutcome(lastResult.interviewerEmailed, lastResult.interviewerHasEmail)} (always notified in-app).
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 16 },
  medium: { fontFamily: FontWeights.medium },
  semibold: { fontFamily: FontWeights.semiBold },
  underline: { textDecorationLine: 'underline' },
  label: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },
  title: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.8 },
  errorBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  block: { gap: 8 },
  kinds: { flexDirection: 'row', padding: 4, gap: 4, borderRadius: Radii.sm },
  kind: { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm - 2, paddingHorizontal: 4 },
  kindText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  linkRow: { marginTop: 6 },
  panel: { padding: 16, gap: 8, borderRadius: Radii.md, borderBottomWidth: StyleSheet.hairlineWidth },
  panelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  share: { padding: 12, gap: 8, borderWidth: 1, borderRadius: Radii.sm },
  shareHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
