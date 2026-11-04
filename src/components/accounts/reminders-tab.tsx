import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { FormGrid } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deletePaymentReminder, getErrorMessage, markPaymentReminderPaid, saveReminderRecord } from '@/lib/api';
import type { BankAccount, PaymentRecurrence, PaymentReminderCategory, PaymentReminderFull } from '@/types/api';

import { CATEGORY_LABELS, fmt, fmtDate, RECURRENCE_LABELS } from './helpers';
import { AccCard, AField, EmptyState, FormError, Money, Tag, type Notify } from './parts';

type Filter = 'ALL' | 'DUE' | 'UPCOMING' | 'PAID';

interface ReminderForm {
  payeeName: string; category: PaymentReminderCategory; amount: string; isAmountFixed: boolean; dueDate: string;
  recurrence: PaymentRecurrence; bankAccountId: string; paymentMethod: string; accountReference: string; notes: string;
}
const EMPTY: ReminderForm = {
  payeeName: '', category: 'OTHER', amount: '', isAmountFixed: true, dueDate: '', recurrence: 'MONTHLY',
  bankAccountId: '', paymentMethod: '', accountReference: '', notes: '',
};

export function PaymentRemindersTab({ reminders, accounts, loading, wide, notify, onChanged }: {
  reminders: PaymentReminderFull[]; accounts: BankAccount[]; loading: boolean; wide: boolean; notify: Notify; onChanged: () => void;
}) {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [formFor, setFormFor] = useState<PaymentReminderFull | 'new' | null>(null);

  const markPaid = (r: PaymentReminderFull) => {
    Alert.alert('Mark as paid?', `${r.payeeName}${r.recurrence !== 'ONE_OFF' ? ' — the due date moves to the next cycle.' : ''}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Paid', onPress: async () => {
          try { await markPaymentReminderPaid(r.id); notify('success', 'Marked as paid'); onChanged(); }
          catch { notify('error', 'Failed to mark paid'); }
        },
      },
    ]);
  };

  const archive = (r: PaymentReminderFull) => {
    Alert.alert(`Archive reminder for "${r.payeeName}"?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive', style: 'destructive', onPress: async () => {
          try { await deletePaymentReminder(r.id); notify('success', 'Reminder archived'); onChanged(); }
          catch { notify('error', 'Failed to archive'); }
        },
      },
    ]);
  };

  const filtered = reminders.filter((r) => {
    if (filter === 'ALL') return true;
    if (filter === 'DUE') return r.isDue || r.isOverdue;
    if (filter === 'UPCOMING') return r.isUpcoming;
    return r.status === 'PAID';
  });
  const overdueCount = reminders.filter((r) => r.isOverdue).length;
  // Same predicate as canMarkPaid below, so the "Due" count and the Mark Paid button never disagree.
  const dueCount = reminders.filter((r) => r.isDue || r.isOverdue).length;
  const upcomingCount = reminders.filter((r) => r.isUpcoming).length;
  const paidCount = reminders.filter((r) => r.status === 'PAID').length;
  const chips: [Filter, string][] = [
    ['ALL', `All (${reminders.length})`], ['DUE', `Due (${dueCount})`], ['UPCOMING', `Upcoming (${upcomingCount})`], ['PAID', `Paid (${paidCount})`],
  ];

  if (loading && reminders.length === 0) return <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={120} />)}</View>;

  return (
    <View style={styles.gapLg}>
      <View style={styles.head}>
        {overdueCount > 0 ? (
          <View style={styles.overdue}><ThemedText style={styles.overdueText}>{`${overdueCount} overdue`}</ThemedText></View>
        ) : <View />}
        <Button onPress={() => setFormFor('new')}>+ Add Reminder</Button>
      </View>

      <View style={styles.chips}>
        {chips.map(([f, label]) => {
          const on = filter === f;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundElement, borderColor: on ? 'transparent' : theme.border }]}>
              <ThemedText style={[styles.chipText, { color: on ? '#ffffff' : theme.textMuted }]}>{label}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      {filtered.length === 0 ? <EmptyState message="No reminders in this view" /> : (
        <View style={styles.gap}>
          {filtered.map((r) => {
            // First match wins: an overdue row is also isDue, so isOverdue is checked first.
            const state: 'OVERDUE' | 'DUE' | 'UPCOMING' | 'PAID' = r.isOverdue ? 'OVERDUE' : r.isDue ? 'DUE' : r.isUpcoming ? 'UPCOMING' : 'PAID';
            const canMarkPaid = state === 'OVERDUE' || state === 'DUE';
            return (
              <AccCard key={r.id} accent={state === 'OVERDUE' ? '#ef4444' : undefined}>
                <View style={[styles.top, wide && styles.topWide]}>
                  <View style={styles.flex1}>
                    <View style={styles.titleRow}>
                      <ThemedText style={styles.name}>{r.payeeName}</ThemedText>
                      <Tag label={CATEGORY_LABELS[r.category] ?? r.category} color={theme.primary} />
                      {state === 'OVERDUE' ? <Tag label="Overdue" color="#ef4444" /> : null}
                      {state === 'DUE' ? <Tag label="Due" color="#b45309" /> : null}
                      {state === 'UPCOMING' ? <Tag label={`Upcoming — due ${fmtDate(r.dueDate)}`} color={theme.textMuted} /> : null}
                      {state === 'PAID' ? <Tag label="PAID" color={theme.success} /> : null}
                    </View>
                    <ThemedText themeColor="textMuted" style={styles.meta}>
                      {`Due: ${fmtDate(r.dueDate)} · ${RECURRENCE_LABELS[r.recurrence]}${r.bankAccount ? ` · ${r.bankAccount.nickname}` : ''}`}
                    </ThemedText>
                    {r.accountReference ? <ThemedText themeColor="textMuted" style={styles.meta}>{`Ref: ${r.accountReference}`}</ThemedText> : null}
                    {state === 'PAID' && r.datePaid ? (
                      <ThemedText style={[styles.meta, { color: theme.success }]}>{`Paid ${fmtDate(r.datePaid)}${r.paidBy ? ` by ${r.paidBy.name}` : ''}`}</ThemedText>
                    ) : null}
                    {state !== 'PAID' && r.datePaid ? (
                      <ThemedText themeColor="textMuted" style={styles.meta}>{`Last paid ${fmtDate(r.datePaid)}${r.paidBy ? ` by ${r.paidBy.name}` : ''}`}</ThemedText>
                    ) : null}
                  </View>
                  <View style={wide ? styles.right : undefined}>
                    {r.amount ? (
                      <Money value={`${fmt(r.amount)}${!r.isAmountFixed ? ' ≈' : ''}`} color={state === 'OVERDUE' ? '#ef4444' : theme.text} size={18} />
                    ) : (
                      <ThemedText themeColor="textMuted" style={styles.meta}>Variable amount</ThemedText>
                    )}
                  </View>
                </View>
                <View style={styles.actions}>
                  {canMarkPaid ? <Button size="sm" onPress={() => markPaid(r)}>Mark Paid</Button> : null}
                  <Button variant="outline" size="sm" onPress={() => setFormFor(r)}>Edit</Button>
                  <Button variant="danger" size="sm" onPress={() => archive(r)}>Archive</Button>
                </View>
              </AccCard>
            );
          })}
        </View>
      )}

      {formFor ? (
        <ReminderFormSheet
          reminder={formFor === 'new' ? null : formFor}
          accounts={accounts}
          notify={notify}
          onClose={() => setFormFor(null)}
          onSaved={() => { setFormFor(null); onChanged(); }}
        />
      ) : null}
    </View>
  );
}

