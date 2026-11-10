import { Stack } from 'expo-router';

// Both screens draw their own header (Team Chat title + actions, or the chat's name/back/call),
// like the dashboard's two panes, so the native header is off.
export default function TeamChatLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ title: 'Team Chat' }} />
      <Stack.Screen name="[id]" options={{ title: 'Chat' }} />
    </Stack>
  );
}
