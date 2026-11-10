import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createLedger, deactivateLedger, deleteLedger, getErrorMessage, reactivateLedger, updateLedger } from '@/lib/api';

const GSTIN_LABEL = 'GSTIN (optional — reference only, non-GST purchases only go through this ledger)';

function ErrorText({ message }: { message: string }) {
  const theme = useTheme();
  return message ? <ThemedText style={[styles.body, { color: theme.danger }]}>{message}</ThemedText> : null;
}

// ─── New Ledger ──────────────────────────────────────────────────────────────
export function NewLedgerSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [gstin, setGstin] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) { setError('Ledger name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await createLedger({
        name: name.trim(),
        gstin: gstin.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      });
      onCreated();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create ledger.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="New Ledger (Sundry Creditor)"
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Create</Button>
        </>
      }>
      <Input label="Name" required value={name} onChangeText={setName} placeholder="Vendor / supplier name" />
      <Input label={GSTIN_LABEL} value={gstin} onChangeText={setGstin} autoCapitalize="characters" />
      <Input label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Input label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Address (optional)" value={address} onChangeText={setAddress} multiline />
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Edit Ledger ─────────────────────────────────────────────────────────────
type EditableLedger = {
  id: string; name: string; gstin: string | null; phone: string | null; email: string | null; address: string | null;
  partyType: 'SUPPLIER' | 'TRANSPORTER' | null;
};

export function EditLedgerSheet({ ledger, onClose, onSaved }: { ledger: EditableLedger; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(ledger.name);
  const [gstin, setGstin] = useState(ledger.gstin ?? '');
  const [phone, setPhone] = useState(ledger.phone ?? '');
  const [email, setEmail] = useState(ledger.email ?? '');
  const [address, setAddress] = useState(ledger.address ?? '');
  const [partyType, setPartyType] = useState<'' | 'SUPPLIER' | 'TRANSPORTER'>(ledger.partyType ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!name.trim()) { setError('Ledger name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      // Full-state save: every field is sent, blank ones as undefined, and
      // partyType as an explicit null to clear a classification (omitting the
      // key would keep the old value).
      await updateLedger(ledger.id, {
        name: name.trim(),
        gstin: gstin.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        partyType: partyType === '' ? null : partyType,
      });
      onSaved();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update ledger.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="Edit Ledger"
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button loading={saving} onPress={submit}>Save</Button>
        </>
      }>
      <Input label="Name" required value={name} onChangeText={setName} placeholder="Vendor / supplier name" />
      <Select
        label="Type (optional — controls which buttons/columns this ledger shows)"
        value={partyType}
        onChange={(v) => setPartyType(v as '' | 'SUPPLIER' | 'TRANSPORTER')}
        options={[
          { value: '', label: '— Unclassified —' },
          { value: 'SUPPLIER', label: 'Supplier' },
          { value: 'TRANSPORTER', label: 'Transporter' },
        ]}
      />
      <Input label={GSTIN_LABEL} value={gstin} onChangeText={setGstin} autoCapitalize="characters" />
      <Input label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Input label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <Input label="Address (optional)" value={address} onChangeText={setAddress} multiline />
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Deactivate / Reactivate ─────────────────────────────────────────────────
export function DeactivateReactivateSheet({
  ledgerId, ledgerName, isActive, onClose, onDone,
}: { ledgerId: string; ledgerName: string; isActive: boolean; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      if (isActive) await deactivateLedger(ledgerId);
      else await reactivateLedger(ledgerId);
      onDone();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update ledger status.'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={isActive ? 'Deactivate Ledger' : 'Reactivate Ledger'}
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Back</Button>
          <Button variant={isActive ? 'danger' : 'primary'} loading={saving} onPress={confirm}>
            {isActive ? 'Deactivate' : 'Reactivate'}
          </Button>
        </>
      }>
      <ThemedText themeColor="textSecondary" style={styles.body}>
        {isActive ? (
          <>
            No new purchase, payment, or receipt vouchers can be posted against <ThemedText style={styles.bold}>{ledgerName}</ThemedText> once
            deactivated. Its existing history and balance stay exactly as they are — nothing is deleted, and this can be undone any time.
          </>
        ) : (
          <>
            <ThemedText style={styles.bold}>{ledgerName}</ThemedText> will accept new vouchers again.
          </>
        )}
      </ThemedText>
      <ErrorText message={error} />
    </Sheet>
  );
}

// ─── Delete (hard-delete only when the ledger has no transactions) ──────────
export function DeleteLedgerSheet({
  ledgerId, ledgerName, hasTransactions, onClose, onDeleted, onDeactivateInstead,
}: {
  ledgerId: string; ledgerName: string; hasTransactions: boolean;
  onClose: () => void; onDeleted: () => void; onDeactivateInstead: () => void;
}) {
  const theme = useTheme();
  const [confirmText, setConfirmText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const remove = async () => {
    setError('');
    if (confirmText.trim() !== ledgerName) { setError('Type the ledger name exactly to confirm.'); return; }
    setSaving(true);
    try {
      await deleteLedger(ledgerId);
      onDeleted();
    } catch (e: unknown) {
      // The backend re-checks inside its own transaction, so a voucher posted
      // since this page loaded is still refused here.
      setError(getErrorMessage(e, 'Failed to delete ledger.'));
      setSaving(false);
    }
  };

  if (hasTransactions) {
    return (
      <Sheet
        visible
        onClose={onClose}
        title="Cannot Permanently Delete"
        footer={
          <>
            <Button variant="outline" onPress={onClose}>Back</Button>
            <Button variant="danger" onPress={onDeactivateInstead}>Deactivate Instead</Button>
          </>
        }>
        <ThemedText themeColor="textSecondary" style={styles.body}>
          <ThemedText style={styles.bold}>{ledgerName}</ThemedText> has financial transactions on it (purchase, payment, or receipt vouchers —
          including cancelled ones, since those still carry real posted-and-reversed entries). Permanently deleting it would orphan that history
          and break the audit trail, so it&apos;s not allowed. Deactivate it instead — it stays fully intact and can no longer accept new vouchers.
        </ThemedText>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title="Permanently Delete Ledger"
      footer={
        <>
          <Button variant="outline" onPress={onClose}>Cancel</Button>
          <Button variant="danger" loading={saving} onPress={remove}>Delete Permanently</Button>
        </>
      }>
      <ThemedText style={[styles.body, { color: theme.danger }]}>
        This ledger has no purchase, payment, or receipt vouchers on it, so this is safe — but it cannot be undone. Type the ledger name to confirm.
      </ThemedText>
      <Input label={`Type "${ledgerName}" to confirm`} value={confirmText} onChangeText={setConfirmText} autoCapitalize="none" />
      <ErrorText message={error} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 14, lineHeight: 20 },
  bold: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
});
