import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCompanySettings, updateCompanySettings } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';

// Mirrors the dashboard's Company Settings page (settings/company/page.tsx) and requireCompanySettingsRead /
// Write (companySettingsLevel): OWNER and STORE_MANAGER always; any other role needs the settings_company tab
// enabled to view and its mode at full_access to edit. The server enforces the same rule.
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER'];
const WIDE_MIN = 560;

// "403: Access denied." — the status plus the server's own message, so a permissions problem and a server
// error are not both "Failed to load".
function describeError(err: unknown, fallback: string): string {
  const e = err as { response?: { status?: number; data?: { error?: string; message?: string } }; message?: string };
  const status = e?.response?.status;
  const msg = e?.response?.data?.error ?? e?.response?.data?.message ?? e?.message ?? fallback;
  return status ? `${status}: ${msg}` : msg;
}

interface Form { gstNo: string; name: string; address: string; phone: string; email: string; logoUrl: string }
const EMPTY: Form = { gstNo: '', name: '', address: '', phone: '', email: '', logoUrl: '' };

export default function CompanySettingsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const { hasTab, tabMode, status } = usePermissions();
  const isAdminRole = ADMIN_ROLES.includes(user?.role ?? '');
  const canView = isAdminRole || hasTab('settings_company');
  const canEdit = isAdminRole || (canView && tabMode('settings_company') === 'full_access');
  const permsLoading = !isAdminRole && (status === 'idle' || status === 'loading');

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;
  const [form, setForm] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((ok: boolean, msg: string) => {
    setToast({ ok, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const load = useCallback(async () => {
    try {
      // null = nothing saved yet: leave the fields empty, not an error.
      const d = await fetchCompanySettings();
      if (d) setForm({ gstNo: d.gstNo || '', name: d.name || '', address: d.address || '', phone: d.phone || '', email: d.email || '', logoUrl: d.logoUrl || '' });
    } catch (err) { showToast(false, describeError(err, "Couldn't load company settings. Check your connection and try again.")); }
    finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    if (canView) load();
  }, [canView, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const save = async () => {
    setSaving(true);
    try { await updateCompanySettings(form); showToast(true, 'Company settings saved successfully.'); }
    catch (err) { showToast(false, describeError(err, "Couldn't save the settings. Try again.")); }
    finally { setSaving(false); }
  };

  const set = (k: keyof Form) => (v: string) => setForm((p) => ({ ...p, [k]: v }));

  if (permsLoading) {
    return <ThemedView style={styles.flex1}><Stack.Screen options={{ title: 'Company Settings' }} /><View style={styles.pad}><Skeleton height={40} /><Skeleton height={200} /></View></ThemedView>;
  }
  if (!canView) {
    return (
      <ThemedView style={[styles.flex1, styles.center]}>
        <Stack.Screen options={{ title: 'Company Settings' }} />
        <ThemedText themeColor="textMuted" style={styles.p}>Company Settings is available to Owner and Store Manager, or to roles granted access.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Company Settings' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} keyboardShouldPersistTaps="handled">
        <View>
          <ThemedText style={styles.title}>Company Settings</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.sub}>Configure company details that appear on invoice headers and PDFs.</ThemedText>
        </View>

        {loading ? (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} /><Skeleton height={40} /></View>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Input label="Company Name" value={form.name} onChangeText={set('name')} placeholder="Fast Tracks Car Care" editable={canEdit} />
            <Input label="GST Number (GSTIN)" value={form.gstNo} onChangeText={(t) => set('gstNo')(t.toUpperCase())} placeholder="36AAEFF7069G1Z9" autoCapitalize="characters" autoCorrect={false} editable={canEdit} />
            <Input label="Address" value={form.address} onChangeText={set('address')} placeholder="Road No 45, Jubilee Hills, Hyderabad, Telangana - 500033" multiline numberOfLines={3} editable={canEdit} />
            <View style={[styles.two, wide && styles.twoWide]}>
              <View style={styles.flex1}><Input label="Phone" value={form.phone} onChangeText={set('phone')} placeholder="7352525252" keyboardType="phone-pad" editable={canEdit} /></View>
              <View style={styles.flex1}><Input label="Email" value={form.email} onChangeText={set('email')} placeholder="admin@fasttrackscarcare.in" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={canEdit} /></View>
            </View>
            <View>
              <Input label="Logo URL (optional)" value={form.logoUrl} onChangeText={set('logoUrl')} placeholder="https://..." keyboardType="url" autoCapitalize="none" autoCorrect={false} editable={canEdit} />
              {form.logoUrl ? <Image source={{ uri: form.logoUrl }} accessibilityLabel="Logo preview" resizeMode="contain" style={[styles.logo, { borderColor: theme.border }]} /> : null}
            </View>

            {canEdit ? (
              <View style={styles.saveRow}><Button onPress={save} loading={saving}>{saving ? 'Saving…' : 'Save Settings'}</Button></View>
            ) : (
              <ThemedText themeColor="textMuted" style={styles.small}>View only — you can see company details but not edit them.</ThemedText>
            )}
          </View>
        )}
      </ScrollView>

      {toast ? (
        <View pointerEvents="none" style={[styles.toast, { bottom: insets.bottom + 16, backgroundColor: toast.ok ? '#22c55e' : '#ef4444' }]}>
          <ThemedText style={styles.toastText}>{toast.msg}</ThemedText>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  pad: { padding: 16, gap: 12 },
  content: { padding: 16, gap: 24, width: '100%', maxWidth: 672, alignSelf: 'center' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 20, gap: 16 },
  two: { gap: 16 },
  twoWide: { flexDirection: 'row' },
  logo: { marginTop: 8, height: 48, width: 160, borderRadius: Radii.sm, borderWidth: 1 },
  saveRow: { flexDirection: 'row', paddingTop: 4 },
  p: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  small: { fontSize: 12, lineHeight: 16},
  toast: { position: 'absolute', left: 16, right: 16, zIndex: 50, borderRadius: Radii.md, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
