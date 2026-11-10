import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChatPanel } from '@/components/conversations/chat';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui';
import { fetchConversation, getErrorMessage } from '@/lib/api';
import type { Conversation } from '@/types/api';

// The phone chat screen: header with a back button, thread, composer. The two-
// pane layout on wide screens lives in index.tsx and uses the same ChatPanel.
export default function ConversationThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setConv(await fetchConversation(id));
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not load this conversation.'));
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    load();
  }, [load]);

  return (
    <ThemedView style={{ flex: 1, paddingTop: insets.top }}>
      <Stack.Screen options={{ title: conv?.customerName || 'Conversation', headerShown: false }} />
      {conv ? (
        <ChatPanel conv={conv} onBack={() => (router.canGoBack() ? router.back() : router.replace('/conversations'))} />
      ) : (
        <View style={{ padding: 16, gap: 12 }}>
          {error ? <ErrorBanner message={error} onRetry={load} /> : <Skeleton height={64} />}
        </View>
      )}
    </ThemedView>
  );
}
