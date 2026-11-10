import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardBox, PageHeader, Restricted, useMdmAccess, useWidth } from '@/components/devices/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Fonts, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deletePolicy, fetchRolePolicies, savePolicy } from '@/lib/api';
import type { RoleAppPolicy } from '@/types/api';

// Dashboard App Policies (devices/policies/page.tsx): pick a role + device type, see the always-allowed
// default apps, and the custom policies. OWNER / STORE_MANAGER / HR can view; only OWNER can toggle
// allowed/blocked, remove, or add an app (POST/DELETE /devices/policies are OWNER-only on the server).
type DeviceType = 'WINDOWS' | 'ANDROID' | 'IOS' | 'MAC';
const ROLES = ['OWNER', 'STORE_MANAGER', 'SALES', 'TECHNICIAN', 'TECH_TEAM', 'SOCIAL_MEDIA', 'STAFF', 'INVENTORY_MANAGER', 'ACCOUNTING', 'CASHIER', 'HR', 'HOUSEKEEPING'];
const DEVICE_TYPES: DeviceType[] = ['WINDOWS', 'ANDROID', 'IOS', 'MAC'];
const DEFAULT_APPS: Record<DeviceType, string[]> = {
  WINDOWS: ['Chrome', 'File Explorer', 'Calculator', 'Notepad', 'Windows Defender', 'Task Manager'],
  ANDROID: ['Phone', 'WhatsApp', 'Chrome', 'Google Maps'],
  IOS: ['Phone', 'WhatsApp', 'Safari', 'Maps'],
  MAC: ['Safari', 'Finder', 'Calculator', 'Terminal'],
};

