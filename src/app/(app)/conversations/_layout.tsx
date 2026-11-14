import { Stack } from 'expo-router';

import { MenuButton } from '@/components/menu-button';
import { detailAnimation } from '@/lib/side-nav';

export default function ConversationsLayout() {
  return (
    <Stack screenOptions={{ animation: detailAnimation }}>
      <Stack.Screen name="index" options={{ title: 'Conversations', headerLeft: () => <MenuButton /> }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
