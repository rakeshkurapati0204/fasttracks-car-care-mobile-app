import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { PWD_CATEGORIES } from '@/components/password-manager/entry-cards';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CardEntry, CardEntryInput, CardType, PasswordEntry, PasswordEntryInput } from '@/types/api';

// The dashboard's blankPwd / blankCard defaults.
type PwdForm = { title: string; category: string; url: string; username: string; password: string; notes: string };
type CardForm = {
  label: string; cardType: CardType; bankName: string; cardholderName: string;
  cardNumber: string; expiry: string; cvv: string; billingAddress: string; notes: string;
};

// The dashboard's PwdInput: masked field with a show/hide toggle.
function PwdInput({ label, hint, value, onChange, placeholder, error }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; placeholder: string; error?: string;
}) {
  const theme = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View>
      <ThemedText themeColor={error ? 'danger' : 'textSecondary'} style={styles.label}>
        {label}{hint ? <ThemedText themeColor="textMuted" style={styles.hint}> {hint}</ThemedText> : null}
      </ThemedText>
      <View style={[styles.pwdWrap, { backgroundColor: theme.surface, borderColor: error ? theme.danger : theme.border }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          importantForAutofill="no"
          style={[styles.pwdInput, { color: theme.text }]}
        />
        <Pressable onPress={() => setShow((s) => !s)} hitSlop={10} accessibilityRole="button" accessibilityLabel={show ? 'Hide' : 'Show'}>
          <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.textMuted} />
        </Pressable>
      </View>
      {error ? <ThemedText themeColor="danger" style={styles.helper}>{error}</ThemedText> : null}
    </View>
  );
}

function FormFooter({ saving, submitLabel, onCancel, onSubmit }: { saving: boolean; submitLabel: string; onCancel: () => void; onSubmit: () => void }) {
  return (
    <View style={styles.footer}>
      <View style={styles.flex1}><Button variant="outline" onPress={onCancel} disabled={saving} fullWidth>Cancel</Button></View>
      <View style={styles.flex1}><Button onPress={onSubmit} loading={saving} fullWidth>{saving ? 'Saving...' : submitLabel}</Button></View>
    </View>
  );
}

