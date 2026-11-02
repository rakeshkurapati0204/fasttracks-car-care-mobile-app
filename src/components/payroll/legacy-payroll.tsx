import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/home/glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  clearPayrollOverride,
  createPayrollDisbursement,
  fetchCompanyPayroll,
  fetchPayrollDisbursement,
  fetchPayrollExportDataUri,
  fetchSalaryHistory,
  fetchSalaryPaymentsAllForMonth,
  getErrorMessage,
  overrideAttendance,
  setEmployeeSalary,
  setPayrollOverride,
  undoSalaryPayment,
  updateEmployee,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CompanyPayrollSummary, PayrollAttendanceDetail, PayrollDisbursementRow, PayrollResult, SalaryHistoryEntry } from '@/types/api';

// GET /all: SALARY_ADMIN_ROLES=[OWNER,STORE_MANAGER,CASHIER] (backend/src/
// routes/payroll.ts — non-admin roles are forced to their own userId and get
// a self-only view of the same shape, so this screen is gated to the admin
// roles entirely rather than trying to render a self-only fallback; use My
// Salary for that). Export, override and disbursement all require the same
// SALARY_ADMIN_ROLES, via requirePayrollAccess middleware or inline checks
// (verified 2026-09-19).
const SALARY_ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'CASHIER'];
const PAYMENT_MODES: { value: string; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'Cheque' },
];

