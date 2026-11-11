import { Stack } from 'expo-router';

import { MenuButton } from '@/components/menu-button';
import { useIsDocked } from '@/lib/drawer-context';
import { stackAnimation } from '@/lib/side-nav';

// "index" is no longer reachable from a tab (the flat More list is replaced
// by the side menu) but is left in place rather than deleted — nothing
// currently routes to it, and removing the file isn't needed to ship the
// nav redesign. Every /more/:route screen (reminders, my-timesheet,
// my-salary, expenses, payslips, and the ScreenStub fallback) now gets the
// hamburger since they're reached from the side menu, not a tab bar.
export default function MoreLayout() {
  return (
    <Stack screenOptions={{ headerLeft: () => <MenuButton />, animation: stackAnimation(useIsDocked()) }}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="reminders" options={{ title: 'Reminders' }} />
      <Stack.Screen name="my-timesheet" options={{ title: 'My Timesheet' }} />
      <Stack.Screen name="my-salary" options={{ title: 'My Salary' }} />
      <Stack.Screen name="expenses" options={{ title: 'Expenses' }} />
      <Stack.Screen name="payslips" options={{ title: 'Payslips' }} />
    </Stack>
  );
}
