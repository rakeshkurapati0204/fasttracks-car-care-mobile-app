import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createPayslip, downloadIssuedPayslipPdf, fetchPayslipPrefill, getErrorMessage } from '@/lib/api';
import type { EmployeeListItem } from '@/types/api';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ₹1,200: Indian grouping, no decimals.
export function fmt(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Select Employee ─────────────────────────────────────────────────────────
export function EmployeePickerSheet({
  candidates, onClose, onSelect,
}: { candidates: EmployeeListItem[]; onClose: () => void; onSelect: (e: EmployeeListItem) => void }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? candidates.filter((e) => e.name.toLowerCase().includes(q)) : candidates;
  }, [candidates, query]);

  return (
    <Sheet visible onClose={onClose} title="Select Employee">
      <Input value={query} onChangeText={setQuery} placeholder="Type a name…" autoFocus />
      {filtered.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.noMatch}>{`No employees match “${query}”.`}</ThemedText>
      ) : (
        filtered.map((e) => (
          <Pressable key={e.id} onPress={() => onSelect(e)} accessibilityRole="button" style={styles.pick}>
            <ThemedText style={styles.body}>{e.name}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>{e.role?.replace(/_/g, ' ')}</ThemedText>
          </Pressable>
        ))
      )}
    </Sheet>
  );
}

// ─── Payslip dialog ──────────────────────────────────────────────────────────
// Amounts are kept as text while typing and parsed on save / for the total.
type Row = { key: string; label: string; amount: string };
let rowSeq = 0;
const toRows = (items: { label: string; amount: number }[]): Row[] =>
  items.map((it) => ({ key: `r${++rowSeq}`, label: it.label, amount: it.amount ? String(it.amount) : '0' }));
const newRow = (): Row => ({ key: `r${++rowSeq}`, label: '', amount: '0' });
const num = (s: string) => parseFloat(s) || 0;

function LineItems({ title, rows, setRows, emptyText }: { title: string; rows: Row[]; setRows: (fn: (p: Row[]) => Row[]) => void; emptyText: string }) {
  const theme = useTheme();
  const update = (key: string, patch: Partial<Row>) => setRows((p) => p.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <View style={styles.gap6}>
      <View style={styles.sectionHead}>
        <ThemedText themeColor="textMuted" style={styles.sectionTitle}>{title.toUpperCase()}</ThemedText>
        <Pressable onPress={() => setRows((p) => [...p, newRow()])} accessibilityRole="button" hitSlop={8}>
          <ThemedText style={[styles.addRow, { color: theme.primary }]}>+ Add row</ThemedText>
        </Pressable>
      </View>
      {rows.map((r) => (
        <View key={r.key} style={styles.lineRow}>
          <View style={styles.flex1}><Input value={r.label} onChangeText={(t) => update(r.key, { label: t })} placeholder="Label" /></View>
          <View style={styles.amountBox}><Input value={r.amount} onChangeText={(t) => update(r.key, { amount: t })} keyboardType="decimal-pad" /></View>
          <Pressable onPress={() => setRows((p) => p.filter((x) => x.key !== r.key))} accessibilityRole="button" accessibilityLabel="Remove row" style={styles.remove}>
            <ThemedText style={{ color: theme.danger, fontSize: 18 }}>×</ThemedText>
          </Pressable>
        </View>
      ))}
      {rows.length === 0 ? <ThemedText themeColor="textMuted" style={styles.small}>{emptyText}</ThemedText> : null}
    </View>
  );
}

