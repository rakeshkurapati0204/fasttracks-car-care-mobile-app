import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardBox, PageHeader, Restricted, fmtShort, useMdmAccess } from '@/components/devices/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchDeviceAlertsFull, markDeviceAlertRead } from '@/lib/api';
import type { DeviceAlertFull } from '@/types/api';

// Dashboard Device Alerts (devices/alerts/page.tsx): unread alerts, one coloured chip per alert type,
// Dismiss per alert, Mark all read, Refresh, "All clear!" when empty. OWNER / STORE_MANAGER / HR only.
const ALERT_STYLE: Record<string, { bg: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  OUTSIDE_GEOFENCE: { bg: 'rgba(251,191,36,0.15)', color: '#b45309', icon: 'location-outline' },
  DEVICE_OFFLINE: { bg: 'rgba(100,116,139,0.15)', color: '#64748b', icon: 'cloud-offline-outline' },
  UNAUTHORIZED_APP: { bg: 'rgba(239,68,68,0.15)', color: '#b91c1c', icon: 'ban-outline' },
  LOW_BATTERY: { bg: 'rgba(249,115,22,0.15)', color: '#c2410c', icon: 'battery-dead-outline' },
  DEVICE_LOCKED: { bg: 'rgba(59,130,246,0.15)', color: '#1d4ed8', icon: 'lock-closed-outline' },
};

export default function DeviceAlertsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { canAccess } = useMdmAccess();
  const [alerts, setAlerts] = useState<DeviceAlertFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setAlerts(await fetchDeviceAlertsFull()); } catch { /* the dashboard logs and shows the empty state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (canAccess) load();
  }, [canAccess, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const markRead = async (id: string) => {
    try { await markDeviceAlertRead(id); setAlerts((prev) => prev.filter((a) => a.id !== id)); } catch { /* swallowed, like the dashboard */ }
  };
  const markAllRead = async () => {
    try { await Promise.all(alerts.map((a) => markDeviceAlertRead(a.id))); setAlerts([]); } catch { /* swallowed, like the dashboard */ }
  };

  if (!canAccess) return <Restricted message="Access restricted." />;

  return (
    <ThemedView style={styles.flex1}>
      <Stack.Screen options={{ title: 'Device Alerts' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <PageHeader
          title="Device Alerts"
          subtitle={`${alerts.length} unread alert${alerts.length !== 1 ? 's' : ''}`}
          right={
            <View style={styles.btns}>
              <Button variant="outline" onPress={load}>↻ Refresh</Button>
              {alerts.length > 0 ? <Button variant="outline" onPress={markAllRead}>Mark all read</Button> : null}
            </View>
          }
        />

        {loading ? (
          <View style={styles.gap}><Skeleton height={84} /><Skeleton height={84} /></View>
        ) : alerts.length === 0 ? (
          <CardBox pad={32} style={styles.emptyBox}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#16a34a" />
            <ThemedText style={styles.emptyTitle}>All clear!</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.emptySub}>No unread device alerts.</ThemedText>
          </CardBox>
        ) : (
          <View style={styles.gap}>
            {alerts.map((alert) => {
              const style = ALERT_STYLE[alert.alertType] ?? ALERT_STYLE.DEVICE_OFFLINE;
              return (
                <CardBox key={alert.id}>
                  <View style={styles.row}>
                    <View style={[styles.icon, { backgroundColor: style.bg }]}><Ionicons name={style.icon} size={20} color={style.color} /></View>
                    <View style={styles.flex1}>
                      <View style={styles.top}>
                        <View style={[styles.chip, { backgroundColor: style.bg }]}>
                          <ThemedText style={[styles.chipText, { color: style.color }]}>{alert.alertType.replace(/_/g, ' ')}</ThemedText>
                        </View>
                        <ThemedText themeColor="textMuted" style={styles.small}>{fmtShort(alert.createdAt)}</ThemedText>
                      </View>
                      <ThemedText themeColor="textMuted" style={styles.small}>{alert.device.deviceName} · {alert.device.deviceType}</ThemedText>
                      <ThemedText style={styles.msg}>{alert.message}</ThemedText>
                    </View>
                  </View>
                  <Pressable onPress={() => markRead(alert.id)} accessibilityRole="button" style={[styles.dismiss, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                    <ThemedText themeColor="textMuted" style={styles.small}>Dismiss</ThemedText>
                  </Pressable>
                </CardBox>
              );
            })}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { padding: 16, gap: 24 },
  gap: { gap: 12 },
  btns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  emptyBox: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontFamily: FontWeights.semiBold },
  emptySub: { fontSize: 14 },
  row: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  icon: { width: 40, height: 40, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  small: { fontSize: 12, lineHeight: 16 },
  msg: { marginTop: 6, fontSize: 14, lineHeight: 20 },
  dismiss: { alignSelf: 'flex-end', marginTop: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radii.sm, borderWidth: 1 },
});
