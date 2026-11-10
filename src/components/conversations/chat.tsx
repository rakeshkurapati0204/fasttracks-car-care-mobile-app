import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  assignConversation, fetchConversation, fetchEmployees, flagConversationHighValue, getErrorMessage,
  initiateConversationCall, sendConversationMessage, updateConversationStatus,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Conversation, ConversationMessage } from '@/types/api';

import { CallsTab } from './calls-tab';
import { formatDateDivider, formatPhone, formatTime, getInitial, GOLD, STATUS_BADGE } from './parts';

const POLL_MS = 5000;
// Status / flag need requireManagerOrOwner; assign is Owner / Store Manager in the UI
// (same gate); click-to-call is CALL_ROLES.
const MANAGER_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING', 'CASHIER'];
const CALL_ROLES = ['OWNER', 'STORE_MANAGER', 'SALES'];

type Item = { msg: ConversationMessage; divider: string | null };

function Bubble({ item }: { item: Item }) {
  const theme = useTheme();
  const { msg, divider } = item;
  const mine = msg.senderType === 'EMPLOYEE';
  return (
    <View>
      {divider ? (
        <View style={styles.dividerRow}>
          <View style={[styles.line, { backgroundColor: theme.border }]} />
          <View style={[styles.dividerPill, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText themeColor="textMuted" style={styles.dividerText}>{divider}</ThemedText>
          </View>
          <View style={[styles.line, { backgroundColor: theme.border }]} />
        </View>
      ) : null}
      <View style={[styles.msgRow, mine ? styles.right : styles.left]}>
        <View style={[styles.msgCol, mine ? styles.alignEnd : styles.alignStart]}>
          <ThemedText themeColor="textMuted" style={[styles.sender, { textAlign: mine ? 'right' : 'left' }]}>{msg.senderName}</ThemedText>
          <View
            style={[
              styles.bubble,
              mine
                ? { backgroundColor: theme.primary, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 4 }
                : { backgroundColor: theme.backgroundElement, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 4, borderBottomRightRadius: 18 },
            ]}>
            <ThemedText style={[styles.bubbleText, { color: mine ? '#ffffff' : theme.text }]}>{msg.content}</ThemedText>
          </View>
          <ThemedText themeColor="textMuted" style={[styles.stamp, { textAlign: mine ? 'right' : 'left' }]}>{formatTime(msg.createdAt)}</ThemedText>
          {mine && msg.deliveryStatus === 'FAILED' ? (
            <ThemedText style={[styles.failed, { color: theme.danger }]}>
              {msg.deliveryError && msg.deliveryError.includes('131047')
                ? "Not delivered — customer hasn't messaged in 24h, use a template"
                : 'Not delivered'}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function ChatPanel({
  conv, onBack, onClose, onUpdated,
}: { conv: Conversation; onBack?: () => void; onClose?: () => void; onUpdated?: (c: Partial<Conversation> & { id: string }) => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const role = user?.role ?? '';
  const canManage = MANAGER_ROLES.includes(role);
  const canReassign = role === 'OWNER' || role === 'STORE_MANAGER';
  const canCall = CALL_ROLES.includes(role);

  const [messages, setMessages] = useState<ConversationMessage[]>(conv.messages ?? []);
  const [status, setStatus] = useState(conv.status);
  const [highValue, setHighValue] = useState(conv.isHighValue);
  const [assignee, setAssignee] = useState(conv.assignedTo?.name ?? '');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  // A call conversation opens on its Calls tab, as on the dashboard.
  const [detailTab, setDetailTab] = useState<'whatsapp' | 'calls'>(conv.category === 'CALL' ? 'calls' : 'whatsapp');
  const [recordingCount, setRecordingCount] = useState(0);
  const [callState, setCallState] = useState<'idle' | 'placing' | 'placed' | 'error'>('idle');
  const [assignOpen, setAssignOpen] = useState(false);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);

  // Merge by id, oldest first, so a poll never drops a message just sent.
  const merge = useCallback((incoming: ConversationMessage[]) => {
    setMessages((prev) => {
      const map = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }, []);

  // Live updates: this app has no socket client, so the open thread re-reads
  // every few seconds while the app is in the foreground (new messages, delivery
  // status, status / flag changes made elsewhere).
  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchConversation(conv.id);
      merge(fresh.messages ?? []);
      setStatus(fresh.status);
      setHighValue(fresh.isHighValue);
      setAssignee(fresh.assignedTo?.name ?? '');
    } catch {
      /* keep what's on screen; the next poll retries */
    }
  }, [conv.id, merge]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the full thread on open
    refresh();
    const t = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const items = useMemo<Item[]>(() => {
    const asc = messages.map((msg, i) => {
      const day = new Date(msg.createdAt).toDateString();
      const prev = i > 0 ? new Date(messages[i - 1].createdAt).toDateString() : null;
      return { msg, divider: day !== prev ? formatDateDivider(new Date(msg.createdAt)) : null };
    });
    return asc.reverse(); // the list is inverted: newest at the bottom
  }, [messages]);

  const send = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      const msg = await sendConversationMessage(conv.id, text);
      merge([msg]);
      setStatus('ACTIVE');
      setReply('');
      onUpdated?.({ id: conv.id, status: 'ACTIVE', lastMessageAt: msg.createdAt });
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not send that message.'));
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (next: string) => {
    try {
      const u = await updateConversationStatus(conv.id, next);
      setStatus(u.status);
      onUpdated?.({ id: conv.id, status: u.status });
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not update the status.'));
    }
  };

  const toggleFlag = async () => {
    try {
      const u = await flagConversationHighValue(conv.id, !highValue);
      setHighValue(u.isHighValue);
      onUpdated?.({ id: conv.id, isHighValue: u.isHighValue });
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not update the flag.'));
    }
  };

  // Click-to-call: only the conversation id goes to the server.
  const call = async () => {
    setCallState('placing');
    try {
      await initiateConversationCall(conv.id);
      setCallState('placed');
    } catch {
      setCallState('error');
    }
    setTimeout(() => setCallState('idle'), 4000);
  };

  const openAssign = async () => {
    setAssignOpen(true);
    if (people.length === 0) {
      try {
        const all = await fetchEmployees();
        setPeople(all.filter((e) => e.isActive && ['SALES', 'STORE_MANAGER', 'OWNER'].includes(e.role)).map((e) => ({ id: e.id, name: e.name })));
      } catch {
        /* the sheet just stays on Loading… */
      }
    }
  };

  const reassign = async (id: string) => {
    try {
      const u = await assignConversation(conv.id, id);
      setAssignee(u.assignedTo?.name ?? '');
      onUpdated?.({ id: conv.id, assignedTo: u.assignedTo });
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not reassign.'));
    } finally {
      setAssignOpen(false);
    }
  };

  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.CLOSED;
  const showTabs = conv.category === 'CUSTOMER_WHATSAPP' || conv.category === 'CALL';
  const thread = detailTab === 'whatsapp' || !showTabs;

  return (
    <KeyboardAvoidingView style={[styles.flex1, { backgroundColor: theme.surface }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 44}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to conversations" style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </Pressable>
        ) : null}
        <View style={[styles.avatar, { backgroundColor: highValue ? GOLD : theme.primary }]}>
          <ThemedText style={styles.avatarText}>{getInitial(conv.customerName)}</ThemedText>
        </View>
        <View style={styles.flex1}>
          <View style={styles.nameRow}>
            <ThemedText numberOfLines={1} style={styles.name}>{conv.customerName}</ThemedText>
            <Badge variant={badge.variant} size="sm" dot>{status}</Badge>
          </View>
          <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.sub}>{`${formatPhone(conv.customerPhone)} · ${assignee}`}</ThemedText>
        </View>
        <View style={styles.actions}>
          {canCall ? (
            <Pressable
              onPress={call}
              disabled={callState === 'placing'}
              accessibilityRole="button"
              accessibilityLabel={callState === 'placed' ? 'Ringing your phone now' : callState === 'error' ? "Couldn't place the call" : 'Call this customer'}
              style={[styles.iconBtn, callState === 'placing' && { opacity: 0.5 }]}>
              <Ionicons name="call-outline" size={18} color={callState === 'placed' ? theme.success : callState === 'error' ? theme.danger : theme.textMuted} />
            </Pressable>
          ) : null}
          {canReassign ? (
            <Pressable onPress={openAssign} accessibilityRole="button" accessibilityLabel="Assign to a salesperson" style={styles.iconBtn}>
              <Ionicons name="person-outline" size={17} color={theme.textMuted} />
            </Pressable>
          ) : null}
          {canManage ? (
            <Pressable onPress={toggleFlag} accessibilityRole="button" accessibilityLabel={highValue ? 'Remove high value' : 'Mark high value'} style={styles.iconBtn}>
              <Ionicons name={highValue ? 'star' : 'star-outline'} size={17} color={highValue ? GOLD : theme.textMuted} />
            </Pressable>
          ) : null}
          {canManage ? (
            status !== 'CLOSED' ? (
              <Pressable onPress={() => changeStatus('CLOSED')} accessibilityRole="button" style={[styles.textBtn, { backgroundColor: 'rgba(224,104,104,0.1)' }]}>
                <ThemedText style={[styles.textBtnLabel, { color: theme.danger }]}>Close</ThemedText>
              </Pressable>
            ) : (
              <Pressable onPress={() => changeStatus('ACTIVE')} accessibilityRole="button" style={[styles.textBtn, { backgroundColor: 'rgba(54,200,126,0.1)' }]}>
                <ThemedText style={[styles.textBtnLabel, { color: theme.success }]}>Reopen</ThemedText>
              </Pressable>
            )
          ) : null}
          {onClose ? (
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close chat" style={styles.iconBtn}>
              <Ionicons name="close" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* WhatsApp / Calls sub-tabs */}
      {showTabs ? (
        <View style={[styles.subTabs, { borderBottomColor: theme.border }]}>
          {(['whatsapp', 'calls'] as const).map((t) => (
            <Pressable
              key={t}
              onPress={() => setDetailTab(t)}
              accessibilityRole="tab"
              accessibilityState={{ selected: detailTab === t }}
              style={[styles.subTab, { borderBottomColor: detailTab === t ? theme.primary : 'transparent' }]}>
              <ThemedText style={[styles.subTabText, { color: detailTab === t ? theme.primary : theme.textMuted }]}>{t === 'whatsapp' ? '💬 WhatsApp' : '📞 Calls'}</ThemedText>
              {t === 'calls' && recordingCount > 0 ? (
                <View style={styles.recCount}><ThemedText style={[styles.recCountText, { color: theme.primary }]}>{recordingCount}</ThemedText></View>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? <ThemedText style={[styles.error, { color: theme.danger }]}>{error}</ThemedText> : null}

      {thread ? (
        <>
          <FlatList
            inverted
            data={items}
            keyExtractor={(i) => i.msg.id}
            renderItem={({ item }) => <Bubble item={item} />}
            contentContainerStyle={styles.thread}
            ListEmptyComponent={
              <View style={styles.invertFix}>
                <ThemedText themeColor="textMuted" style={styles.empty}>No messages in this conversation yet.</ThemedText>
              </View>
            }
            keyboardShouldPersistTaps="handled"
          />
          <View style={[styles.composer, { borderTopColor: theme.border, paddingBottom: Math.max(8, insets.bottom) }]}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder="Type a message…"
              placeholderTextColor={theme.textMuted}
              multiline
              editable={!sending}
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }]}
            />
            <Pressable
              onPress={send}
              disabled={!reply.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              style={[styles.send, { backgroundColor: reply.trim() && !sending ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
              {sending ? <ActivityIndicator size="small" color={theme.textMuted} /> : <Ionicons name="send" size={16} color={reply.trim() ? '#ffffff' : theme.textMuted} />}
            </Pressable>
          </View>
        </>
      ) : (
        <CallsTab conv={conv} onCount={setRecordingCount} />
      )}

      {assignOpen ? (
        <Sheet visible onClose={() => setAssignOpen(false)} title="Assign to a salesperson">
          {people.length === 0 ? (
            <ThemedText themeColor="textMuted" style={styles.empty}>Loading…</ThemedText>
          ) : (
            people.map((p) => (
              <Pressable key={p.id} onPress={() => reassign(p.id)} accessibilityRole="button" style={styles.person}>
                <ThemedText style={styles.personText}>{p.name}</ThemedText>
              </Pressable>
            ))
          )}
        </Sheet>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, flexShrink: 1 },
  sub: { fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  textBtn: { paddingHorizontal: 8, minHeight: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  subTabs: { flexDirection: 'row', borderBottomWidth: 1 },
  subTab: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderBottomWidth: 2 },
  recCount: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: 'rgba(104,15,26,0.12)' },
  recCountText: { fontSize: 10, lineHeight: 12, fontFamily: FontWeights.semiBold },
  subTabText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  error: { fontSize: 12, lineHeight: 16, paddingHorizontal: 12, paddingVertical: 6 },
  thread: { paddingHorizontal: 12, paddingVertical: 12, gap: 12 },
  invertFix: { transform: [{ scaleY: -1 }] },
  empty: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40, fontStyle: 'italic' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 4 },
  line: { flex: 1, height: 1 },
  dividerPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  dividerText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  msgRow: { flexDirection: 'row' },
  right: { justifyContent: 'flex-end' },
  left: { justifyContent: 'flex-start' },
  msgCol: { maxWidth: '78%' },
  alignEnd: { alignItems: 'flex-end' },
  alignStart: { alignItems: 'flex-start' },
  sender: { fontSize: 10, lineHeight: 14, paddingHorizontal: 4, marginBottom: 2 },
  bubble: { paddingHorizontal: 14, paddingVertical: 8 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  stamp: { fontSize: 9, lineHeight: 12, paddingHorizontal: 4, marginTop: 2 },
  failed: { fontSize: 9, lineHeight: 12, paddingHorizontal: 4, marginTop: 2, fontFamily: FontWeights.medium, textAlign: 'right' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, lineHeight: 20, fontFamily: FontWeights.regular },
  send: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  person: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8 },
  personText: { fontSize: 14, lineHeight: 20 },
});
