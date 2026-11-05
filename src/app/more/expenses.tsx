import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminExpensesView } from '@/components/expenses/admin-view';
import { StaffExpensesView } from '@/components/expenses/staff-view';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';

const WIDE_MIN = 560;

// Same rule as the dashboard: which view renders is driven by the RESOLVED
// 'expenses' permission (role default + per-person override), not by role. The
// mode defaults to 'add' when absent. verify/both -> AdminExpensesView (canAdd
// adds the "+ Add Expense" sheet), add-only -> StaffExpensesView.
export default function ExpensesScreen() {
  const { user } = useAuth();
  const { status, error, hasTab, tabMode, refresh } = usePermissions();
  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;

  const enabled = status === 'ready' && hasTab('expenses');
  const mode = tabMode('expenses') ?? 'add';
  const canVerify = enabled && (mode === 'verify' || mode === 'both');
  const canAdd = enabled && (mode === 'add' || mode === 'both');
  const userId = user?.id ?? '';

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Expenses' }} />
      {children}
    </ThemedView>
  );

  if (status === 'idle' || status === 'loading') {
    return shell(<View style={styles.pad}><Skeleton height={28} width={160} /><Skeleton height={180} /></View>);
  }
  if (status === 'error') {
    return shell(<View style={styles.pad}><ErrorBanner message={error ?? "Couldn't load your permissions."} onRetry={() => { refresh(); }} /></View>);
  }
  return shell(canVerify ? <AdminExpensesView wide={wide} canAdd={canAdd} currentUserId={userId} /> : <StaffExpensesView wide={wide} currentUserId={userId} />);
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  pad: { padding: 16, gap: 16 },
});
