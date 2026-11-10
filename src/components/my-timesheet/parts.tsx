import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MtReply } from '@/lib/my-timesheet-api';
import type { MentionableUser } from '@/types/api';

export const MANAGER_ROLES = ['OWNER', 'STORE_MANAGER'];

export const CONTACT_TYPE_OPTIONS = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'VENDOR_SERVICE_PROVIDER', label: 'Vendor / Service Provider' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'OTHER', label: 'Other' },
];

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** YYYY-MM-DD from a local calendar date, no timezone conversion. */
export function localDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Backend dates are stored at UTC midnight ("2026-05-21T00:00:00.000Z") — the first 10 chars are the calendar day. */
export function entryDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Local Date for a YYYY-MM-DD key. */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatPrice(v: string | number | null | undefined): string {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? '' : `₹${n.toLocaleString('en-IN')}`;
}

/** First quote is "Initial", the last is "Final" — purely by position, no stored label. */
export function quoteLabel(index: number, total: number): string {
  if (total === 1) return 'Quote';
  if (index === 0) return 'Initial';
  if (index === total - 1) return 'Final';
  return `Quote ${index + 1}`;
}

// Cosmetic only — never touches what's sent to the API.
export function displayContactPhone(phone: string): string {
  return phone.startsWith('+91') && phone.length === 13 ? `+91 ${phone.slice(3)}` : phone;
}

const CONTACT_TYPE_LABELS: Record<string, string> = {
  CUSTOMER: 'Customer',
  VENDOR_SERVICE_PROVIDER: 'Vendor / Service Provider',
  STAFF: 'Staff',
  OTHER: 'Other',
};

export function contactTypeDisplay(contactType: string, contactTypeOther?: string | null): string {
  if (contactType === 'OTHER') return contactTypeOther?.trim() || 'Other';
  return CONTACT_TYPE_LABELS[contactType] ?? contactType;
}

export function formatTimeIST(date: string | Date): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

export function formatDateTimeIST(date: string | Date): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

let idCounter = 0;
/** v4-style id for a new task entry (Hermes has no crypto.randomUUID). */
export function newEntryId(): string {
  idCounter += 1;
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${['8', '9', 'a', 'b'][idCounter % 4]}${hex(3)}-${hex(12)}`;
}

export function apiErrorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return err?.response?.data?.error ?? err?.response?.data?.message ?? fallback;
}

// ── @-mention field ─────────────────────────────────────────────────────────
function activeToken(text: string, caret: number): { start: number; q: string } | null {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null; // an email never triggers it
  const frag = upto.slice(at + 1);
  if (frag.includes('\n') || frag.split(' ').length > 2) return null;
  return { start: at, q: frag };
}

// Dashboard MentionInput: the literal "@Name" stays in the text; picking someone records their id, and only ids
// whose "@Name" is still present survive. initialMentions rehydrates an already-saved entry.
export function MentionField({ value, onChange, users, placeholder, multiline, disabled, onSubmit, initialMentions }: {
  value: string; onChange: (v: string, mentions: string[]) => void; users: MentionableUser[];
  placeholder?: string; multiline?: boolean; disabled?: boolean; onSubmit?: () => void; initialMentions?: string[];
}) {
  const theme = useTheme();
  const [picked, setPicked] = useState<string[]>(initialMentions ?? []);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);

  const live = (text: string, ids: string[]) => ids.filter((id) => {
    const u = users.find((x) => x.id === id);
    return u ? text.includes(`@${u.name}`) : false;
  });
  const token = focused && !disabled ? activeToken(value, caret) : null;
  const suggestions = token ? users.filter((u) => u.name.toLowerCase().includes(token.q.toLowerCase())).slice(0, 6) : [];

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
        style={[styles.mInput, multiline && styles.mMulti, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border, opacity: disabled ? 0.6 : 1 }]}
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
    </View>
  );
}

// ── Reply thread (dashboard ReplyThread) ────────────────────────────────────
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Highlights "@Name" for each CURRENT name in mentionedUsers — never a bare "@".
function MessageText({ message, mentionedUsers, color }: { message: string; mentionedUsers?: { id: string; name: string }[]; color: string }) {
  const names = Array.from(new Set((mentionedUsers ?? []).map((u) => u.name).filter(Boolean)));
  if (names.length === 0) return <ThemedText style={[styles.msg, { color }]}>{message}</ThemedText>;
  names.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(@(?:${names.map(escapeRegExp).join('|')}))`, 'g');
  return (
    <ThemedText style={[styles.msg, { color }]}>
      {message.split(pattern).map((part, i) =>
        part.startsWith('@') && names.includes(part.slice(1))
          ? <ThemedText key={i} style={[styles.msg, styles.mention]}>{part}</ThemedText>
          : part)}
    </ThemedText>
  );
}

