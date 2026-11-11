import { Stack } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BankAccountsTab } from '@/components/accounts/bank-tab';
import { EMITrackerTab } from '@/components/accounts/emi-tab';
import { EmailCheckTab } from '@/components/accounts/email-tab';
import type { Notify } from '@/components/accounts/parts';
import { PaymentRemindersTab } from '@/components/accounts/reminders-tab';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchBankAccounts, fetchEmailCheckStatus, fetchEmis, fetchPaymentRemindersFull } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { BankAccount, EMI, EmailCheckState, PaymentReminderFull } from '@/types/api';

const WIDE_MIN = 560;
// Same static gate as the server's canAccess (requireRoles OWNER, ACCOUNTING) on every /accounts route.
const ALLOWED_ROLES = ['OWNER', 'ACCOUNTING'];

type TabId = 'bank' | 'emis' | 'reminders' | 'email';
const TABS: { id: TabId; label: string }[] = [
  { id: 'bank', label: 'Bank Accounts' },
  { id: 'emis', label: 'EMI Tracker' },
  { id: 'reminders', label: 'Payment Reminders' },
  { id: 'email', label: 'Email Check' },
];

export default function AccountsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const role = user?.role ?? '';
  const allowed = ALLOWED_ROLES.includes(role);

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;
  const [tab, setTab] = useState<TabId>('bank');
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'warning'; msg: string } | null>(null);
  const [loadError, setLoadError] = useState('');

  // Bank accounts load once up front: the EMI and Reminder forms use them for their dropdown.
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [emis, setEmis] = useState<EMI[]>([]);
  const [emisLoading, setEmisLoading] = useState(false);
  const [reminders, setReminders] = useState<PaymentReminderFull[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [email, setEmail] = useState<EmailCheckState | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.type === 'warning' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const notify: Notify = useCallback((type, msg) => setToast({ type, msg }), []);

  const loadAccounts = useCallback(async () => {
    try {
      const r = await fetchBankAccounts();
      setAccounts(Array.isArray(r) ? r : []);
      setLoadError('');
    } catch {
      setLoadError("Couldn't load bank accounts. Check your connection and try again.");
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const loadEmis = useCallback(async () => {
    setEmisLoading(true);
    try { const r = await fetchEmis(); setEmis(Array.isArray(r) ? r : []); setLoadError(''); }
    catch { setLoadError("Couldn't load EMIs. Check your connection and try again."); }
    finally { setEmisLoading(false); }
  }, []);

  const loadReminders = useCallback(async () => {
    setRemindersLoading(true);
    try { const r = await fetchPaymentRemindersFull(); setReminders(Array.isArray(r) ? r : []); setLoadError(''); }
    catch { setLoadError("Couldn't load reminders. Check your connection and try again."); }
    finally { setRemindersLoading(false); }
  }, []);

  const loadEmail = useCallback(async () => {
    setEmailLoading(true);
    try { setEmail(await fetchEmailCheckStatus()); setLoadError(''); }
    catch { setLoadError("Couldn't load email check status. Check your connection and try again."); }
    finally { setEmailLoading(false); }
  }, []);

  const loadActive = useCallback(async () => {
    if (tab === 'bank') await loadAccounts();
    else if (tab === 'emis') await loadEmis();
    else if (tab === 'reminders') await loadReminders();
    else await loadEmail();
  }, [tab, loadAccounts, loadEmis, loadReminders, loadEmail]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the dropdown accounts on mount
    if (allowed) loadAccounts();
  }, [allowed, loadAccounts]);

  useEffect(() => {
    // Each tab loads when it opens (the dashboard mounts a fresh tab each time).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on tab change
    if (allowed && tab !== 'bank') loadActive();
  }, [allowed, tab, loadActive]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadActive(), tab === 'bank' ? Promise.resolve() : loadAccounts()]);
    setRefreshing(false);
  };

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Accounts' }} />
      {children}
    </ThemedView>
  );

  if (!allowed) {
    return shell(
      <View style={styles.denied}>
        <ThemedText themeColor="textMuted" style={styles.body}>Access restricted.</ThemedText>
      </View>,
    );
  }

  const banner = toast ? (
    toast.type === 'success' ? <SuccessBanner message={toast.msg} />
      : toast.type === 'warning' ? (
        <View style={styles.warn}><ThemedText style={styles.warnText}>{toast.msg}</ThemedText></View>
      ) : <ErrorBanner message={toast.msg} />
  ) : null;

  return shell(
    <ScrollView
      contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      keyboardShouldPersistTaps="handled">
      <View style={styles.headerWrap}>
        <ThemedText style={styles.h1}>Accounts</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.subtitle}>Bank accounts, EMIs, payment reminders, and email check log</ThemedText>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.tabsScroll, { backgroundColor: theme.backgroundElement }]} contentContainerStyle={styles.tabs}>
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => { setLoadError(''); setTab(t.id); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, wide && styles.tabWide, on && { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
              <ThemedText style={[styles.tabText, { color: on ? theme.text : theme.textMuted }]}>{t.label}</ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.content}>
        {banner}
        {loadError ? <ErrorBanner message={loadError} onRetry={loadActive} /> : null}

        {tab === 'bank' ? (
          <BankAccountsTab accounts={accounts} loading={accountsLoading} isOwner={role === 'OWNER'} wide={wide} notify={notify} onChanged={loadAccounts} />
        ) : null}
        {tab === 'emis' ? <EMITrackerTab emis={emis} accounts={accounts} loading={emisLoading} wide={wide} notify={notify} onChanged={loadEmis} /> : null}
        {tab === 'reminders' ? (
          <PaymentRemindersTab reminders={reminders} accounts={accounts} loading={remindersLoading} wide={wide} notify={notify} onChanged={loadReminders} />
        ) : null}
        {tab === 'email' ? <EmailCheckTab state={email} loading={emailLoading} isOwner={role === 'OWNER'} wide={wide} notify={notify} onChanged={loadEmail} /> : null}
      </View>
    </ScrollView>,
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 896, alignSelf: 'center' },
  denied: { alignItems: 'center', justifyContent: 'center', paddingVertical: 120 },
  body: { fontSize: 14, lineHeight: 20 },
  headerWrap: { marginBottom: 24 },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  tabsScroll: { flexGrow: 0, borderRadius: 12, marginBottom: 24 },
  tabs: { padding: 4, gap: 4, flexGrow: 1 },
  tab: { minHeight: 40, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  tabWide: { flex: 1 },
  tabText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  content: { gap: 16 },
  warn: { padding: 12, borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.3)' },
  warnText: { color: '#b45309', fontSize: 13, lineHeight: 18 },
});
