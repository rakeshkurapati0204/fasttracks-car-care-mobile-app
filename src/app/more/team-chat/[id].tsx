import { useLocalSearchParams } from 'expo-router';

import { TeamChatShell } from '@/components/team-chat/shell';

// Membership-scoped: GET/POST /team-chat/:id/messages 403s a caller who isn't a member
// of this chat server-side — no separate client role gate.
export default function TeamChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeamChatShell routeChatId={id} />;
}
