import { Stack } from 'expo-router';

import { MenuButton } from '@/components/menu-button';

export default function ConversationsLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Conversations', headerLeft: () => <MenuButton /> }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
