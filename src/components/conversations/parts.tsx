import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Conversation } from '@/types/api';

// ─── Helpers (the dashboard's own) ──────────────────────────────────────────
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Unresolved caller ids ("Unknown (likely: caller ID)") are shown as given.
export function formatPhone(phone: string): string {
  if (!/^\+?\d+$/.test(phone)) return phone;
  if (phone.length === 12 && phone.startsWith('91')) return `+91 ${phone.slice(2, 7)} ${phone.slice(7)}`;
  return phone.startsWith('+') ? phone : `+${phone}`;
}

export function isWaitingTooLong(conv: Conversation): boolean {
  if (conv.status !== 'WAITING') return false;
  const at = conv.lastCustomerMessageAt || conv.lastMessageAt;
  if (!at) return false;
  return Date.now() - new Date(at).getTime() > 60 * 60 * 1000;
}

export function getInitial(name: string): string {
  return (name ?? '').trim().charAt(0).toUpperCase();
}

export function formatDateDivider(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const d = date.toDateString();
  if (d === today.toDateString()) return 'Today';
  if (d === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export const GOLD = '#C9922A';

export const STATUS_BADGE: Record<string, { variant: 'success' | 'warning' | 'muted'; dot: boolean }> = {
  ACTIVE: { variant: 'success', dot: true },
  WAITING: { variant: 'warning', dot: true },
  CLOSED: { variant: 'muted', dot: false },
};

// ─── Conversation card ──────────────────────────────────────────────────────
export function ConversationCard({ conv, isSelected, onPress }: { conv: Conversation; isSelected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const lastMsg = conv.messages?.[conv.messages.length - 1];
  const tooLong = isWaitingTooLong(conv);
  const badge = STATUS_BADGE[conv.status] ?? STATUS_BADGE.ACTIVE;

  const border = isSelected ? theme.primary : conv.status === 'WAITING' ? 'rgba(232,168,40,0.3)' : theme.border;
  const bg = isSelected ? 'rgba(104,15,26,0.06)' : conv.status === 'WAITING' ? 'rgba(232,168,40,0.04)' : 'transparent';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.card, { borderColor: tooLong && !isSelected ? 'rgba(232,168,40,0.6)' : border, backgroundColor: bg }, tooLong && !isSelected && styles.ring]}>
      <View style={styles.row1}>
        <View style={[styles.avatar, { backgroundColor: conv.isHighValue ? GOLD : theme.primary }]}>
          <ThemedText style={styles.avatarText}>{getInitial(conv.customerName)}</ThemedText>
        </View>
        <View style={styles.flex1}>
          <View style={styles.nameRow}>
            <ThemedText numberOfLines={1} style={styles.name}>{conv.customerName}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.time}>{conv.lastMessageAt ? timeAgo(conv.lastMessageAt) : ''}</ThemedText>
          </View>
          <ThemedText themeColor="textMuted" style={styles.phone}>{formatPhone(conv.customerPhone)}</ThemedText>
        </View>
      </View>

      {lastMsg ? (
        <ThemedText themeColor="textSecondary" numberOfLines={1} style={styles.preview}>
          {`${lastMsg.senderType === 'EMPLOYEE' ? '↩ ' : ''}${(lastMsg.content ?? '').slice(0, 70)}${(lastMsg.content ?? '').length > 70 ? '…' : ''}`}
        </ThemedText>
      ) : (
        <ThemedText themeColor="textMuted" style={[styles.preview, { fontStyle: 'italic' }]}>No messages yet</ThemedText>
      )}

      <View style={styles.row3}>
        <Badge variant={badge.variant} size="sm" dot={badge.dot}>{conv.status}</Badge>
        {conv.isHighValue ? (
          <View style={styles.hv}><ThemedText style={styles.hvText}>High Value</ThemedText></View>
        ) : null}
        {tooLong ? <ThemedText style={[styles.tooLong, { color: theme.warning }]}>&gt;1 hr</ThemedText> : null}
        <ThemedText themeColor="textMuted" style={styles.assignee}>{conv.assignedTo?.name ?? ''}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 14 },
  ring: { borderWidth: 1.5 },
  row1: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  avatarText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, flexShrink: 1 },
  time: { fontSize: 10, lineHeight: 14 },
  phone: { fontSize: 11, lineHeight: 16 },
  preview: { fontSize: 12, lineHeight: 16, paddingLeft: 46, marginBottom: 8 },
  row3: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 46 },
  hv: { backgroundColor: 'rgba(201,146,42,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  hvText: { color: GOLD, fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  tooLong: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  assignee: { fontSize: 10, lineHeight: 14, marginLeft: 'auto' },
});
