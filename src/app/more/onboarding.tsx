import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ADMIN_ROLES } from '@/components/applications/application-format';
import { CheckInsTab } from '@/components/onboarding/checkins-tab';
import { ChecklistTab } from '@/components/onboarding/checklist-tab';
import { DisciplineTab } from '@/components/onboarding/discipline-tab';
import { DocumentsTab } from '@/components/onboarding/documents-tab';
import { EmploymentTab } from '@/components/onboarding/employment-tab';
import { LettersTab } from '@/components/onboarding/letters-tab';
import { TABS, type CheckInFilter, type OverviewTarget, type TabKey } from '@/components/onboarding/onboarding-format';
import { PreJoiningTab } from '@/components/onboarding/prejoining-tab';
import { VerificationTab } from '@/components/onboarding/verification-tab';
import { OverviewTab } from '@/components/onboarding/overview-tab';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontWeights, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchOnboardingEmployees } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { OnboardingEmployee, ProbationMilestone } from '@/types/api';

const WIDE_MIN = 560;
const isTabKey = (v: unknown): v is TabKey => TABS.some((t) => t.key === v);

export default function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  // 4 roles only — this page carries salary / ID-number / approval data (dashboard ADMIN_ROLES).
  const allowed = ADMIN_ROLES.includes(user?.role ?? '');

  // Deep links: ?tab=…&userId=… (Applications "View Candidate" / "Start Onboarding");
  // a bare ?userId= still lands on that person's checklist, as before.
  const params = useLocalSearchParams<{ tab?: string; userId?: string }>();
  const startTab: TabKey = isTabKey(params.tab) ? params.tab : params.userId ? 'onboarding' : 'overview';
  const startUser = params.userId || '';

  const [tab, setTab] = useState<TabKey>(startTab);
  const [employees, setEmployees] = useState<OnboardingEmployee[]>([]);
  // Each tab keeps its own selected person (like the dashboard) so jumping
  // between tabs and deep links land on that person.
  const userFor = (t: TabKey) => (startTab === t ? startUser : '');
  const [lettersUserId, setLettersUserId] = useState(userFor('letters'));
  const [onboardingUserId, setOnboardingUserId] = useState(userFor('onboarding'));
  const [docsUserId, setDocsUserId] = useState(userFor('documents'));
  const [employmentUserId, setEmploymentUserId] = useState(userFor('employment'));
  const [preJoiningUserId, setPreJoiningUserId] = useState(userFor('prejoining'));
  const [disciplineUserId, setDisciplineUserId] = useState(userFor('discipline'));
  // Set when an Overview card opens Check-ins pre-filtered; part of the tab's remount key.
  const [checkIn, setCheckIn] = useState<{ filter: CheckInFilter; userId: string; milestone?: ProbationMilestone }>({ filter: 'ALL', userId: startTab === 'checkins' ? startUser : '' });
  const [width, setWidth] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const tabBar = useRef<ScrollView>(null);

  useEffect(() => {
    if (!allowed) return;
    fetchOnboardingEmployees().then(setEmployees).catch(() => setEmployees([]));
  }, [allowed, refreshKey]);

  const openFromOverview = (target: OverviewTarget) => {
    if (target.tab === 'onboarding') setOnboardingUserId(target.userId ?? '');
    if (target.tab === 'letters') setLettersUserId(target.userId ?? '');
    if (target.tab === 'checkins') setCheckIn({ filter: target.checkInFilter, userId: target.userId ?? '', milestone: target.milestone });
    if (target.tab === 'documents') setDocsUserId(target.userId);
    if (target.tab === 'employment') setEmploymentUserId(target.userId);
    if (target.tab === 'prejoining' && target.userId) setPreJoiningUserId(target.userId);
    setTab(target.tab);
  };

  const pressTab = (key: TabKey) => {
    // The tab strip clears a pre-selected person, like the dashboard.
    if (key === 'letters') setLettersUserId('');
    if (key === 'onboarding') setOnboardingUserId('');
    if (key === 'checkins') setCheckIn({ filter: 'ALL', userId: '' });
    setTab(key);
  };

  const onRefresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  if (!allowed) {
    return (
      <ThemedView style={styles.flex1}>
        <Stack.Screen options={{ title: 'Onboarding' }} />
        <View style={styles.denied}>
          <ThemedText type="small" themeColor="textSecondary">
            Onboarding is available to Owner, Store Manager, HR and Accounting roles only.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  const pad = width >= WIDE_MIN ? Spacing.four : Spacing.three;

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Onboarding' }} />
      <View style={{ paddingHorizontal: pad, paddingTop: pad }}>
        <ThemedText style={styles.title}>Onboarding</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.subtitle}>Offer &amp; experience letters and onboarding checklists.</ThemedText>
      </View>

      <View style={[styles.tabBarWrap, { borderBottomColor: theme.border, marginHorizontal: pad }]}>
        <ScrollView ref={tabBar} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => pressTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[styles.tab, { borderBottomColor: active ? theme.primary : 'transparent' }]}>
                <ThemedText style={[styles.tabLabel, { color: active ? theme.primary : theme.textMuted }]}>{t.label}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + Spacing.four }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {tab === 'overview' ? (
          <OverviewTab employees={employees} onOpen={openFromOverview} onViewDetails={() => router.push('/more/employees' as never)} refreshKey={refreshKey} />
        ) : tab === 'onboarding' ? (
          <ChecklistTab key={onboardingUserId} initialUserId={onboardingUserId} refreshKey={refreshKey} />
        ) : tab === 'letters' ? (
          <LettersTab
            key={lettersUserId}
            employees={employees}
            initialUserId={lettersUserId}
            refreshKey={refreshKey}
            onVerifyDocuments={(userId) => openFromOverview({ tab: 'documents', userId })}
          />
        ) : tab === 'documents' ? (
          <DocumentsTab
            employees={employees}
            userId={docsUserId}
            onUserIdChange={setDocsUserId}
            refreshKey={refreshKey}
            onAllMandatoryVerified={(userId) => openFromOverview({ tab: 'letters', userId })}
          />
        ) : tab === 'employment' ? (
          <EmploymentTab employees={employees} userId={employmentUserId} onUserIdChange={setEmploymentUserId} refreshKey={refreshKey} />
        ) : tab === 'prejoining' ? (
          <PreJoiningTab
            employees={employees}
            userId={preJoiningUserId}
            onUserIdChange={setPreJoiningUserId}
            refreshKey={refreshKey}
            onApproved={(userId) => openFromOverview({ tab: 'letters', userId })}
          />
        ) : tab === 'verification' ? (
          <VerificationTab refreshKey={refreshKey} onOpenDocuments={(userId) => openFromOverview({ tab: 'documents', userId })} />
        ) : tab === 'discipline' ? (
          <DisciplineTab employees={employees} userId={disciplineUserId} onUserIdChange={setDisciplineUserId} refreshKey={refreshKey} />
        ) : tab === 'checkins' ? (
          <CheckInsTab
            key={`${checkIn.filter}:${checkIn.userId}:${checkIn.milestone ?? ''}`}
            initialFilter={checkIn.filter}
            initialUserId={checkIn.userId || undefined}
            initialMilestone={checkIn.milestone}
            refreshKey={refreshKey}
          />
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  denied: { padding: Spacing.three },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  tabBarWrap: { borderBottomWidth: 1, marginTop: Spacing.three },
  tabBar: { gap: 8 },
  tab: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 2, marginBottom: -1, minHeight: 44, justifyContent: 'center' },
  tabLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
