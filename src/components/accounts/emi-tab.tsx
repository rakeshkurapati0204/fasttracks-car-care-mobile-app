import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { DateField } from '@/components/call-tracker/date-field';
import { Sheet } from '@/components/customers/sheet';
import { FormGrid } from '@/components/onboarding/form-parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteEMI, getErrorMessage, markEMIPaid, saveEmiRecord, uploadEmiDocument } from '@/lib/api';
import { pickFromCamera, validatePickedFile, type PickedFile } from '@/lib/upload';
import type { BankAccount, EMI } from '@/types/api';

import { computeEndDate, DOC_RULES, fmt, fmtDate } from './helpers';
import { AccCard, AField, DocumentsSheet, EmptyState, FormError, Money, Summary, Tag, type Notify } from './parts';

interface EMIForm {
  lenderName: string; loanPurpose: string; description: string; emiAmount: string; debitDay: string; bankAccountId: string;
  totalTenure: string; emisPaid: string; remainingBalance: string; interestRate: string; startDate: string;
  principalAmount: string; endDate: string; notes: string;
}
const EMPTY: EMIForm = {
  lenderName: '', loanPurpose: '', description: '', emiAmount: '', debitDay: '', bankAccountId: '',
  totalTenure: '', emisPaid: '0', remainingBalance: '', interestRate: '', startDate: '',
  principalAmount: '', endDate: '', notes: '',
};

// Days until the next debit day this month / next (the dashboard's own 31-day wrap).
function daysUntil(debitDay: number, today: Date) {
  return debitDay >= today.getDate() ? debitDay - today.getDate() : debitDay + 31 - today.getDate();
}

