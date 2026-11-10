import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardBox, Dot, PageHeader, Restricted, fmtShort, mapsUrl, useMdmAccess, useWidth } from '@/components/devices/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Skeleton } from '@/components/ui';
import { FontWeights, Fonts, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchDevicesFull } from '@/lib/api';
import { openExternalUrl } from '@/lib/open-url';
import type { DeviceFull } from '@/types/api';

// Dashboard Live Location (devices/location/page.tsx): devices that have a location, inside / outside the
// two 200 m office geofences, summary chips, office links, auto-refresh every 60 s (foreground only here).
const GEOFENCES = [
  { name: 'Jubilee Hills (Road No. 45)', lat: 17.4305, lng: 78.4084 },
  { name: 'Minister Road, Hyderabad', lat: 17.3871, lng: 78.4776 },
];

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function insideGeofence(lat: number, lng: number): { inside: boolean; name?: string } {
  for (const gf of GEOFENCES) {
    if (haversine(lat, lng, gf.lat, gf.lng) <= 200) return { inside: true, name: gf.name };
  }
  return { inside: false };
}

export default function LiveLocationScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { canAccess } = useMdmAccess();
  const { wide, onLayout } = useWidth();
  const [devices, setDevices] = useState<DeviceFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await fetchDevicesFull();
      setDevices(all.filter((d) => d.currentLocation));
      setLastRefresh(new Date());
    } catch { /* the dashboard logs and shows the empty state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!canAccess) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
    const t = setInterval(() => { if (AppState.currentState === 'active') load(); }, 60000);
    return () => clearInterval(t);
  }, [canAccess, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!canAccess) return <Restricted message="Access restricted." />;

  const withLoc = devices.filter((d) => d.currentLocation);
  const inside = withLoc.filter((d) => insideGeofence(d.currentLocation!.latitude, d.currentLocation!.longitude).inside).length;
  const outside = withLoc.length - inside;

  return (
    <ThemedView style={styles.flex1} onLayout={onLayout}>
      <Stack.Screen options={{ title: 'Live Location' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <PageHeader
          title="Live Location"
          subtitle={`Refreshed ${fmtShort(lastRefresh.toISOString())} · auto-refresh every 60s`}
          right={<Button variant="outline" onPress={load}>↻ Refresh</Button>}
        />

        <View style={styles.chips}>
          <View style={[styles.chip, { backgroundColor: 'rgba(34,197,94,0.15)' }]}>
            <Dot on size={8} color="#22c55e" /><ThemedText style={[styles.chipText, { color: '#15803d' }]}>{inside} inside geofence</ThemedText>
          </View>
          <View style={[styles.chip, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
            <Dot on size={8} color="#ef4444" /><ThemedText style={[styles.chipText, { color: '#b91c1c' }]}>{outside} outside geofence</ThemedText>
          </View>
        </View>

        <View style={[styles.offices, wide && styles.officesWide]}>
          {GEOFENCES.map((gf) => (
            <Pressable key={gf.name} onPress={() => openExternalUrl(`${mapsUrl(gf.lat, gf.lng)}&z=17`)} accessibilityRole="link" style={[styles.office, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.flex1]}>
              <Ionicons name="business-outline" size={24} color={theme.text} />
              <View style={styles.flex1}>
                <ThemedText numberOfLines={1} style={styles.officeName}>{gf.name}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.small}>{gf.lat.toFixed(4)}, {gf.lng.toFixed(4)} · 200m radius</ThemedText>
              </View>
              <ThemedText style={[styles.small, { color: theme.primary }]}>Open ↗</ThemedText>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <View style={styles.gap}><Skeleton height={80} /><Skeleton height={80} /></View>
        ) : withLoc.length === 0 ? (
          <CardBox pad={32} style={styles.emptyBox}>
            <Ionicons name="map-outline" size={48} color={theme.textMuted} />
            <ThemedText style={styles.emptyTitle}>No location data yet</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.emptySub}>Devices appear here once they send their first location ping.</ThemedText>
          </CardBox>
        ) : (
          <View style={styles.gapS}>
            {withLoc.map((device) => {
              const loc = device.currentLocation!;
              const geo = insideGeofence(loc.latitude, loc.longitude);
              return (
                <CardBox key={device.id} border={geo.inside ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}>
                  <View style={styles.row}>
                    <Dot on size={12} color={geo.inside ? '#22c55e' : '#ef4444'} />
                    <View style={styles.flex1}>
                      <ThemedText style={styles.devName}>
                        {device.deviceName}
                        {device.isLocked ? <ThemedText style={[styles.small, { color: '#b91c1c' }]}>{'  '}🔒 Locked</ThemedText> : null}
                      </ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.small}>
                        {device.user?.name ?? 'Unassigned'} · {device.deviceType} ·{' '}
                        {geo.inside ? <ThemedText style={[styles.small, { color: '#15803d' }]}>✓ {geo.name}</ThemedText> : <ThemedText style={[styles.small, { color: '#b91c1c' }]}>⚠ Outside geofence</ThemedText>}
                      </ThemedText>
                      <ThemedText themeColor="textMuted" style={[styles.small, { fontFamily: Fonts?.mono, marginTop: 2 }]}>{loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}</ThemedText>
                    </View>
                    <View style={styles.right}>
                      <Dot on={device.isOnline} />
                      <Pressable onPress={() => openExternalUrl(mapsUrl(loc.latitude, loc.longitude))} accessibilityRole="link" style={[styles.maps, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                        <ThemedText style={[styles.small, { color: theme.primary }]}>Maps ↗</ThemedText>
                      </Pressable>
                    </View>
                  </View>
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
  gapS: { gap: 8 },
  chips: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  chipText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  offices: { gap: 12 },
  officesWide: { flexDirection: 'row' },
  office: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radii.md, borderWidth: 1 },
  officeName: { fontSize: 14, fontFamily: FontWeights.medium },
  small: { fontSize: 12, lineHeight: 16 },
  emptyBox: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: FontWeights.semiBold },
  emptySub: { fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  devName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  right: { alignItems: 'flex-end', gap: 6 },
  maps: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.sm, borderWidth: 1 },
});