// Loads a suggestion from payroll data. If a payslip for this employee and
// month already exists it offers to view / re-print it instead of silently
// regenerating over it. The dashboard's print page is, here, the issued
// payslip's PDF opened in the share sheet.
export function PayslipSheet({ employee, month, year, onClose }: { employee: EmployeeListItem; month: number; year: number; onClose: () => void }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [existing, setExisting] = useState<{ id: string; generatedAt: string } | null>(null);
  const [mode, setMode] = useState<'choice' | 'edit'>('edit');

  const [employeeName, setEmployeeName] = useState(employee.name);
  const [employeeRole, setEmployeeRole] = useState(employee.designation || employee.role || '');
  const [earnings, setEarnings] = useState<Row[]>([]);
  const [deductions, setDeductions] = useState<Row[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchPayslipPrefill(employee.id, month, year)
      .then((data) => {
        if (cancelled) return;
        setEmployeeName(data.employeeName || employee.name);
        setEmployeeRole(data.employeeRole || employee.designation || employee.role || '');
        setEarnings(toRows(data.earnings));
        setDeductions(toRows(data.deductions));
        if (data.existing) { setExisting(data.existing); setMode('choice'); } else setMode('edit');
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(getErrorMessage(e, 'Failed to load payroll data for this employee/month.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employee.id, employee.name, employee.designation, employee.role, month, year]);

  const computedTotal = earnings.reduce((s, e) => s + num(e.amount), 0) - deductions.reduce((s, d) => s + num(d.amount), 0);

  // Saves the PDF to the cache and opens the share sheet.
  const sharePdf = async (id: string, name: string) => {
    const { uri } = await downloadIssuedPayslipPdf(id, name, month, year);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
  };

  const downloadExisting = async () => {
    if (!existing) return;
    setDownloadError('');
    setDownloading(true);
    try {
      await sharePdf(existing.id, employeeName);
    } catch (e: unknown) {
      setDownloadError(e instanceof Error && e.message ? e.message : getErrorMessage(e, 'Failed to download this payslip.'));
    } finally {
      setDownloading(false);
    }
  };

  const save = async (overwrite: boolean) => {
    setSaveError('');
    if ([...earnings, ...deductions].some((r) => !r.label.trim())) {
      setSaveError('Every earnings/deductions row needs a label.');
      return;
    }
    setSaving(true);
    try {
      const res = await createPayslip({
        userId: employee.id,
        month,
        year,
        employeeName: employeeName.trim(),
        employeeRole: employeeRole.trim(),
        earnings: earnings.map((r) => ({ label: r.label.trim(), amount: num(r.amount) })),
        deductions: deductions.map((r) => ({ label: r.label.trim(), amount: num(r.amount) })),
        notes: notes.trim() || undefined,
        overwrite,
      });
      try {
        await sharePdf(res.id, employeeName);
        onClose();
      } catch (e: unknown) {
        // Saved, but the PDF couldn't be opened: offer it again from the choice view.
        setExisting({ id: res.id, generatedAt: res.generatedAt });
        setDownloadError(`Payslip saved, but its PDF couldn't be opened. ${e instanceof Error ? e.message : ''}`.trim());
        setMode('choice');
      }
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string; existing?: { id: string; generatedAt: string } } } };
      if (err?.response?.status === 409 && err.response.data?.existing) {
        setExisting(err.response.data.existing);
        setMode('choice');
      } else {
        setSaveError(getErrorMessage(e, 'Failed to save payslip.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const footer =
    !loading && !loadError && mode === 'edit' ? (
      <>
        <Button variant="outline" onPress={onClose} style={styles.flex1}>Cancel</Button>
        <Button onPress={() => save(!!existing)} loading={saving} style={styles.flex1}>
          {saving ? 'Saving…' : existing ? 'Save & Print (overwrite issued payslip)' : 'Save & Print'}
        </Button>
      </>
    ) : undefined;

  return (
    <Sheet visible fullHeight onClose={onClose} locked={saving} title={`Payslip — ${employee.name} — ${MONTH_NAMES[month - 1]} ${year}`} footer={footer}>
      {loading ? (
        <ThemedText themeColor="textMuted" style={styles.center}>Loading payroll data…</ThemedText>
      ) : loadError ? (
        <ThemedText style={[styles.center, { color: theme.danger }]}>{loadError}</ThemedText>
      ) : mode === 'choice' ? (
        <View style={styles.gap12}>
          <ThemedText style={styles.body}>
            {'A payslip for '}
            <ThemedText style={styles.bold}>{employee.name}</ThemedText>
            {` — ${MONTH_NAMES[month - 1]} ${year} was already issued${existing ? ` on ${fmtDateTime(existing.generatedAt)}` : ''}.`}
          </ThemedText>
          {downloadError ? (
            <View style={styles.errBox}><ThemedText style={[styles.body, { color: theme.danger }]}>{downloadError}</ThemedText></View>
          ) : null}
          <View style={styles.choiceRow}>
            <Button onPress={downloadExisting} loading={downloading} style={styles.flex1}>View / Re-print issued payslip</Button>
            <Button variant="secondary" onPress={downloadExisting} disabled={downloading} style={styles.flex1}>{downloading ? 'Downloading…' : 'Download PDF'}</Button>
          </View>
          <Button variant="outline" onPress={() => setMode('edit')} fullWidth>Regenerate anyway</Button>
        </View>
      ) : (
        <>
          {saveError ? <View style={styles.errBox}><ThemedText style={[styles.body, { color: theme.danger }]}>{saveError}</ThemedText></View> : null}

          <View style={styles.twoCol}>
            <View style={styles.flex1}><Input label="Employee name" value={employeeName} onChangeText={setEmployeeName} /></View>
            <View style={styles.flex1}><Input label="Role / Designation" value={employeeRole} onChangeText={setEmployeeRole} /></View>
          </View>

          <LineItems title="Earnings" rows={earnings} setRows={setEarnings} emptyText="No earnings rows." />
          <LineItems title="Deductions" rows={deductions} setRows={setDeductions} emptyText="No deduction rows." />

          <View style={[styles.net, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText style={[styles.body, styles.semi]}>Net Pay</ThemedText>
            <ThemedText style={[styles.mono, styles.netAmt]}>{fmt(computedTotal)}</ThemedText>
          </View>
          <ThemedText themeColor="textMuted" style={styles.tiny}>Always earnings − deductions — edit a row above to change it.</ThemedText>

          <Input label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  bold: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  semi: { fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 16 },
  tiny: { fontSize: 11, lineHeight: 16 },
  mono: { fontFamily: Fonts?.mono },
  center: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 32 },
  noMatch: { fontSize: 12, lineHeight: 16, textAlign: 'center', paddingVertical: 24 },
  pick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, paddingHorizontal: 12, borderRadius: 8 },
  gap6: { gap: 6 },
  gap12: { gap: 12, paddingVertical: 8 },
  errBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(224,104,104,0.1)' },
  twoCol: { flexDirection: 'row', gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },
  addRow: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  amountBox: { width: 112 },
  remove: { width: 28, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  net: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderRadius: Radii.md },
  netAmt: { fontSize: 16, lineHeight: 24, fontWeight: '700' },
  choiceRow: { flexDirection: 'row', gap: 8 },
});
