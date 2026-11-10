import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { MenuButton } from '@/components/menu-button';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage, hideTeamChat, pinTeamChat, startTeamChat, unpinTeamChat } from '@/lib/api';
import type { TeamChat, TeamChatEmployee } from '@/types/api';

import { byRecency, chatDisplayName, displayName, fmtTime, personForChat, previewText } from './helpers';
import { Avatar, MemberPicker, MenuRow, UnreadBadge } from './parts';
import type { ChatListState } from './use-chat-list';

type ListTab = 'all' | 'unread' | 'groups';
type Row =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'group'; key: string; chat: TeamChat }
  | { kind: 'person'; key: string; emp: TeamChatEmployee; chat?: TeamChat };

const TABS: [ListTab, string][] = [['all', 'All'], ['unread', 'Unread'], ['groups', 'Groups']];

// The left pane of the dashboard's Team Chat page: header, search + filter tabs,
// Pinned / Recent / People sections, long-press row menu and the New Group sheet.
export function ChatList({ list, myId, activeId, onOpen, onDropped, onEditNick, topInset = 0 }: {
  list: ChatListState; myId: string; activeId: string | null; topInset?: number;
  onOpen: (chatId: string) => void; onDropped: (chatId: string) => void; onEditNick: (emp: TeamChatEmployee) => void;
}) {
  const theme = useTheme();
  const { chats, setChats, employees, loading, error, load } = list;
  const [search, setSearch] = useState('');
  const [listTab, setListTab] = useState<ListTab>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');
  const [menu, setMenu] = useState<TeamChat | null>(null);

  const [showGroup, setShowGroup] = useState(false);
  const [groupSelected, setGroupSelected] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const q = search.toLowerCase();
    const matches = (ch: TeamChat) => !q || chatDisplayName(ch, myId, employees).toLowerCase().includes(q);
    const pinned = chats.filter((c) => c.pinnedAt).filter(matches)
      .sort((a, b) => new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime());
    // A 1:1 only counts as "recent" once it has a message; an empty one stays under People.
    const recent = chats.filter((c) => !c.pinnedAt).filter((c) => c.isGroup || c.messages.length > 0).filter(matches).sort(byRecency);
    const recentIds = new Set([...pinned, ...recent].filter((c) => !c.isGroup).map((c) => c.members.find((m) => m.userId !== myId)?.userId));
    const byEmp = new Map<string, TeamChat>();
    for (const ch of chats) {
      if (!ch.isGroup && ch.members.length === 2) {
        const other = ch.members.find((m) => m.userId !== myId);
        if (other) byEmp.set(other.userId, ch);
      }
    }
    const people = employees.filter((e) => !recentIds.has(e.id) && (!q || displayName(e).toLowerCase().includes(q)));
    const inTab = (ch: TeamChat) => (listTab === 'unread' ? (ch.unreadCount ?? 0) > 0 : listTab === 'groups' ? ch.isGroup : true);
    const pinnedShown = pinned.filter(inTab);
    const recentShown = recent.filter(inTab);
    const peopleShown = listTab === 'all' ? people : [];

    const chatRow = (c: TeamChat): Row => (c.isGroup
      ? { kind: 'group', key: c.id, chat: c }
      : { kind: 'person', key: c.id, emp: personForChat(c, myId, employees), chat: c });
    const out: Row[] = [];
    if (pinnedShown.length) out.push({ kind: 'header', key: 'h-pinned', label: 'Pinned' }, ...pinnedShown.map(chatRow));
    if (recentShown.length) out.push({ kind: 'header', key: 'h-recent', label: 'Recent' }, ...recentShown.map(chatRow));
    if ((pinnedShown.length || recentShown.length) && peopleShown.length) out.push({ kind: 'header', key: 'h-people', label: 'People' });
    for (const e of peopleShown) out.push({ kind: 'person', key: `p-${e.id}`, emp: e, chat: byEmp.get(e.id) });
    return out;
  }, [chats, employees, myId, search, listTab]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openPerson = async (emp: TeamChatEmployee, existing?: TeamChat) => {
    if (existing) { onOpen(existing.id); return; }
    try {
      const chat = await startTeamChat([emp.id]);
      setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]));
      onOpen(chat.id);
    } catch (e) {
      setNotice(getErrorMessage(e, 'Could not start this chat.'));
    }
  };

  const togglePin = async (chat: TeamChat) => {
    setMenu(null);
    try {
      const r = chat.pinnedAt ? await unpinTeamChat(chat.id) : await pinTeamChat(chat.id);
      setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, pinnedAt: r.pinnedAt } : c)));
    } catch (e) {
      setNotice(getErrorMessage(e, 'Failed to update pin'));
    }
  };

  // "Delete chat" (1:1): hides it from MY list only; a new message brings it back.
  const deleteChat = (chat: TeamChat) => {
    setMenu(null);
    Alert.alert(
      'Delete chat',
      `Delete this chat with ${chatDisplayName(chat, myId, employees)}? It's only removed from your list; it comes back if a new message arrives.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await hideTeamChat(chat.id);
              setChats((prev) => prev.filter((c) => c.id !== chat.id));
              onDropped(chat.id);
            } catch (e) {
              setNotice(getErrorMessage(e, 'Failed to delete chat'));
            }
          },
        },
      ],
    );
  };

  const closeGroup = () => { setShowGroup(false); setGroupSelected([]); setGroupName(''); setGroupSearch(''); };
  const createGroup = async () => {
    if (groupSelected.length < 2 || creating) return;
    setCreating(true);
    try {
      const chat = await startTeamChat(groupSelected, groupName.trim() || 'Group Chat');
      setChats((prev) => (prev.some((c) => c.id === chat.id) ? prev : [chat, ...prev]));
      closeGroup();
      onOpen(chat.id);
    } catch (e) {
      setNotice(getErrorMessage(e, 'Could not create the group.'));
    } finally {
      setCreating(false);
    }
  };

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'header') {
      return <ThemedText themeColor="textMuted" style={styles.sectionLabel}>{item.label.toUpperCase()}</ThemedText>;
    }
    const chat = item.kind === 'group' ? item.chat : item.chat;
    const last = chat?.messages[0];
    const unread = chat && chat.id !== activeId ? (chat.unreadCount ?? 0) : 0;
    const isActive = !!chat && chat.id === activeId;
    const isGroup = item.kind === 'group';
    const title = isGroup ? item.chat.name || 'Group Chat' : displayName(item.emp);
    const preview = last ? previewText(last) : null;
    const prefix = last ? (last.sender.id === myId ? 'You: ' : isGroup ? `${last.sender.name}: ` : '') : '';
    return (
      <Pressable
        onPress={() => (isGroup ? onOpen(item.chat.id) : openPerson(item.emp, item.chat))}
        onLongPress={chat ? () => setMenu(chat) : undefined}
        delayLongPress={500}
        accessibilityRole="button"
        accessibilityLabel={title}
        style={[styles.row, { backgroundColor: isActive ? theme.backgroundElement : 'transparent' }]}>
        <Avatar name={title} group={isGroup} dim={isGroup ? 0.8 : 0.75} />
        <View style={styles.flex1}>
          <View style={styles.rowTop}>
            <ThemedText numberOfLines={1} style={[styles.title, isGroup && styles.semi]}>
              {chat?.pinnedAt ? '📌 ' : ''}{title}
            </ThemedText>
            {!isGroup && item.emp.nickname ? (
              <View style={[styles.nick, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText themeColor="textMuted" style={styles.nickText}>nick</ThemedText>
              </View>
            ) : null}
          </View>
          {last ? (
            <ThemedText
              numberOfLines={1}
              themeColor={unread > 0 ? 'text' : 'textMuted'}
              style={[styles.preview, unread > 0 && styles.semi]}>
              {prefix}{preview}
            </ThemedText>
          ) : (
            <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.preview, { opacity: 0.6 }]}>
              {isGroup ? `${item.chat.members.length} members` : item.emp.designation || item.emp.role}
            </ThemedText>
          )}
        </View>
        <View style={styles.rowEnd}>
          {last ? <ThemedText themeColor="textMuted" style={styles.time}>{fmtTime(last.sentAt)}</ThemedText> : null}
          <UnreadBadge count={unread} />
          {!isGroup ? (
            <Pressable
              onPress={() => onEditNick(item.emp)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Set display name for ${item.emp.name}`}>
              <Ionicons name="pencil" size={14} color={theme.textMuted} style={{ opacity: 0.6 }} />
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const emptyText = search ? `No results for "${search}"` : listTab === 'unread' ? 'No unread chats' : listTab === 'groups' ? 'No groups yet' : 'No one to show';

  return (
    <View style={[styles.pane, { backgroundColor: theme.surface, paddingTop: topInset }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <MenuButton />
        <ThemedText style={styles.h1}>Team Chat</ThemedText>
        <View style={styles.flex1} />
        <Pressable
          onPress={() => setShowGroup(true)}
          accessibilityRole="button"
          accessibilityLabel="New group chat"
          style={[styles.groupBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="people-outline" size={14} color={theme.textMuted} />
          <ThemedText themeColor="textMuted" style={styles.groupBtnText}>Create Group</ThemedText>
        </Pressable>
      </View>

      <View style={[styles.searchWrap, { borderBottomColor: theme.border }]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search team…"
          placeholderTextColor={theme.textMuted}
          style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
        />
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map(([key, label]) => {
            const on = listTab === key;
            return (
              <Pressable
                key={key}
                onPress={() => setListTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.tab, { backgroundColor: on ? theme.primary : theme.backgroundElement, borderColor: on ? 'transparent' : theme.border }]}>
                <ThemedText style={[styles.tabText, { color: on ? '#fff' : theme.textMuted }]}>{label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <View style={styles.banner}><ErrorBanner message={error} onRetry={load} /></View> : null}
      {notice ? <View style={styles.banner}><ErrorBanner message={notice} /></View> : null}

      {loading ? (
        <View style={styles.skels}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={48} />)}</View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<ThemedText themeColor="textMuted" style={styles.empty}>{emptyText}</ThemedText>}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listPad}
        />
      )}

      <Sheet visible={showGroup} onClose={closeGroup} title="New Group" locked={creating} footer={
        <View style={styles.footer}>
          <View style={styles.flex1}><Button variant="outline" onPress={closeGroup} fullWidth>Cancel</Button></View>
          <View style={styles.flex1}>
            <Button onPress={createGroup} disabled={groupSelected.length < 2} loading={creating} fullWidth>
              {groupSelected.length < 2 ? 'Pick 2+ people' : 'Create Group'}
            </Button>
          </View>
        </View>
      }>
        <MemberPicker
          employees={employees}
          selected={groupSelected}
          onToggle={(id) => setGroupSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
          search={groupSearch}
          onSearchChange={setGroupSearch}
        />
        {groupSelected.length >= 2 ? <Input placeholder="Group name (optional)" value={groupName} onChangeText={setGroupName} /> : null}
      </Sheet>

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu ? chatDisplayName(menu, myId, employees) : ''}>
        {menu ? (
          <View>
            <MenuRow label={menu.pinnedAt ? 'Unpin chat' : 'Pin chat'} onPress={() => togglePin(menu)} />
            {/* 1:1 only — a group's equivalent is Leave group, in Group info (Phase 2) */}
            {!menu.isGroup ? <MenuRow label="Delete chat" danger onPress={() => deleteChat(menu)} /> : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  pane: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  h1: { fontSize: 16, lineHeight: 24, fontFamily: FontWeights.bold },
  groupBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, minHeight: 32 },
  groupBtnText: { fontSize: 12, lineHeight: 16 },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1 },
  search: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 13 },
  tabs: { flexDirection: 'row', gap: 4, marginTop: 8 },
  tab: { flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center', minHeight: 32, justifyContent: 'center' },
  tabText: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.medium },
  banner: { padding: 12 },
  skels: { padding: 12, gap: 8 },
  listPad: { paddingBottom: 24 },
  sectionLabel: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 56 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, flexShrink: 1 },
  semi: { fontFamily: FontWeights.semiBold },
  preview: { fontSize: 12, lineHeight: 16 },
  nick: { paddingHorizontal: 4, borderRadius: 4, borderWidth: 1 },
  nickText: { fontSize: 9, lineHeight: 13 },
  rowEnd: { alignItems: 'flex-end', gap: 2 },
  time: { fontSize: 10, lineHeight: 14 },
  empty: { fontSize: 12, textAlign: 'center', paddingVertical: 32 },
  footer: { flexDirection: 'row', gap: 8, flex: 1 },
});
