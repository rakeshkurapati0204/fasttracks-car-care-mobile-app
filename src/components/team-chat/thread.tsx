import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  ActivityIndicator, Alert, AppState, FlatList, Keyboard, Platform, Pressable, Share, StyleSheet, TextInput, View,
} from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { FontWeights, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteTeamChatMessage, downloadTeamChatDocument, editTeamChatMessage, fetchTeamChatMessagesPage, fetchTeamChatPins, getErrorMessage,
  markTeamChatRead, pinTeamChatMessage, sendTeamChatMessage, unpinTeamChatMessage, uploadTeamChatAttachment,
} from '@/lib/api';
import { openExternalUrl } from '@/lib/open-url';
import { pickFromCamera, pickManyFromGallery, type PickedFile } from '@/lib/upload';
import type { TeamChat, TeamChatEmployee, TeamChatMessage } from '@/types/api';

import {
  DELETED_TEXT, DOC_EXTS, DOC_MAX_BYTES, DOC_PICKER_TYPES, EDIT_WINDOW_MS, MAX_FILES_PER_PICK, buildRows, docExtOf, docMime, docName,
  fmtBubbleTime, mediaKind, quoteText, type ChatRow,
} from './helpers';
import { ShareLinkBox } from './link-box';
import { ImageLightbox, MediaBlock } from './media';
import { Avatar, Linkified, MenuRow } from './parts';
import { ForwardSheet, GroupInfoSheet } from './sheets';
import { useVoiceRecorder } from './voice';

export const THREAD_POLL_MS = 5_000;
const PAGE = 60;

/** Fresh newest-window messages replace the matching tail of what is already loaded; older pages stay. */
function mergeNewest(prev: TeamChatMessage[], fresh: TeamChatMessage[]) {
  if (fresh.length === 0) return prev;
  if (prev.length === 0) return fresh;
  const first = new Date(fresh[0].sentAt).getTime();
  return [...prev.filter((m) => new Date(m.sentAt).getTime() < first), ...fresh];
}

