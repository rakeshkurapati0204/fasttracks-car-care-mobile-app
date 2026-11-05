import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MtContactConflict, MtLinkContactInput } from '@/lib/my-timesheet-api';
import { CONTACT_TYPE_OPTIONS, contactTypeDisplay, displayContactPhone, formatDateTimeIST } from './parts';

export type LinkContactResult =
  | { ok: true }
  | { ok: false; kind: 'conflict'; conflict: MtContactConflict }
  | { ok: false; kind: 'error'; message: string };

// Dashboard ContactComposeForm: flat compose form (phone / type / name / reason) that swaps its own content for an
// inline 409 confirm step. Cancelling from the confirm step returns to the form with everything still typed.
export function ContactComposeForm({ onSubmit, onDone, onCancel }: {
  onSubmit: (data: MtLinkContactInput) => Promise<LinkContactResult>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const theme = useTheme();
  const [phone, setPhone] = useState('');
  const [contactType, setContactType] = useState('');
  const [contactTypeOther, setContactTypeOther] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [pending, setPending] = useState<MtContactConflict | null>(null);

  const submit = async (confirmed: boolean) => {
    setFormError('');
    setSaving(true);
    try {
      const result = await onSubmit({
        phone: phone.trim(),
        contactType: contactType || undefined,
        contactTypeOther: contactType === 'OTHER' ? contactTypeOther.trim() : undefined,
        name: name.trim() || undefined,
        reason: reason.trim() || undefined,
        linkExistingConfirmed: confirmed || undefined,
      });
      if (result.ok) { onDone(); return; }
      if (result.kind === 'conflict') setPending(result.conflict);
      else setFormError(result.message);
    } finally {
      setSaving(false);
    }
  };

  const box = [styles.box, { backgroundColor: theme.surface, borderColor: theme.border }];

  if (pending) {
    const wasDeleted = pending.isDeleted;
    // contactType is only present alongside the rest of the directory detail — that's what distinguishes the shapes.
    const hasDetail = pending.contactType !== undefined;
    return (
      <View style={box}>
        {hasDetail ? (
          <View style={styles.gap4}>
            <ThemedText style={styles.medium}>
              {pending.name || displayContactPhone(phone)} — {contactTypeDisplay(pending.contactType!, pending.contactTypeOther)}
            </ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>
              {pending.addedBy
                ? `Added by ${pending.addedBy.name} on ${formatDateTimeIST(pending.createdAt!)}`
                : `Added on ${formatDateTimeIST(pending.createdAt!)}`}
            </ThemedText>
          </View>
        ) : (
          <ThemedText style={styles.small}>
            {wasDeleted
              ? 'This number was saved before but has since been removed. Link it to this task?'
              : 'This number is already saved. Link it to this task?'}
          </ThemedText>
        )}
        <ThemedText themeColor="textMuted" style={styles.small}>
          {wasDeleted ? 'Confirming will restore this contact to the directory. ' : ''}
          The name and type you entered won&apos;t be applied — the existing record is used as-is.
        </ThemedText>
        {formError ? <ThemedText themeColor="danger" style={styles.small}>{formError}</ThemedText> : null}
        <View style={styles.row}>
          <Button variant="outline" size="sm" onPress={() => setPending(null)}>Cancel</Button>
          <Button size="sm" loading={saving} onPress={() => submit(true)}>{wasDeleted ? 'Restore & Link' : 'Link Contact'}</Button>
        </View>
      </View>
    );
  }

  return (
    <View style={box}>
      <Input label="Phone" required value={phone} onChangeText={setPhone} hint="Enter a 10-digit Indian number." keyboardType="phone-pad" autoComplete="off" />
      <Select label="Contact Type" required options={CONTACT_TYPE_OPTIONS} value={contactType} onChange={setContactType} />
      {contactType === 'OTHER' ? (
        <Input label="Label" required value={contactTypeOther} onChangeText={setContactTypeOther} hint="What kind of contact is this?" />
      ) : null}
      <Input label="Name" value={name} onChangeText={setName} autoComplete="off" />
      <Input label="Reason" value={reason} onChangeText={setReason} autoComplete="off" />
      {formError ? <ThemedText themeColor="danger" style={styles.small}>{formError}</ThemedText> : null}
      <View style={styles.row}>
        <Button variant="outline" size="sm" onPress={onCancel}>Cancel</Button>
        <Button
          size="sm"
          loading={saving}
          onPress={() => {
            if (!phone.trim()) { setFormError('Phone number is required.'); return; }
            if (!contactType) { setFormError('Contact type is required.'); return; }
            if (contactType === 'OTHER' && !contactTypeOther.trim()) {
              setFormError('A label is required when contact type is Other.'); return;
            }
            submit(false);
          }}>
          Add Contact
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 10 },
  gap4: { gap: 4 },
  row: { flexDirection: 'row', gap: 8 },
  small: { fontSize: 12, lineHeight: 17 },
  medium: { fontSize: 12, lineHeight: 17, fontFamily: FontWeights.medium },
});
