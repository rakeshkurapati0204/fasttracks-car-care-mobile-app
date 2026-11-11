import { Stack } from 'expo-router';

import { MenuButton } from '@/components/menu-button';
import { useIsDocked } from '@/lib/drawer-context';
import { stackAnimation } from '@/lib/side-nav';

export default function ConversationsLayout() {
  return (
    <Stack screenOptions={{ animation: stackAnimation(useIsDocked()) }}>
      <Stack.Screen name="index" options={{ title: 'Conversations', headerLeft: () => <MenuButton /> }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
