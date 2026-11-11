import { Stack } from 'expo-router';

import { useIsDocked } from '@/lib/drawer-context';
import { stackAnimation } from '@/lib/side-nav';

export default function CustomersLayout() {
  return (
    <Stack screenOptions={{ animation: stackAnimation(useIsDocked()) }}>
      {/* The list screen draws its own header row (menu button, title, New Entry) so
          the native header's header-button touch area can't sit over the tabs. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