// The right pane of the dashboard's Team Chat page (text messages): header, pinned bar,
// day-divided inverted thread, reply / edit banners and the composer. Polls every 5 s
// while the app is in the foreground and marks the chat read like the dashboard.
export function ChatThread({
  chat, chats, employees, myId, onBack, onEditNick, onSent, onRead, onChatUpdated, onChatStarted, onForwarded, onLeft, topInset = 0, bottomInset = 0, screenGap = 0,
}: {
  chat: TeamChat; chats: TeamChat[]; employees: TeamChatEmployee[]; myId: string; topInset?: number; bottomInset?: number;
  /** Space between the bottom of this pane and the bottom of the screen (two-pane margin); 0 on phone. */
  screenGap?: number;
  onBack?: () => void; onEditNick: (emp: TeamChatEmployee) => void;
  onSent: (chatId: string, msg: TeamChatMessage) => void; onRead: (chatId: string) => void;
  onChatUpdated: (chat: TeamChat) => void; onChatStarted: (chat: TeamChat) => void; onForwarded: () => void;
  onLeft: (chatId: string) => void;
}) {
  const theme = useTheme();
  const chatId = chat.id;
  // The nav-bar inset only matters while the keyboard is closed (the keyboard sits above it).
  // KeyboardAvoidingView is unreliable on Android edge-to-edge inside a nested stack, so the keyboard
  // height is tracked here and applied as bottom padding (the message list is flex: 1 and shrinks).
  const [keyboardH, setKeyboardH] = useState(0);
  const keyboardUp = keyboardH > 0;
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setKeyboardH(e.endCoordinates.height));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [okNotice, setOkNotice] = useState('');
  const [pins, setPins] = useState<TeamChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<TeamChatMessage | null>(null);
  const replyRef = useRef<TeamChatMessage | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [showLinkBox, setShowLinkBox] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [forwarding, setForwarding] = useState<TeamChatMessage | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [editing, setEditing] = useState<TeamChatMessage | null>(null);
  const [menu, setMenu] = useState<{ msg: TeamChatMessage; canEdit: boolean; canChange: boolean } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatRow>>(null);
  const idsRef = useRef<Set<string>>(new Set());
  const hlTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const other = !chat.isGroup ? chat.members.find((m) => m.userId !== myId) : undefined;
  const otherEmp = other ? employees.find((e) => e.id === other.userId) : undefined;
  const chatName = chat.isGroup ? chat.name || 'Group Chat' : otherEmp ? (otherEmp.nickname ?? otherEmp.name) : other?.user.name ?? 'Chat';
  const phone = otherEmp?.phone ?? other?.user.phone ?? null;

  const rows = useMemo(() => buildRows(messages, chat.isGroup, myId), [messages, chat.isGroup, myId]);

  const setReply = (m: TeamChatMessage | null) => { replyRef.current = m; setReplyingTo(m); };
  const notify = (tone: 'success' | 'error', msg: string) => { if (tone === 'error') setNotice(msg); else setOkNotice(msg); };

  useEffect(() => {
    if (!okNotice && !notice) return;
    const t = setTimeout(() => { setOkNotice(''); setNotice(''); }, 5000);
    return () => clearTimeout(t);
  }, [okNotice, notice]);

  // One send path for text, media and links: appends the server's message and updates the list preview.
  const postMessage = async (content: string | null, media: { mediaUrl: string; mediaType: string } | null, replyToId?: string) => {
    const msg = await sendTeamChatMessage(chatId, content, media ?? undefined, replyToId);
    idsRef.current.add(msg.id);
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    onSent(chatId, msg);
    return msg;
  };

  const loadNewest = useCallback(async (initial: boolean) => {
    try {
      const r = await fetchTeamChatMessagesPage(chatId, { limit: PAGE });
      const known = idsRef.current;
      const incoming = r.messages.some((m) => !known.has(m.id) && m.senderId !== myId);
      r.messages.forEach((m) => known.add(m.id));
      setMessages((prev) => mergeNewest(prev, r.messages));
      if (initial) setHasMore(r.hasMore);
      setError('');
      // Opening a chat reads it; so does a message arriving while it is open.
      if (initial || incoming) {
        markTeamChatRead(chatId).catch(() => {});
        onRead(chatId);
      }
    } catch (e) {
      if (initial) setError(getErrorMessage(e, 'Failed to load messages'));
    } finally {
      if (initial) setLoading(false);
    }
  }, [chatId, myId, onRead]);

  const loadPins = useCallback(() => {
    fetchTeamChatPins(chatId).then((p) => setPins(Array.isArray(p) ? p : [])).catch(() => {});
  }, [chatId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on open
    loadNewest(true);
    loadPins();
  }, [loadNewest, loadPins]);

  useEffect(() => {
    const t = setInterval(() => {
      if (AppState.currentState === 'active') { loadNewest(false); loadPins(); }
    }, THREAD_POLL_MS);
    return () => clearInterval(t);
  }, [loadNewest, loadPins]);

  useEffect(() => () => { if (hlTimer.current) clearTimeout(hlTimer.current); }, []);

  const loadOlder = async () => {
    if (loadingOlder || !hasMore || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const r = await fetchTeamChatMessagesPage(chatId, { before: messages[0].id, limit: PAGE });
      r.messages.forEach((m) => idsRef.current.add(m.id));
      setMessages((prev) => [...r.messages, ...prev]);
      setHasMore(r.hasMore);
    } catch (e) {
      setNotice(getErrorMessage(e, 'Failed to load older messages'));
    } finally {
      setLoadingOlder(false);
    }
  };

  // Tapping a quote or a pin: scroll to the original and flash it, if it's loaded.
  const jumpToMessage = (id: string) => {
    const index = rows.findIndex((r) => r.type === 'msg' && r.msg.id === id);
    if (index < 0) return;
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
    setHighlightId(id);
    if (hlTimer.current) clearTimeout(hlTimer.current);
    hlTimer.current = setTimeout(() => setHighlightId((p) => (p === id ? null : p)), 1500);
  };

  const applyUpdate = (msg: TeamChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
    setPins((prev) => (msg.deleted ? prev.filter((p) => p.id !== msg.id) : prev.map((p) => (p.id === msg.id ? msg : p))));
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    if (editing) {
      if (content === editing.content) { setEditing(null); setDraft(''); return; }
      setSending(true);
      try {
        applyUpdate(await editTeamChatMessage(chatId, editing.id, content));
        setEditing(null);
        setDraft('');
      } catch (e) {
        setNotice(getErrorMessage(e, 'Failed to edit message'));
      } finally {
        setSending(false);
      }
      return;
    }
    const reply = replyRef.current;
    setDraft('');
    setReply(null);
    setSending(true);
    try {
      await postMessage(content, null, reply?.id);
      setNotice('');
    } catch (e) {
      setDraft(content);
      setReply(reply);
      setNotice(getErrorMessage(e, 'Failed to send message'));
    } finally {
      setSending(false);
    }
  };

  // ── Media: images, documents, voice notes, links (dashboard sendPickedFiles / sendLink) ──
  const noUploadCtrl = () => ({ onProgress: () => {}, signal: new AbortController().signal });

  const sendPickedFiles = async (list: PickedFile[], kind: 'image' | 'file') => {
    if (list.length === 0) return;
    let files = list;
    if (files.length > MAX_FILES_PER_PICK) {
      notify('error', `You can send up to ${MAX_FILES_PER_PICK} files at once — sending the first ${MAX_FILES_PER_PICK}`);
      files = files.slice(0, MAX_FILES_PER_PICK);
    }
    setUploadingMedia(true);
    let sent = 0;
    const failed: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        setUploadProgress(files.length > 1 ? `Sending ${i + 1} of ${files.length}: ${f.name}` : `Sending ${f.name}`);
        if ((f.size ?? 0) > DOC_MAX_BYTES) { failed.push(`${f.name} (over 25 MB)`); continue; }
        try {
          const up = await uploadTeamChatAttachment(f, noUploadCtrl());
          // The MIME type, so the staff app opens a document with the right viewer.
          await postMessage(null, { mediaUrl: up.url, mediaType: up.mimeType || (kind === 'file' ? 'file' : up.type) }, replyRef.current?.id);
          setReply(null);
          sent++;
        } catch (e) {
          const why = getErrorMessage(e, '');
          failed.push(`${f.name}${why ? ` (${why})` : ''}`);
        }
      }
    } finally {
      setUploadingMedia(false);
      setUploadProgress(null);
    }
    if (failed.length) notify('error', `Could not send: ${failed.join(', ')}`);
    else if (sent > 1) notify('success', `${sent} files sent`);
  };

  const pickDocs = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: DOC_PICKER_TYPES, multiple: true, copyToCacheDirectory: true });
    if (r.canceled) return;
    const ok: PickedFile[] = [];
    const bad: string[] = [];
    for (const a of r.assets) {
      if (DOC_EXTS.includes(docExtOf(a.name))) ok.push({ uri: a.uri, name: a.name, mimeType: docMime(a.name, a.mimeType), size: a.size });
      else bad.push(a.name);
    }
    if (bad.length) notify('error', `Could not send: ${bad.map((n) => `${n} (PDF, Word, Excel, PowerPoint, text, CSV or ZIP only)`).join(', ')}`);
    await sendPickedFiles(ok, 'file');
  };

  const takePhoto = async () => {
    setPhotoSheet(false);
    const f = await pickFromCamera();
    if (f) await sendPickedFiles([f], 'image');
  };
  const pickPhotos = async () => {
    setPhotoSheet(false);
    await sendPickedFiles(await pickManyFromGallery(MAX_FILES_PER_PICK), 'image');
  };

  const sendLink = async (rawUrl: string, rawNote: string) => {
    let url = rawUrl.trim();
    if (!url) return false;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try { new URL(url); } catch { notify('error', 'Please paste a valid link'); return false; }
    const note = rawNote.trim();
    setSending(true);
    try {
      await postMessage(note ? `${note}\n${url}` : url, null, replyRef.current?.id);
      setReply(null);
      return true;
    } catch {
      notify('error', 'Failed to share link');
      return false;
    } finally {
      setSending(false);
    }
  };

  const onVoiceFinished = useCallback(async (file: PickedFile) => {
    setUploadingMedia(true);
    try {
      const up = await uploadTeamChatAttachment(file, { onProgress: () => {}, signal: new AbortController().signal });
      await postMessage(null, { mediaUrl: up.url, mediaType: up.mimeType || 'audio' }, replyRef.current?.id);
      setReply(null);
    } catch (e) {
      notify('error', getErrorMessage(e, 'Failed to send voice note'));
    } finally {
      setUploadingMedia(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- postMessage/notify/setReply only touch refs and state setters
  }, [chatId]);
  const voice = useVoiceRecorder(onVoiceFinished);

  const imageUrls = useMemo(
    () => messages.filter((m) => !m.deleted && mediaKind(m.mediaType) === 'image' && m.mediaUrl).map((m) => m.mediaUrl as string),
    [messages],
  );

  // Documents download to the cache and open through the share sheet.
  const openDoc = async (msg: TeamChatMessage) => {
    if (!msg.mediaUrl) return;
    setOpeningId(msg.id);
    try {
      const name = docName(msg.mediaUrl, msg.mediaName);
      const { uri } = await downloadTeamChatDocument(msg.mediaUrl, name);
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      const type = msg.mediaType && msg.mediaType.includes('/') ? msg.mediaType : docMime(name);
      await Sharing.shareAsync(uri, { mimeType: type, dialogTitle: name });
    } catch (e) {
      notify('error', getErrorMessage(e, 'Could not open this document.'));
    } finally {
      setOpeningId(null);
    }
  };

  const copyMsg = async (msg: TeamChatMessage) => {
    setMenu(null);
    if (!msg.content) return;
    try { await Clipboard.setStringAsync(msg.content); notify('success', '✓ Copied!'); }
    catch { notify('error', 'Could not copy'); }
  };

  const shareMsg = async (msg: TeamChatMessage) => {
    setMenu(null);
    const text = msg.content || msg.mediaUrl?.split('#')[0] || '';
    if (!text) return;
    try { await Share.share({ message: text }); } catch { /* cancelled */ }
  };

  const openMenu = (msg: TeamChatMessage) => {
    if (msg.deleted) return;
    const canChange = msg.senderId === myId;
    const canEdit = canChange && !!msg.content && !msg.mediaUrl && new Date().getTime() - new Date(msg.sentAt).getTime() < EDIT_WINDOW_MS;
    setMenu({ msg, canEdit, canChange });
  };

  const startReply = (msg: TeamChatMessage) => { setMenu(null); setEditing(null); setReply(msg); };
  const startEdit = (msg: TeamChatMessage) => { setMenu(null); setReply(null); setEditing(msg); setDraft(msg.content ?? ''); };
  const cancelEdit = () => { setEditing(null); setDraft(''); };

  const togglePin = async (msg: TeamChatMessage) => {
    setMenu(null);
    const pinned = pins.some((p) => p.id === msg.id);
    try {
      const next = pinned ? await unpinTeamChatMessage(chatId, msg.id) : await pinTeamChatMessage(chatId, msg.id);
      setPins(next);
      const at = new Map(next.map((p) => [p.id, p.pinnedAt ?? null]));
      setMessages((prev) => prev.map((m) => ({ ...m, pinnedAt: at.get(m.id) ?? null })));
    } catch (e) {
      setNotice(getErrorMessage(e, `Failed to ${pinned ? 'unpin' : 'pin'} message`));
    }
  };

  const deleteMsg = (msg: TeamChatMessage) => {
    setMenu(null);
    Alert.alert('Delete message', 'Delete this message for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try { applyUpdate(await deleteTeamChatMessage(chatId, msg.id)); }
          catch (e) { setNotice(getErrorMessage(e, 'Failed to delete message')); }
        },
      },
    ]);
  };

  const renderRow = ({ item }: { item: ChatRow }) => {
    if (item.type === 'day') {
      return (
        <View style={styles.dayWrap}>
          <View style={[styles.dayPill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <ThemedText themeColor="textMuted" style={styles.dayText}>{item.label}</ThemedText>
          </View>
        </View>
      );
    }
    const { msg, showSender } = item;
    const mine = msg.senderId === myId;
    const fg = mine ? '#fff' : theme.text;
    return (
      <View style={[styles.msgRow, { justifyContent: mine ? 'flex-end' : 'flex-start', backgroundColor: highlightId === msg.id ? withAlpha(theme.primary, 0.12) : 'transparent' }]}>
        <View style={styles.msgCol}>
          {showSender ? <ThemedText themeColor="textMuted" style={styles.sender}>{msg.sender.name}</ThemedText> : null}
          <Pressable
            onLongPress={() => openMenu(msg)}
            delayLongPress={450}
            accessibilityHint={msg.deleted ? undefined : 'Long press for message actions'}
            style={[
              styles.bubble,
              mine ? { backgroundColor: theme.primary, borderBottomRightRadius: 4 } : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderBottomLeftRadius: 4 },
              msg.deleted && { opacity: 0.6 },
            ]}>
            {msg.deleted ? (
              <ThemedText style={[styles.deleted, { color: fg }]}>🚫 {DELETED_TEXT}</ThemedText>
            ) : (
              <>
                {msg.forwarded ? <ThemedText style={[styles.forwarded, { color: fg }]}>↪ Forwarded</ThemedText> : null}
                {msg.replyTo ? (
                  <Pressable
                    onPress={() => jumpToMessage(msg.replyTo!.id)}
                    accessibilityLabel="Go to original message"
                    style={[styles.quote, { backgroundColor: mine ? 'rgba(255,255,255,0.15)' : theme.backgroundElement, borderLeftColor: mine ? 'rgba(255,255,255,0.7)' : theme.primary }]}>
                    <ThemedText numberOfLines={1} style={[styles.quoteName, { color: fg }]}>{msg.replyTo.senderId === myId ? 'You' : msg.replyTo.sender.name}</ThemedText>
                    <ThemedText numberOfLines={1} style={[styles.quoteText, { color: fg }, msg.replyTo.deleted && styles.italic]}>{quoteText(msg.replyTo)}</ThemedText>
                  </Pressable>
                ) : null}
                <MediaBlock
                  msg={msg}
                  mine={mine}
                  fg={fg}
                  opening={openingId === msg.id}
                  onImage={(url) => setLightbox(Math.max(0, imageUrls.indexOf(url)))}
                  onDoc={openDoc}
                />
                {msg.content ? (
                  <View style={[styles.textPad, msg.mediaType ? styles.textPadMedia : null]}>
                    <Linkified text={msg.content} isMine={mine} />
                  </View>
                ) : null}
              </>
            )}
          </Pressable>
          <ThemedText themeColor="textMuted" style={[styles.time, { textAlign: mine ? 'right' : 'left' }]}>
            {msg.edited && !msg.deleted ? <ThemedText themeColor="textMuted" style={styles.italic}>edited </ThemedText> : null}
            {fmtBubbleTime(msg.sentAt)}
          </ThemedText>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.flex1, { backgroundColor: theme.backgroundElement, paddingBottom: Math.max(0, keyboardH - screenGap) }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border, paddingTop: 12 + topInset }]}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back to chat list" style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={theme.textMuted} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={chat.isGroup ? () => setShowInfo(true) : undefined}
          disabled={!chat.isGroup}
          accessibilityRole={chat.isGroup ? 'button' : undefined}
          accessibilityLabel={chat.isGroup ? 'Group info' : undefined}>
          <Avatar name={chatName} group={chat.isGroup} size={36} dim={0.85} />
        </Pressable>
        <View style={styles.flex1}>
          <View style={styles.nameRow}>
            {chat.isGroup ? (
              <Pressable onPress={() => setShowInfo(true)} style={styles.flex1} accessibilityRole="button" accessibilityLabel="Group info">
                <ThemedText numberOfLines={1} style={styles.name}>{chatName}</ThemedText>
              </Pressable>
            ) : (
              <ThemedText numberOfLines={1} style={styles.name}>{chatName}</ThemedText>
            )}
            {otherEmp ? (
              <Pressable onPress={() => onEditNick(otherEmp)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Set display name for this contact">
                <Ionicons name="pencil" size={14} color={theme.textMuted} style={{ opacity: 0.6 }} />
              </Pressable>
            ) : null}
          </View>
          {chat.isGroup ? (
            <Pressable onPress={() => setShowInfo(true)} accessibilityRole="button" accessibilityLabel="Group info">
              <ThemedText themeColor="textMuted" style={styles.sub}>{chat.members.length} members · tap for group info</ThemedText>
            </Pressable>
          ) : otherEmp?.designation ? (
            <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.sub}>{otherEmp.designation}</ThemedText>
          ) : null}
        </View>
        {!chat.isGroup ? (
          <Pressable
            onPress={() => phone && openExternalUrl(`tel:+91${phone}`)}
            disabled={!phone}
            accessibilityRole="button"
            accessibilityLabel={phone ? `Call ${chatName}` : 'No phone number on file'}
            style={[styles.call, { backgroundColor: phone ? 'rgba(16,185,129,0.15)' : theme.backgroundElement, opacity: phone ? 1 : 0.25 }]}>
            <Ionicons name="call-outline" size={20} color={phone ? '#10b981' : theme.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {/* Pinned messages — same for everyone in the chat */}
      {pins.length > 0 ? (
        <View style={[styles.pins, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          {pins.map((p) => (
            <View key={p.id} style={styles.pinRow}>
              <ThemedText>📌</ThemedText>
              <Pressable onPress={() => jumpToMessage(p.id)} style={styles.flex1} accessibilityLabel="Go to message">
                <ThemedText numberOfLines={1} style={styles.pinText}>
                  <ThemedText style={[styles.pinText, styles.semi]}>{p.senderId === myId ? 'You' : p.sender.name}: </ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.pinText}>{quoteText(p)}</ThemedText>
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => togglePin(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Unpin">
                <Ionicons name="close" size={14} color={theme.textMuted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {error ? <View style={styles.banner}><ErrorBanner message={error} onRetry={() => { setLoading(true); loadNewest(true); }} /></View> : null}
      {notice ? <View style={styles.banner}><ErrorBanner message={notice} /></View> : null}
      {okNotice ? <View style={styles.banner}><SuccessBanner message={okNotice} /></View> : null}

      {/* Messages */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.primary} /></View>
      ) : messages.length === 0 ? (
        <View style={styles.center}>
          <ThemedText themeColor="textMuted" style={styles.empty}>
            {chat.isGroup ? 'No messages yet. Start the conversation!' : `Say hello to ${chatName}!`}
          </ThemedText>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          inverted
          keyExtractor={(r) => r.key}
          renderItem={renderRow}
          onEndReached={loadOlder}
          onEndReachedThreshold={0.4}
          onScrollToIndexFailed={(info) => listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true })}
          ListFooterComponent={loadingOlder ? <ActivityIndicator style={styles.older} color={theme.primary} /> : null}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Replying banner */}
      {replyingTo ? (
        <View style={[styles.banner2, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={[styles.bannerBody, { borderLeftColor: theme.primary }]}>
            <ThemedText style={[styles.bannerTitle, { color: theme.primary }]}>
              Replying to {replyingTo.senderId === myId ? 'yourself' : replyingTo.sender.name}
            </ThemedText>
            <ThemedText themeColor="textMuted" numberOfLines={1} style={styles.bannerText}>{quoteText(replyingTo)}</ThemedText>
          </View>
          <Pressable onPress={() => setReply(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel reply">
            <Ionicons name="close" size={16} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Editing banner */}
      {editing ? (
        <View style={[styles.banner2, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <ThemedText style={[styles.bannerTitle, { color: theme.primary }]}>Editing message</ThemedText>
          <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.bannerText, styles.flex1]}>{editing.content}</ThemedText>
          <Pressable onPress={cancelEdit} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel edit">
            <Ionicons name="close" size={16} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}

      {/* Share-link box (Google Drive / Docs / any link) */}
      {showLinkBox ? <ShareLinkBox sending={sending} onShare={sendLink} onClose={() => setShowLinkBox(false)} /> : null}

      {/* Multi-file upload progress */}
      {uploadProgress ? (
        <View style={[styles.banner2, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
          <ActivityIndicator size="small" color={theme.primary} />
          <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.bannerText, styles.flex1]}>{uploadProgress}</ThemedText>
        </View>
      ) : null}

      {/* Mic error (stays until dismissed or the next successful recording) */}
      {voice.error && !voice.recording ? (
        <View style={[styles.micError, { borderTopColor: theme.border }]}>
          <ThemedText style={[styles.bannerText, styles.flex1, { color: theme.danger }]}>
            <ThemedText style={[styles.bannerText, styles.semi, { color: theme.danger }]}>🎤 Mic not working: </ThemedText>{voice.error}
          </ThemedText>
          <Pressable onPress={voice.clearError} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
            <ThemedText style={{ color: theme.danger }}>✕</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {/* Voice-recording bar */}
      {voice.recording ? (
        <View style={[styles.recBar, { borderTopColor: theme.border }]}>
          <View style={styles.recDot} />
          <ThemedText style={styles.recText}>Recording {Math.floor(voice.seconds / 60)}:{String(voice.seconds % 60).padStart(2, '0')}</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.bannerText, styles.flex1]}>Tap the red mic to send</ThemedText>
          <Pressable onPress={voice.cancel} accessibilityRole="button" style={[styles.recBtn, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <ThemedText style={styles.recBtnText}>Cancel</ThemedText>
          </Pressable>
          <Pressable onPress={voice.stopAndSend} accessibilityRole="button" style={[styles.recBtn, { backgroundColor: '#ef4444', borderColor: '#ef4444' }]}>
            <ThemedText style={[styles.recBtnText, { color: '#fff' }]}>Stop &amp; send</ThemedText>
          </Pressable>
        </View>
      ) : null}

      {/* Composer */}
      <View style={[styles.composer, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: 12 + (keyboardUp ? 0 : bottomInset) }]}>
        <RoundBtn icon="attach" label="Share documents (PDF, Word, Excel, PPT, TXT, CSV, ZIP — max 25 MB each)" onPress={pickDocs} disabled={uploadingMedia || voice.recording} />
        <RoundBtn icon="link" label="Share a link" onPress={() => setShowLinkBox((v) => !v)} disabled={voice.recording} active={showLinkBox} />
        <RoundBtn icon="image-outline" label="Send images" onPress={() => setPhotoSheet(true)} disabled={uploadingMedia || voice.recording} busy={uploadingMedia} />
        <RoundBtn icon="mic" label={voice.recording ? 'Stop and send voice note' : 'Record voice note'} onPress={voice.recording ? voice.stopAndSend : voice.start} disabled={uploadingMedia} active={voice.recording} danger />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          editable={!voice.recording}
          placeholder={voice.recording ? 'Recording… tap mic to stop & send' : editing ? 'Edit message…' : 'Type a message…'}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text, opacity: voice.recording ? 0.5 : 1 }]}
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending || voice.recording}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Save edit' : 'Send'}
          style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: !draft.trim() || sending || voice.recording ? 0.4 : 1 }]}>
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name={editing ? 'checkmark' : 'send'} size={16} color="#fff" />}
        </Pressable>
      </View>

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title="Message">
        {menu ? (
          <View>
            <MenuRow label="Reply" onPress={() => startReply(menu.msg)} />
            {menu.msg.content ? <MenuRow label="Copy" onPress={() => copyMsg(menu.msg)} /> : null}
            <MenuRow label={pins.some((p) => p.id === menu.msg.id) ? 'Unpin' : 'Pin'} onPress={() => togglePin(menu.msg)} />
            <MenuRow label="Forward" onPress={() => { const m = menu.msg; setMenu(null); setForwarding(m); }} />
            {menu.msg.content || menu.msg.mediaUrl ? <MenuRow label="Share" onPress={() => shareMsg(menu.msg)} /> : null}
            {menu.canEdit ? <MenuRow label="Edit" onPress={() => startEdit(menu.msg)} /> : null}
            {menu.canChange ? <MenuRow label="Delete for everyone" danger onPress={() => deleteMsg(menu.msg)} /> : null}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title="Send images" subtitle={`Pick one or more (up to ${MAX_FILES_PER_PICK} at once)`}>
        <View>
          <MenuRow label="Take a photo" onPress={takePhoto} />
          <MenuRow label="Choose from gallery" onPress={pickPhotos} />
        </View>
      </Sheet>

      {forwarding ? (
        <ForwardSheet
          message={forwarding}
          chats={chats}
          employees={employees}
          myId={myId}
          onClose={() => setForwarding(null)}
          onDone={() => { setForwarding(null); onForwarded(); }}
          onChatStarted={onChatStarted}
          notify={notify}
        />
      ) : null}

      {showInfo && chat.isGroup ? (
        <GroupInfoSheet
          chat={chat}
          employees={employees}
          myId={myId}
          onClose={() => setShowInfo(false)}
          onChanged={onChatUpdated}
          onLeft={(id) => { setShowInfo(false); onLeft(id); }}
          notify={notify}
        />
      ) : null}

      {lightbox !== null && imageUrls.length > 0 ? <ImageLightbox urls={imageUrls} start={lightbox} onClose={() => setLightbox(null)} /> : null}
    </View>
  );
}

// 32pt round composer button (document / link / image / mic).
function RoundBtn({ icon, label, onPress, disabled, active, busy, danger }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; active?: boolean; busy?: boolean; danger?: boolean;
}) {
  const theme = useTheme();
  const on = active ? (danger ? '#ef4444' : theme.primary) : theme.backgroundElement;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.round, { backgroundColor: on, borderColor: active ? 'transparent' : theme.border, opacity: disabled ? 0.3 : 1 }]}>
      {busy ? <ActivityIndicator size="small" color={theme.textMuted} /> : <Ionicons name={icon} size={16} color={active ? '#fff' : theme.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  round: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  micError: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, backgroundColor: 'rgba(239,68,68,0.08)' },
  recBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 1, backgroundColor: 'rgba(239,68,68,0.08)' },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  recText: { color: '#ef4444', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  recBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  recBtnText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1 },
  back: { marginLeft: -6, padding: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, flexShrink: 1 },
  sub: { fontSize: 12, lineHeight: 16 },
  call: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  pins: { paddingHorizontal: 16, paddingVertical: 6, gap: 2, borderBottomWidth: 1 },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pinText: { fontSize: 12, lineHeight: 18 },
  semi: { fontFamily: FontWeights.semiBold },
  banner: { padding: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  thread: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  older: { paddingVertical: 12 },
  dayWrap: { alignItems: 'center', paddingVertical: 4 },
  dayPill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  dayText: { fontSize: 10, lineHeight: 16, fontFamily: FontWeights.medium },
  msgRow: { flexDirection: 'row', borderRadius: 12 },
  msgCol: { maxWidth: '78%' },
  sender: { fontSize: 12, lineHeight: 16, marginBottom: 4, marginLeft: 4 },
  bubble: { overflow: 'hidden', borderRadius: 18 },
  deleted: { paddingHorizontal: 12, paddingVertical: 8, fontStyle: 'italic', fontSize: 14, lineHeight: 20 },
  forwarded: { paddingHorizontal: 12, paddingTop: 6, fontSize: 10, lineHeight: 14, fontStyle: 'italic', opacity: 0.7 },
  quote: { marginHorizontal: 6, marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderLeftWidth: 3 },
  quoteName: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  quoteText: { fontSize: 12, lineHeight: 16, opacity: 0.8 },
  italic: { fontStyle: 'italic' },
  media: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, minWidth: 180 },
  ext: { width: 36, height: 40, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  extText: { fontSize: 9, lineHeight: 12, fontFamily: FontWeights.bold },
  docName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  docSub: { fontSize: 11, lineHeight: 15, opacity: 0.75 },
  textPad: { paddingHorizontal: 12, paddingVertical: 8 },
  textPadMedia: { paddingTop: 4, paddingBottom: 8 },
  time: { fontSize: 10, lineHeight: 14, marginTop: 2, marginHorizontal: 4 },
  banner2: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1 },
  bannerBody: { flex: 1, minWidth: 0, paddingLeft: 8, borderLeftWidth: 3 },
  bannerTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  bannerText: { fontSize: 12, lineHeight: 16 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
