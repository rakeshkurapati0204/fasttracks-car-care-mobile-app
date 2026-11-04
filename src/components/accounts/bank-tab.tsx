import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { FormGrid } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Fonts } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deactivateBankAccount, fetchBankAccountReveals, getErrorMessage, revealBankAccountNumber, saveBankAccountRecord, updateBankAccountBalance,
} from '@/lib/api';
import type { BankAccount, BankAccountRevealLog, BankAccountType } from '@/types/api';

import { ACCOUNT_TYPE_LABELS, fmt, fmtDateTime } from './helpers';
import { AccCard, AField, DocumentsSheet, EmptyState, FormError, Money, Summary, Tag, type Notify } from './parts';

const REVEAL_MS = 10000;

interface BankForm {
  nickname: string; bankName: string; accountHolderName: string; accountNumber: string;
  ifscCode: string; branch: string; accountType: BankAccountType; currentBalance: string;
}
const EMPTY: BankForm = { nickname: '', bankName: '', accountHolderName: '', accountNumber: '', ifscCode: '', branch: '', accountType: 'SAVINGS', currentBalance: '0' };

export function BankAccountsTab({ accounts, loading, isOwner, wide, notify, onChanged }: {
  accounts: BankAccount[]; loading: boolean; isOwner: boolean; wide: boolean; notify: Notify; onChanged: () => void;
}) {
  const theme = useTheme();
  const [formFor, setFormFor] = useState<BankAccount | 'new' | null>(null);
  const [balanceFor, setBalanceFor] = useState<BankAccount | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);
  const [docsFor, setDocsFor] = useState<BankAccount | null>(null);

  // Full numbers live only in memory for 10 seconds, then fall back to the masked value.
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const t = timers.current;
    return () => { Object.values(t).forEach(clearTimeout); };
  }, []);

  const reveal = async (id: string) => {
    if (revealed[id]) return;
    try {
      const r = await revealBankAccountNumber(id);
      setRevealed((prev) => ({ ...prev, [id]: r.accountNumber }));
      if (timers.current[id]) clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => {
        setRevealed((prev) => { const n = { ...prev }; delete n[id]; return n; });
      }, REVEAL_MS);
    } catch {
      notify('error', 'Failed to reveal account number');
    }
  };

  const del = (a: BankAccount) => {
    Alert.alert(`Delete "${a.nickname}"?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deactivateBankAccount(a.id);
            notify('success', 'Account deleted');
            onChanged();
          } catch {
            notify('error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const total = accounts.reduce((s, a) => s + a.currentBalance, 0);

  if (loading && accounts.length === 0) return <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={150} />)}</View>;

  return (
    <View style={styles.gapLg}>
      <Summary caption="Total across all accounts" value={fmt(total)} color={theme.success} action={<Button onPress={() => setFormFor('new')}>+ Add Account</Button>} />

      {accounts.length === 0 ? <EmptyState message="No bank accounts added yet" /> : (
        <View style={styles.gap}>
          {accounts.map((a) => {
            const shown = revealed[a.id];
            return (
              <AccCard key={a.id}>
                <View style={[styles.top, wide && styles.topWide]}>
                  <View style={styles.flex1}>
                    <View style={styles.titleRow}>
                      <ThemedText style={styles.name}>{a.nickname}</ThemedText>
                      <Tag label={ACCOUNT_TYPE_LABELS[a.accountType as BankAccountType] ?? a.accountType} color={theme.primary} />
                    </View>
                    <ThemedText themeColor="textMuted" style={styles.meta}>{`${a.bankName} · ${a.branch}`}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.meta}>{`${a.accountHolderName} · IFSC: ${a.ifscCode}`}</ThemedText>
                    <View style={styles.numRow}>
                      <ThemedText themeColor="textMuted" style={styles.num}>{shown || a.accountNumber}</ThemedText>
                      {!shown ? (
                        <Pressable onPress={() => reveal(a.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reveal account number">
                          <ThemedText style={[styles.link, { color: theme.primary }]}>Reveal</ThemedText>
                        </Pressable>
                      ) : (
                        <ThemedText style={[styles.tiny, { color: theme.warning }]}>Hides in 10s</ThemedText>
                      )}
                    </View>
                  </View>
                  <View style={wide ? styles.right : undefined}>
                    <Money value={fmt(a.currentBalance)} color={theme.success} size={20} />
                    {a.balanceUpdatedAt && a.balanceUpdatedBy ? (
                      <ThemedText themeColor="textMuted" style={styles.tiny}>{`Updated ${fmtDateTime(a.balanceUpdatedAt)} by ${a.balanceUpdatedBy.name}`}</ThemedText>
                    ) : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  <Button variant="outline" size="sm" onPress={() => setBalanceFor(a)}>Update Balance</Button>
                  <Button variant="outline" size="sm" onPress={() => setFormFor(a)}>Edit Details</Button>
                  <Button variant="outline" size="sm" onPress={() => setDocsFor(a)}>Documents</Button>
                  {isOwner ? <Button variant="outline" size="sm" onPress={() => setLogFor(a.id)}>Reveal Log</Button> : null}
                  <Button variant="danger" size="sm" onPress={() => del(a)}>Delete</Button>
                </View>
              </AccCard>
            );
          })}
        </View>
      )}

      {formFor ? (
        <BankFormSheet
          account={formFor === 'new' ? null : formFor}
          onClose={() => setFormFor(null)}
          notify={notify}
          onSaved={() => { setFormFor(null); onChanged(); }}
        />
      ) : null}
      {balanceFor ? <BalanceSheet account={balanceFor} onClose={() => setBalanceFor(null)} notify={notify} onSaved={() => { setBalanceFor(null); onChanged(); }} /> : null}
      {logFor ? <RevealLogSheet accountId={logFor} onClose={() => setLogFor(null)} notify={notify} /> : null}
      {docsFor ? <DocumentsSheet kind="bank" ownerId={docsFor.id} title={docsFor.nickname} onClose={() => setDocsFor(null)} notify={notify} /> : null}
    </View>
  );
}

function BankFormSheet({ account, onClose, onSaved, notify }: { account: BankAccount | null; onClose: () => void; onSaved: () => void; notify: Notify }) {
  const editing = !!account;
  const [form, setForm] = useState<BankForm>(() => account
    ? {
        nickname: account.nickname, bankName: account.bankName, accountHolderName: account.accountHolderName,
        // The list only ever holds the masked number; the full one is never prefilled.
        accountNumber: '', ifscCode: account.ifscCode, branch: account.branch,
        accountType: account.accountType as BankAccountType, currentBalance: String(account.currentBalance),
      }
    : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof BankForm) => (v: string) => setForm((f) => ({ ...f, [k]: k === 'ifscCode' ? v.toUpperCase() : v }));

  const save = async () => {
    if (!form.nickname || !form.bankName || (!editing && !form.accountNumber)) {
      setError(editing ? 'Nickname and bank name are required' : 'Nickname, bank name, and account number are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await saveBankAccountRecord(account!.id, {
          nickname: form.nickname, bankName: form.bankName, accountHolderName: form.accountHolderName,
          // Blank keeps the stored number (the server ignores an empty value).
          accountNumber: form.accountNumber, ifscCode: form.ifscCode, branch: form.branch, accountType: form.accountType,
        });
        notify('success', 'Account updated');
      } else {
        await saveBankAccountRecord(null, { ...form, currentBalance: parseFloat(form.currentBalance) || 0 });
        notify('success', 'Account added');
      }
      onSaved();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to save account'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      fullHeight
      onClose={onClose}
      locked={saving}
      title={editing ? 'Edit Bank Account' : 'Add Bank Account'}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }>
      {error ? <FormError message={error} /> : null}
      <FormGrid>
        <AField label="Nickname *"><Input value={form.nickname} onChangeText={set('nickname')} placeholder="e.g. Kotak Business" /></AField>
        <AField label="Bank Name *"><Input value={form.bankName} onChangeText={set('bankName')} placeholder="e.g. Kotak Mahindra" /></AField>
        <AField label="Account Holder Name"><Input value={form.accountHolderName} onChangeText={set('accountHolderName')} /></AField>
        <AField label="Account Type">
          <Select value={form.accountType} onChange={set('accountType')} options={[{ value: 'SAVINGS', label: 'Savings' }, { value: 'CURRENT', label: 'Current' }, { value: 'OD', label: 'Overdraft' }]} />
        </AField>
        <AField label={editing ? 'Account Number' : 'Account Number *'} hint={editing ? 'Leave blank to keep the current number' : undefined}>
          <Input value={form.accountNumber} onChangeText={set('accountNumber')} placeholder={editing ? 'New account number (optional)' : 'Full account number'} keyboardType="number-pad" autoCorrect={false} />
        </AField>
        <AField label="IFSC Code"><Input value={form.ifscCode} onChangeText={set('ifscCode')} autoCapitalize="characters" autoCorrect={false} /></AField>
        <AField label="Branch"><Input value={form.branch} onChangeText={set('branch')} /></AField>
        {!editing ? <AField label="Current Balance (₹)"><Input value={form.currentBalance} onChangeText={set('currentBalance')} keyboardType="decimal-pad" /></AField> : null}
      </FormGrid>
      <View style={styles.note}>
        <ThemedText style={styles.noteText}>
          Account numbers are stored securely and shown masked by default. Full number requires an explicit reveal action, which is logged.
        </ThemedText>
      </View>
    </Sheet>
  );
}

function BalanceSheet({ account, onClose, onSaved, notify }: { account: BankAccount; onClose: () => void; onSaved: () => void; notify: Notify }) {
  const [balance, setBalance] = useState(String(account.currentBalance));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    const bal = parseFloat(balance);
    if (isNaN(bal)) { setError('Enter a valid balance'); return; }
    setSaving(true);
    setError('');
    try {
      await updateBankAccountBalance(account.id, bal, note || undefined);
      notify('success', 'Balance updated');
      onSaved();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to update balance'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={saving}
      title={`Update Balance — ${account.nickname}`}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Update'}</Button>
        </>
      }>
      {error ? <FormError message={error} /> : null}
      <AField label="New Balance (₹) *"><Input value={balance} onChangeText={setBalance} keyboardType="numbers-and-punctuation" autoFocus /></AField>
      <AField label="Note (optional)"><Input value={note} onChangeText={setNote} placeholder="e.g. After salary transfers" /></AField>
    </Sheet>
  );
}

function RevealLogSheet({ accountId, onClose, notify }: { accountId: string; onClose: () => void; notify: Notify }) {
  const theme = useTheme();
  const [logs, setLogs] = useState<BankAccountRevealLog[] | null>(null);

  useEffect(() => {
    let live = true;
    fetchBankAccountReveals(accountId)
      .then((r) => { if (live) setLogs(Array.isArray(r) ? r : []); })
      .catch(() => { if (live) { notify('error', 'Failed to load audit log'); onClose(); } });
    return () => { live = false; };
  }, [accountId, notify, onClose]);

  return (
    <Sheet visible onClose={onClose} title="Account Number Reveal Log">
      {logs === null ? (
        <ThemedText themeColor="textMuted" style={[styles.meta, styles.center]}>Loading…</ThemedText>
      ) : logs.length === 0 ? (
        <ThemedText themeColor="textMuted" style={[styles.body, styles.center]}>No reveals on record</ThemedText>
      ) : (
        logs.map((l) => (
          <View key={l.id} style={[styles.logRow, { borderBottomColor: theme.border }]}>
            <ThemedText style={styles.body}>{l.revealedBy?.name ?? '—'}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.meta}>{fmtDateTime(l.createdAt)}</ThemedText>
          </View>
        ))
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  gapLg: { gap: 20 },
  top: { gap: 12 },
  topWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  right: { alignItems: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  meta: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 20 },
  tiny: { fontSize: 10, lineHeight: 14, marginTop: 2 },
  center: { textAlign: 'center', paddingVertical: 20 },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  num: { fontSize: 12, lineHeight: 18, fontFamily: Fonts?.mono },
  link: { fontSize: 11, lineHeight: 16, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  note: { backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  noteText: { color: '#b45309', fontSize: 11, lineHeight: 16 },
  logRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 10, borderBottomWidth: 1 },
});
