import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import * as XLSX from 'xlsx';

import { AdminCalendar } from '@/components/attendance/admin-calendar';
import { AbsentToday, AdminHeader, TodayAttendance } from '@/components/attendance/admin-today';
import { MONTH_NAMES, todayStr } from '@/components/attendance/attendance-format';
import { BulkMarkSheet } from '@/components/attendance/bulk-mark-sheet';
import { DayModal } from '@/components/attendance/day-modal';
import { ImportResultsSheet } from '@/components/attendance/import-results';
import { OverrideSheet } from '@/components/attendance/override-sheet';
import { MonthNav, RegisterGrid } from '@/components/attendance/register-grid';
import { ErrorBanner } from '@/components/overview/parts';
import { Button } from '@/components/ui';
import {
  downloadAttendanceReport, fetchAttendanceDailyLog, fetchAttendancePunches, fetchAttendanceRegister, getErrorMessage, importDeviceAttendance,
  type DeviceImportResult,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

// The dashboard's exact role gates for these actions (attendance/page.tsx:
// canBulkMark, canImport, canDownload, canOverride).
const CAN_BULK_MARK = ['OWNER', 'STORE_MANAGER'];
const CAN_IMPORT = ['OWNER', 'STORE_MANAGER'];
const CAN_DOWNLOAD = ['OWNER', 'STORE_MANAGER', 'HR'];
const CAN_OVERRIDE = ['OWNER', 'STORE_MANAGER'];

const WIDE_MIN = 560;

type DailyLog = Awaited<ReturnType<typeof fetchAttendanceDailyLog>>;
type Register = Awaited<ReturnType<typeof fetchAttendanceRegister>>;

// Dashboard AdminAttendance ("All Employees"): header + actions, Absent Today,
// Today's Attendance, then the month navigator, Monthly Register grid and the
// tap-a-day calendar, with the Override, Bulk Mark and Import Results sheets.
export function AdminAttendance() {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canBulkMark = CAN_BULK_MARK.includes(role);
  const canImport = CAN_IMPORT.includes(role);
  const canDownload = CAN_DOWNLOAD.includes(role);
  const canOverride = CAN_OVERRIDE.includes(role);

  const now = new Date();
  const today = todayStr();
  const [width, setWidth] = useState(0);
  const [viewMonth, setViewMonth] = useState({ month: now.getMonth(), year: now.getFullYear() });
  const isCurrentMonth = viewMonth.month === now.getMonth() && viewMonth.year === now.getFullYear();

  const [todayData, setTodayData] = useState<DailyLog | null>(null);
  const [regData, setRegData] = useState<Register | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPunches, setExpandedPunches] = useState<{ direction: 'IN' | 'OUT'; time: string }[]>([]);
  const [expandedLoading, setExpandedLoading] = useState(false);

  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalStatus, setModalStatus] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<{ empId: string; empName: string; date: string; currentStatus: string } | null>(null);
  const [bulkMarkOpen, setBulkMarkOpen] = useState(false);
  const [importResults, setImportResults] = useState<DeviceImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [dlLoading, setDlLoading] = useState<string | null>(null);
  const [dlMsg, setDlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const loadGen = useRef(0);

  const yyyy = viewMonth.year;
  const mm = String(viewMonth.month + 1).padStart(2, '0');
  const fromDate = `${yyyy}-${mm}-01`;
  // Past months run to their last day; the current month to today.
  const toDate = isCurrentMonth ? today : new Date(Date.UTC(viewMonth.year, viewMonth.month + 1, 0)).toISOString().split('T')[0];

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    setLoading(true);
    setRegData(null); // clear stale data so the skeleton shows during navigation
    setErrorMsg(null);
    try {
      const [td, rd] = await Promise.all([fetchAttendanceDailyLog(today), fetchAttendanceRegister(fromDate, toDate)]);
      if (gen !== loadGen.current) return; // a newer navigation superseded this response
      setTodayData(td);
      setRegData(rd);
    } catch (err: unknown) {
      if (gen === loadGen.current) setErrorMsg(getErrorMessage(err, 'Failed to load attendance.'));
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, [today, fromDate, toDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / month change
    void load();
  }, [load]);

  // ?date=YYYY-MM-DD&status=PRESENT|LATE|ABSENT: jump the register to that month
  // and open the day sheet pre-filtered, like the dashboard's deep link.
  const params = useLocalSearchParams<{ date?: string; status?: string }>();
  useEffect(() => {
    const d = params.date;
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const [y, m] = d.split('-').map(Number);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep link
    setViewMonth({ month: m - 1, year: y });
    setModalDate(d);
    if (params.status) setModalStatus(params.status);
  }, [params.date, params.status]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleExpanded = async (empId: string) => {
    if (expandedId === empId) { setExpandedId(null); return; }
    setExpandedId(empId);
    setExpandedLoading(true);
    try { setExpandedPunches(await fetchAttendancePunches(empId, today)); }
    catch { setExpandedPunches([]); }
    finally { setExpandedLoading(false); }
  };

  const copyAbsentees = async () => {
    if (!todayData?.absentees?.length) return;
    await Clipboard.setStringAsync(todayData.absentees.map((p, i) => `${i + 1}. ${p.name}`).join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Import from Device: an .xls/.xlsx punch export (ID | Name | Time | …),
  // first punch per (ID, date), exactly as the dashboard parses it.
  const handleImportFile = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    setImporting(true);
    setErrorMsg(null);
    try {
      const b64 = await FileSystem.readAsStringAsync(picked.assets[0].uri, { encoding: FileSystem.EncodingType.Base64 });
      const workbook = XLSX.read(b64, { type: 'base64' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as string[][];
      const seen = new Map<string, { deviceUserId: string; name: string; punchTime: string }>();
      for (const row of rawRows) {
        if (!row || row.length < 3) continue;
        const deviceUserId = String(row[0] || '').trim();
        const name = String(row[1] || '').trim();
        const timeStr = String(row[2] || '').trim();
        if (!deviceUserId || !timeStr || !/\d{4}\/\d{2}\/\d{2}/.test(timeStr)) continue;
        const iso = timeStr.replace(/\//g, '-').replace(' ', 'T') + '+05:30';
        const key = `${deviceUserId}::${timeStr.slice(0, 10)}`;
        if (!seen.has(key)) seen.set(key, { deviceUserId, name, punchTime: iso });
      }
      const rows = Array.from(seen.values());
      if (rows.length === 0) { setErrorMsg('No valid rows found in file'); return; }
      setImportResults(await importDeviceAttendance(rows));
      void load();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDownload = async (kind: 'daily' | 'monthly', format: 'pdf' | 'excel') => {
    setDlLoading(`${kind}-${format}`);
    setDlMsg(null);
    try {
      const { uri } = kind === 'daily'
        ? await downloadAttendanceReport('daily', { date: today, format })
        : await downloadAttendanceReport('monthly', { month: viewMonth.month + 1, year: viewMonth.year, format });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      setDlMsg({ ok: true, text: `${kind === 'daily' ? 'Daily' : 'Monthly'} ${format.toUpperCase()} downloaded` });
    } catch {
      setDlMsg({ ok: false, text: `Failed to download ${kind} ${format.toUpperCase()}` });
    } finally {
      setDlLoading(null);
      setTimeout(() => setDlMsg(null), 4000);
    }
  };

  const prevMonth = () => setViewMonth((p) => (p.month === 0 ? { month: 11, year: p.year - 1 } : { ...p, month: p.month - 1 }));
  const nextMonth = () => { if (!isCurrentMonth) setViewMonth((p) => (p.month === 11 ? { month: 0, year: p.year + 1 } : { ...p, month: p.month + 1 })); };

  // After an override: refetch the register so the ✏️ marker appears.
  const refreshRegister = () => { fetchAttendanceRegister(fromDate, toDate).then(setRegData).catch(() => {}); };

  const wide = width >= WIDE_MIN;
  const monthTitle = `${MONTH_NAMES[viewMonth.month]} ${yyyy}`;

  return (
    <View style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <AdminHeader
          wide={wide}
          primaryActions={
            <>
              {canBulkMark ? <Button size="sm" icon="clipboard-outline" onPress={() => setBulkMarkOpen(true)}>Bulk Mark Attendance</Button> : null}
              {canImport ? <Button size="sm" variant="secondary" icon="cloud-upload-outline" disabled={importing} onPress={handleImportFile}>{importing ? 'Importing...' : 'Import from Device'}</Button> : null}
            </>
          }
          canDownload={canDownload}
          monthTitle={monthTitle}
          dlLoading={dlLoading}
          dlMsg={dlMsg}
          onDownload={handleDownload}
        />
        {errorMsg ? <ErrorBanner message={errorMsg} onRetry={load} /> : null}

        <AbsentToday data={todayData} loading={loading} copied={copied} onCopy={copyAbsentees} />
        <TodayAttendance
          data={todayData}
          regData={regData}
          loading={loading}
          today={today}
          search={search}
          onSearch={setSearch}
          expandedId={expandedId}
          expandedLoading={expandedLoading}
          expandedPunches={expandedPunches}
          onToggle={toggleExpanded}
        />

        <MonthNav title={monthTitle} subtitle="Monthly Register" isCurrentMonth={isCurrentMonth} wide={wide} onPrev={prevMonth} onNext={nextMonth} />

        <RegisterGrid
          regData={regData}
          loading={loading}
          wide={wide}
          search={search}
          canOverride={canOverride}
          onOpenOverride={(empId, empName, date, currentStatus) => setOverrideTarget({ empId, empName, date, currentStatus })}
          onOpenDay={setModalDate}
        />

        <AdminCalendar month={viewMonth.month} year={yyyy} isCurrentMonth={isCurrentMonth} onOpenDay={setModalDate} />
      </ScrollView>

      {modalDate ? (
        <DayModal date={modalDate} initialSearch={search} onSearchChange={setSearch} initialStatus={modalStatus} onClose={() => { setModalDate(null); setModalStatus(null); }} />
      ) : null}
      {overrideTarget ? <OverrideSheet target={overrideTarget} onClose={() => setOverrideTarget(null)} onSaved={refreshRegister} /> : null}
      {bulkMarkOpen ? <BulkMarkSheet onClose={() => setBulkMarkOpen(false)} onSuccess={() => { setBulkMarkOpen(false); void load(); }} /> : null}
      {importResults ? <ImportResultsSheet result={importResults} onClose={() => setImportResults(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  content: { padding: 16, gap: 24, width: '100%', maxWidth: 1200, alignSelf: 'center', paddingBottom: 48 },
});
