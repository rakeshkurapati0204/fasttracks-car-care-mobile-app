import * as Sharing from 'expo-sharing';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { downloadMyPayslip, fetchMyPayslips, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { PayslipListItem } from '@/types/api';

const WIDE_MIN = 560;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ₹45,000: Indian grouping, no decimals.
function fmt(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}
// The dashboard's formatDateTime (IST).
function formatDateTime(iso: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

// No role check, like the dashboard: GET /payslips/mine is self-scoped
// server-side, so every signed-in user simply sees their own payslips.
export default function MyPayslipsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [width, setWidth] = useState(0);
  const [payslips, setPayslips] = useState<PayslipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setPayslips(await fetchMyPayslips());
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load your payslips.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    if (user) load();
  }, [user, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // Saved to the cache as payslip-<name>-<month>-<year>.pdf, then opened in the
  // device's share sheet so it can be saved, opened or sent.
  const download = async (p: PayslipListItem) => {
    setDownloadError('');
    setDownloadingId(p.id);
    try {
      const { uri } = await downloadMyPayslip(p.id, p.month, p.year, user?.name || 'payslip');
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
      else setDownloadError('Sharing isn’t available on this device.');
    } catch (err: unknown) {
      setDownloadError(err instanceof Error && err.message ? err.message : 'Failed to download this payslip.');
    } finally {
      setDownloadingId(null);
    }
  };

  const wide = width >= WIDE_MIN;

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'My Payslips' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View>
          <ThemedText style={styles.h1}>My Payslips</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Issued payslips, newest first.</ThemedText>
        </View>

        {downloadError ? (
          <View style={[styles.banner, { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
            <ThemedText style={[styles.bannerText, { color: theme.danger }]}>{downloadError}</ThemedText>
          </View>
        ) : null}

        <Card padding="none" style={styles.clip}>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <View key={i} style={[styles.skelRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <Skeleton width={112} height={16} />
                <Skeleton width={80} height={16} />
              </View>
            ))
          ) : error ? (
            <View style={styles.center}>
              <ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText>
              <Pressable onPress={load} hitSlop={8} accessibilityRole="button" style={styles.retry}>
                <ThemedText style={[styles.retryText, { color: theme.primary }]}>Try again</ThemedText>
              </Pressable>
            </View>
          ) : payslips.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.background }]}><ThemedText style={styles.emoji}>🧾</ThemedText></View>
              <ThemedText themeColor="textMuted" style={styles.body}>No payslips issued yet.</ThemedText>
            </View>
          ) : (
            payslips.map((p, i) => (
              <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <View style={styles.flex1}>
                  <ThemedText style={styles.month}>{`${MONTH_NAMES[p.month - 1]} ${p.year}`}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.issued}>{`Issued ${formatDateTime(p.generatedAt)}`}</ThemedText>
                </View>
                <View style={styles.right}>
                  <ThemedText style={styles.net}>{fmt(p.netPay)}</ThemedText>
                  <Button size="sm" variant="secondary" loading={downloadingId === p.id} disabled={downloadingId !== null && downloadingId !== p.id} onPress={() => download(p)}>Download</Button>
                </View>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { gap: 24, width: '100%', maxWidth: 768, alignSelf: 'center' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20 },
  body: { fontSize: 14, lineHeight: 20 },
  banner: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  clip: { overflow: 'hidden' },
  skelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  center: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 16 },
  retry: { marginTop: 12, minHeight: 36, justifyContent: 'center' },
  retryText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, gap: 8 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24, lineHeight: 30 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  month: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  issued: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0 },
  net: { fontSize: 14, lineHeight: 20, fontFamily: Fonts?.mono, fontWeight: '700', color: '#22c55e' },
});
