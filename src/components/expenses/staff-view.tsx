import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type MentionableUser } from '@/types/api';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addExpenseAttachment, bulkCreateExpenses, extractReceiptFields, extractStatementTransactions, fetchExpensesAdmin,
  fetchMentionableUsers, getErrorMessage, submitExpenseTagged,
} from '@/lib/api';
import { pickFromCamera, type PickedFile } from '@/lib/upload';

import {
  BILL_EXTS, BILL_PICKER_TYPES, BILL_REQUIRED_ABOVE, MAX_BILLS, STATEMENT_EXTS, STATEMENT_PICKER_TYPES,
  canExtract, checkFile, fmt, fmtDate, inferMime, todayStr,
} from './helpers';
import { BillThumb, CategoryBadge, ExpenseThread, MentionInput, Money, Panel, SmallBtn, StatusBadge } from './parts';

interface BulkRow { clientId: string; date: string; amount: string; description: string; category: string; duplicateWarning: boolean }

const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }));
let rowSeq = 0;
const newId = () => `row-${Date.now()}-${rowSeq++}`;

function Label({ children }: { children: string }) {
  return <ThemedText themeColor="textMuted" style={styles.label}>{children}</ThemedText>;
}

// Dashboard StaffExpensesView. `embedded` = the same view inside the admin's "Add Expense" sheet.
export function StaffExpensesView({ wide, embedded, currentUserId }: { wide: boolean; embedded?: boolean; currentUserId: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [mentionUsers, setMentionUsers] = useState<MentionableUser[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>('MISC');
  const [description, setDescription] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [date, setDate] = useState(() => todayStr());
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [extraction, setExtraction] = useState<'idle' | 'loading' | 'applied' | 'none'>('idle');
  const file = files[0] ?? null;

  const [entryMode, setEntryMode] = useState<'bulk' | 'single'>('bulk');
  const [statementFile, setStatementFile] = useState<PickedFile | null>(null);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const [bulkSource, setBulkSource] = useState<'ai' | 'spreadsheet' | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchExpensesAdmin({ limit: 100 });
      setExpenses(res.expenses ?? []);
      setLoadError('');
    } catch {
      setLoadError('Failed to load your expenses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
    fetchMentionableUsers().then(setMentionUsers).catch(() => {});
  }, [load]);

  const amountNum = parseFloat(amount) || 0;
  const billRequired = amountNum > BILL_REQUIRED_ABOVE;
  const blocked = billRequired && !file;

  const reset = () => {
    setAmount(''); setCategory('MISC'); setDescription(''); setMentions([]); setDate(todayStr()); setFiles([]); setExtraction('idle');
  };

  // Suggestion only — never blocks picking a file or submitting.
  const readBill = async (f: PickedFile) => {
    if (!canExtract(f.name, f.mimeType)) { setExtraction('idle'); return; }
    setExtraction('loading');
    try {
      const r = await extractReceiptFields(f);
      if (r.amount != null) setAmount(String(r.amount));
      if (r.date) setDate(r.date);
      setExtraction(r.amount != null || r.date ? 'applied' : 'none');
    } catch {
      setExtraction('none');
    }
  };

  const addFiles = (picked: PickedFile[]) => {
    const ok: PickedFile[] = [];
    for (const f of picked) {
      const bad = checkFile(f.name, f.size, BILL_EXTS, 'Only photos, PDF, Word and Excel files are allowed.');
      if (bad) setToast({ type: 'error', msg: bad }); else ok.push(f);
    }
    if (!ok.length) return;
    const isFirst = files.length === 0;
    if (files.length + ok.length > MAX_BILLS) setToast({ type: 'error', msg: `Up to ${MAX_BILLS} bills per expense` });
    setFiles([...files, ...ok].slice(0, MAX_BILLS));
    if (isFirst) void readBill(ok[0]);
  };

  const pickBills = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: BILL_PICKER_TYPES, multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    addFiles(r.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: inferMime(a.name, a.mimeType), size: a.size })));
  };
  const pickBillCamera = async () => { const f = await pickFromCamera(); if (f) addFiles([f]); };
  const removeFile = (i: number) => {
    setFiles(files.filter((_, j) => j !== i));
    if (i === 0) setExtraction('idle');
  };

  const submit = async () => {
    setError('');
    if (!amountNum || !description.trim()) { setError('Amount and description are required.'); return; }
    if (blocked) { setError(`A bill is required for expenses over ${fmt(BILL_REQUIRED_ABOVE)}.`); return; }
    setSubmitting(true);
    try {
      const created = await submitExpenseTagged({ amount: amountNum, category: category as ExpenseCategory, description: description.trim(), date, mentions }, file ?? undefined);
      // The remaining bills go onto the expense just created, one by one.
      const failed: string[] = [];
      for (const extra of files.slice(1)) {
        try { await addExpenseAttachment(created.id, extra, { onProgress: () => {}, signal: new AbortController().signal }); }
        catch { failed.push(extra.name); }
      }
      if (failed.length) setToast({ type: 'error', msg: `Expense saved, but these bills didn't upload: ${failed.join(', ')}` });
      else if (files.length > 1) setToast({ type: 'success', msg: `Expense saved with ${files.length} bills` });
      reset();
      await load();
    } catch (e) {
      setError(getErrorMessage(e, 'Failed to submit expense.'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Bulk statement ──
  const resetBulk = () => { setStatementFile(null); setBulkRows([]); setBulkError(''); setBulkNote(null); setBulkSource(null); };

  const readStatement = async (f: PickedFile) => {
    const bad = checkFile(f.name, f.size, STATEMENT_EXTS, 'Only images, PDF, .xlsx, .xls, and .csv are allowed.');
    if (bad) { setBulkError(bad); return; }
    setStatementFile(f);
    setBulkRows([]);
    setBulkError('');
    setBulkNote(null);
    setBulkLoading(true);
    try {
      const { transactions, unparsedNote, source } = await extractStatementTransactions(f);
      setBulkSource(source);
      setBulkNote(unparsedNote);
      if (transactions.length === 0) { setBulkError(unparsedNote ?? "Couldn't find any transactions in this file."); return; }
      setBulkRows(transactions.map((t) => ({
        clientId: newId(), date: t.date ?? todayStr(), amount: t.amount != null ? String(t.amount) : '',
        description: '', category: 'MISC', duplicateWarning: !!t.duplicateWarning,
      })));
    } catch (e) {
      setBulkError(getErrorMessage(e, "Couldn't read this file. Try Single entry instead."));
    } finally {
      setBulkLoading(false);
    }
  };
  const pickStatement = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: STATEMENT_PICKER_TYPES, copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    await readStatement({ uri: a.uri, name: a.name, mimeType: inferMime(a.name, a.mimeType), size: a.size });
  };
  const pickStatementCamera = async () => { const f = await pickFromCamera(); if (f) await readStatement(f); };

  const updateRow = (id: string, field: keyof BulkRow, value: string) => setBulkRows((rows) => rows.map((r) => (r.clientId === id ? { ...r, [field]: value } : r)));
  const removeRow = (id: string) => setBulkRows((rows) => rows.filter((r) => r.clientId !== id));
  const addRow = () => setBulkRows((rows) => [...rows, { clientId: newId(), date: todayStr(), amount: '', description: '', category: 'MISC', duplicateWarning: false }]);

  const bulkTotal = bulkRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const bulkInvalid = bulkRows.some((r) => !r.date || !(parseFloat(r.amount) > 0) || !r.description.trim());
  const bulkSaveDisabled = bulkSaving || bulkRows.length === 0 || bulkInvalid || !statementFile;

  const saveBulk = async () => {
    setBulkError('');
    if (!statementFile) { setBulkError('The statement file is required.'); return; }
    if (bulkRows.length === 0) { setBulkError('Add at least one transaction.'); return; }
    if (bulkInvalid) { setBulkError('Every row needs a date, a positive amount, and a description.'); return; }
    setBulkSaving(true);
    try {
      await bulkCreateExpenses(
        statementFile,
        bulkRows.map((r) => ({ date: r.date, amount: parseFloat(r.amount), category: r.category as ExpenseCategory, description: r.description.trim() })),
        { onProgress: () => {}, signal: new AbortController().signal },
      );
      resetBulk();
      await load();
    } catch (e) {
      setBulkError(getErrorMessage(e, 'Failed to save expenses.'));
    } finally {
      setBulkSaving(false);
    }
  };

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const toggle = (
    <View style={[styles.seg, { backgroundColor: theme.surface }]}>
      {([['bulk', '📄 Bulk statement'], ['single', 'Single entry']] as const).map(([k, label]) => (
        <Pressable
          key={k}
          onPress={() => setEntryMode(k)}
          accessibilityRole="button"
          accessibilityState={{ selected: entryMode === k }}
          style={[styles.segBtn, entryMode === k && { backgroundColor: theme.primary }]}>
          <ThemedText style={[styles.segText, { color: entryMode === k ? '#fff' : theme.textMuted }]}>{label}</ThemedText>
        </Pressable>
      ))}
    </View>
  );

  const errBox = (msg: string, action?: ReactNode) => (
    <View style={[styles.errBox, { backgroundColor: 'rgba(224,104,104,0.1)' }]}>
      <ThemedText style={[styles.small, { color: theme.danger }]}>{msg}{action ? ' ' : ''}{action}</ThemedText>
    </View>
  );

  const bulkCard = (
    <Panel>
      <View style={styles.gap}>
        <ThemedText themeColor="textMuted" style={styles.small}>
          Upload a bank/card statement (PDF, photo, or .xlsx/.xls/.csv export) — every transaction on it is pulled into the table below for you to review, edit, or remove before anything is saved.
        </ThemedText>
        {bulkError ? errBox(bulkError, <ThemedText onPress={() => setEntryMode('single')} style={[styles.small, styles.underline, { color: theme.danger }]}>Switch to Single entry</ThemedText>) : null}
        <View style={styles.row}>
          <SmallBtn label={`📎 ${statementFile ? 'Change statement' : 'Upload statement'}`} onPress={pickStatement} disabled={bulkLoading} />
          <SmallBtn label="📷 Take photo" onPress={pickStatementCamera} disabled={bulkLoading} />
          {statementFile ? <ThemedText numberOfLines={1} style={[styles.small, styles.flex1]}>{statementFile.name}</ThemedText> : null}
          {bulkLoading ? <ThemedText themeColor="textMuted" style={styles.small}>{bulkSource === null ? 'Reading statement…' : 'Reading…'}</ThemedText> : null}
        </View>
        {bulkNote && bulkRows.length > 0 ? (
          <View style={[styles.errBox, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
            <ThemedText style={[styles.small, { color: theme.warning }]}>⚠️ {bulkNote}</ThemedText>
          </View>
        ) : null}
        {bulkRows.length > 0 ? (
          <>
            <View style={styles.gap}>
              {bulkRows.map((row) => (
                <View key={row.clientId} style={[styles.bulkRow, { borderColor: theme.border }, wide && styles.bulkRowWide]}>
                  <View style={wide ? styles.cDate : undefined}>
                    <DateField label="Date" value={row.date} onChange={(v) => updateRow(row.clientId, 'date', v)} compact />
                  </View>
                  <View style={wide ? styles.cAmt : undefined}>
                    <Input value={row.amount} onChangeText={(v) => updateRow(row.clientId, 'amount', v)} keyboardType="decimal-pad" placeholder="Amount (₹)" />
                  </View>
                  <View style={[wide && styles.flex1, styles.descWrap]}>
                    <View style={styles.flex1}><Input value={row.description} onChangeText={(v) => updateRow(row.clientId, 'description', v)} placeholder="Description" /></View>
                    {row.duplicateWarning ? <ThemedText accessibilityLabel="Looks similar to an expense already on file — check before saving.">⚠️</ThemedText> : null}
                  </View>
                  <View style={wide ? styles.cCat : undefined}>
                    <Select options={CATEGORY_OPTIONS} value={row.category} onChange={(v) => updateRow(row.clientId, 'category', v)} />
                  </View>
                  <Pressable onPress={() => removeRow(row.clientId)} accessibilityRole="button" accessibilityLabel="Remove row" hitSlop={8} style={styles.removeBtn}>
                    <Ionicons name="close" size={20} color={theme.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.between}>
              <Pressable onPress={addRow} accessibilityRole="button"><ThemedText style={[styles.small, styles.medium, { color: theme.primary }]}>+ Add row</ThemedText></Pressable>
              <ThemedText style={[styles.small, styles.medium]}>{bulkRows.length} transaction{bulkRows.length === 1 ? '' : 's'} · {fmt(bulkTotal)}</ThemedText>
            </View>
            <Button fullWidth onPress={saveBulk} disabled={bulkSaveDisabled} loading={bulkSaving}>
              {`Save all ${bulkRows.length} expense${bulkRows.length === 1 ? '' : 's'}`}
            </Button>
          </>
        ) : null}
      </View>
    </Panel>
  );

  const singleCard = (
    <Panel>
      <View style={styles.gap}>
        {error ? errBox(error) : null}
        <View style={[styles.grid2, !wide && styles.col]}>
          <View style={wide ? styles.flex1 : undefined}>
            <Input label="Amount (₹)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
          </View>
          <View style={wide ? styles.flex1 : undefined}>
            <Select label="Category" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
          </View>
        </View>
        <DateField label="Date spent" value={date} onChange={(v) => v && setDate(v)} />
        <View>
          <Label>What was it for</Label>
          <MentionInput value={description} onChange={(v, m) => { setDescription(v); setMentions(m); }} users={mentionUsers} placeholder="e.g. Rapido to the parts shop — use @ to tag someone" multiline />
        </View>
        <View style={styles.row}>
          <SmallBtn label={`📷 ${files.length ? 'Add another photo' : 'Take photo'}`} onPress={pickBillCamera} disabled={files.length >= MAX_BILLS} />
          <SmallBtn label={`📎 ${files.length ? 'Add more files' : 'Gallery / Files / Drive'}`} onPress={pickBills} disabled={files.length >= MAX_BILLS} />
          {files.map((f, i) => (
            <View key={`${f.name}-${i}`} style={[styles.fileChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText numberOfLines={1} style={[styles.small, styles.fileName]}>{f.name}</ThemedText>
              <Pressable onPress={() => removeFile(i)} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} hitSlop={8}>
                <ThemedText style={{ color: theme.danger }}>×</ThemedText>
              </Pressable>
            </View>
          ))}
          {blocked ? <ThemedText style={[styles.small, styles.medium, { color: theme.danger }]}>Bill required over {fmt(BILL_REQUIRED_ABOVE)}</ThemedText> : null}
        </View>
        {extraction === 'loading' ? <ThemedText themeColor="textMuted" style={styles.small}>Reading document…</ThemedText> : null}
        {extraction === 'applied' ? <ThemedText style={[styles.small, styles.medium, { color: theme.primary }]}>✨ Auto-filled from document — please verify before submitting</ThemedText> : null}
        <Button fullWidth onPress={submit} disabled={blocked} loading={submitting}>Submit expense</Button>
      </View>
    </Panel>
  );

  const head = (
    <View style={styles.sections}>
      <View>
        <ThemedText style={styles.h1}>Expenses</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.sub}>Log what you spent. Bills are required over {fmt(BILL_REQUIRED_ABOVE)}.</ThemedText>
      </View>
      {toast ? (toast.type === 'success' ? <SuccessBanner message={toast.msg} /> : <ErrorBanner message={toast.msg} />) : null}
      {loadError ? <ErrorBanner message={loadError} onRetry={load} /> : null}
      <View style={styles.alignStart}>{toggle}</View>
      {entryMode === 'bulk' ? bulkCard : singleCard}
      <ThemedText themeColor="textMuted" style={styles.listTitle}>YOUR EXPENSES</ThemedText>
      {loading ? (
        <Skeleton height={96} />
      ) : expenses.length === 0 ? (
        <Panel pad={24}>
          <View style={styles.emptyBox}>
            <Ionicons name="receipt-outline" size={20} color={theme.textMuted} />
            <ThemedText themeColor="textMuted" style={styles.small}>Nothing logged yet.</ThemedText>
          </View>
        </Panel>
      ) : null}
    </View>
  );

  const card = (e: Expense) => (
    <Panel>
      <View style={styles.gapSm}>
        <View style={styles.badges}>
          <Money value={fmt(e.amount)} />
          <CategoryBadge category={e.category} />
          <StatusBadge status={e.status} />
        </View>
        <ThemedText style={styles.desc}>{e.description}</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.tiny}>{fmtDate(e.date ?? e.createdAt)}</ThemedText>
        {(e.attachments?.length ?? 0) > 0 ? (
          <View style={styles.thumbs}>{e.attachments!.map((a) => <BillThumb key={a.id} attachment={a} onError={(m) => setToast({ type: 'error', msg: m })} />)}</View>
        ) : null}
        {e.reviewNote ? (
          <View style={[styles.note, { backgroundColor: theme.surface }]}>
            <ThemedText themeColor="textMuted" style={styles.small}>
              <ThemedText style={[styles.small, styles.bold]}>{e.reviewedBy?.name ?? 'Reviewer'}:</ThemedText> {e.reviewNote}
            </ThemedText>
          </View>
        ) : null}
        <ExpenseThread expense={e} currentUserId={currentUserId} mentionUsers={mentionUsers} onChanged={load} />
      </View>
    </Panel>
  );

  if (embedded) {
    return (
      <View style={styles.sections}>
        {head}
        {expenses.map((e) => <View key={e.id}>{card(e)}</View>)}
      </View>
    );
  }

  return (
    <FlatList
      data={loading ? [] : expenses}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => card(item)}
      ListHeaderComponent={head}
      ItemSeparatorComponent={Gap}
      contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={8}
    />
  );
}

function Gap() { return <View style={{ height: 8 }} />; }

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 768, alignSelf: 'center' },
  sections: { gap: 24 },
  gap: { gap: 12 },
  gapSm: { gap: 8 },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 11, lineHeight: 15 },
  medium: { fontFamily: FontWeights.medium },
  bold: { fontFamily: FontWeights.bold },
  underline: { textDecorationLine: 'underline' },
  alignStart: { alignItems: 'flex-start' },
  seg: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  segText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  errBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  grid2: { flexDirection: 'row', gap: 12 },
  col: { flexDirection: 'column' },
  bulkRow: { gap: 8, paddingTop: 12, borderTopWidth: 1 },
  bulkRowWide: { flexDirection: 'row', alignItems: 'flex-start' },
  cDate: { width: 130 },
  cAmt: { width: 100 },
  cCat: { width: 130 },
  descWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 140 },
  removeBtn: { alignSelf: 'flex-end', padding: 6 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: Radii.sm, borderWidth: 1 },
  fileName: { maxWidth: 160 },
  listTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  emptyBox: { alignItems: 'center', gap: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  desc: { fontSize: 14, lineHeight: 20 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: Radii.sm },
});
