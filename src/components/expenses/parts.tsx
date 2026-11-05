import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, TextInput, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Fonts, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { downloadExpenseAttachment, fetchExpenseAttachmentDataUri, getErrorMessage, replyToExpenseTagged } from '@/lib/api';
import type { Expense, ExpenseAttachment, MentionableUser } from '@/types/api';

import { CATEGORY_STYLE, STATUS_STYLE } from './helpers';

export function CategoryBadge({ category }: { category: string }) {
  const dark = useColorScheme() === 'dark';
  const st = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.MISC;
  return (
    <View style={[styles.catBadge, { backgroundColor: st.bg }]}>
      <ThemedText style={[styles.catText, { color: dark ? st.dark : st.color }]}>{category}</ThemedText>
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const dark = useColorScheme() === 'dark';
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.PENDING;
  return (
    <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
      <ThemedText style={[styles.statusText, { color: dark ? st.dark : st.color }]}>{st.label}</ThemedText>
    </View>
  );
}

export function Money({ value, size = 16 }: { value: string; size?: number }) {
  return <ThemedText style={{ fontSize: size, lineHeight: size + 6, fontFamily: Fonts?.mono, fontWeight: '700' }}>{value}</ThemedText>;
}

// Bytes arrive through an authenticated request (private container); images are
// shown inline, everything else — and any image that fails — is a link.
const thumbCache = new Map<string, string>();

export function BillThumb({ attachment, onError }: { attachment: ExpenseAttachment; onError?: (m: string) => void }) {
  const theme = useTheme();
  const isImage = attachment.mimeType.startsWith('image/');
  const [uri, setUri] = useState<string | null>(() => thumbCache.get(attachment.id) ?? null);
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(false);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!isImage || thumbCache.has(attachment.id)) return;
    let live = true;
    fetchExpenseAttachmentDataUri(attachment.id, attachment.mimeType)
      .then((u) => { thumbCache.set(attachment.id, u); if (live) setUri(u); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [attachment.id, attachment.mimeType, isImage]);

  const openFile = async () => {
    setOpening(true);
    try {
      const { uri: file } = await downloadExpenseAttachment(attachment.id, attachment.filename);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(file, { mimeType: attachment.mimeType });
    } catch (e) {
      onError?.(getErrorMessage(e, 'Could not open this bill.'));
    } finally {
      setOpening(false);
    }
  };

  if (!isImage || failed) {
    return (
      <Pressable onPress={openFile} accessibilityRole="link" accessibilityLabel={`Open ${attachment.filename}`} style={styles.linkRow}>
        {opening ? <ActivityIndicator size="small" /> : null}
        <ThemedText numberOfLines={1} style={[styles.link, { color: theme.primary }]}>{attachment.filename}</ThemedText>
      </Pressable>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => (uri ? setFull(true) : openFile())}
        accessibilityRole="button"
        accessibilityLabel={`View ${attachment.filename}`}
        style={[styles.thumb, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        {uri ? <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" /> : <ActivityIndicator style={styles.thumbSpin} />}
      </Pressable>
      <Modal visible={full} transparent animationType="fade" onRequestClose={() => setFull(false)}>
        <View style={styles.lightbox}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFull(false)} accessibilityLabel="Close" />
          {uri ? <Image source={{ uri }} style={styles.full} resizeMode="contain" /> : null}
          <ThemedText style={styles.fullName} numberOfLines={1}>{attachment.filename}</ThemedText>
          <Pressable onPress={() => setFull(false)} style={styles.fullClose} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

// ─── @-tag input: picking a name records its id; the literal "@Name" stays as prose ──
function activeToken(text: string, caret: number): { start: number; q: string } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null; // an email never triggers it
  const frag = upto.slice(at + 1);
  if (frag.includes('\n') || frag.split(' ').length > 2) return null;
  return { start: at, q: frag };
}

export function MentionInput({ value, onChange, users, placeholder, multiline, disabled, onSubmit }: {
  value: string; onChange: (v: string, mentions: string[]) => void; users: MentionableUser[];
  placeholder?: string; multiline?: boolean; disabled?: boolean; onSubmit?: () => void;
}) {
  const theme = useTheme();
  const [picked, setPicked] = useState<string[]>([]);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);

  const live = (text: string, ids: string[]) => ids.filter((id) => {
    const u = users.find((x) => x.id === id);
    return u ? text.includes(`@${u.name}`) : false;
  });
  const token = focused ? activeToken(value, caret) : null;
  const suggestions = token ? users.filter((u) => u.name.toLowerCase().includes(token.q.toLowerCase())).slice(0, 6) : [];
  const liveIds = live(value, picked);

  const choose = (u: MentionableUser) => {
    if (!token) return;
    const next = `${value.slice(0, token.start)}@${u.name} ${value.slice(caret)}`;
    const nextPicked = picked.includes(u.id) ? picked : [...picked, u.id];
    setPicked(nextPicked);
    setCaret(token.start + u.name.length + 2);
    onChange(next, live(next, nextPicked));
  };

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={(t) => { setCaret(t.length); onChange(t, live(t, picked)); }}
        onSelectionChange={(e) => setCaret(e.nativeEvent.selection.end)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        editable={!disabled}
        multiline={multiline}
        onSubmitEditing={multiline ? undefined : onSubmit}
        returnKeyType={multiline ? 'default' : 'send'}
        style={[styles.mInput, multiline && styles.mMulti, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
      />
      {suggestions.length > 0 ? (
        <View style={[styles.sugg, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {suggestions.map((u) => (
            <Pressable key={u.id} onPress={() => choose(u)} style={styles.suggRow} accessibilityRole="button">
              <ThemedText style={styles.suggName}>{u.name}</ThemedText>
              <ThemedText themeColor="textMuted" style={styles.suggRole}>{u.role.replace(/_/g, ' ').toUpperCase()}</ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {liveIds.length > 0 ? (
        <View style={styles.chips}>
          {liveIds.map((id) => {
            const u = users.find((x) => x.id === id);
            return u ? (
              <View key={id} style={[styles.notify, { backgroundColor: 'rgba(13,148,136,0.15)' }]}>
                <ThemedText style={styles.notifyText}>will notify {u.name}</ThemedText>
              </View>
            ) : null;
          })}
        </View>
      ) : null}
    </View>
  );
}

const QUICK_REPLIES = ['👍 Got it', 'On it', 'Will check'];

// One expense's conversation (dashboard ExpenseThread + ReplyThread).
export function ExpenseThread({ expense, currentUserId, mentionUsers, onChanged }: {
  expense: Expense; currentUserId: string; mentionUsers: MentionableUser[]; onChanged: () => void;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const replies = expense.replies ?? [];

  const send = async (message: string, ids: string[]) => {
    setSending(true);
    setError('');
    try {
      await replyToExpenseTagged(expense.id, message, ids);
      onChanged();
      return true;
    } catch (e) {
      setError(getErrorMessage(e, 'Could not send that reply.'));
      return false;
    } finally {
      setSending(false);
    }
  };
  const submit = async () => {
    const t = draft.trim();
    if (!t || sending) return;
    if (await send(t, mentions)) { setDraft(''); setMentions([]); }
  };

  return (
    <View style={[styles.thread, { backgroundColor: theme.surface }]}>
      {replies.length > 0 ? (
        <View style={styles.bubbles}>
          {replies.map((r) => {
            const me = r.author.id === currentUserId;
            return (
              <View key={r.id} style={[styles.bubbleRow, { justifyContent: me ? 'flex-end' : 'flex-start' }]}>
                <View style={[styles.bubble, me ? { backgroundColor: theme.primary } : { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 }]}>
                  {!me ? <ThemedText themeColor="textMuted" style={styles.author}>{r.author.name}</ThemedText> : null}
                  <ThemedText style={[styles.msg, me && { color: '#fff' }]}>{r.message}</ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.chips}>
        {QUICK_REPLIES.map((q) => (
          <Pressable key={q} disabled={sending} onPress={() => send(q, [])} style={[styles.quick, { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: sending ? 0.5 : 1 }]}>
            <ThemedText themeColor="textMuted" style={styles.quickText}>{q}</ThemedText>
          </Pressable>
        ))}
      </View>
      <View style={styles.compose}>
        <View style={styles.flex1}>
          <MentionInput
            value={draft}
            onChange={(v, m) => { setDraft(v); setMentions(m); }}
            users={mentionUsers}
            placeholder="Reply… use @ to tag someone"
            disabled={sending}
            onSubmit={submit}
          />
        </View>
        <Pressable
          onPress={submit}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: !draft.trim() || sending ? 0.5 : 1 }]}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <ThemedText style={styles.sendText}>Send</ThemedText>}
        </Pressable>
      </View>
      {error ? <ThemedText style={[styles.err, { color: theme.danger }]}>{error}</ThemedText> : null}
    </View>
  );
}

export function SmallBtn({ label, onPress, disabled, tone }: { label: string; onPress: () => void; disabled?: boolean; tone?: 'ok' | 'bad' | 'plain'; }) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const base = tone === 'ok' ? { bg: 'rgba(34,197,94,0.15)', fg: dark ? '#4ade80' : '#15803d' }
    : tone === 'bad' ? { bg: 'rgba(239,68,68,0.15)', fg: dark ? '#f87171' : '#b91c1c' }
      : { bg: theme.surface, fg: theme.textMuted };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.small, { backgroundColor: base.bg, borderColor: tone === 'plain' || !tone ? theme.border : 'transparent', borderWidth: tone && tone !== 'plain' ? 0 : 1, opacity: disabled ? 0.5 : 1 }]}>
      <ThemedText style={[styles.smallText, { color: base.fg }]}>{label}</ThemedText>
    </Pressable>
  );
}

export function Panel({ children, pad = 16 }: { children: ReactNode; pad?: number }) {
  const theme = useTheme();
  return <View style={[styles.panel, { backgroundColor: theme.backgroundElement, borderColor: theme.border, padding: pad }]}>{children}</View>;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  catBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  catText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 240 },
  link: { fontSize: 12, lineHeight: 16, textDecorationLine: 'underline' },
  thumb: { width: 80, height: 80, borderRadius: Radii.md, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: '100%', height: '100%' },
  thumbSpin: { alignSelf: 'center' },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  fullName: { color: '#fff', fontSize: 12, marginTop: 8, maxWidth: '80%' },
  fullClose: { position: 'absolute', top: 48, right: 20, padding: 8 },
  mInput: { minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  mMulti: { minHeight: 76, textAlignVertical: 'top' },
  sugg: { borderWidth: 1, borderRadius: Radii.md, marginTop: 4, overflow: 'hidden' },
  suggRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  suggName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  suggRole: { fontSize: 10, lineHeight: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  notify: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  notifyText: { color: '#0d9488', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  thread: { marginTop: 8, padding: 8, borderRadius: Radii.md },
  bubbles: { gap: 6 },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  author: { fontSize: 11, lineHeight: 14, marginBottom: 2 },
  msg: { fontSize: 14, lineHeight: 20 },
  quick: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  quickText: { fontSize: 12, lineHeight: 16 },
  compose: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  sendBtn: { height: 44, paddingHorizontal: 16, borderRadius: Radii.md, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#fff', fontSize: 14, fontFamily: FontWeights.semiBold },
  err: { fontSize: 12, marginTop: 6 },
  small: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  smallText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  panel: { borderWidth: 1, borderRadius: 12 },
});

// withAlpha is re-exported for the views' tinted notices.
export { withAlpha };