// Add / Edit Password — fields, labels and placeholders as on the dashboard. Editing leaves the password
// blank (blank = keep current); the real value is never fetched into the form.
export function PasswordForm({ editing, saving, error, onCancel, onSubmit }: {
  editing: PasswordEntry | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: PasswordEntryInput) => void;
}) {
  const [f, setF] = useState<PwdForm>(() =>
    editing
      ? { title: editing.title, category: editing.category, url: editing.url || '', username: editing.username, password: '', notes: editing.notes || '' }
      : { title: '', category: 'Social Media', url: '', username: '', password: '', notes: '' },
  );
  const [errs, setErrs] = useState<Partial<Record<keyof PwdForm, string>>>({});
  const set = (k: keyof PwdForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = () => {
    const e: typeof errs = {};
    if (!f.title.trim()) e.title = 'Title is required.';
    if (!f.username.trim()) e.username = 'Username / Email is required.';
    if (!editing && !f.password) e.password = 'Password is required.';
    setErrs(e);
    if (Object.keys(e).length) return;
    // Edit: only send the password when one was typed, like the dashboard.
    const body: PasswordEntryInput = { title: f.title, category: f.category, url: f.url, username: f.username, notes: f.notes };
    if (!editing || f.password) body.password = f.password;
    onSubmit(body);
  };

  return (
    <Sheet visible fullHeight onClose={onCancel} locked={saving} title={editing ? 'Edit Password' : 'Add Password'}
      footer={<FormFooter saving={saving} submitLabel={editing ? 'Save Changes' : 'Add Password'} onCancel={onCancel} onSubmit={submit} />}>
      <Input label="Title" required value={f.title} onChangeText={set('title')} placeholder="e.g. Google Account" error={errs.title} />
      <Select label="Category" required value={f.category} onChange={set('category')} options={PWD_CATEGORIES.map((c) => ({ value: c, label: c }))} />
      <Input label="URL" value={f.url} onChangeText={set('url')} placeholder="https://..." keyboardType="url" autoCapitalize="none" autoCorrect={false} />
      <Input label="Username / Email" required value={f.username} onChangeText={set('username')} placeholder="username@example.com" autoCapitalize="none" autoCorrect={false} error={errs.username} />
      <PwdInput
        label={editing ? 'Password' : 'Password *'}
        hint={editing ? '(leave blank to keep current)' : undefined}
        value={f.password}
        onChange={set('password')}
        placeholder={editing ? 'Leave blank to keep' : 'Enter password'}
        error={errs.password}
      />
      <Input label="Notes" value={f.notes} onChangeText={set('notes')} placeholder="Optional notes..." multiline numberOfLines={3} />
      {error ? <ThemedText themeColor="danger" style={styles.helper}>{error}</ThemedText> : null}
    </Sheet>
  );
}

// Add / Edit Card — fields, labels, placeholders and input masks as on the dashboard
// (16-digit number, MM/YY auto-slash, 4-digit CVV).
export function CardFormView({ editing, saving, error, onCancel, onSubmit }: {
  editing: CardEntry | null;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (body: CardEntryInput) => void;
}) {
  const [f, setF] = useState<CardForm>(() =>
    editing
      ? {
          label: editing.label, cardType: editing.cardType, bankName: editing.bankName, cardholderName: editing.cardholderName,
          cardNumber: '', expiry: editing.expiry, cvv: '', billingAddress: editing.billingAddress || '', notes: editing.notes || '',
        }
      : { label: '', cardType: 'CREDIT', bankName: '', cardholderName: '', cardNumber: '', expiry: '', cvv: '', billingAddress: '', notes: '' },
  );
  const [errs, setErrs] = useState<Partial<Record<keyof CardForm, string>>>({});
  const set = <K extends keyof CardForm>(k: K) => (v: CardForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const submit = () => {
    const e: typeof errs = {};
    if (!f.label.trim()) e.label = 'Card Label is required.';
    if (!f.bankName.trim()) e.bankName = 'Bank Name is required.';
    if (!f.cardholderName.trim()) e.cardholderName = 'Cardholder Name is required.';
    if (!editing && !f.cardNumber) e.cardNumber = 'Card Number is required.';
    if (!f.expiry.trim()) e.expiry = 'Required.';
    if (!editing && !f.cvv) e.cvv = 'Required.';
    setErrs(e);
    if (Object.keys(e).length) return;
    // Edit: number / CVV are only sent when typed (blank = keep).
    const body: CardEntryInput = {
      label: f.label, cardType: f.cardType, bankName: f.bankName, cardholderName: f.cardholderName,
      expiry: f.expiry, billingAddress: f.billingAddress, notes: f.notes,
    };
    if (!editing || f.cardNumber) body.cardNumber = f.cardNumber;
    if (!editing || f.cvv) body.cvv = f.cvv;
    onSubmit(body);
  };

  return (
    <Sheet visible fullHeight onClose={onCancel} locked={saving} title={editing ? 'Edit Card' : 'Add Card'}
      footer={<FormFooter saving={saving} submitLabel={editing ? 'Save Changes' : 'Add Card'} onCancel={onCancel} onSubmit={submit} />}>
      <Input label="Card Label" required value={f.label} onChangeText={set('label')} placeholder="e.g. HDFC Business Card" error={errs.label} />
      <Select label="Card Type" required value={f.cardType} onChange={(v) => set('cardType')(v as CardType)} options={[{ value: 'CREDIT', label: 'Credit' }, { value: 'DEBIT', label: 'Debit' }]} />
      <Input label="Bank Name" required value={f.bankName} onChangeText={set('bankName')} placeholder="e.g. HDFC Bank" error={errs.bankName} />
      <Input label="Cardholder Name" required value={f.cardholderName} onChangeText={set('cardholderName')} placeholder="Name on card" error={errs.cardholderName} />
      <Input
        label={editing ? 'Card Number (leave blank to keep)' : 'Card Number'}
        required={!editing}
        value={f.cardNumber}
        onChangeText={(v) => set('cardNumber')(v.replace(/\D/g, '').slice(0, 16))}
        placeholder={editing ? 'Leave blank to keep' : '16-digit card number'}
        keyboardType="number-pad"
        maxLength={16}
        autoComplete="off"
        importantForAutofill="no"
        error={errs.cardNumber}
      />
      <View style={styles.twoCol}>
        <View style={styles.flex1}>
          <Input
            label="Expiry (MM/YY)"
            required
            value={f.expiry}
            onChangeText={(v) => {
              let d = v.replace(/\D/g, '');
              if (d.length >= 2) d = `${d.slice(0, 2)}/${d.slice(2, 4)}`;
              set('expiry')(d);
            }}
            placeholder="MM/YY"
            keyboardType="number-pad"
            maxLength={5}
            error={errs.expiry}
          />
        </View>
        <View style={styles.flex1}>
          <PwdInput
            label={editing ? 'CVV' : 'CVV *'}
            hint={editing ? '(leave blank)' : undefined}
            value={f.cvv}
            onChange={(v) => set('cvv')(v.replace(/\D/g, '').slice(0, 4))}
            placeholder={editing ? 'Leave blank' : 'CVV'}
            error={errs.cvv}
          />
        </View>
      </View>
      <Input label="Billing Address" value={f.billingAddress} onChangeText={set('billingAddress')} placeholder="Optional" multiline numberOfLines={2} />
      <Input label="Notes" value={f.notes} onChangeText={set('notes')} placeholder="Optional notes..." multiline numberOfLines={2} />
      {error ? <ThemedText themeColor="danger" style={styles.helper}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium, marginBottom: 4 },
  hint: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.regular },
  helper: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  pwdWrap: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14, gap: 8 },
  pwdInput: { flex: 1, fontSize: 14, paddingVertical: 10, fontFamily: FontWeights.regular },
  twoCol: { flexDirection: 'row', gap: 12 },
  footer: { flexDirection: 'row', gap: 8, flex: 1 },
});
