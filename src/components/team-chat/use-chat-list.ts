import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchTeamChatEmployees, fetchTeamChats, getErrorMessage } from '@/lib/api';
import type { TeamChat, TeamChatEmployee } from '@/types/api';

export const LIST_POLL_MS = 20_000;

// Chats + directory for the Team Chat list. No socket client is installed, so the
// list is polled every 20 s while the app is in the foreground (and refreshed when it comes back).
export function useChatList() {
  const [chats, setChats] = useState<TeamChat[]>([]);
  const [employees, setEmployees] = useState<TeamChatEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const [empRes, chatRes] = await Promise.allSettled([fetchTeamChatEmployees(), fetchTeamChats()]);
    if (empRes.status === 'fulfilled') setEmployees(Array.isArray(empRes.value) ? empRes.value : []);
    if (chatRes.status === 'fulfilled') setChats(Array.isArray(chatRes.value) ? chatRes.value : []);
    else setError(getErrorMessage(chatRes.reason, 'Could not load team chat.'));
    setLoading(false);
  }, []);

  // Chat list only, no skeleton — keeps the current list if the call fails.
  const refreshChats = useCallback(async () => {
    try {
      const r = await fetchTeamChats();
      if (Array.isArray(r)) setChats(r);
    } catch { /* keep current list */ }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => { if (AppState.currentState === 'active') refreshChats(); }, LIST_POLL_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refreshChats(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [refreshChats]);

  return { chats, setChats, employees, setEmployees, loading, error, load, refreshChats };
}

export type ChatListState = ReturnType<typeof useChatList>;
