import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AdminAttendance } from '@/components/attendance/admin-attendance';
import { StaffAttendance } from '@/components/attendance/staff-attendance';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';

// Same list as the dashboard's ALL_TAB_ROLES (attendance/page.tsx): these roles
// get the My Attendance / All Employees switch; everyone else only ever sees
// their own attendance.
const ALL_TAB_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'TECH_TEAM', 'ACCOUNTING', 'CASHIER'];

type Tab = 'mine' | 'all';

// Dashboard TabbedAttendance. The Owner doesn't punch, so a personal view is
// meaningless for them: they get the all-employees register only, with no tab
// to switch away from it. Accounting and Cashier open on All Employees.
function TabbedAttendance({ defaultTab, showMineTab }: { defaultTab: Tab; showMineTab: boolean }) {
  const theme = useTheme();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>(showMineTab ? defaultTab : 'all');

  const tabs: { key: Tab; label: string }[] = [
    ...(showMineTab ? [{ key: 'mine' as const, label: '👤 My Attendance' }] : []),
    { key: 'all', label: '👥 All Employees' },
  ];

  return (
    <View style={styles.flex1}>
      <View style={[styles.switcher, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.pill, active && { backgroundColor: theme.backgroundElement }, active && styles.pillActive]}>
              <ThemedText style={[styles.pillText, { color: active ? theme.text : theme.textMuted }]}>{t.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      {tab === 'mine' ? <StaffAttendance forceUserId={user?.id} /> : <AdminAttendance />}
    </View>
  );
}

export default function AttendanceScreen() {
  const { user } = useAuth();
  const canSeeAll = ALL_TAB_ROLES.includes(user?.role ?? '');
  const isOwner = user?.role === 'OWNER';
  const defaultTab: Tab = user?.role === 'ACCOUNTING' || user?.role === 'CASHIER' || isOwner ? 'all' : 'mine';

  return (
    <ThemedView style={styles.flex1}>
      <Stack.Screen options={{ title: 'Attendance' }} />
      {canSeeAll ? <TabbedAttendance defaultTab={defaultTab} showMineTab={!isOwner} /> : <StaffAttendance />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  switcher: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: 12, borderWidth: 1, alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 16, marginBottom: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minHeight: 40, justifyContent: 'center' },
  pillActive: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  pillText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
});
