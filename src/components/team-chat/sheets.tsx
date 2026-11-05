import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addTeamChatMembers, forwardTeamChatMessage, getErrorMessage, leaveTeamChat, removeTeamChatMember, renameTeamChatGroup, startTeamChat,
} from '@/lib/api';
import type { TeamChat, TeamChatEmployee, TeamChatMessage } from '@/types/api';

import { displayName, quoteText } from './helpers';
import { Avatar, MemberPicker } from './parts';

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

// ─── Forward ────────────────────────────────────────────────────────────────
// People without a 1:1 yet get one first (POST /team-chat is find-or-create), then one forward
// call for every destination. The server re-checks that I'm in the source and every destination.
export function ForwardSheet({ message, chats, employees, myId, onClose, onDone, onChatStarted, notify }: {
  message: TeamChatMessage; chats: TeamChat[]; employees: TeamChatEmployee[]; myId: string;
  onClose: () => void; onDone: () => void; onChatStarted: (chat: TeamChat) => void;
  notify: (tone: 'success' | 'error', msg: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (selected.length === 0 || sending) return;
    setSending(true);
    try {
      const chatIds = await Promise.all(selected.map(async (key) => {
        if (key.startsWith('group:')) return key.slice('group:'.length);
        const existing = chats.find((c) => !c.isGroup && c.members.length === 2 && c.members.some((m) => m.userId === key) && c.members.some((m) => m.userId === myId));
        if (existing) return existing.id;
        const created = await startTeamChat([key]);
        onChatStarted(created);
        return created.id;
      }));
      await forwardTeamChatMessage(message.id, chatIds);
      notify('success', `Forwarded to ${chatIds.length} chat${chatIds.length > 1 ? 's' : ''}`);
      onDone();
    } catch (e) {
      notify('error', getErrorMessage(e, 'Failed to forward'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet visible fullHeight onClose={onClose} locked={sending} title="Forward to…" subtitle={quoteText(message)} footer={
      <View style={styles.footer}>
        <View style={styles.flex1}><Button variant="outline" onPress={onClose} fullWidth>Cancel</Button></View>
        <View style={styles.flex1}>
          <Button onPress={send} disabled={selected.length === 0} loading={sending} fullWidth>
            {selected.length ? `Forward (${selected.length})` : 'Pick chats'}
          </Button>
        </View>
      </View>
    }>
      <MemberPicker
        employees={employees}
        groups={chats.filter((c) => c.isGroup).map((c) => ({ id: c.id, name: c.name || 'Group Chat', memberCount: c.members.length }))}
        selected={selected}
        onToggle={(id) => setSelected((p) => toggle(p, id))}
        search={search}
        onSearchChange={setSearch}
      />
    </Sheet>
  );
}

// ─── Group info ─────────────────────────────────────────────────────────────
// Rename / add / remove are only shown to the admin, but that is just UI: the server re-checks
// admin on every one of them and answers 403 otherwise. Any member can leave.
export function GroupInfoSheet({ chat, employees, myId, onClose, onChanged, onLeft, notify }: {
  chat: TeamChat; employees: TeamChatEmployee[]; myId: string; onClose: () => void;
  onChanged: (chat: TeamChat) => void; onLeft: (chatId: string, name: string) => void;
  notify: (tone: 'success' | 'error', msg: string) => void;
}) {
  const theme = useTheme();
  const iAmAdmin = chat.adminId === myId;
  const [name, setName] = useState(chat.name || '');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addSelected, setAddSelected] = useState<string[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const nonMembers = employees.filter((e) => !chat.members.some((m) => m.userId === e.id));
  const groupName = chat.name || 'Group Chat';

  const run = async (fn: () => Promise<void>, fail: string) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { notify('error', getErrorMessage(e, fail)); } finally { setBusy(false); }
  };

  const save = () => run(async () => {
    onChanged(await renameTeamChatGroup(chat.id, name.trim()));
    notify('success', 'Group renamed');
  }, 'Failed to rename group');

  const add = () => run(async () => {
    onChanged(await addTeamChatMembers(chat.id, addSelected));
    setAdding(false); setAddSelected([]); setAddSearch('');
  }, 'Failed to add people');

  const remove = (userId: string, who: string) => {
    Alert.alert('Remove member', `Remove ${who} from this group?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(async () => { onChanged(await removeTeamChatMember(chat.id, userId)); }, 'Failed to remove member') },
    ]);
  };

  const leave = () => {
    const warning = chat.members.length <= 1
      ? `Leave "${groupName}"? You're the last member, so the group will be closed.`
      : iAmAdmin
        ? `Leave "${groupName}"? You're the admin — admin will pass to the longest-standing member.`
        : `Leave "${groupName}"?`;
    Alert.alert('Leave group', warning, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => run(async () => { await leaveTeamChat(chat.id); onLeft(chat.id, groupName); }, 'Failed to leave group') },
    ]);
  };

  return (
    <Sheet visible fullHeight onClose={onClose} locked={busy} title="Group info">
      <ThemedText themeColor="textMuted" style={styles.label}>GROUP NAME</ThemedText>
      {iAmAdmin ? (
        <View style={styles.nameRow}>
          <View style={styles.flex1}><Input value={name} onChangeText={setName} maxLength={100} onSubmitEditing={save} /></View>
          <Button onPress={save} loading={busy} disabled={!name.trim() || name.trim() === (chat.name || '')}>Save</Button>
        </View>
      ) : (
        <ThemedText style={styles.groupName}>{groupName}</ThemedText>
      )}

      <View style={styles.membersHead}>
        <ThemedText themeColor="textMuted" style={styles.label}>{chat.members.length} MEMBERS</ThemedText>
        {iAmAdmin && !adding ? (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={[styles.addBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText style={styles.addText}>+ Add people</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {iAmAdmin && adding ? (
        <View style={[styles.addPanel, { borderColor: theme.border }]}>
          <MemberPicker employees={nonMembers} selected={addSelected} onToggle={(id) => setAddSelected((p) => toggle(p, id))} search={addSearch} onSearchChange={setAddSearch} />
          <View style={styles.footer}>
            <View style={styles.flex1}><Button variant="outline" onPress={() => { setAdding(false); setAddSelected([]); setAddSearch(''); }} fullWidth>Cancel</Button></View>
            <View style={styles.flex1}>
              <Button onPress={add} disabled={addSelected.length === 0} loading={busy} fullWidth>
                {addSelected.length ? `Add ${addSelected.length}` : 'Pick people'}
              </Button>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.members}>
        {chat.members.map((m) => {
          const emp = employees.find((e) => e.id === m.userId);
          const who = emp ? displayName(emp) : m.user.name;
          const sub = emp?.designation || m.user.designation || m.user.role || '';
          const isMe = m.userId === myId;
          return (
            <View key={m.userId} style={styles.memberRow}>
              <Avatar name={who} size={32} dim={isMe ? 0.5 : 0.8} />
              <View style={styles.flex1}>
                <ThemedText numberOfLines={1} style={styles.memberName}>{who}{isMe ? ' (you)' : ''}</ThemedText>
                {sub ? <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.memberSub}>{sub}</ThemedText> : null}
              </View>
              {m.userId === chat.adminId ? (
                <View style={[styles.admin, { backgroundColor: withAlpha(theme.primary, 0.1), borderColor: withAlpha(theme.primary, 0.3) }]}>
                  <ThemedText style={[styles.adminText, { color: theme.primary }]}>Admin</ThemedText>
                </View>
              ) : null}
              {iAmAdmin && !isMe ? (
                <Pressable onPress={() => remove(m.userId, who)} disabled={busy} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove ${who}`}>
                  <ThemedText style={[styles.remove, { color: theme.danger }]}>Remove</ThemedText>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      <Button variant="outline" onPress={leave} disabled={busy} fullWidth>Leave group</Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  footer: { flexDirection: 'row', gap: 8, flex: 1, marginTop: 12 },
  label: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 1, marginBottom: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  groupName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, marginBottom: 8 },
  membersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  addBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  addText: { fontSize: 12, lineHeight: 16 },
  addPanel: { padding: 12, borderRadius: 12, borderWidth: 1 },
  members: { gap: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium },
  memberSub: { fontSize: 11, lineHeight: 15 },
  admin: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  adminText: { fontSize: 9, lineHeight: 13 },
  remove: { fontSize: 11, lineHeight: 15 },
});
