import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage, updateTeamChatNickname } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { TeamChatEmployee, TeamChatMessage } from '@/types/api';

import { ChatList } from './chat-list';
import { ChatThread } from './thread';
import { useChatList } from './use-chat-list';

const WIDE_MIN = 560;
const LIST_W = 272; // dashboard md:w-[17rem]

// Both routes render this. >= 560 content width: list left, chat right (no navigation, like the
// dashboard). Phone: the list screen pushes /more/team-chat/[id]; the chat screen has a back button.
export function TeamChatShell({ routeChatId }: { routeChatId?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myId = user?.id ?? '';
  const list = useChatList();
  const { chats, setChats, employees, setEmployees, loading, error, load } = list;

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;
  const [activeId, setActiveId] = useState<string | null>(routeChatId ?? null);

  const [nickEmp, setNickEmp] = useState<TeamChatEmployee | null>(null);
  const [nickInput, setNickInput] = useState('');
  const [savingNick, setSavingNick] = useState(false);
  const [nickError, setNickError] = useState('');

  const openChat = useCallback((id: string) => {
    if (wide || routeChatId) setActiveId(id);
    else router.push(`/more/team-chat/${id}`);
  }, [wide, routeChatId, router]);

  const closeChat = useCallback(() => {
    if (wide) { setActiveId(null); return; }
    if (router.canGoBack()) router.back();
    else router.replace('/more/team-chat');
  }, [wide, router]);

  const onSent = useCallback((chatId: string, msg: TeamChatMessage) => {
    setChats((prev) => prev
      .map((c) => (c.id === chatId ? { ...c, lastMsgAt: msg.sentAt, messages: [msg] } : c))
      .sort((a, b) => new Date(b.lastMsgAt ?? 0).getTime() - new Date(a.lastMsgAt ?? 0).getTime()));
  }, [setChats]);

  const onRead = useCallback((chatId: string) => {
    setChats((prev) => (prev.some((c) => c.id === chatId && (c.unreadCount ?? 0) > 0)
      ? prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
      : prev));
  }, [setChats]);

  const editNick = (emp: TeamChatEmployee) => { setNickEmp(emp); setNickInput(emp.nickname ?? ''); setNickError(''); };
  const saveNick = async () => {
    if (!nickEmp) return;
    setSavingNick(true);
    setNickError('');
    try {
      await updateTeamChatNickname(nickEmp.id, nickInput.trim());
      setEmployees((prev) => prev.map((e) => (e.id === nickEmp.id ? { ...e, nickname: nickInput.trim() || null } : e)));
      setNickEmp(null);
    } catch (e) {
      setNickError(getErrorMessage(e, 'Could not save that display name.'));
    } finally {
      setSavingNick(false);
    }
  };

  const active = activeId ? chats.find((c) => c.id === activeId) ?? null : null;
  const topInset = insets.top;

  const listPane = (
    <ChatList
      list={list}
      myId={myId}
      activeId={activeId}
      topInset={wide ? 0 : topInset}
      onOpen={openChat}
      onDropped={(id) => { if (activeId === id) closeChat(); }}
      onEditNick={editNick}
    />
  );

  const emptyPane = (
    <View style={[styles.empty, { backgroundColor: theme.backgroundElement }]}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="chatbubbles-outline" size={30} color={theme.textMuted} />
      </View>
      <ThemedText style={styles.emptyTitle}>Select someone to chat with</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.emptySub}>All team members are listed on the left</ThemedText>
    </View>
  );

  const threadPane = () => {
    if (active) {
      return (
        <ChatThread
          key={active.id}
          chat={active}
          employees={employees}
          myId={myId}
          topInset={wide ? 0 : topInset}
          onBack={wide ? undefined : closeChat}
          onEditNick={editNick}
          onSent={onSent}
          onRead={onRead}
        />
      );
    }
    // Opened from a route (or notification) before the list has the chat.
    if (loading) return <View style={[styles.pad, { paddingTop: 16 + topInset }]}><Skeleton height={40} /><Skeleton height={240} /></View>;
    if (error) return <View style={[styles.pad, { paddingTop: 16 + topInset }]}><ErrorBanner message={error} onRetry={load} /></View>;
    return emptyPane;
  };

  let body;
  if (wide) {
    body = (
      <View style={[styles.panes, { borderColor: theme.border }]}>
        <View style={[styles.listCol, { width: LIST_W, borderRightColor: theme.border }]}>{listPane}</View>
        <View style={styles.flex1}>{threadPane()}</View>
      </View>
    );
  } else if (routeChatId) {
    body = threadPane();
  } else {
    body = listPane;
  }

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {body}
      <Sheet visible={!!nickEmp} onClose={() => setNickEmp(null)} title="Display Name" locked={savingNick} subtitle="Only visible to you — doesn't change their name for anyone else." footer={
        <View style={styles.footer}>
          <View style={styles.flex1}><Button variant="outline" onPress={() => setNickEmp(null)} fullWidth>Cancel</Button></View>
          <View style={styles.flex1}><Button onPress={saveNick} loading={savingNick} fullWidth>Save</Button></View>
        </View>
      }>
        <Input placeholder={nickEmp?.name ?? 'Real name'} value={nickInput} onChangeText={setNickInput} autoFocus error={nickError || undefined} hint="Leave blank to reset to real name." />
      </Sheet>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  panes: { flex: 1, flexDirection: 'row', margin: 16, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  listCol: { borderRightWidth: 1 },
  pad: { padding: 16, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  emptySub: { fontSize: 12, lineHeight: 16, marginTop: 4, textAlign: 'center' },
  footer: { flexDirection: 'row', gap: 8, flex: 1 },
});
