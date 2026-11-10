import * as Sharing from 'expo-sharing';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { downloadHrReport } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toYmd } from '@/lib/overview-format';
import type { HrReportFormat, HrReportKind } from '@/types/api';

// 4 roles only: the whole /hr-reports router is requireHROrOwner and the page
// carries salary / ID-number / approval data (no hr_module override).
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'];
const WIDE_MIN = 560;

const CATEGORIES: { key: HrReportKind; label: string; description: string }[] = [
  { key: 'hiring', label: 'Hiring', description: 'Applications, status, and AI interview/assignment scores for the range.' },
  { key: 'onboarding', label: 'Onboarding', description: 'Checklists started, document verification activity, and probation check-ins.' },
  { key: 'attendance', label: 'Attendance', description: 'Per-employee day-by-day attendance and rankings for any date range.' },
  { key: 'discipline', label: 'Discipline', description: 'Warnings, disciplinary actions, and acknowledgements issued in the range.' },
];

const monthAgo = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return toYmd(d);
};

// The dashboard's status colours.
const OK = '#22c55e';
const BAD = '#ef4444';

export default function HrReportsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const allowed = ADMIN_ROLES.includes(user?.role ?? '');

  const [width, setWidth] = useState(0);
  const [category, setCategory] = useState<HrReportKind>('hiring');
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(() => toYmd(new Date()));
  const [dlLoading, setDlLoading] = useState<string | null>(null);
  const [dlMsg, setDlMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (clearTimer.current) clearTimeout(clearTimer.current); }, []);

  // YYYY-MM-DD strings compare correctly as text, the same check the backend makes.
  const invalidRange = !from || !to || from > to;

  const handleDownload = async (format: HrReportFormat) => {
    if (invalidRange) return;
    setDlLoading(`${category}-${format}`);
    setDlMsg(null);
    try {
      // Same endpoint and filename as the dashboard; saved to the cache, then
      // handed to the device share sheet so it can be saved, opened or sent.
      const { uri, mimeType } = await downloadHrReport(category, from, to, format);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType, dialogTitle: 'Report' });
        setDlMsg({ ok: true, text: `${format.toUpperCase()} downloaded` });
      } else {
        setDlMsg({ ok: false, text: 'Sharing isn’t available on this device.' });
      }
    } catch {
      setDlMsg({ ok: false, text: `Failed to download ${format.toUpperCase()}` });
    } finally {
      setDlLoading(null);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => setDlMsg(null), 4000);
    }
  };

  if (!allowed) {
    return (
      <ThemedView style={styles.denied}>
        <Stack.Screen options={{ title: 'Reports' }} />
        <ThemedText themeColor="textMuted" style={styles.body}>Reports is available to Owner, Store Manager, HR and Accounting roles only.</ThemedText>
      </ThemedView>
    );
  }

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;
  const cols = wide ? 4 : 2;
  const rows: (typeof CATEGORIES)[] = [];
  for (let i = 0; i < CATEGORIES.length; i += cols) rows.push(CATEGORIES.slice(i, i + cols));

  // Same height as the DateField box (44 + its 1px borders), so the bottoms line up exactly.
  const pdfButton = (full: boolean) => (
    <Button variant="secondary" fullWidth={full} style={styles.btn} loading={dlLoading === `${category}-pdf`} disabled={invalidRange || dlLoading !== null} onPress={() => handleDownload('pdf')}>
      Download PDF
    </Button>
  );
  const excelButton = (full: boolean) => (
    <Button variant="secondary" fullWidth={full} style={styles.btn} loading={dlLoading === `${category}-excel`} disabled={invalidRange || dlLoading !== null} onPress={() => handleDownload('excel')}>
      Download Excel
    </Button>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Reports' }} />
      <ScrollView contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + 40, gap: 24 }}>
        <View>
          <ThemedText style={styles.h1}>Reports</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>
            Export Hiring, Onboarding, Attendance, or Discipline data for any date range as PDF or Excel.
          </ThemedText>
        </View>

        <View style={styles.stack}>
          <View style={styles.grid}>
            {rows.map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((c) => {
                  const selected = category === c.key;
                  return (
                    <View key={c.key} style={styles.cell}>
                      <Card
                        padding="md"
                        onPress={() => setCategory(c.key)}
                        style={[styles.card, selected && { borderColor: theme.primary, borderWidth: 2 }]}>
                        <ThemedText style={[styles.cardTitle, { color: selected ? theme.primary : theme.text }]}>{c.label}</ThemedText>
                        <ThemedText themeColor="textMuted" style={styles.cardText}>{c.description}</ThemedText>
                      </Card>
                    </View>
                  );
                })}
                {Array.from({ length: cols - row.length }).map((_, k) => <View key={`p${k}`} style={styles.cell} />)}
              </View>
            ))}
          </View>

          <Card padding="lg">
            {wide ? (
              // One line: From | To | Download PDF | Download Excel, bottom-aligned (wraps only if the width can't fit all four).
              <View style={styles.controlsWide}>
                <View style={styles.dateFixed}><DateField label="From" value={from} onChange={setFrom} /></View>
                <View style={styles.dateFixed}><DateField label="To" value={to} onChange={setTo} /></View>
                {pdfButton(false)}
                {excelButton(false)}
              </View>
            ) : (
              <View style={styles.controlsNarrow}>
                <View style={styles.pair}>
                  <View style={styles.half}><DateField label="From" value={from} onChange={setFrom} /></View>
                  <View style={styles.half}><DateField label="To" value={to} onChange={setTo} /></View>
                </View>
                <View style={styles.pair}>
                  <View style={styles.half}>{pdfButton(true)}</View>
                  <View style={styles.half}>{excelButton(true)}</View>
                </View>
              </View>
            )}
            {invalidRange ? (
              <ThemedText style={[styles.small, styles.msg, { color: BAD }]}>Pick a valid range — &quot;From&quot; must not be after &quot;To&quot;.</ThemedText>
            ) : null}
            {dlMsg ? <ThemedText style={[styles.small, styles.msg, { color: dlMsg.ok ? OK : BAD }]} accessibilityRole="alert">{dlMsg.text}</ThemedText> : null}
          </Card>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  denied: { flex: 1, padding: 24 },
  stack: { gap: 16 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, minWidth: 0 },
  card: { flex: 1 },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  cardTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  cardText: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  controlsWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 },
  dateFixed: { width: 160 },
  controlsNarrow: { gap: 12 },
  pair: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  half: { flex: 1, minWidth: 0 },
  btn: { height: 46 },
  msg: { marginTop: 8 },
});
