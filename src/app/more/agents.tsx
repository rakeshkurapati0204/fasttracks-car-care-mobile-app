import { Stack } from 'expo-router';
import { View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui';
import { ComingSoon } from '@/components/ui/coming-soon';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';

// The dashboard's AI Agents page currently renders its "Coming soon" screen
// (AgentsPage returns <ComingSoon />; the agent cards, toggles and activity
// feed in that file are unreachable), so this screen does the same, with the
// same access rule: Owner, Store Manager, or the `ai_agents` permission.
// Nothing here calls /agents, so the toggle and trigger routes (live webhooks
// with customer-facing effects) are not reachable from the app.
export default function AgentsScreen() {
  const { user } = useAuth();
  const { status, hasTab } = usePermissions();
  const canAccess = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER' || hasTab('ai_agents');

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'AI Agents' }} />
      {status !== 'ready' ? (
        <View style={{ padding: 16 }}><Skeleton height={64} /></View>
      ) : canAccess ? (
        <ComingSoon />
      ) : (
        <View style={{ padding: 24 }}>
          <ThemedText themeColor="textMuted" style={{ fontSize: 14, lineHeight: 20, textAlign: 'center' }}>You don&apos;t have access to AI Agents.</ThemedText>
        </View>
      )}
    </ThemedView>
  );
}
