import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { CardBox, Dot, PageHeader, Restricted, Tag, fmtDateTime, mapsUrl, useMdmAccess, useWidth } from '@/components/devices/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Select, Skeleton } from '@/components/ui';
import { FontWeights, Fonts, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchDevicesFull, generateEnrollmentCode, lockDevice, unenrollDevice, unlockDevice } from '@/lib/api';
import { openExternalUrl } from '@/lib/open-url';
import type { DeviceFull } from '@/types/api';

// Mirrors the dashboard's Device Management page (devices/page.tsx). MDM_ROLES = OWNER, STORE_MANAGER, HR
// (every /devices route); lock / unlock / unenroll buttons only for OWNER and STORE_MANAGER (requireOwnerMgr).
// Alerts, App Policies and Live Location are their own screens, as in the dashboard's sidebar.
const TYPE_ICON: Record<string, string> = { WINDOWS: 'PC', ANDROID: 'Android', IOS: 'iOS', MAC: 'Mac' };
const AGENT_URLS = { windows: '/downloads/fasttracks-agent.exe', android: '/downloads/fasttracks-mdm.apk' };
const BACKEND_URL = 'https://dashboard.fasttrackscarcare.in';

export default function DevicesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user, canAccess } = useMdmAccess();
  const { width, wide, onLayout } = useWidth();
  const cols = width >= 900 ? 3 : wide ? 2 : 1;

  const [devices, setDevices] = useState<DeviceFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollCode, setEnrollCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [detail, setDetail] = useState<DeviceFull | null>(null);
  const [actionLoading, setActionLoading] = useState('');
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: { deviceType?: string; status?: string } = {};
      if (filterType) params.deviceType = filterType;
      if (filterStatus) params.status = filterStatus;
      setDevices(await fetchDevicesFull(params));
    } catch { /* the dashboard logs and shows the empty state */ }
    finally { setLoading(false); }
  }, [filterType, filterStatus]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on filter change
    if (canAccess) load();
  }, [canAccess, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const generate = async () => {
    setEnrollCode('');
    setCopied(false);
    setEnrollOpen(true);
    try {
      const r = await generateEnrollmentCode();
      if (!r.enrollmentCode) throw new Error('No enrollment code returned');
      setEnrollCode(r.enrollmentCode);
    } catch {
      setEnrollCode('(error — try again)');
    }
  };

  const copyCode = async () => {
    if (!enrollCode || enrollCode.startsWith('(')) return;
    try { await Clipboard.setStringAsync(enrollCode); } catch { return; }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const setLocked = async (id: string, lock: boolean) => {
    setActionLoading(`${id}-${lock ? 'lock' : 'unlock'}`);
    try {
      await (lock ? lockDevice(id) : unlockDevice(id));
      setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, isLocked: lock } : d)));
      setDetail((d) => (d && d.id === id ? { ...d, isLocked: lock } : d));
    } catch { /* dashboard swallows to the console */ }
    finally { setActionLoading(''); }
  };

  const unenroll = (id: string) => {
    Alert.alert('Unenroll this device?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK', style: 'destructive',
        onPress: async () => {
          try {
            await unenrollDevice(id);
            setDevices((prev) => prev.filter((d) => d.id !== id));
            setDetail(null);
          } catch { /* swallowed, like the dashboard */ }
        },
      },
    ]);
  };

  if (!canAccess) return <Restricted message="Access restricted to Owner, Store Manager, and HR." />;

  const online = devices.filter((d) => d.isOnline).length;
  const stats = [
    { label: 'Total', value: devices.length, color: theme.text },
    { label: 'Online', value: online, color: '#16a34a' },
    { label: 'Locked', value: devices.filter((d) => d.isLocked).length, color: '#dc2626' },
    { label: 'Alerts', value: devices.reduce((s, d) => s + (d.alerts?.length ?? 0), 0), color: '#d97706' },
  ];
  const canLock = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER';
  const itemW = cols > 1 ? Math.floor((width - 32 - 16 * (cols - 1)) / cols) : undefined;
  const codeBad = !enrollCode || enrollCode.startsWith('(');

  return (
    <ThemedView style={styles.flex1} onLayout={onLayout}>
      <Stack.Screen options={{ title: 'Devices' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <PageHeader
          title="Device Management"
          subtitle={`${devices.length} device${devices.length !== 1 ? 's' : ''} enrolled · ${online} online`}
          right={<Button icon="add" onPress={generate}>Enroll Device</Button>}
        />

        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }, wide && styles.statWide]}>
              <ThemedText style={[styles.statValue, { color: s.color }]}>{s.value}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.statLabel}>{s.label}</ThemedText>
            </View>
          ))}
        </View>

        <View style={[styles.filters, wide && styles.filtersWide]}>
          <View style={wide ? styles.filterW : undefined}>
            <Select value={filterType} onChange={setFilterType} options={[{ value: '', label: 'All Types' }, ...['WINDOWS', 'ANDROID', 'IOS', 'MAC'].map((t) => ({ value: t, label: t }))]} />
          </View>
          <View style={wide ? styles.filterW : undefined}>
            <Select value={filterStatus} onChange={setFilterStatus} options={[{ value: '', label: 'All Status' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }, { value: 'locked', label: 'Locked' }]} />
          </View>
          <Button variant="outline" onPress={load}>↻ Refresh</Button>
        </View>

        {loading ? (
          <View style={styles.gap}><Skeleton height={120} /><Skeleton height={120} /></View>
        ) : devices.length === 0 ? (
          <CardBox pad={32} style={styles.emptyBox}>
            <Ionicons name="phone-portrait-outline" size={40} color={theme.textMuted} />
            <ThemedText style={styles.emptyTitle}>No devices enrolled yet</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.emptySub}>Click Enroll Device to get started.</ThemedText>
            <Button onPress={generate}>Enroll First Device</Button>
          </CardBox>
        ) : (
          <View style={styles.grid}>
            {devices.map((d) => (
              <Pressable key={d.id} onPress={() => setDetail(d)} accessibilityRole="button" style={[itemW ? { width: itemW } : styles.full]}>
                <CardBox border={d.isLocked ? 'rgba(220,38,38,0.4)' : undefined}>
                  <View style={styles.cardTop}>
                    <View style={styles.rowC}>
                      <ThemedText style={styles.typeIcon}>{TYPE_ICON[d.deviceType]}</ThemedText>
                      <View style={styles.flex1}>
                        <ThemedText numberOfLines={1} style={styles.devName}>{d.deviceName}</ThemedText>
                        <ThemedText numberOfLines={1} themeColor="textMuted" style={styles.small}>{d.deviceType}{d.deviceModel ? ` · ${d.deviceModel}` : ''}</ThemedText>
                      </View>
                    </View>
                    <View style={styles.tags}>
                      <View style={styles.rowC}>
                        <Dot on={d.isOnline} />
                        <ThemedText themeColor="textMuted" style={styles.small}>{d.isOnline ? 'Online' : 'Offline'}</ThemedText>
                      </View>
                      {d.isLocked ? <Tag label="Locked" bg="rgba(220,38,38,0.15)" fg="#b91c1c" /> : null}
                      {d.isCompanyOwned ? <Tag label="Company" bg="rgba(59,130,246,0.15)" fg="#1d4ed8" /> : null}
                    </View>
                  </View>
                  <View style={styles.meta}>
                    <ThemedText themeColor="textMuted" style={styles.small}>User: <ThemedText style={styles.small}>{d.user?.name ?? 'Unassigned'}</ThemedText></ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.small}>Last seen: {fmtDateTime(d.lastSeen)}</ThemedText>
                    {(d.alerts?.length ?? 0) > 0 ? <Tag label={`${d.alerts!.length} alert${d.alerts!.length > 1 ? 's' : ''}`} bg="rgba(239,68,68,0.15)" fg="#b91c1c" /> : null}
                  </View>
                </CardBox>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {detail ? (
        <Sheet visible fullHeight onClose={() => setDetail(null)} title={`${TYPE_ICON[detail.deviceType]} ${detail.deviceName}`}>
          <View style={[styles.table, { borderColor: theme.border }]}>
            {([
              ['Type', detail.deviceType],
              ['Model', detail.deviceModel ?? '—'],
              ['OS Version', detail.osVersion ?? '—'],
              ['Ownership', detail.isCompanyOwned ? 'Company Owned' : 'Personal (BYOD)'],
              ['Status', detail.isOnline ? 'Online' : 'Offline'],
              ['Lock Status', detail.isLocked ? 'Locked' : 'Unlocked'],
              ['Assigned User', detail.user?.name ?? 'Unassigned'],
              ['User Role', detail.user?.role ?? '—'],
              ['Last Seen', fmtDateTime(detail.lastSeen)],
              ['Enrolled', fmtDateTime(detail.registeredAt)],
            ] as [string, string][]).map(([k, v], i) => (
              <View key={k} style={[styles.tr, { backgroundColor: i % 2 === 0 ? theme.backgroundElement : 'transparent' }]}>
                <ThemedText themeColor="textMuted" style={styles.k}>{k}</ThemedText>
                <ThemedText style={styles.v}>{v}</ThemedText>
              </View>
            ))}
          </View>
          {detail.currentLocation ? (
            <Pressable onPress={() => openExternalUrl(mapsUrl(detail.currentLocation!.latitude, detail.currentLocation!.longitude))} accessibilityRole="link"
              style={[styles.mapLink, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Ionicons name="location-outline" size={14} color={theme.primary} />
              <ThemedText style={{ color: theme.primary, fontSize: 14 }}>View last location on Google Maps ↗</ThemedText>
            </Pressable>
          ) : null}
          {canLock ? (
            <View style={styles.actions}>
              {detail.isLocked ? (
                <Button onPress={() => setLocked(detail.id, false)} loading={actionLoading === `${detail.id}-unlock`} style={{ backgroundColor: '#16a34a' }}>Unlock Device</Button>
              ) : (
                <Button variant="danger" onPress={() => setLocked(detail.id, true)} loading={actionLoading === `${detail.id}-lock`}>Lock Device</Button>
              )}
              <Button variant="outline" onPress={() => unenroll(detail.id)}>Unenroll</Button>
            </View>
          ) : null}
        </Sheet>
      ) : null}

      {enrollOpen ? (
        <Sheet visible fullHeight onClose={() => setEnrollOpen(false)} title="Enroll New Device">
          <ThemedText themeColor="textMuted" style={styles.p}>
            Share this enrollment code with the device user. They enter it when first launching the Windows Agent or Android APK.
          </ThemedText>
          <View style={styles.center}>
            <View style={[styles.code, { backgroundColor: theme.backgroundElement }]}>
              {enrollCode ? <ThemedText style={[styles.codeText, { color: theme.primary }]} selectable>{enrollCode}</ThemedText> : <ThemedText themeColor="textMuted" style={styles.small}>Generating…</ThemedText>}
            </View>
            <Pressable onPress={copyCode} disabled={codeBad} accessibilityRole="button" style={{ opacity: codeBad ? 0.4 : 1, marginTop: 8 }}>
              <ThemedText style={[styles.copy, { color: copied ? '#22c55e' : theme.textMuted }]}>{copied ? '✓ Copied!' : 'Copy code'}</ThemedText>
            </Pressable>
          </View>
          <CardBox pad={16}>
            <ThemedText style={styles.dlTitle}>Download Agents</ThemedText>
            <View style={styles.gap}>
              <Pressable onPress={() => openExternalUrl(`${BACKEND_URL}${AGENT_URLS.windows}`)} accessibilityRole="button" style={[styles.dl, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="desktop-outline" size={14} color={theme.text} />
                <ThemedText style={styles.dlText}>Windows Agent (fasttracks-agent.exe)</ThemedText>
              </Pressable>
              <Pressable onPress={() => openExternalUrl(`${BACKEND_URL}${AGENT_URLS.android}`)} accessibilityRole="button" style={[styles.dl, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="phone-portrait-outline" size={14} color={theme.text} />
                <ThemedText style={styles.dlText}>Android MDM App (fasttracks-mdm.apk)</ThemedText>
              </Pressable>
            </View>
          </CardBox>
          <ThemedText themeColor="textMuted" style={styles.small}>
            <ThemedText style={[styles.small, { fontFamily: FontWeights.bold }]}>Instructions:</ThemedText> Install the agent → Enter backend URL <ThemedText style={[styles.small, { fontFamily: Fonts?.mono }]}>{BACKEND_URL}</ThemedText> → Enter the enrollment code above → Login with Fasttracks credentials.
          </ThemedText>
        </Sheet>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  gap: { gap: 8 },
  content: { padding: 16, gap: 24 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: Radii.lg, padding: 16, alignItems: 'center' },
  statWide: { flexBasis: '22%' },
  statValue: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  statLabel: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  filters: { gap: 12 },
  filtersWide: { flexDirection: 'row', alignItems: 'center' },
  filterW: { minWidth: 160 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  full: { width: '100%' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  rowC: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  typeIcon: { fontSize: 13, fontFamily: FontWeights.bold },
  devName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 16 },
  tags: { alignItems: 'flex-end', gap: 4 },
  meta: { marginTop: 12, gap: 4 },
  emptyBox: { alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 16, fontFamily: FontWeights.semiBold },
  emptySub: { fontSize: 14, marginBottom: 8 },
  table: { borderWidth: 1, borderRadius: Radii.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  k: { width: 110, fontSize: 14, fontFamily: FontWeights.medium },
  v: { flex: 1, fontSize: 14 },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: Radii.md, borderWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  p: { fontSize: 14, lineHeight: 20 },
  center: { alignItems: 'center' },
  code: { minHeight: 56, minWidth: 200, paddingHorizontal: 24, paddingVertical: 16, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  codeText: { fontSize: 20, lineHeight: 28, fontFamily: Fonts?.mono, letterSpacing: 1 },
  copy: { fontSize: 14, textDecorationLine: 'underline' },
  dlTitle: { fontSize: 14, fontFamily: FontWeights.semiBold, marginBottom: 12 },
  dl: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderRadius: Radii.md, borderWidth: 1 },
  dlText: { fontSize: 14, fontFamily: FontWeights.medium, flexShrink: 1 },
});