function formatCurrency(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const LOAN_MODE_LABELS: Record<string, string> = {
  MONTHLY_N: 'Monthly plan',
  CUSTOM: 'Custom plan',
  LUMP_NEXT_MONTH: 'Lump sum',
  TBD: 'TBD',
};

// Payment window: last 5 days of current month + first 5 days of next month
// (mirrors dashboard's getPaymentWindow/formatPaymentWindow exactly).
function getPaymentWindow(month: number, year: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const windowStart = new Date(year, month - 1, lastDay - 4);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const windowEnd = new Date(nextYear, nextMonth - 1, 5, 23, 59, 59);
  return { windowStart, windowEnd };
}
function formatPaymentWindow(month: number, year: number) {
  const { windowStart, windowEnd } = getPaymentWindow(month, year);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${windowStart.toLocaleDateString('en-IN', opts)} – ${windowEnd.toLocaleDateString('en-IN', opts)}`;
}
function isWithinPaymentWindow(date: Date, month: number, year: number) {
  const { windowStart, windowEnd } = getPaymentWindow(month, year);
  return date >= windowStart && date <= windowEnd;
}

function ModalShell({
  visible, title, onClose, children, theme,
}: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode; theme: ReturnType<typeof useTheme> }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ThemedView style={styles.flex1}>
        <View style={[styles.sheetHeader, { borderColor: theme.border }]}>
          <ThemedText type="subtitle" style={styles.flex1}>{title}</ThemedText>
          <Pressable onPress={onClose} hitSlop={8}><ThemedText type="subtitle">✕</ThemedText></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetScroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </ThemedView>
    </Modal>
  );
}

// Initial salary setup for an unconfigured employee — distinct from
// EditSalaryModal below (already-configured, dedicated staff-config
// endpoint with history). Matches dashboard's SetSalaryModal exactly.
function SetSalaryModal({
  employee, onClose, onSaved, theme,
}: { employee: PayrollResult; onClose: () => void; onSaved: () => void; theme: ReturnType<typeof useTheme> }) {
  const [salary, setSalary] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [salaryType, setSalaryType] = useState<'MONTHLY' | 'FIXED'>('MONTHLY');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!salary || !joiningDate) { setError('Salary and joining date are required.'); return; }
    setSaving(true);
    setError('');
    try {
      await updateEmployee(employee.userId!, { monthlySalary: parseFloat(salary), joiningDate, salaryType });
      onSaved();
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to save salary.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell visible title={`Set Salary — ${employee.userName}`} onClose={onClose} theme={theme}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Monthly Salary (₹) *</ThemedText>
      <TextInput
        value={salary}
        onChangeText={setSalary}
        placeholder="e.g. 18000"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Joining Date *</ThemedText>
      <TextInput
        value={joiningDate}
        onChangeText={setJoiningDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Salary Type</ThemedText>
      <View style={styles.chipRow}>
        {(['MONTHLY', 'FIXED'] as const).map((t) => (
          <Pressable key={t} onPress={() => setSalaryType(t)} style={[styles.modeChip, { backgroundColor: salaryType === t ? theme.primary : theme.backgroundElement }]}>
            <ThemedText type="small" style={salaryType === t ? styles.actionLabel : undefined}>{t === 'MONTHLY' ? 'Monthly' : 'Fixed (no attendance deduction)'}</ThemedText>
          </Pressable>
        ))}
      </View>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <View style={styles.actionsRow}>
        <Pressable onPress={handleSave} disabled={saving} style={styles.actionButton}>
          {saving ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.actionLabel}>Save Salary</ThemedText>}
        </Pressable>
        <Pressable onPress={onClose} style={[styles.actionButton, styles.cancelButton]}>
          <ThemedText style={styles.actionLabel}>Cancel</ThemedText>
        </Pressable>
      </View>
    </ModalShell>
  );
}

// For an ALREADY-configured employee — distinct from SetSalaryModal above.
// Wired to staffConfig's dedicated salary endpoint, which writes
// SalaryHistory with the "effective 1st of next month" convention and has a
// paired history read route — matches dashboard's EditSalaryModal exactly.
function EditSalaryModal({
  employee, onClose, onSaved, theme,
}: { employee: PayrollResult; onClose: () => void; onSaved: () => void; theme: ReturnType<typeof useTheme> }) {
  const [salary, setSalary] = useState(String(employee.monthlySalary ?? ''));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<SalaryHistoryEntry[]>([]);

  useEffect(() => {
    fetchSalaryHistory(employee.userId!).then(setHistory).catch(() => {});
  }, [employee.userId]);

  const handleSave = async () => {
    const parsed = parseFloat(salary);
    if (!salary || Number.isNaN(parsed) || parsed < 0) { setError('Enter a valid salary amount.'); return; }
    setSaving(true);
    setError('');
    try {
      await setEmployeeSalary(employee.userId!, parsed);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update salary.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell visible title={`Edit Salary — ${employee.userName}`} onClose={onClose} theme={theme}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Monthly Salary (₹) *</ThemedText>
      <TextInput
        value={salary}
        onChangeText={setSalary}
        keyboardType="decimal-pad"
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.helperText}>Current: {formatCurrency(employee.monthlySalary ?? 0)}</ThemedText>
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <View style={styles.actionsRow}>
        <Pressable onPress={handleSave} disabled={saving} style={styles.actionButton}>
          {saving ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.actionLabel}>Save</ThemedText>}
        </Pressable>
        <Pressable onPress={onClose} style={[styles.actionButton, styles.cancelButton]}>
          <ThemedText style={styles.actionLabel}>Cancel</ThemedText>
        </Pressable>
      </View>
      {history.length > 0 && (
        <View style={styles.historySection}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Recent changes</ThemedText>
          {history.slice(0, 5).map((h) => (
            <View key={h.id} style={styles.summaryRow}>
              <ThemedText type="small" themeColor="textSecondary">
                {formatCurrency(h.oldSalary ?? 0)} → {formatCurrency(h.newSalary)} by {h.changedBy?.name ?? 'Unknown'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{new Date(h.effectiveFrom).toLocaleDateString('en-IN')}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </ModalShell>
  );
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  PRESENT: { bg: 'rgba(54,200,126,0.15)', text: '#22c55e', label: 'P' },
  LATE: { bg: 'rgba(232,168,40,0.15)', text: '#e8a828', label: 'L' },
  HALF_DAY: { bg: 'rgba(249,115,22,0.15)', text: '#f97316', label: 'H' },
  ABSENT: { bg: 'rgba(224,104,104,0.15)', text: '#e06868', label: 'A' },
  LEAVE: { bg: 'rgba(104,15,26,0.15)', text: '#7A1C2E', label: 'Lv' },
  WEEKEND: { bg: 'transparent', text: '#8A8A8E', label: '—' },
};

const OVERRIDE_STATUSES = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE'] as const;

function statusDisplayLabel(s: string) {
  return s === 'HALF_DAY' ? 'Half Day' : s === 'LEAVE' ? 'Leave' : s.charAt(0) + s.slice(1).toLowerCase();
}
function fmtTime(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Day-by-day attendance grid + per-day status override — matches
// dashboard's AttendanceGrid exactly. canOverride is OWNER/STORE_MANAGER
// only, narrower than the screen's own SALARY_ADMIN_ROLES (which also
// includes CASHIER) — a UI-local check the dashboard applies the same way,
// separate from the backend's actual PATCH /attendance/:userId/:date/override
// gate (not re-derived here, same as everywhere else in this codebase).
function AttendanceGrid({
  details, userId, month, year, canOverride, onRefresh, theme,
}: {
  details: PayrollAttendanceDetail[]; userId: string; month: number; year: number;
  canOverride: boolean; onRefresh: () => void; theme: ReturnType<typeof useTheme>;
}) {
  const [activeDay, setActiveDay] = useState<PayrollAttendanceDetail | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showOverrides, setShowOverrides] = useState(false);

  const handleBadgeTap = (d: PayrollAttendanceDetail) => {
    if (d.status === 'WEEKEND') return;
    setActiveDay(activeDay?.date === d.date ? null : d);
    setEditStatus(d.status);
    setEditReason('');
  };

  const handleSave = async () => {
    if (!activeDay || !editReason.trim()) return;
    setSaving(true);
    try {
      await overrideAttendance(userId, activeDay.date, { status: editStatus, reason: editReason.trim() });
      const prevLabel = STATUS_COLORS[activeDay.status]?.label ?? activeDay.status;
      const newLabel = STATUS_COLORS[editStatus]?.label ?? editStatus;
      const dayNum = parseInt(activeDay.date.split('-')[2], 10);
      setToast(`✓ ${MONTH_NAMES[month - 1]} ${dayNum} updated: ${prevLabel} → ${newLabel}`);
      setTimeout(() => setToast(null), 4000);
      setActiveDay(null);
      onRefresh();
    } catch (err: any) {
      setToast(`✗ ${getErrorMessage(err, 'Could not save this override.')}`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const overriddenDays = details.filter((d) => d.isOverridden);

  return (
    <View style={styles.dayGridSection}>
      <ThemedText type="small" style={styles.dayGridHeading}>DAY-BY-DAY BREAKDOWN</ThemedText>

      {toast && (
        <View style={[styles.gridToast, { backgroundColor: toast.startsWith('✓') ? 'rgba(34,197,94,0.12)' : 'rgba(224,104,104,0.12)' }]}>
          <ThemedText type="small" style={{ color: toast.startsWith('✓') ? '#15803d' : '#e06868' }}>{toast}</ThemedText>
        </View>
      )}

      <View style={styles.dayBadgeGrid}>
        {details.map((d) => {
          const st = STATUS_COLORS[d.status] ?? STATUS_COLORS.WEEKEND;
          const dayNum = parseInt(d.date.split('-')[2], 10);
          const isActive = activeDay?.date === d.date;
          const isWeekend = d.status === 'WEEKEND';
          return (
            <Pressable
              key={d.date}
              onPress={() => !isWeekend && handleBadgeTap(d)}
              disabled={isWeekend}
              style={[styles.dayBadge, { backgroundColor: isActive ? st.text : st.bg }, isActive && { borderWidth: 2, borderColor: st.text }]}
            >
              <ThemedText style={[styles.dayBadgeNum, { color: isActive ? '#ffffff' : st.text }]}>{dayNum}</ThemedText>
              <ThemedText style={[styles.dayBadgeLabel, { color: isActive ? '#ffffff' : st.text }]}>{st.label}</ThemedText>
              {d.isOverridden && <View style={styles.overrideDot} />}
            </Pressable>
          );
        })}
      </View>

      {activeDay && (() => {
        const dayNum = parseInt(activeDay.date.split('-')[2], 10);
        const inTime = fmtTime(activeDay.clockIn);
        const outTime = fmtTime(activeDay.clockOut);
        return (
          <View style={styles.dayDetailPanel}>
            <View style={styles.headerRow}>
              <View style={styles.flex1}>
                <ThemedText type="smallBold">📅 {MONTH_NAMES[month - 1]} {dayNum} — {activeDay.status.replace(/_/g, ' ')}</ThemedText>
                {activeDay.isOverridden && (
                  <ThemedText type="small" style={styles.overriddenNote}>
                    ● Manually overridden{activeDay.overriddenByName ? ` by ${activeDay.overriddenByName}` : ''}
                    {activeDay.overrideReason ? ` · "${activeDay.overrideReason}"` : ''}
                  </ThemedText>
                )}
              </View>
              <Pressable onPress={() => setActiveDay(null)} hitSlop={8}><ThemedText type="subtitle">✕</ThemedText></Pressable>
            </View>

            <View style={styles.punchCard}>
              <ThemedText type="small" themeColor="textSecondary">
                <ThemedText type="smallBold">IN: </ThemedText>{inTime ?? 'No punch recorded'}{inTime ? ' (from biometric)' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                <ThemedText type="smallBold">OUT: </ThemedText>{outTime ?? '—'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.thresholdNote}>Threshold: before 10:30 = Present</ThemedText>
            </View>

            {canOverride ? (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.changeToLabel}>Change to:</ThemedText>
                <View style={styles.chipRow}>
                  {OVERRIDE_STATUSES.map((s) => {
                    const sc = STATUS_COLORS[s];
                    const sel = editStatus === s;
                    return (
                      <Pressable key={s} onPress={() => setEditStatus(s)} style={[styles.statusChip, { backgroundColor: sel ? sc.text : sc.bg, borderColor: sc.text }]}>
                        <ThemedText type="small" style={{ color: sel ? '#ffffff' : sc.text }}>{sc.label} {statusDisplayLabel(s)}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  value={editReason}
                  onChangeText={setEditReason}
                  placeholder="e.g. Employee showed biometric slip, device lag confirmed"
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  style={[styles.input, styles.reasonInput, { color: theme.text, backgroundColor: theme.background, borderColor: editReason.trim() ? theme.border : '#e06868', borderWidth: 1 }]}
                />
                {!editReason.trim() && <ThemedText type="small" style={styles.error}>Reason is required</ThemedText>}
                <View style={styles.actionsRow}>
                  <Pressable onPress={handleSave} disabled={saving || !editReason.trim()} style={[styles.actionButton, (saving || !editReason.trim()) && styles.disabledButton]}>
                    {saving ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.actionLabel}>Save</ThemedText>}
                  </Pressable>
                  <Pressable onPress={() => setActiveDay(null)} style={[styles.actionButton, styles.cancelButton]}>
                    <ThemedText style={styles.actionLabel}>Cancel</ThemedText>
                  </Pressable>
                </View>
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">Read-only view</ThemedText>
            )}
          </View>
        );
      })()}

      <View style={styles.legendRow}>
        {[
          { label: 'Present', code: 'PRESENT' },
          { label: 'Late', code: 'LATE' },
          { label: 'Half Day', code: 'HALF_DAY' },
          { label: 'Absent', code: 'ABSENT' },
          { label: 'Leave', code: 'LEAVE' },
          { label: 'Weekend / —', code: 'WEEKEND' },
        ].map((l) => (
          <View key={l.code} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: STATUS_COLORS[l.code].bg }]}>
              <ThemedText style={[styles.legendSwatchLabel, { color: STATUS_COLORS[l.code].text }]}>{STATUS_COLORS[l.code].label}</ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">{l.label}</ThemedText>
          </View>
        ))}
        {overriddenDays.length > 0 && (
          <View style={styles.legendItem}>
            <View style={styles.legendSwatch}><View style={styles.overrideDotLegend} /></View>
            <ThemedText type="small" themeColor="textSecondary">Overridden</ThemedText>
          </View>
        )}
      </View>

      {overriddenDays.length > 0 && (
        <View style={styles.overridesSection}>
          <Pressable onPress={() => setShowOverrides((v) => !v)}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.overridesHeading}>
              {showOverrides ? '▾' : '▸'} Overrides This Month ({overriddenDays.length})
            </ThemedText>
          </Pressable>
          {showOverrides && overriddenDays.map((d) => {
            const dayNum = parseInt(d.date.split('-')[2], 10);
            const sc = STATUS_COLORS[d.status];
            return (
              <View key={d.date} style={styles.overrideHistoryRow}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.overrideHistoryDate}>{MONTH_NAMES[month - 1].slice(0, 3)} {dayNum}</ThemedText>
                <ThemedText type="small" style={{ flex: 1 }}>
                  <ThemedText type="small" style={{ color: sc?.text, fontWeight: '700' }}>{d.status.replace(/_/g, ' ')}</ThemedText>
                  {d.overrideReason ? <ThemedText type="small" themeColor="textSecondary"> · &quot;{d.overrideReason}&quot;</ThemedText> : null}
                  {d.overriddenByName ? <ThemedText type="small" themeColor="textSecondary"> · by {d.overriddenByName}</ThemedText> : null}
                </ThemedText>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const now = new Date();

// The previous (pre-redesign) payroll screen, kept whole so Mark Paid, the bulk
// Disbursement table and Undo keep working until Payroll Phase 2 replaces them.
export default function LegacyPayrollScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const isAuthorized = SALARY_ADMIN_ROLES.includes(user?.role ?? '');
  const canOverrideAttendance = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER';

  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [summary, setSummary] = useState<CompanyPayrollSummary | null>(null);
  const [disbursement, setDisbursement] = useState<PayrollDisbursementRow[] | null>(null);
  const [showDisbursement, setShowDisbursement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isLoadingDisbursement, setIsLoadingDisbursement] = useState(false);

  const [overrideUserId, setOverrideUserId] = useState<string | null>(null);
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideNote, setOverrideNote] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);

  // Mark Paid confirmation — added 2026-09-24 (full-parity pass). Was an
  // immediate Alert.alert with no way to adjust anything before confirming;
  // the dashboard's own "Mark Paid" modal lets the cashier edit
  // attendance-deduction, skip/adjust the advance deduction, override the
  // amount paid, pick a payment mode, and add a note — all richer params
  // to the SAME POST /payroll/disbursement call mobile already made, no
  // backend payout-logic change (explicit go-ahead: "Same endpoint,
  // richer params only").
  const [payFormId, setPayFormId] = useState<string | null>(null);
  // Absent Days is a day count, not rupees — the cashier enters days and
  // this multiplies by dailyRate to get the rupee deduction, matching
  // dashboard's DisbursePayModal exactly (GET /disbursement doesn't return
  // recorded absentDays/halfDays the way GET /calculate's PayrollResult
  // does, so this always starts at 0, not prefilled).
  const [payAbsentDays, setPayAbsentDays] = useState('0');
  const [payAdvanceDeduction, setPayAdvanceDeduction] = useState('');
  const [paySkipAdvance, setPaySkipAdvance] = useState(false);
  const [payAmountOverride, setPayAmountOverride] = useState('');
  const [payAmountEdited, setPayAmountEdited] = useState(false);
  const [payMode, setPayMode] = useState('CASH');
  const [payNote, setPayNote] = useState('');
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [viewingPaidId, setViewingPaidId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);
  const [setSalaryEmployee, setSetSalaryEmployee] = useState<PayrollResult | null>(null);
  const [editSalaryEmployee, setEditSalaryEmployee] = useState<PayrollResult | null>(null);
  const [salaryPayments, setSalaryPayments] = useState<Record<string, { amount: number; mode: string | null; paidAt: string; paidBy: { name: string } | null }>>({});

  // Employee-row Mark Paid form — same fields/validation as the bulk
  // Disbursement section's pay form, sourced from PayrollResult instead of
  // PayrollDisbursementRow (loanOutstanding/loanMonthlyDeduction derived
  // from loanDeductions, matching dashboard's MarkPaidModal exactly).
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [markAbsentDays, setMarkAbsentDays] = useState('0');
  const [markAdvanceDeduction, setMarkAdvanceDeduction] = useState('');
  const [markSkipAdvance, setMarkSkipAdvance] = useState(false);
  const [markAmountPaid, setMarkAmountPaid] = useState('');
  const [markAmountEdited, setMarkAmountEdited] = useState(false);
  const [markMode, setMarkMode] = useState('CASH');
  const [markNote, setMarkNote] = useState('');
  const [markSaving, setMarkSaving] = useState(false);

  // Auto-fill Amount Paid to the derived net payable unless the cashier has
  // manually edited it — matches dashboard's DisbursePayModal effect.
  useEffect(() => {
    if (payFormId === null || payAmountEdited || disbursement === null) return;
    const row = disbursement.find((d) => d.userId === payFormId);
    if (!row) return;
    const rateDivisor = month === 2 ? new Date(year, 2, 0).getDate() : 30;
    const dailyRate = row.grossSalary / rateDivisor;
    const absentDaysN = Number(payAbsentDays) || 0;
    const attendanceDeduction = absentDaysN * dailyRate;
    const advanceDeduction = paySkipAdvance ? 0 : (Number(payAdvanceDeduction) || 0);
    const netPayable = Math.max(0, row.grossSalary - attendanceDeduction - advanceDeduction);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived Amount Paid preview, mirrors dashboard
    setPayAmountOverride(String(Math.round(netPayable)));
  }, [payFormId, payAbsentDays, payAdvanceDeduction, paySkipAdvance, payAmountEdited, disbursement, month, year]);

  useEffect(() => {
    if (markPaidId === null || markAmountEdited || summary === null) return;
    const e = summary.employees.find((emp) => emp.userId === markPaidId);
    if (!e) return;
    const absentDaysN = Number(markAbsentDays) || 0;
    const attN = absentDaysN * e.dailyRate;
    const advN = markSkipAdvance ? 0 : (Number(markAdvanceDeduction) || 0);
    const netPayable = Math.max(0, e.monthlySalary - attN - advN);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived Amount Paid preview, mirrors dashboard
    setMarkAmountPaid(String(Math.round(netPayable)));
  }, [markPaidId, markAbsentDays, markAdvanceDeduction, markSkipAdvance, markAmountEdited, summary]);

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    setError(null);
    try {
      setSummary(await fetchCompanyPayroll(month, year));
      try {
        const payments = await fetchSalaryPaymentsAllForMonth(month, year);
        setSalaryPayments(Object.fromEntries(payments.map((p) => [p.userId, p])));
      } catch {
        // Non-critical — the payment confirmation banner just won't show.
        setSalaryPayments({});
      }
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load payroll.'));
    }
  }, [isAuthorized, month, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / month-year change
    load();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const shiftMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setMonth(m);
    setYear(y);
    setDisbursement(null);
    setShowDisbursement(false);
  };

  const onExport = async () => {
    setIsExporting(true);
    setError(null);
    setNotice(null);
    try {
      const dataUri = await fetchPayrollExportDataUri(month, year);
      await Linking.openURL(dataUri);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not export payroll.'));
    } finally {
      setIsExporting(false);
    }
  };

  const onToggleDisbursement = async () => {
    if (showDisbursement) {
      setShowDisbursement(false);
      return;
    }
    setShowDisbursement(true);
    if (disbursement !== null) return;
    setIsLoadingDisbursement(true);
    setError(null);
    try {
      setDisbursement(await fetchPayrollDisbursement(year, month));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load disbursement.'));
    } finally {
      setIsLoadingDisbursement(false);
    }
  };

  const onStartOverride = (userId: string, current: number | null) => {
    setOverrideUserId(userId);
    setOverrideAmount(current != null ? String(current) : '');
    setOverrideNote('');
    setError(null);
    setNotice(null);
  };

  const onSaveOverride = async () => {
    if (!overrideUserId) return;
    const amt = Number(overrideAmount);
    if (!amt || amt <= 0) {
      setError('Enter a valid final salary.');
      return;
    }
    setIsSavingOverride(true);
    setError(null);
    setNotice(null);
    try {
      await setPayrollOverride({ userId: overrideUserId, month, year, finalSalary: amt, note: overrideNote.trim() || undefined });
      setNotice('Override saved.');
      setOverrideUserId(null);
      await load();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not save the override.'));
    } finally {
      setIsSavingOverride(false);
    }
  };

  const onClearOverride = async (userId: string) => {
    setIsSavingOverride(true);
    setError(null);
    setNotice(null);
    try {
      await clearPayrollOverride({ userId, month, year });
      setNotice('Override cleared.');
      setOverrideUserId(null);
      await load();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not clear the override.'));
    } finally {
      setIsSavingOverride(false);
    }
  };

  // dailyRate: mirrors payrollService.ts RULE 1 (divide by 30, except
  // February uses its actual day count) — GET /disbursement doesn't return
  // dailyRate itself, so it's derived client-side the same way dashboard's
  // DisbursePayModal derives it, without touching any backend file.
  const rateDivisor = month === 2 ? new Date(year, 2, 0).getDate() : 30;
  const daysInMonth = new Date(year, month, 0).getDate();

  const openPayForm = (row: PayrollDisbursementRow) => {
    setPayFormId(row.userId);
    setPayAbsentDays('0');
    setPayAdvanceDeduction('');
    setPaySkipAdvance(false);
    setPayAmountOverride(String(Math.round(row.netPayable)));
    setPayAmountEdited(false);
    setPayMode('CASH');
    setPayNote('');
    setError(null);
  };

  const onConfirmPay = (row: PayrollDisbursementRow) => {
    const dailyRate = row.grossSalary / rateDivisor;
    const absentDaysN = Number(payAbsentDays) || 0;
    if (absentDaysN < 0) { setError('Absent days cannot be negative.'); return; }
    if (absentDaysN > daysInMonth) { setError(`Cannot exceed ${daysInMonth} days in this month.`); return; }
    const rawAdvanceN = Number(payAdvanceDeduction) || 0;
    if (!paySkipAdvance && rawAdvanceN > row.loanOutstanding) {
      setError(`Cannot exceed the outstanding balance of ${formatCurrency(row.loanOutstanding)}.`);
      return;
    }
    const attendanceDeduction = absentDaysN * dailyRate;
    const advanceDeduction = paySkipAdvance ? 0 : rawAdvanceN;
    const totalDeductions = attendanceDeduction + advanceDeduction;
    const netPayable = Math.max(0, row.grossSalary - totalDeductions);
    const amountPaid = Number(payAmountOverride) || netPayable;
    Alert.alert(
      'Confirm payment?',
      `This records ${row.name}'s salary of ${formatCurrency(amountPaid)} as paid for ${month}/${year} and applies loan deductions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setPayingId(row.userId);
            setError(null);
            setNotice(null);
            try {
              await createPayrollDisbursement({
                userId: row.userId, month, year,
                grossSalary: row.grossSalary, loanDeduction: 0,
                attendanceDeduction, advanceDeduction, skipAdvanceDeduction: paySkipAdvance,
                totalDeductions, netPayable, amountPaid, mode: payMode, note: payNote.trim() || undefined,
              });
              setNotice(`${row.name}'s salary marked as paid.`);
              setPayFormId(null);
              setDisbursement(await fetchPayrollDisbursement(year, month));
            } catch (err: any) {
              setError(getErrorMessage(err, 'Could not record the payment.'));
            } finally {
              setPayingId(null);
            }
          },
        },
      ],
    );
  };

  const onUndoPaid = (row: PayrollDisbursementRow) => {
    Alert.alert(
      'Undo this payment?',
      `This removes the payment record for ${row.name} in ${month}/${year} and reverses any loan deductions it applied. This cannot be undone from here.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Undo payment',
          style: 'destructive',
          onPress: async () => {
            setUndoingId(row.userId);
            setError(null);
            setNotice(null);
            try {
              await undoSalaryPayment({ userId: row.userId, month, year });
              setNotice(`Payment for ${row.name} undone.`);
              setDisbursement(await fetchPayrollDisbursement(year, month));
            } catch (err: any) {
              setError(getErrorMessage(err, 'Could not undo the payment.'));
            } finally {
              setUndoingId(null);
            }
          },
        },
      ],
    );
  };

  const openMarkPaid = (e: PayrollResult) => {
    setMarkPaidId(e.userId!);
    setMarkAbsentDays(String(Math.max(0, (e.absentDays || 0) + (e.halfDays || 0) * 0.5)));
    setMarkAdvanceDeduction('');
    setMarkSkipAdvance(false);
    setMarkAmountPaid(String(Math.round(e.netSalary)));
    setMarkAmountEdited(false);
    setMarkMode('CASH');
    setMarkNote('');
    setError(null);
  };

  const onConfirmMarkPaid = (e: PayrollResult) => {
    const loanOutstanding = (e.loanDeductions ?? []).reduce((s, l) => s + l.remainingAfter + l.amount, 0);
    const absentDaysN = Number(markAbsentDays) || 0;
    if (absentDaysN < 0) { setError('Absent days cannot be negative.'); return; }
    if (absentDaysN > daysInMonth) { setError(`Cannot exceed ${daysInMonth} days in this month.`); return; }
    const rawAdvanceN = Number(markAdvanceDeduction) || 0;
    if (!markSkipAdvance && rawAdvanceN > loanOutstanding) {
      setError(`Cannot exceed the outstanding balance of ${formatCurrency(loanOutstanding)}.`);
      return;
    }
    const attN = absentDaysN * e.dailyRate;
    const advN = markSkipAdvance ? 0 : rawAdvanceN;
    const totalDeductions = attN + advN;
    const netPayable = Math.max(0, e.monthlySalary - totalDeductions);
    const amountPaid = Number(markAmountPaid) || netPayable;
    Alert.alert(
      'Confirm payment?',
      `This records ${e.userName}'s salary of ${formatCurrency(amountPaid)} as paid for ${month}/${year} and applies loan deductions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setMarkSaving(true);
            setError(null);
            setNotice(null);
            try {
              await createPayrollDisbursement({
                userId: e.userId!, month, year,
                grossSalary: e.monthlySalary, loanDeduction: 0,
                attendanceDeduction: attN, advanceDeduction: advN, skipAdvanceDeduction: markSkipAdvance,
                totalDeductions, netPayable, amountPaid, mode: markMode, note: markNote.trim() || undefined,
              });
              setNotice(`${e.userName}'s salary marked as paid.`);
              setMarkPaidId(null);
              await load();
            } catch (err: any) {
              setError(getErrorMessage(err, 'Could not record the payment.'));
            } finally {
              setMarkSaving(false);
            }
          },
        },
      ],
    );
  };

  if (!isAuthorized) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">
          Payroll is only available to Owner, Store Manager, or Cashier accounts.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Payroll' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.monthRow}>
          <Pressable onPress={() => shiftMonth(-1)} style={styles.monthButton}>
            <ThemedText type="link">‹ Previous</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">{MONTH_NAMES[month - 1]} {year}</ThemedText>
          <Pressable onPress={() => shiftMonth(1)} style={styles.monthButton}>
            <ThemedText type="link">Next ›</ThemedText>
          </Pressable>
        </View>
        {(() => {
          const today = new Date();
          const { windowStart, windowEnd } = getPaymentWindow(month, year);
          const beforeWindow = today < windowStart;
          const afterWindow = today > windowEnd;
          const inWindow = !beforeWindow && !afterWindow;
          return (
            <View style={[styles.windowBanner, { backgroundColor: inWindow ? 'rgba(34,197,94,0.1)' : beforeWindow ? 'rgba(234,179,8,0.1)' : 'rgba(107,114,128,0.12)' }]}>
              <ThemedText type="small" style={{ color: inWindow ? '#15803d' : beforeWindow ? '#a16207' : '#6b7280' }}>
                Payment window: {formatPaymentWindow(month, year)}
                {beforeWindow ? ' · Not yet open' : afterWindow ? ' · Window passed' : ' · Open now'}
              </ThemedText>
            </View>
          );
        })()}

        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}

        {summary === null ? (
          // Money screen: a failed fetch must never look like "loading" —
          // no spinner once there's an error and nothing to show under it,
          // and never a fallback to a blank/zero summary.
          error ? (
            <Pressable onPress={load} style={styles.retryButton}>
              <ThemedText style={styles.actionLabel}>Retry</ThemedText>
            </Pressable>
          ) : (
            <ActivityIndicator style={styles.spinner} />
          )
        ) : (
          <>
            <GlassCard style={styles.card}>
              <ThemedText type="smallBold">Company summary</ThemedText>
              <Row label="Total Gross Payroll" value={formatCurrency(summary.summary.totalPayroll + summary.summary.totalDeductions)} />
              <Row label="Total Deductions" value={formatCurrency(summary.summary.totalDeductions)} />
              <Row label="Employees" value={String(summary.summary.employeeCount)} />
              <Row label="Avg Attendance" value={`${summary.summary.avgAttendance}%`} />
              <View style={styles.netPayableRow}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>Net Payable</ThemedText>
                <ThemedText type="smallBold" style={[styles.tabularNums, { color: theme.primary }]}>{formatCurrency(summary.summary.totalPayroll)}</ThemedText>
              </View>
            </GlassCard>

            <View style={styles.actionsRow}>
              <Pressable onPress={onExport} disabled={isExporting} style={styles.actionButton}>
                {isExporting ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.actionLabel}>Export Excel</ThemedText>}
              </Pressable>
              <Pressable onPress={onToggleDisbursement} style={styles.actionButton}>
                <ThemedText style={styles.actionLabel}>{showDisbursement ? 'Hide Disburse Salaries' : 'Disburse Salaries'}</ThemedText>
              </Pressable>
            </View>

            {showDisbursement && (
              <View style={styles.section}>
                <ThemedText type="smallBold">Disbursement</ThemedText>
                {isLoadingDisbursement ? (
                  <ActivityIndicator style={styles.spinner} />
                ) : disbursement === null || disbursement.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">No disbursement records.</ThemedText>
                ) : (
                  disbursement.map((d) => {
                    const dailyRate = d.grossSalary / rateDivisor;
                    const absentDaysN = Number(payAbsentDays) || 0;
                    const absentDaysError = absentDaysN < 0 ? 'Absent days cannot be negative.'
                      : absentDaysN > daysInMonth ? `Cannot exceed ${daysInMonth} days in this month.` : '';
                    const attDeductN = absentDaysN * dailyRate;
                    const rawAdvanceN = Number(payAdvanceDeduction) || 0;
                    const advanceError = !paySkipAdvance && rawAdvanceN > d.loanOutstanding
                      ? `Cannot exceed the outstanding balance of ${formatCurrency(d.loanOutstanding)}.` : '';
                    const advDeductN = paySkipAdvance ? 0 : rawAdvanceN;
                    const totalDeductionsN = attDeductN + advDeductN;
                    const netPayableN = Math.max(0, d.grossSalary - totalDeductionsN);
                    return (
                    <ThemedView key={d.userId} type="backgroundElement" style={styles.row}>
                      <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail">{d.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.tabularNums}>
                        Net payable {formatCurrency(d.netPayable)} · Payable days {d.payableDays}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" style={styles.tabularNums}>
                        {d.payment ? `Paid ${formatCurrency(d.payment.amount)}` : 'Not yet paid'}
                      </ThemedText>
                      <View style={styles.actionsRow}>
                        {d.payment ? (
                          <>
                            <Pressable onPress={() => setViewingPaidId(viewingPaidId === d.userId ? null : d.userId)} style={[styles.actionButton, styles.cancelButton]}>
                              <ThemedText style={styles.actionLabel}>{viewingPaidId === d.userId ? 'Hide' : 'View'}</ThemedText>
                            </Pressable>
                            <Pressable onPress={() => onUndoPaid(d)} disabled={undoingId === d.userId} style={[styles.actionButton, styles.clearButton]}>
                              {undoingId === d.userId ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.actionLabel}>Undo</ThemedText>}
                            </Pressable>
                          </>
                        ) : payFormId === d.userId ? null : (
                          <Pressable onPress={() => openPayForm(d)} style={styles.actionButton}>
                            <ThemedText style={styles.actionLabel}>Pay</ThemedText>
                          </Pressable>
                        )}
                      </View>

                      {d.payment && viewingPaidId === d.userId && (
                        <View style={styles.paidBreakdown}>
                          <View style={styles.paidBanner}>
                            <ThemedText type="smallBold" style={{ color: '#15803d' }}>✓ Already paid</ThemedText>
                          </View>
                          <Row label="Amount Paid" value={formatCurrency(d.payment.amount)} />
                          <Row label="Attendance Deduction" value={formatCurrency(d.payment.attendanceDeduction ?? 0)} />
                          <Row label="Advance Deduction" value={d.payment.advanceSkipped ? 'Skipped' : formatCurrency(d.payment.advanceDeduction ?? 0)} />
                          <Row label="Mode" value={d.payment.mode ?? '—'} />
                          <Row label="Paid" value={`${new Date(d.payment.paidAt).toLocaleString('en-IN')} by ${d.payment.paidBy ?? 'Unknown'}`} />
                          <ThemedText type="small" themeColor="textSecondary" style={styles.helperText}>
                            To correct this payment, undo it first, then re-confirm.
                          </ThemedText>
                        </View>
                      )}

                      {payFormId === d.userId && (
                        <View style={styles.payForm}>
                          <View style={[styles.windowBanner, { backgroundColor: isWithinPaymentWindow(new Date(), month, year) ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)' }]}>
                            <ThemedText type="small" style={{ color: isWithinPaymentWindow(new Date(), month, year) ? '#15803d' : '#a16207' }}>
                              Payment window: {formatPaymentWindow(month, year)}
                              {!isWithinPaymentWindow(new Date(), month, year) ? ' · ⚠ Today is outside this window' : ''}
                            </ThemedText>
                          </View>

                          <View style={styles.grossSalaryCard}>
                            <ThemedText type="small" themeColor="textSecondary">Gross Salary</ThemedText>
                            <ThemedText type="title" style={styles.tabularNums}>{formatCurrency(d.grossSalary)}</ThemedText>
                          </View>

                          {(d.unpaidIncentiveBalance ?? 0) > 0 && (
                            <ThemedText type="small" themeColor="textSecondary" style={styles.incentiveNote}>
                              💡 Unpaid incentive: {formatCurrency(d.unpaidIncentiveBalance!)} — paid separately, not included in this payment.
                            </ThemedText>
                          )}

                          <ThemedText type="smallBold" style={styles.deductionsHeading}>DEDUCTIONS</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">Absent Days</ThemedText>
                          <TextInput
                            value={payAbsentDays}
                            onChangeText={setPayAbsentDays}
                            keyboardType="decimal-pad"
                            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                          />
                          <ThemedText type="small" style={absentDaysError ? styles.error : undefined} themeColor={absentDaysError ? undefined : 'textSecondary'}>
                            {absentDaysError || `${absentDaysN} day${absentDaysN === 1 ? '' : 's'} × ${formatCurrency(dailyRate)} = ${formatCurrency(attDeductN)}`}
                          </ThemedText>

                          {d.loanOutstanding > 0 && (
                            <View style={styles.outstandingCard}>
                              <Row label="Outstanding Advance" value={formatCurrency(d.loanOutstanding)} />
                              {d.loanMonthlyDeduction > 0 && <Row label="Suggested monthly" value={formatCurrency(d.loanMonthlyDeduction)} />}
                            </View>
                          )}
                          <ThemedText type="small" themeColor="textSecondary">Advance Deduction (₹) {paySkipAdvance ? '(skipped)' : ''}</ThemedText>
                          {!paySkipAdvance && (
                            <TextInput
                              value={payAdvanceDeduction}
                              onChangeText={setPayAdvanceDeduction}
                              keyboardType="decimal-pad"
                              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                            />
                          )}
                          {d.loanOutstanding > 0 && (
                            <Pressable onPress={() => setPaySkipAdvance((v) => !v)} style={styles.checkboxRow}>
                              <View style={[styles.checkbox, { backgroundColor: paySkipAdvance ? theme.primary : 'transparent', borderColor: theme.border }]}>
                                {paySkipAdvance && <ThemedText style={styles.checkboxTick}>✓</ThemedText>}
                              </View>
                              <ThemedText type="small" themeColor="textSecondary">Skip Advance Deduction This Month</ThemedText>
                            </Pressable>
                          )}
                          <ThemedText type="small" style={advanceError ? styles.error : undefined} themeColor={advanceError ? undefined : 'textSecondary'}>
                            {advanceError || (paySkipAdvance ? `${formatCurrency(d.loanOutstanding)} — unchanged, deduction skipped.`
                              : d.loanOutstanding > 0 ? `Remaining after this payment: ${formatCurrency(Math.max(0, d.loanOutstanding - advDeductN))}` : '')}
                          </ThemedText>

                          {(d.loanScheduledPlan ?? []).map((entry) => {
                            const modeLabel = LOAN_MODE_LABELS[entry.mode] ?? entry.mode;
                            if (entry.mode === 'TBD') {
                              return (
                                <View key={entry.loanId} style={styles.tbdLoanCard}>
                                  <View style={styles.headerRow}>
                                    <ThemedText type="small" style={styles.tbdLoanLabel}>{modeLabel}</ThemedText>
                                    <ThemedText type="small" style={styles.tbdLoanLabel}>Suggested: {formatCurrency(entry.suggestedAmount ?? 0)}</ThemedText>
                                  </View>
                                  <ThemedText type="small" style={styles.tbdLoanNote}>
                                    Not deducted automatically. To collect, set this loan&apos;s repayment plan.
                                  </ThemedText>
                                </View>
                              );
                            }
                            const due = entry.plannedAmount;
                            const thisMonthAmt = Math.max(0, due - entry.carriedAmount);
                            const isCapped = entry.cappedAmount < due;
                            return (
                              <View key={entry.loanId} style={styles.loanPlanCard}>
                                <View style={styles.headerRow}>
                                  <ThemedText type="small" style={styles.loanPlanTitle}>{modeLabel}</ThemedText>
                                  <ThemedText type="small" style={styles.loanPlanTitle}>{formatCurrency(entry.cappedAmount)}</ThemedText>
                                </View>
                                {entry.mode === 'LUMP_NEXT_MONTH' ? (
                                  <Row label="Full amount due" value={formatCurrency(due)} />
                                ) : (
                                  <>
                                    <Row label="Planned this month" value={formatCurrency(thisMonthAmt)} />
                                    {entry.carriedAmount > 0 && (
                                      <View style={styles.summaryRow}>
                                        <ThemedText type="small" style={styles.carriedLabel}>Carried from previous</ThemedText>
                                        <ThemedText type="small" style={styles.carriedLabel}>{formatCurrency(entry.carriedAmount)}</ThemedText>
                                      </View>
                                    )}
                                    <Row label="Due" value={formatCurrency(due)} />
                                  </>
                                )}
                                <View style={styles.summaryRow}>
                                  <ThemedText type="small" style={isCapped ? styles.error : undefined} themeColor={isCapped ? undefined : 'textSecondary'}>Being deducted</ThemedText>
                                  <ThemedText type="small" style={isCapped ? styles.error : undefined} themeColor={isCapped ? undefined : 'textSecondary'}>
                                    {isCapped ? `${formatCurrency(entry.cappedAmount)} — capped by available pay` : formatCurrency(entry.cappedAmount)}
                                  </ThemedText>
                                </View>
                              </View>
                            );
                          })}

                          <View style={styles.netPayableRow}>
                            <ThemedText type="small" themeColor="textSecondary">Total Deductions</ThemedText>
                            <ThemedText type="smallBold" style={totalDeductionsN > 0 ? styles.error : undefined}>
                              {totalDeductionsN > 0 ? `− ${formatCurrency(totalDeductionsN)}` : '—'}
                            </ThemedText>
                          </View>

                          <View style={styles.netPayableBanner}>
                            <ThemedText type="smallBold" style={{ color: theme.primary }}>Net Payable</ThemedText>
                            <ThemedText type="title" style={[styles.tabularNums, { color: theme.primary }]}>{formatCurrency(netPayableN)}</ThemedText>
                          </View>

                          <ThemedText type="small" themeColor="textSecondary">Amount Paid (₹)</ThemedText>
                          <TextInput
                            value={payAmountOverride}
                            onChangeText={(t) => { setPayAmountOverride(t); setPayAmountEdited(true); }}
                            keyboardType="decimal-pad"
                            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                          />
                          <ThemedText type="small" themeColor="textSecondary" style={styles.helperText}>Override if actual amount differs from net payable</ThemedText>

                          <ThemedText type="small" themeColor="textSecondary">Payment Mode</ThemedText>
                          <View style={styles.chipRow}>
                            {PAYMENT_MODES.map((m) => (
                              <Pressable key={m.value} onPress={() => setPayMode(m.value)} style={[styles.modeChip, { backgroundColor: payMode === m.value ? theme.primary : theme.backgroundElement }]}>
                                <ThemedText type="small" style={payMode === m.value ? styles.actionLabel : undefined}>{m.label}</ThemedText>
                              </Pressable>
                            ))}
                          </View>
                          <TextInput
                            value={payNote}
                            onChangeText={setPayNote}
                            placeholder="e.g. Full salary paid"
                            placeholderTextColor={theme.textSecondary}
                            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                          />
                          <View style={styles.actionsRow}>
                            <Pressable onPress={() => onConfirmPay(d)} disabled={payingId === d.userId || !!absentDaysError || !!advanceError} style={[styles.actionButton, (!!absentDaysError || !!advanceError) && styles.disabledButton]}>
                              {payingId === d.userId ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.actionLabel}>Confirm Payment</ThemedText>}
                            </Pressable>
                            <Pressable onPress={() => setPayFormId(null)} style={[styles.actionButton, styles.clearButton]}>
                              <ThemedText style={styles.actionLabel}>Cancel</ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      )}
                    </ThemedView>
                    );
                  })
                )}
              </View>
            )}

            <ThemedText type="smallBold" style={styles.sectionTitle}>Employees</ThemedText>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search employee…"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            {(() => {
              const q = search.trim().toLowerCase();
              const filteredEmployees = q ? summary.employees.filter((e) => (e.userName ?? '').toLowerCase().includes(q)) : summary.employees;
              if (filteredEmployees.length === 0) {
                return (
                  <ThemedText type="small" themeColor="textSecondary">
                    {q ? `No employee matching "${search}"` : 'No active employees found.'}
                  </ThemedText>
                );
              }
              return filteredEmployees.map((e) => {
                if (e.isConfigured === false) {
                  return (
                    <ThemedView key={e.userId} type="backgroundElement" style={[styles.row, styles.unconfiguredRow]}>
                      <View style={styles.headerRow}>
                        <View style={styles.flex1}>
                          <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail">{e.userName}</ThemedText>
                          {e.designation && <ThemedText type="small" themeColor="textSecondary">{e.designation}</ThemedText>}
                        </View>
                        <View style={styles.unconfiguredBadge}>
                          <ThemedText type="small" style={styles.unconfiguredBadgeLabel}>Salary not set</ThemedText>
                        </View>
                        <Pressable onPress={() => setSetSalaryEmployee(e)} style={styles.setSalaryButton}>
                          <ThemedText type="small" style={styles.actionLabel}>+ Set Salary</ThemedText>
                        </Pressable>
                      </View>
                    </ThemedView>
                  );
                }

                const displayDeduction = Math.max(0, e.monthlySalary - e.netSalary);
                const displayDeductionPct = e.monthlySalary > 0 ? Math.round((displayDeduction / e.monthlySalary) * 100) : 0;
                const payment = salaryPayments[e.userId!];
                // hasPaymentBreakdown/displayGrossSalary/etc. mirror dashboard's
                // EmployeePayrollRow exactly, except displayAdvanceTotal: dashboard
                // reads a `totalAdvanceDeduction` field that calculateAllPayroll
                // never actually returns (confirmed by reading payrollService.ts
                // in full) — totalLoanDeduction is the real field carrying this
                // same figure, used here instead.
                const expanded = expandedEmployeeId === e.userId;
                const isConfiguredRow = true;
                const loanOutstanding = (e.loanDeductions ?? []).reduce((s, l) => s + l.remainingAfter + l.amount, 0);
                const loanMonthlyDeduction = (e.loanDeductions ?? []).reduce((s, l) => s + l.amount, 0);
                const markAbsentDaysN = Number(markAbsentDays) || 0;
                const markAbsentDaysError = markAbsentDaysN < 0 ? 'Absent days cannot be negative.'
                  : markAbsentDaysN > daysInMonth ? `Cannot exceed ${daysInMonth} days in this month.` : '';
                const markAttN = markAbsentDaysN * e.dailyRate;
                const markRawAdvanceN = Number(markAdvanceDeduction) || 0;
                const markAdvanceError = !markSkipAdvance && markRawAdvanceN > loanOutstanding
                  ? `Cannot exceed the outstanding balance of ${formatCurrency(loanOutstanding)}.` : '';
                return (
                  <ThemedView key={e.userId} type="backgroundElement" style={styles.row}>
                    <Pressable onPress={() => setExpandedEmployeeId(expanded ? null : e.userId!)} style={styles.headerRow}>
                      <View style={styles.flex1}>
                        <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail">{e.userName}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.tabularNums}>
                          {e.designation ?? '—'} · {e.presentDays + e.lateCount + e.halfDays}P {(e.absentDays + e.leaveDays)}A
                        </ThemedText>
                      </View>
                      <View style={styles.salaryColumn}>
                        <ThemedText type="smallBold" style={styles.tabularNums}>{formatCurrency(e.netSalary)}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.tabularNums}>gross {formatCurrency(e.monthlySalary)}</ThemedText>
                        {displayDeduction > 0 && (
                          <ThemedText type="small" style={[styles.error, styles.tabularNums]}>-{formatCurrency(displayDeduction)} ({displayDeductionPct}%)</ThemedText>
                        )}
                      </View>
                    </Pressable>

                    <View style={styles.badgeRow}>
                      {loanMonthlyDeduction > 0 && (
                        <View style={styles.advBadge}>
                          <ThemedText type="small" style={styles.advBadgeLabel}>Adv -{formatCurrency(loanMonthlyDeduction)}</ThemedText>
                        </View>
                      )}
                      {e.finalSalaryOverride != null && (
                        <ThemedText type="small" themeColor="textSecondary" style={styles.tabularNums}>Override: {formatCurrency(e.finalSalaryOverride)}</ThemedText>
                      )}
                    </View>

                    <View style={styles.actionsRow}>
                      {payment ? (
                        <View style={styles.paidPill}>
                          <ThemedText type="small" style={styles.paidPillLabel}>✓ Paid</ThemedText>
                        </View>
                      ) : (
                        <Pressable onPress={() => (markPaidId === e.userId ? setMarkPaidId(null) : openMarkPaid(e))} style={styles.actionButton}>
                          <ThemedText style={styles.actionLabel}>{markPaidId === e.userId ? 'Close' : 'Mark Paid'}</ThemedText>
                        </Pressable>
                      )}
                      <Pressable onPress={() => onStartOverride(e.userId ?? '', e.finalSalaryOverride)}>
                        <ThemedText type="link">Override</ThemedText>
                      </Pressable>
                    </View>

                    {overrideUserId === e.userId && (
                      <View style={styles.overrideForm}>
                        <TextInput
                          value={overrideAmount}
                          onChangeText={setOverrideAmount}
                          placeholder="Final salary"
                          placeholderTextColor={theme.textSecondary}
                          keyboardType="decimal-pad"
                          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                        />
                        <TextInput
                          value={overrideNote}
                          onChangeText={setOverrideNote}
                          placeholder="Note (optional)"
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                        />
                        <View style={styles.actionsRow}>
                          <Pressable onPress={onSaveOverride} disabled={isSavingOverride} style={styles.actionButton}>
                            {isSavingOverride ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.actionLabel}>Save</ThemedText>}
                          </Pressable>
                          {e.finalSalaryOverride != null && (
                            <Pressable onPress={() => onClearOverride(e.userId ?? '')} disabled={isSavingOverride} style={[styles.actionButton, styles.clearButton]}>
                              <ThemedText style={styles.actionLabel}>Clear</ThemedText>
                            </Pressable>
                          )}
                          <Pressable onPress={() => setOverrideUserId(null)} style={[styles.actionButton, styles.cancelButton]}>
                            <ThemedText type="small">Cancel</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    {markPaidId === e.userId && isConfiguredRow && (
                      <View style={styles.payForm}>
                        <View style={[styles.windowBanner, { backgroundColor: isWithinPaymentWindow(new Date(), month, year) ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)' }]}>
                          <ThemedText type="small" style={{ color: isWithinPaymentWindow(new Date(), month, year) ? '#15803d' : '#a16207' }}>
                            Payment window: {formatPaymentWindow(month, year)}
                            {!isWithinPaymentWindow(new Date(), month, year) ? ' · ⚠ Today is outside this window' : ''}
                          </ThemedText>
                        </View>
                        <ThemedText type="small" themeColor="textSecondary">Absent Days</ThemedText>
                        <TextInput
                          value={markAbsentDays}
                          onChangeText={setMarkAbsentDays}
                          keyboardType="decimal-pad"
                          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                        />
                        <ThemedText type="small" style={markAbsentDaysError ? styles.error : undefined} themeColor={markAbsentDaysError ? undefined : 'textSecondary'}>
                          {markAbsentDaysError || `${markAbsentDaysN} day${markAbsentDaysN === 1 ? '' : 's'} × ${formatCurrency(e.dailyRate)} = ${formatCurrency(markAttN)}`}
                        </ThemedText>
                        {loanOutstanding > 0 && (
                          <View style={styles.outstandingCard}>
                            <Row label="Outstanding Advance" value={formatCurrency(loanOutstanding)} />
                            {loanMonthlyDeduction > 0 && <Row label="Suggested monthly" value={formatCurrency(loanMonthlyDeduction)} />}
                          </View>
                        )}
                        <ThemedText type="small" themeColor="textSecondary">Advance Deduction (₹) {markSkipAdvance ? '(skipped)' : ''}</ThemedText>
                        {!markSkipAdvance && (
                          <TextInput
                            value={markAdvanceDeduction}
                            onChangeText={setMarkAdvanceDeduction}
                            keyboardType="decimal-pad"
                            style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                          />
                        )}
                        {loanOutstanding > 0 && (
                          <Pressable onPress={() => setMarkSkipAdvance((v) => !v)} style={styles.checkboxRow}>
                            <View style={[styles.checkbox, { backgroundColor: markSkipAdvance ? theme.primary : 'transparent', borderColor: theme.border }]}>
                              {markSkipAdvance && <ThemedText style={styles.checkboxTick}>✓</ThemedText>}
                            </View>
                            <ThemedText type="small" themeColor="textSecondary">Skip Advance Deduction This Month</ThemedText>
                          </Pressable>
                        )}
                        <ThemedText type="small" style={markAdvanceError ? styles.error : undefined} themeColor={markAdvanceError ? undefined : 'textSecondary'}>
                          {markAdvanceError || (markSkipAdvance ? `${formatCurrency(loanOutstanding)} — unchanged, deduction skipped.`
                            : loanOutstanding > 0 ? `Remaining after this payment: ${formatCurrency(Math.max(0, loanOutstanding - (markSkipAdvance ? 0 : markRawAdvanceN)))}` : '')}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">Amount Paid (₹)</ThemedText>
                        <TextInput
                          value={markAmountPaid}
                          onChangeText={(t) => { setMarkAmountPaid(t); setMarkAmountEdited(true); }}
                          keyboardType="decimal-pad"
                          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                        />
                        <ThemedText type="small" themeColor="textSecondary">Payment Mode</ThemedText>
                        <View style={styles.chipRow}>
                          {PAYMENT_MODES.map((m) => (
                            <Pressable key={m.value} onPress={() => setMarkMode(m.value)} style={[styles.modeChip, { backgroundColor: markMode === m.value ? theme.primary : theme.backgroundElement }]}>
                              <ThemedText type="small" style={markMode === m.value ? styles.actionLabel : undefined}>{m.label}</ThemedText>
                            </Pressable>
                          ))}
                        </View>
                        <TextInput
                          value={markNote}
                          onChangeText={setMarkNote}
                          placeholder="e.g. Full salary paid"
                          placeholderTextColor={theme.textSecondary}
                          style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                        />
                        <View style={styles.actionsRow}>
                          <Pressable onPress={() => onConfirmMarkPaid(e)} disabled={markSaving || !!markAbsentDaysError || !!markAdvanceError} style={[styles.actionButton, (!!markAbsentDaysError || !!markAdvanceError) && styles.disabledButton]}>
                            {markSaving ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.actionLabel}>Confirm Payment</ThemedText>}
                          </Pressable>
                          <Pressable onPress={() => setMarkPaidId(null)} style={[styles.actionButton, styles.clearButton]}>
                            <ThemedText style={styles.actionLabel}>Cancel</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    )}

                    {expanded && (
                      <View style={styles.expandedDetail}>
                        <ThemedText type="small" themeColor="textSecondary">
                          Cycle: {e.cycleStart} → {e.cycleEnd} · Daily rate: {formatCurrency(e.dailyRate)}
                        </ThemedText>

                        <View style={styles.deductionBlock}>
                          <View style={styles.summaryRow}>
                            <ThemedText type="small" themeColor="textSecondary">Gross Salary</ThemedText>
                            <View style={styles.badgeRow}>
                              <ThemedText type="small">{formatCurrency(e.monthlySalary)}</ThemedText>
                              <Pressable onPress={() => setEditSalaryEmployee(e)}>
                                <ThemedText type="small" style={styles.editSalaryLink}>Edit</ThemedText>
                              </Pressable>
                            </View>
                          </View>
                          <Row label={`Earned (${e.payableDays} attendance days)`} value={formatCurrency(e.earnedSalary ?? e.monthlySalary)} />
                          {e.absentDays > 0 && <Row label={`Absent (${e.absentDays} days — not counted)`} value="—" />}
                          {e.halfDays > 0 && <Row label={`Half days (${e.halfDays} × 0.5 — in attendance days)`} value="—" />}
                          {e.lateDeduction > 0 && (
                            <View style={styles.summaryRow}>
                              <ThemedText type="small" style={styles.error}>Late penalty ({e.lateFullDays > 0 ? `${e.lateFullDays}d ` : ''}{e.lateHalfDays > 0 ? `${e.lateHalfDays}½d` : ''})</ThemedText>
                              <ThemedText type="small" style={styles.error}>-{formatCurrency(e.lateDeduction)}</ThemedText>
                            </View>
                          )}
                          {e.carriedLates > 0 && e.carriedLateDeduction > 0 && (
                            <View style={styles.summaryRow}>
                              <ThemedText type="small" style={styles.carryoverLabel}>↳ Carryover lates (prev. month): {e.carriedLates} lates</ThemedText>
                              <ThemedText type="small" style={styles.carryoverLabel}>-{formatCurrency(e.carriedLateDeduction)}</ThemedText>
                            </View>
                          )}
                          <View style={[styles.summaryRow, styles.subtotalRow]}>
                            <ThemedText type="smallBold">Subtotal (after late penalties)</ThemedText>
                            <ThemedText type="smallBold">{formatCurrency(Math.max(0, (e.earnedSalary ?? e.monthlySalary) - (e.lateDeduction ?? 0)))}</ThemedText>
                          </View>
                          <View style={styles.advanceDeductionsRow}>
                            <ThemedText type="small" style={styles.advanceDeductionsLabel}>Advance Deductions</ThemedText>
                            <ThemedText type="small" style={styles.advanceDeductionsLabel}>{e.totalLoanDeduction > 0 ? `-${formatCurrency(e.totalLoanDeduction)}` : '—'}</ThemedText>
                          </View>
                          <View style={[styles.summaryRow, styles.subtotalRow]}>
                            <ThemedText type="smallBold">Net Payable</ThemedText>
                            <ThemedText type="smallBold" style={styles.netPayableLabel}>{formatCurrency(e.netSalary)}</ThemedText>
                          </View>
                        </View>

                        <View style={styles.attendanceGroupsRow}>
                          <View style={styles.attendanceGroupCard}>
                            <ThemedText type="title" style={[styles.tabularNums, styles.presentGroupLabel]}>{e.presentDays + e.lateCount + e.halfDays}</ThemedText>
                            <ThemedText type="small" style={styles.attendanceGroupHeading}>Present</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {[e.presentDays > 0 ? `${e.presentDays} Present` : null, e.lateCount > 0 ? `${e.lateCount} Late` : null, e.halfDays > 0 ? `${e.halfDays} Half Day` : null].filter(Boolean).join(' · ') || '0 days'}
                            </ThemedText>
                          </View>
                          <View style={styles.attendanceGroupCard}>
                            <ThemedText type="title" style={[styles.tabularNums, styles.absentGroupLabel]}>{e.absentDays + e.leaveDays}</ThemedText>
                            <ThemedText type="small" style={styles.attendanceGroupHeading}>Absent</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {[e.absentDays > 0 ? `${e.absentDays} Absent` : null, e.leaveDays > 0 ? `${e.leaveDays} Leave` : null].filter(Boolean).join(' · ') || '0 days'}
                            </ThemedText>
                          </View>
                        </View>

                        {e.lateCount > 0 && (
                          <View style={styles.lateAnalysisCard}>
                            <ThemedText type="smallBold" style={styles.lateAnalysisHeading}>Late Analysis</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                              {e.lateCount} late(s) this month{e.carriedLates > 0 ? ` + ${e.carriedLates} carried in = ${e.lateCount + e.carriedLates} total` : ''}
                            </ThemedText>
                            <View style={styles.badgeRow}>
                              {e.lateFullDays > 0 && <ThemedText type="small" style={styles.error}>−{e.lateFullDays} full day(s) deducted</ThemedText>}
                              {e.lateHalfDays > 0 && <ThemedText type="small" style={styles.carryoverLabel}>−{e.lateHalfDays} half day(s) deducted</ThemedText>}
                              {e.lateFullDays === 0 && e.lateHalfDays === 0 && <ThemedText type="small" themeColor="textSecondary">No deduction yet</ThemedText>}
                              {e.lateCarryForward > 0 && <ThemedText type="small" style={styles.carryoverLabel}>↪ {e.lateCarryForward} late(s) carrying to next month</ThemedText>}
                            </View>
                          </View>
                        )}

                        {payment && (
                          <View style={styles.paymentConfirmBanner}>
                            <ThemedText type="small" style={styles.paidBannerHeading}>Salary Paid — {formatCurrency(payment.amount)}</ThemedText>
                            <ThemedText type="small" style={styles.paidBannerSub}>
                              via {payment.mode || 'Cash'} · by {payment.paidBy?.name ?? 'Unknown'} · {new Date(payment.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                              {!isWithinPaymentWindow(new Date(payment.paidAt), month, year) ? ' ⚠' : ''}
                            </ThemedText>
                          </View>
                        )}

                        {(e.attendanceDetails ?? []).length > 0 && (
                          <AttendanceGrid
                            details={e.attendanceDetails!}
                            userId={e.userId!}
                            month={month}
                            year={year}
                            canOverride={canOverrideAttendance}
                            onRefresh={load}
                            theme={theme}
                          />
                        )}
                      </View>
                    )}
                  </ThemedView>
                );
              });
            })()}
          </>
        )}
      </ScrollView>

      {setSalaryEmployee && (
        <SetSalaryModal
          employee={setSalaryEmployee}
          onClose={() => setSetSalaryEmployee(null)}
          onSaved={() => { setSetSalaryEmployee(null); load(); }}
          theme={theme}
        />
      )}
      {editSalaryEmployee && (
        <EditSalaryModal
          employee={editSalaryEmployee}
          onClose={() => setEditSalaryEmployee(null)}
          onSaved={() => { setEditSalaryEmployee(null); load(); }}
          theme={theme}
        />
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold" style={styles.tabularNums}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Layout.cardGap, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.three },
  error: { color: '#B83030', marginTop: Spacing.one },
  notice: { color: '#167A48', marginTop: Spacing.one },
  spinner: { marginTop: Spacing.three },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  windowBanner: { borderRadius: Spacing.two, padding: Spacing.two },
  netPayableRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.one, paddingTop: Spacing.one, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(127,127,127,0.2)' },
  monthButton: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  card: { gap: Spacing.one },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabularNums: { fontVariant: ['tabular-nums'] },
  section: { gap: Spacing.two },
  sectionTitle: { marginTop: Spacing.two },
  row: { borderRadius: Spacing.three, padding: Spacing.three, minHeight: Layout.minTouchTarget, gap: Spacing.one },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  flex1: { flex: 1 },
  actionsRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  actionButton: { height: 40, paddingHorizontal: Spacing.three, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7A1C2E' },
  clearButton: { backgroundColor: '#B83030' },
  cancelButton: { backgroundColor: '#8A8A8E' },
  actionLabel: { color: '#ffffff', fontWeight: '600' },
  retryButton: { height: 44, paddingHorizontal: Spacing.four, borderRadius: Spacing.two, backgroundColor: '#7A1C2E', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginTop: Spacing.two },
  overrideForm: { gap: Spacing.one, marginTop: Spacing.one },
  input: { height: 42, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15 },
  payForm: { gap: Spacing.one, marginTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(127,127,127,0.2)', paddingTop: Spacing.two },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  skipToggle: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: Spacing.two, backgroundColor: 'rgba(127,127,127,0.2)' },
  skipToggleActive: { backgroundColor: '#B83030' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  modeChip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: 999 },
  paidBreakdown: { gap: Spacing.half, marginTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(127,127,127,0.2)', paddingTop: Spacing.two },
  paidBanner: { backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: Spacing.two, padding: Spacing.two },
  helperText: { marginTop: 2 },
  grossSalaryCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: Spacing.two, padding: Spacing.two, borderWidth: 1, borderColor: 'rgba(127,127,127,0.2)' },
  incentiveNote: { backgroundColor: 'rgba(99,102,241,0.08)', borderRadius: Spacing.two, padding: Spacing.two },
  deductionsHeading: { marginTop: Spacing.one, fontSize: 11, letterSpacing: 0.5 },
  outstandingCard: { backgroundColor: 'rgba(127,127,127,0.08)', borderRadius: Spacing.two, padding: Spacing.two, gap: 2 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checkboxTick: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  tbdLoanCard: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: Spacing.two, padding: Spacing.two, gap: 2 },
  tbdLoanLabel: { color: '#92400e', fontWeight: '700' },
  tbdLoanNote: { color: '#92400e', opacity: 0.85 },
  loanPlanCard: { borderRadius: Spacing.two, padding: Spacing.two, gap: 2, backgroundColor: 'rgba(127,127,127,0.08)' },
  loanPlanTitle: { fontWeight: '700' },
  carriedLabel: { color: '#b45309' },
  netPayableBanner: { backgroundColor: 'rgba(99,102,241,0.08)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', borderRadius: Spacing.two, padding: Spacing.two, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  disabledButton: { opacity: 0.5 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetScroll: { padding: Spacing.three, gap: Spacing.one },
  fieldLabel: { marginTop: Spacing.two },
  historySection: { marginTop: Spacing.three, gap: Spacing.half },
  unconfiguredRow: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(127,127,127,0.4)' },
  unconfiguredBadge: { backgroundColor: 'rgba(232,168,40,0.15)', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  unconfiguredBadgeLabel: { color: '#a86018' },
  setSalaryButton: { height: 36, paddingHorizontal: Spacing.two, borderRadius: Spacing.two, backgroundColor: '#7A1C2E', alignItems: 'center', justifyContent: 'center' },
  salaryColumn: { alignItems: 'flex-end', gap: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  advBadge: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  advBadgeLabel: { color: '#b91c1c' },
  paidPill: { backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  paidPillLabel: { color: '#15803d', fontWeight: '600' },
  expandedDetail: { gap: Spacing.two, marginTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(127,127,127,0.2)', paddingTop: Spacing.two },
  deductionBlock: { gap: 2 },
  subtotalRow: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(127,127,127,0.2)', paddingTop: Spacing.half, marginTop: Spacing.half },
  advanceDeductionsRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(245,158,11,0.07)', borderRadius: 4, paddingHorizontal: Spacing.one, paddingVertical: 2 },
  advanceDeductionsLabel: { color: '#92400e' },
  carryoverLabel: { color: '#b45309' },
  netPayableLabel: { color: '#22c55e' },
  attendanceGroupsRow: { flexDirection: 'row', gap: Spacing.two },
  attendanceGroupCard: { flex: 1, borderRadius: Spacing.two, padding: Spacing.two, backgroundColor: 'rgba(127,127,127,0.08)' },
  attendanceGroupHeading: { fontWeight: '600' },
  presentGroupLabel: { color: '#22c55e' },
  absentGroupLabel: { color: '#e06868' },
  lateAnalysisCard: { borderRadius: Spacing.two, padding: Spacing.two, backgroundColor: 'rgba(127,127,127,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', gap: Spacing.half },
  lateAnalysisHeading: { color: '#92400e' },
  paymentConfirmBanner: { borderRadius: Spacing.two, padding: Spacing.two, backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
  paidBannerHeading: { color: '#15803d', fontWeight: '700' },
  paidBannerSub: { color: '#166534', marginTop: 2 },
  editSalaryLink: { color: '#7A1C2E' },
  dayGridSection: { marginTop: Spacing.two },
  dayGridHeading: { color: '#8A8A8E', letterSpacing: 0.5, marginBottom: Spacing.two },
  gridToast: { borderRadius: Spacing.two, padding: Spacing.two, marginBottom: Spacing.two },
  dayBadgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  dayBadge: { width: 36, height: 36, borderRadius: Spacing.one, alignItems: 'center', justifyContent: 'center' },
  dayBadgeNum: { fontSize: 8, opacity: 0.7, lineHeight: 10 },
  dayBadgeLabel: { fontSize: 11, fontWeight: '700', lineHeight: 13 },
  overrideDot: { position: 'absolute', bottom: 2, width: 5, height: 5, borderRadius: 3, backgroundColor: '#60a5fa' },
  dayDetailPanel: { marginTop: Spacing.two, borderRadius: Spacing.three, padding: Spacing.three, borderWidth: 1, borderColor: 'rgba(127,127,127,0.2)' },
  overriddenNote: { color: '#60a5fa', marginTop: 2 },
  punchCard: { borderRadius: Spacing.two, padding: Spacing.two, backgroundColor: 'rgba(127,127,127,0.08)', marginTop: Spacing.two, gap: 2 },
  thresholdNote: { marginTop: Spacing.half },
  changeToLabel: { marginTop: Spacing.two, textTransform: 'uppercase', letterSpacing: 0.5 },
  statusChip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.half, borderRadius: Spacing.two, borderWidth: 1.5 },
  reasonInput: { height: 60, textAlignVertical: 'top', paddingTop: Spacing.one, marginTop: Spacing.one },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
  legendSwatch: { width: 20, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  legendSwatchLabel: { fontSize: 9, fontWeight: '700' },
  overrideDotLegend: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#60a5fa' },
  overridesSection: { marginTop: Spacing.three },
  overridesHeading: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  overrideHistoryRow: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.one, paddingHorizontal: Spacing.two, borderRadius: Spacing.two, marginTop: Spacing.half, backgroundColor: 'rgba(127,127,127,0.08)' },
  overrideHistoryDate: { minWidth: 40 },
});