const DEFAULT_QUICK_REPLIES = ['👍 Got it', 'On it', 'Will check'];

export function ReplyThread({ replies, currentUserId, onSend, sending, placeholder, mentionUsers, error }: {
  replies: MtReply[]; currentUserId: string;
  onSend: (message: string, mentions?: string[]) => Promise<void>;
  sending: boolean; placeholder: string; mentionUsers: MentionableUser[]; error?: string;
}) {
  const theme = useTheme();
  const [draft, setDraft] = useState('');
  const [mentions, setMentions] = useState<string[]>([]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    await onSend(trimmed, mentions);
    setDraft('');
    setMentions([]);
  };
  const sendCanned = async (text: string) => {
    if (sending) return;
    await onSend(text, []);
  };

  return (
    <View style={styles.thread}>
      {replies.length > 0 ? (
        <View style={styles.bubbles}>
          {replies.map((r) => {
            const me = r.authorId === currentUserId;
            return (
              <View key={r.id} style={[styles.bubbleRow, { justifyContent: me ? 'flex-end' : 'flex-start' }]}>
                <View style={[styles.bubble, me ? { backgroundColor: theme.primary } : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
                  {!me ? <ThemedText themeColor="textMuted" style={styles.author}>{r.author?.name ?? 'Unknown'}</ThemedText> : null}
                  <MessageText message={r.message} mentionedUsers={r.mentionedUsers} color={me ? '#ffffff' : theme.text} />
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
      <View style={styles.chips}>
        {DEFAULT_QUICK_REPLIES.map((q) => (
          <Pressable key={q} disabled={sending} onPress={() => sendCanned(q)} style={[styles.quick, { borderColor: theme.border, backgroundColor: theme.surface, opacity: sending ? 0.5 : 1 }]}>
            <ThemedText themeColor="textMuted" style={styles.quickText}>{q}</ThemedText>
          </Pressable>
        ))}
      </View>
      <View style={styles.compose}>
        <View style={styles.flex1}>
          <MentionField value={draft} onChange={(v, m) => { setDraft(v); setMentions(m); }} users={mentionUsers} placeholder={placeholder} disabled={sending} onSubmit={handleSend} />
        </View>
        <Pressable
          onPress={handleSend}
          disabled={!draft.trim() || sending}
          accessibilityRole="button"
          style={[styles.sendBtn, { backgroundColor: theme.primary, opacity: !draft.trim() || sending ? 0.5 : 1 }]}>
          {sending ? <ActivityIndicator size="small" color="#ffffff" /> : <ThemedText style={styles.sendText}>Send</ThemedText>}
        </Pressable>
      </View>
      {error ? <ThemedText themeColor="danger" style={styles.err}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  mInput: { minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, fontFamily: FontWeights.regular },
  mMulti: { minHeight: 64, textAlignVertical: 'top' },
  sugg: { borderWidth: 1, borderRadius: Radii.md, marginTop: 4, overflow: 'hidden' },
  suggRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  suggName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  suggRole: { fontSize: 10, lineHeight: 14 },
  thread: { gap: 8 },
  bubbles: { gap: 6 },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '85%', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  author: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, marginBottom: 2 },
  msg: { fontSize: 14, lineHeight: 20 },
  mention: { fontFamily: FontWeights.semiBold, color: '#0d9488', backgroundColor: 'rgba(13,148,136,0.15)' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quick: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
  quickText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  compose: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sendBtn: { height: 44, paddingHorizontal: 16, borderRadius: Radii.sm, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#ffffff', fontSize: 14, fontFamily: FontWeights.semiBold },
  err: { fontSize: 12 },
});