function ReminderFormSheet({ reminder, accounts, onClose, onSaved, notify }: {
  reminder: PaymentReminderFull | null; accounts: BankAccount[]; onClose: () => void; onSaved: () => void; notify: Notify;
}) {
  const editing = !!reminder;
  const [form, setForm] = useState<ReminderForm>(() => reminder
    ? {
        payeeName: reminder.payeeName, category: reminder.category, amount: reminder.amount ? String(reminder.amount) : '',
        isAmountFixed: reminder.isAmountFixed, dueDate: reminder.dueDate.slice(0, 10), recurrence: reminder.recurrence,
        bankAccountId: reminder.bankAccountId ?? '', paymentMethod: reminder.paymentMethod ?? '',
        accountReference: reminder.accountReference ?? '', notes: reminder.notes ?? '',
      }
    : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof ReminderForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.payeeName || !form.dueDate) { setError('Payee name and due date are required'); return; }
    setSaving(true);
    setError('');
    try {
      await saveReminderRecord(editing ? reminder!.id : null, {
        payeeName: form.payeeName, category: form.category,
        amount: form.amount ? parseFloat(form.amount) : undefined,
        isAmountFixed: form.isAmountFixed,
        dueDate: form.dueDate, recurrence: form.recurrence,
        bankAccountId: form.bankAccountId || undefined,
        paymentMethod: form.paymentMethod || undefined,
        accountReference: form.accountReference || undefined,
        notes: form.notes || undefined,
      });
      notify('success', editing ? 'Reminder updated' : 'Reminder added');
      onSaved();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to save reminder'));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      fullHeight
      onClose={onClose}
      locked={saving}
      title={editing ? 'Edit Reminder' : 'Add Payment Reminder'}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }>
      {error ? <FormError message={error} /> : null}
      <FormGrid>
        <AField label="Payee Name *"><Input value={form.payeeName} onChangeText={set('payeeName')} /></AField>
        <AField label="Category">
          <Select value={form.category} onChange={set('category')} options={Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
        </AField>
        <AField label="Amount (₹, blank if variable)"><Input value={form.amount} onChangeText={set('amount')} keyboardType="decimal-pad" /></AField>
        <AField label="Amount Type">
          <Select
            value={form.isAmountFixed ? 'fixed' : 'variable'}
            onChange={(v) => setForm((f) => ({ ...f, isAmountFixed: v === 'fixed' }))}
            options={[{ value: 'fixed', label: 'Fixed' }, { value: 'variable', label: 'Variable (estimated)' }]}
          />
        </AField>
        <AField label="Due Date *"><DateField label="Due Date" value={form.dueDate} onChange={set('dueDate')} compact /></AField>
        <AField label="Recurrence">
          <Select value={form.recurrence} onChange={set('recurrence')} options={Object.entries(RECURRENCE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
        </AField>
        <AField label="Linked Bank Account">
          <Select
            placeholder="— None —"
            value={form.bankAccountId}
            onChange={set('bankAccountId')}
            options={[{ value: '', label: '— None —' }, ...accounts.map((a) => ({ value: a.id, label: `${a.nickname} (${a.bankName})` }))]}
          />
        </AField>
        <AField label="Account/Consumer No."><Input value={form.accountReference} onChangeText={set('accountReference')} placeholder="Policy no., consumer ID, etc." /></AField>
      </FormGrid>
      <AField label="Notes"><Input value={form.notes} onChangeText={set('notes')} multiline /></AField>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  gapLg: { gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  overdue: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  overdueText: { color: '#ef4444', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  top: { gap: 12 },
  topWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  right: { alignItems: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  meta: { fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
});