export function EMITrackerTab({ emis, accounts, loading, wide, notify, onChanged }: {
  emis: EMI[]; accounts: BankAccount[]; loading: boolean; wide: boolean; notify: Notify; onChanged: () => void;
}) {
  const theme = useTheme();
  const [formFor, setFormFor] = useState<EMI | 'new' | null>(null);
  const [docsFor, setDocsFor] = useState<EMI | null>(null);
  const [today] = useState(() => new Date());

  const markPaid = (e: EMI) => {
    Alert.alert('Mark EMI as paid?', `${e.lenderName} — ${fmt(e.emiAmount)}. This reduces the remaining balance and cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Paid', onPress: async () => {
          try { await markEMIPaid(e.id); notify('success', 'EMI marked as paid'); onChanged(); }
          catch { notify('error', 'Failed to mark paid'); }
        },
      },
    ]);
  };

  const del = (e: EMI) => {
    Alert.alert(`Delete EMI for "${e.lenderName}"?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { await deleteEMI(e.id); notify('success', 'EMI deleted'); onChanged(); }
          catch { notify('error', 'Failed to delete'); }
        },
      },
    ]);
  };

  const active = emis.filter((e) => e.status === 'ACTIVE');
  const monthly = active.reduce((s, e) => s + e.emiAmount, 0);
  const upcoming = [...active].sort((a, b) => daysUntil(a.debitDay, today) - daysUntil(b.debitDay, today));

  if (loading && emis.length === 0) return <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={150} />)}</View>;

  return (
    <View style={styles.gapLg}>
      <Summary
        caption={`Monthly EMI outflow (${active.length} active)`}
        value={fmt(monthly)}
        color={theme.danger}
        action={<Button onPress={() => setFormFor('new')}>+ Add EMI</Button>}
      />

      {upcoming.length > 0 ? (
        <View style={styles.upBox}>
          <ThemedText style={styles.upTitle}>UPCOMING DEBITS THIS MONTH</ThemedText>
          {upcoming.slice(0, 5).map((e) => {
            const d = daysUntil(e.debitDay, today);
            return (
              <View key={e.id} style={styles.upRow}>
                <ThemedText style={[styles.body, styles.flex1]}>{`${e.lenderName} — ${e.loanPurpose}`}</ThemedText>
                <View style={styles.upRight}>
                  <ThemedText themeColor="textMuted" style={styles.body}>{`${d === 0 ? 'Today' : `${d}d`} (day ${e.debitDay})`}</ThemedText>
                  <Money value={fmt(e.emiAmount)} color={theme.danger} size={14} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {emis.length === 0 ? <EmptyState message="No EMIs added yet" /> : (
        <View style={styles.gap}>
          {emis.map((e) => {
            const progress = e.totalTenure > 0 ? (e.emisPaid / e.totalTenure) * 100 : 0;
            const statusColor = e.status === 'ACTIVE' ? theme.primary : e.status === 'COMPLETED' ? theme.success : theme.textMuted;
            return (
              <AccCard key={e.id}>
                <View style={[styles.top, wide && styles.topWide]}>
                  <View style={styles.flex1}>
                    <View style={styles.titleRow}>
                      <ThemedText style={styles.name}>{e.lenderName}</ThemedText>
                      <Tag label={e.status} color={statusColor} />
                    </View>
                    <ThemedText themeColor="textMuted" style={styles.meta}>{`${e.loanPurpose}${e.description ? ` · ${e.description}` : ''}`}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.meta}>
                      {`Debit: day ${e.debitDay} of each month${e.bankAccount ? ` · ${e.bankAccount.nickname} (${e.bankAccount.bankName})` : ''}${e.interestRate ? ` · ${e.interestRate}% p.a.` : ''}`}
                    </ThemedText>
                    {e.principalAmount != null || e.startDate || e.endDate ? (
                      <ThemedText themeColor="textMuted" style={styles.meta}>
                        {`${e.principalAmount != null ? `Loan taken: ${fmt(e.principalAmount)}` : ''}${e.principalAmount != null && (e.startDate || e.endDate) ? ' · ' : ''}${e.startDate ? `From ${fmtDate(e.startDate)}` : ''}${e.startDate && e.endDate ? ' → ' : ''}${e.endDate ? `${e.startDate ? '' : 'Ends '}${fmtDate(e.endDate)}` : ''}`}
                      </ThemedText>
                    ) : null}
                    <View style={styles.progWrap}>
                      <View style={styles.progHead}>
                        <ThemedText themeColor="textMuted" style={styles.tiny}>{`${e.emisPaid}/${e.totalTenure} EMIs paid`}</ThemedText>
                        <ThemedText themeColor="textMuted" style={styles.tiny}>{`${Math.round(progress)}%`}</ThemedText>
                      </View>
                      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                        <View style={[styles.fill, { width: `${Math.min(100, progress)}%`, backgroundColor: progress >= 100 ? theme.success : theme.primary }]} />
                      </View>
                    </View>
                  </View>
                  <View style={wide ? styles.right : undefined}>
                    <Money value={fmt(e.emiAmount)} color={theme.danger} size={18} suffix="/mo" />
                    {/* remainingBalance is hand-maintained, so it is only meaningful for an ACTIVE loan. */}
                    {e.status === 'ACTIVE' ? <ThemedText themeColor="textMuted" style={styles.meta}>{`Remaining: ${fmt(e.remainingBalance)}`}</ThemedText> : null}
                  </View>
                </View>
                <View style={styles.actions}>
                  {e.status === 'ACTIVE' ? <Button size="sm" onPress={() => markPaid(e)}>Mark Paid</Button> : null}
                  {e.status === 'ACTIVE' ? <Button variant="outline" size="sm" onPress={() => setFormFor(e)}>Edit</Button> : null}
                  <Button variant="outline" size="sm" onPress={() => setDocsFor(e)}>Documents</Button>
                  {e.status === 'ACTIVE' ? <Button variant="danger" size="sm" onPress={() => del(e)}>Delete</Button> : null}
                </View>
              </AccCard>
            );
          })}
        </View>
      )}

      {formFor ? (
        <EMIFormSheet
          emi={formFor === 'new' ? null : formFor}
          accounts={accounts}
          notify={notify}
          onClose={() => setFormFor(null)}
          onSaved={() => { setFormFor(null); onChanged(); }}
        />
      ) : null}
      {docsFor ? <DocumentsSheet kind="emi" ownerId={docsFor.id} title={docsFor.lenderName} onClose={() => setDocsFor(null)} notify={notify} /> : null}
    </View>
  );
}

function EMIFormSheet({ emi, accounts, onClose, onSaved, notify }: { emi: EMI | null; accounts: BankAccount[]; onClose: () => void; onSaved: () => void; notify: Notify }) {
  const editing = !!emi;
  const [form, setForm] = useState<EMIForm>(() => emi
    ? {
        lenderName: emi.lenderName, loanPurpose: emi.loanPurpose, description: emi.description ?? '', emiAmount: String(emi.emiAmount),
        debitDay: String(emi.debitDay), bankAccountId: emi.bankAccountId ?? '', totalTenure: String(emi.totalTenure), emisPaid: String(emi.emisPaid),
        remainingBalance: String(emi.remainingBalance), interestRate: emi.interestRate ? String(emi.interestRate) : '',
        startDate: emi.startDate ? emi.startDate.slice(0, 10) : '', principalAmount: emi.principalAmount != null ? String(emi.principalAmount) : '',
        endDate: emi.endDate ? emi.endDate.slice(0, 10) : '', notes: emi.notes ?? '',
      }
    : EMPTY);
  const [sanction, setSanction] = useState<PickedFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof EMIForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Keep the end date in step with start date / tenure, but never overwrite a date the user set on purpose.
  const syncEnd = (next: EMIForm, prev: EMIForm): EMIForm => {
    const previouslyDerived = computeEndDate(prev.startDate, prev.totalTenure);
    if (prev.endDate !== '' && prev.endDate !== previouslyDerived) return next;
    const derived = computeEndDate(next.startDate, next.totalTenure);
    return derived ? { ...next, endDate: derived } : next;
  };

  const pickSanction = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: DOC_RULES.allowedMimeTypes, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    chooseSanction({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size });
  };
  const chooseSanction = (f: PickedFile) => {
    const invalid = validatePickedFile(f, DOC_RULES);
    if (invalid) { setError(invalid); return; }
    setError('');
    setSanction(f);
  };

  const save = async () => {
    if (!form.lenderName || !form.emiAmount || !form.debitDay || !form.totalTenure || !form.remainingBalance) {
      setError('Fill required fields');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        lenderName: form.lenderName, loanPurpose: form.loanPurpose,
        description: form.description || undefined,
        emiAmount: parseFloat(form.emiAmount),
        debitDay: parseInt(form.debitDay, 10),
        bankAccountId: form.bankAccountId || undefined,
        totalTenure: parseInt(form.totalTenure, 10),
        emisPaid: parseInt(form.emisPaid, 10) || 0,
        remainingBalance: parseFloat(form.remainingBalance),
        interestRate: form.interestRate ? parseFloat(form.interestRate) : undefined,
        startDate: form.startDate || undefined,
        // null (not undefined) when cleared on edit, so a value can be removed.
        principalAmount: form.principalAmount ? parseFloat(form.principalAmount) : (editing ? null : undefined),
        endDate: form.endDate || (editing ? null : undefined),
        notes: form.notes || undefined,
      };
      if (editing) {
        await saveEmiRecord(emi!.id, payload);
        notify('success', 'EMI updated');
      } else {
        const created = await saveEmiRecord(null, payload);
        if (sanction && created?.id) {
          try {
            await uploadEmiDocument(created.id, sanction, 'Sanction Letter', { onProgress: () => {}, signal: new AbortController().signal });
            notify('success', 'EMI added — sanction letter attached');
          } catch {
            notify('error', 'EMI added, but the sanction letter failed to upload — add it later from Documents');
          }
        } else {
          notify('warning', 'EMI added — no sanction letter attached yet; you can add one later from Documents');
        }
      }
      onSaved();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to save EMI'));
      setSaving(false);
    }
  };

  const derivedNow = computeEndDate(form.startDate, form.totalTenure);

  return (
    <Sheet
      visible
      fullHeight
      onClose={onClose}
      locked={saving}
      title={editing ? 'Edit EMI' : 'Add EMI'}
      footer={
        <>
          <Button variant="ghost" onPress={onClose} disabled={saving} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }>
      {error ? <FormError message={error} /> : null}
      <FormGrid>
        <AField label="Lender Name *"><Input value={form.lenderName} onChangeText={set('lenderName')} placeholder="e.g. HDFC Bank" /></AField>
        <AField label="Loan Purpose *"><Input value={form.loanPurpose} onChangeText={set('loanPurpose')} placeholder="e.g. Vehicle Loan" /></AField>
        <AField label="Loan Amount Taken (₹)"><Input value={form.principalAmount} onChangeText={set('principalAmount')} placeholder="Original amount borrowed" keyboardType="decimal-pad" /></AField>
        <AField label="EMI Amount (₹) *"><Input value={form.emiAmount} onChangeText={set('emiAmount')} keyboardType="decimal-pad" /></AField>
        <AField label="Debit Day (1–31) *"><Input value={form.debitDay} onChangeText={set('debitDay')} keyboardType="number-pad" maxLength={2} /></AField>
        <AField label="Total Tenure (months) *">
          <Input value={form.totalTenure} onChangeText={(v) => setForm((f) => syncEnd({ ...f, totalTenure: v }, f))} keyboardType="number-pad" />
        </AField>
        <AField label="EMIs Paid So Far"><Input value={form.emisPaid} onChangeText={set('emisPaid')} keyboardType="number-pad" /></AField>
        <AField label="Remaining Balance (₹) *"><Input value={form.remainingBalance} onChangeText={set('remainingBalance')} keyboardType="decimal-pad" /></AField>
        <AField label="Interest Rate (% p.a.)"><Input value={form.interestRate} onChangeText={set('interestRate')} keyboardType="decimal-pad" /></AField>
        <AField label="Linked Bank Account">
          <Select
            placeholder="— None —"
            value={form.bankAccountId}
            onChange={set('bankAccountId')}
            options={[{ value: '', label: '— None —' }, ...accounts.map((a) => ({ value: a.id, label: `${a.nickname} (${a.bankName})` }))]}
          />
        </AField>
        <AField label="Start Date">
          <DateField label="Start Date" value={form.startDate} onChange={(v) => setForm((f) => syncEnd({ ...f, startDate: v }, f))} compact />
        </AField>
        <AField
          label="End Date"
          hint={form.endDate && form.endDate === derivedNow ? `Filled from start date + ${form.totalTenure} months — edit if the actual date differs.` : undefined}>
          <DateField label="End Date" value={form.endDate} onChange={set('endDate')} compact />
        </AField>
      </FormGrid>
      <AField label="Notes"><Input value={form.notes} onChangeText={set('notes')} multiline /></AField>
      {!editing ? (
        <AField label="Sanction Letter (recommended)" hint="Optional — you can attach it now or add it later from this loan's Documents section.">
          <View style={styles.row}>
            <Button variant="outline" size="sm" onPress={pickSanction} disabled={saving} style={styles.flex1}>{sanction ? sanction.name : 'Choose file'}</Button>
            <Button variant="outline" size="sm" disabled={saving} onPress={async () => { const f = await pickFromCamera(); if (f) chooseSanction(f); }}>Camera</Button>
          </View>
        </AField>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 12 },
  gapLg: { gap: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  top: { gap: 12 },
  topWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  right: { alignItems: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  meta: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 20 },
  tiny: { fontSize: 10, lineHeight: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  upBox: { padding: 16, borderRadius: 12, gap: 8, backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)' },
  upTitle: { color: '#b45309', fontSize: 11, lineHeight: 15, fontFamily: FontWeights.semiBold, letterSpacing: 0.5 },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  upRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progWrap: { marginTop: 8, gap: 4 },
  progHead: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
