import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openExternalUrl } from '@/lib/open-url';
import type { TeamChatEmployee } from '@/types/api';

import { displayName, getInitials, splitLinks } from './helpers';

export function Avatar({ name, group, size = 36, dim = 0.8 }: { name?: string; group?: boolean; size?: number; dim?: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(theme.primary, dim) }]}>
      {group ? (
        <Ionicons name="people-outline" size={size * 0.55} color="#fff" />
      ) : (
        <ThemedText style={[styles.initials, { fontSize: size * 0.34 }]}>{getInitials(name ?? '')}</ThemedText>
      )}
    </View>
  );
}

export function UnreadBadge({ count }: { count: number }) {
  const theme = useTheme();
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: theme.danger }]}>
      <ThemedText style={styles.badgeText}>{count > 99 ? '99+' : count}</ThemedText>
    </View>
  );
}

/** Message text with every URL turned into a tappable link (well-known share links get a label). */
export function Linkified({ text, isMine }: { text: string; isMine: boolean }) {
  const theme = useTheme();
  const color = isMine ? '#fff' : theme.primary;
  return (
    <ThemedText style={[styles.msgText, isMine && { color: '#fff' }]}>
      {splitLinks(text).map((p, i) => {
        if ('text' in p) return p.text;
        return (
          <ThemedText key={i}>
            <ThemedText onPress={() => openExternalUrl(p.href)} style={[styles.link, { color }]} accessibilityRole="link">
              {p.kind ? `🔗 ${p.kind} ` : ''}{p.url}
            </ThemedText>
            {p.tail}
          </ThemedText>
        );
      })}
    </ThemedText>
  );
}

/** Searchable multi-select of employees (dashboard MemberPicker). */
export function MemberPicker({ employees, groups = [], selected, onToggle, search, onSearchChange }: {
  employees: TeamChatEmployee[]; groups?: { id: string; name: string; memberCount: number }[];
  selected: string[]; onToggle: (id: string) => void; search: string; onSearchChange: (s: string) => void;
}) {
  const theme = useTheme();
  const needle = search.toLowerCase();
  const shown = search ? employees.filter((e) => displayName(e).toLowerCase().includes(needle)) : employees;
  const shownGroups = search ? groups.filter((g) => g.name.toLowerCase().includes(needle)) : groups;
  return (
    <View>
      <TextInput
        value={search}
        onChangeText={onSearchChange}
        placeholder="Search members…"
        placeholderTextColor={theme.textMuted}
        style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
      />
      <View style={styles.pickList}>
        {/* Groups first; a picked group is reported as "group:<chatId>" so it can't be confused with an employee id. */}
        {shownGroups.map((g) => {
          const key = `group:${g.id}`;
          const sel = selected.includes(key);
          return (
            <Pressable
              key={key}
              onPress={() => onToggle(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: sel }}
              style={[styles.pickRow, { backgroundColor: sel ? withAlpha(theme.primary, 0.1) : 'transparent', borderColor: sel ? withAlpha(theme.primary, 0.3) : 'transparent' }]}>
              <Avatar group size={32} />
              <View style={styles.flex1}>
                <ThemedText numberOfLines={1} style={styles.pickName}>{g.name}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.pickSub}>Group · {g.memberCount} members</ThemedText>
              </View>
              {sel ? <Ionicons name="checkmark" size={18} color={theme.primary} /> : null}
            </Pressable>
          );
        })}
        {shown.map((emp) => {
          const sel = selected.includes(emp.id);
          return (
            <Pressable
              key={emp.id}
              onPress={() => onToggle(emp.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: sel }}
              style={[styles.pickRow, { backgroundColor: sel ? withAlpha(theme.primary, 0.1) : 'transparent', borderColor: sel ? withAlpha(theme.primary, 0.3) : 'transparent' }]}>
              <Avatar name={displayName(emp)} size={32} />
              <View style={styles.flex1}>
                <ThemedText numberOfLines={1} style={styles.pickName}>{displayName(emp)}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.pickSub}>{emp.designation || emp.role}</ThemedText>
              </View>
              {sel ? <Ionicons name="checkmark" size={18} color={theme.primary} /> : null}
            </Pressable>
          );
        })}
        {shown.length === 0 && shownGroups.length === 0 ? <ThemedText themeColor="textMuted" style={styles.none}>No one to show</ThemedText> : null}
      </View>
    </View>
  );
}

/** One row of a long-press menu (dashboard MenuItem). */
export function MenuRow({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.menuRow}>
      <ThemedText style={[styles.menuText, { color: danger ? theme.danger : theme.text }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontFamily: FontWeights.bold },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  msgText: { fontSize: 14, lineHeight: 20 },
  link: { textDecorationLine: 'underline' },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 14, marginBottom: 12 },
  pickList: { gap: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  pickName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  pickSub: { fontSize: 12, lineHeight: 16 },
  none: { fontSize: 12, textAlign: 'center', paddingVertical: 16 },
  menuRow: { paddingHorizontal: 4, paddingVertical: 14, minHeight: 48, justifyContent: 'center' },
  menuText: { fontSize: 15, lineHeight: 20 },
});