export default function AppPoliciesScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user, canAccess } = useMdmAccess();
  const { wide, onLayout } = useWidth();
  const isOwner = user?.role === 'OWNER';

  const [selectedRole, setSelectedRole] = useState('OWNER');
  const [selectedDT, setSelectedDT] = useState<DeviceType>('WINDOWS');
  const [policies, setPolicies] = useState<RoleAppPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ appName: '', packageName: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPolicies((await fetchRolePolicies(selectedRole)).filter((p) => p.deviceType === selectedDT));
    } catch { /* the dashboard logs and shows the empty row */ }
    finally { setLoading(false); }
  }, [selectedRole, selectedDT]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / on selection change
    if (canAccess) load();
  }, [canAccess, load]);

  const toggle = async (p: RoleAppPolicy) => {
    if (!isOwner) return;
    try {
      await savePolicy({ role: p.role, appName: p.appName, packageName: p.packageName ?? undefined, isAllowed: !p.isAllowed, deviceType: p.deviceType });
      setPolicies((prev) => prev.map((x) => (x.id === p.id ? { ...x, isAllowed: !x.isAllowed } : x)));
    } catch { /* swallowed, like the dashboard */ }
  };

  const add = async () => {
    if (!form.appName.trim()) return;
    setSaving(true);
    try {
      const created = await savePolicy({ role: selectedRole, appName: form.appName.trim(), packageName: form.packageName.trim() || undefined, isAllowed: true, deviceType: selectedDT });
      setPolicies((prev) => [...prev, created]);
      setForm({ appName: '', packageName: '' });
    } catch { /* swallowed, like the dashboard */ }
    finally { setSaving(false); }
  };

  const remove = (id: string) => {
    if (!isOwner) return;
    Alert.alert('Remove this policy?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'OK', style: 'destructive',
        onPress: async () => {
          try { await deletePolicy(id); setPolicies((prev) => prev.filter((p) => p.id !== id)); } catch { /* swallowed */ }
        },
      },
    ]);
  };

  if (!canAccess) return <Restricted message="Access restricted." />;

  const roleLabel = selectedRole.replace('_', ' ');

  return (
    <ThemedView style={styles.flex1} onLayout={onLayout}>
      <Stack.Screen options={{ title: 'App Policies' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <PageHeader title="App Policies" subtitle="Control which apps each role can use per device type" />

        <View style={[styles.filters, wide && styles.filtersWide]}>
          <View style={wide ? styles.filterW : undefined}>
            <Select value={selectedRole} onChange={setSelectedRole} options={ROLES.map((r) => ({ value: r, label: r.replace('_', ' ') }))} />
          </View>
          <View style={wide ? styles.filterW : undefined}>
            <Select value={selectedDT} onChange={(v) => setSelectedDT(v as DeviceType)} options={DEVICE_TYPES.map((t) => ({ value: t, label: t }))} />
          </View>
        </View>

        <CardBox>
          <ThemedText themeColor="textMuted" style={styles.eyebrow}>Always allowed (all roles)</ThemedText>
          <View style={styles.apps}>
            {DEFAULT_APPS[selectedDT].map((app) => (
              <View key={app} style={[styles.app, { backgroundColor: 'rgba(34,197,94,0.15)' }]}><ThemedText style={[styles.appText, { color: '#15803d' }]}>{app}</ThemedText></View>
            ))}
          </View>
        </CardBox>

        <View style={[styles.box, { borderColor: theme.border }]}>
          <View style={[styles.boxHead, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
            <ThemedText style={styles.boxTitle}>Custom policies — {roleLabel} · {selectedDT}</ThemedText>
          </View>

          {loading ? (
            <View style={styles.pad}><Skeleton height={40} /><Skeleton height={40} /></View>
          ) : policies.length === 0 ? (
            <ThemedText themeColor="textMuted" style={styles.none}>No custom policies. Add apps below.</ThemedText>
          ) : (
            policies.map((p, i) => (
              <View key={p.id} style={[styles.tr, { borderBottomColor: theme.border, backgroundColor: i % 2 === 0 ? theme.surface : 'transparent' }]}>
                <View style={styles.flex1}>
                  <ThemedText style={styles.appName}>{p.appName}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.pkg}>{p.packageName ?? '—'}</ThemedText>
                </View>
                {isOwner ? (
                  <Switch value={p.isAllowed} onValueChange={() => toggle(p)} trackColor={{ true: '#16a34a', false: '#dc2626' }} thumbColor="#fff" accessibilityLabel={p.isAllowed ? 'Click to block' : 'Click to allow'} />
                ) : (
                  <View style={[styles.status, { backgroundColor: p.isAllowed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }]}>
                    <ThemedText style={[styles.statusText, { color: p.isAllowed ? '#15803d' : '#b91c1c' }]}>{p.isAllowed ? 'Allowed' : 'Blocked'}</ThemedText>
                  </View>
                )}
                {isOwner ? (
                  <Pressable onPress={() => remove(p.id)} hitSlop={8} accessibilityRole="button"><ThemedText style={styles.remove}>Remove</ThemedText></Pressable>
                ) : null}
              </View>
            ))
          )}

          {isOwner ? (
            <View style={[styles.add, { borderTopColor: theme.border }, wide && styles.addWide]}>
              <View style={styles.flex1}><Input label="App Name *" value={form.appName} onChangeText={(t) => setForm((f) => ({ ...f, appName: t }))} placeholder="e.g. Slack" /></View>
              <View style={styles.flex1}><Input label="Package / Bundle ID" value={form.packageName} onChangeText={(t) => setForm((f) => ({ ...f, packageName: t }))} placeholder="com.slack.android" autoCapitalize="none" autoCorrect={false} /></View>
              <Button onPress={add} loading={saving} disabled={saving || !form.appName.trim()}>+ Add App</Button>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { padding: 16, gap: 24 },
  filters: { gap: 12 },
  filtersWide: { flexDirection: 'row' },
  filterW: { minWidth: 200 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  apps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  app: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.sm },
  appText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  box: { borderWidth: 1, borderRadius: Radii.lg, overflow: 'hidden' },
  boxHead: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  boxTitle: { fontSize: 14, fontFamily: FontWeights.semiBold },
  pad: { padding: 16, gap: 8 },
  none: { padding: 24, textAlign: 'center', fontSize: 14 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  appName: { fontSize: 14, fontFamily: FontWeights.medium },
  pkg: { fontSize: 12, fontFamily: Fonts?.mono },
  status: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  remove: { fontSize: 12, color: '#ef4444' },
  add: { padding: 16, gap: 12, borderTopWidth: 1 },
  addWide: { flexDirection: 'row', alignItems: 'flex-end' },
});
