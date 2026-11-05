import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Fonts, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openExternalUrl } from '@/lib/open-url';
import type { CardEntry, PasswordEntry } from '@/types/api';

// Exactly the dashboard's PWD_CATEGORIES (password-manager/page.tsx).
export const PWD_CATEGORIES = ['Social Media', 'Email', 'Banking', 'Work', 'Shopping', 'Streaming', 'Developer', 'Other'];

// The dashboard's CAT_COLORS (Tailwind -100 background / -700 text), as hex.
const CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  'Social Media': { bg: '#fce7f3', fg: '#be185d' },
  Email: { bg: '#dbeafe', fg: '#1d4ed8' },
  Banking: { bg: '#dcfce7', fg: '#15803d' },
  Work: { bg: '#f3e8ff', fg: '#7e22ce' },
  Shopping: { bg: '#ffedd5', fg: '#c2410c' },
  Streaming: { bg: '#fee2e2', fg: '#b91c1c' },
  Developer: { bg: '#f3f4f6', fg: '#374151' },
  Other: { bg: '#fef9c3', fg: '#a16207' },
};

// The dashboard's CARD_GRADIENTS (gray-900 / slate-800 for CREDIT, emerald-900 / teal-800 for DEBIT).
// expo-linear-gradient is not in package.json (and no new packages are allowed), so each card is the
// gradient's middle colour with the two outer colours layered on as soft end-caps.
const CARD_COLORS = {
  CREDIT: { mid: '#1e293b', edge: '#111827' },
  DEBIT: { mid: '#115e59', edge: '#064e3b' },
};

export const MASK = '••••••••';

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString();
}

function SmallButton({ label, onPress, color }: { label: string; onPress: () => void; color: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" style={styles.smallBtn}>
      <ThemedText style={[styles.smallBtnText, { color }]}>{label}</ThemedText>
    </Pressable>
  );
}

function IconButton({ name, label, onPress, color, size = 18 }: { name: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; color: string; size?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={styles.iconBtn}>
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export function PasswordCard({
  entry, revealed, canManage, onReveal, onCopy, onEdit, onDelete,
}: {
  entry: PasswordEntry;
  revealed?: string;
  canManage: boolean;
  onReveal: () => void;
  onCopy: (value: string, label: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const cat = CAT_COLORS[entry.category] ?? CAT_COLORS.Developer;
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.head}>
        <View style={styles.flex1}>
          <ThemedText numberOfLines={1} style={styles.title}>{entry.title}</ThemedText>
          {entry.url ? (
            <Pressable onPress={() => openExternalUrl(entry.url!.startsWith('http') ? entry.url! : `https://${entry.url}`)} accessibilityRole="link">
              <ThemedText numberOfLines={1} style={styles.link}>{entry.url}</ThemedText>
            </Pressable>
          ) : null}
        </View>
        <View style={[styles.pill, { backgroundColor: cat.bg }]}>
          <ThemedText style={[styles.pillText, { color: cat.fg }]}>{entry.category}</ThemedText>
        </View>
      </View>

      <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.flex1}>
          <ThemedText themeColor="textMuted" style={styles.fieldLabel}>Username</ThemedText>
          <ThemedText numberOfLines={1} style={styles.fieldValue}>{entry.username}</ThemedText>
        </View>
        <IconButton name="copy-outline" label="Copy username" onPress={() => onCopy(entry.username, 'Username')} color={theme.textMuted} />
      </View>

      <View style={[styles.field, { backgroundColor: theme.backgroundElement }]}>
        <View style={styles.flex1}>
          <ThemedText themeColor="textMuted" style={styles.fieldLabel}>Password</ThemedText>
          <ThemedText style={[styles.fieldValue, styles.mono]} selectable={!!revealed}>{revealed || MASK}</ThemedText>
        </View>
        <IconButton name={revealed ? 'eye-off-outline' : 'eye-outline'} label={revealed ? 'Hide' : 'Reveal password'} onPress={onReveal} color={theme.textMuted} />
        {revealed ? <IconButton name="copy-outline" label="Copy password" onPress={() => onCopy(revealed, 'Password')} color={theme.textMuted} /> : null}
      </View>

      {entry.notes ? <ThemedText themeColor="textMuted" numberOfLines={2} style={styles.notes}>{entry.notes}</ThemedText> : null}

      <View style={[styles.footer, styles.footerRule, { borderTopColor: theme.border }]}>
        <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.flex1, styles.footText]}>
          By {entry.addedBy?.name || 'Unknown'} · {fmtDate(entry.createdAt)}
        </ThemedText>
        {canManage && (
          <View style={styles.actions}>
            <SmallButton label="Edit" onPress={onEdit} color="#2563eb" />
            <SmallButton label="Delete" onPress={onDelete} color="#dc2626" />
          </View>
        )}
      </View>
    </View>
  );
}

const WHITE = '#ffffff';

export function CardVisual({
  card, revealedNum, revealedCvv, canManage, onRevealNum, onRevealCvv, onCopy, onEdit, onDelete,
}: {
  card: CardEntry;
  revealedNum?: string;
  revealedCvv?: string;
  canManage: boolean;
  onRevealNum: () => void;
  onRevealCvv: () => void;
  onCopy: (value: string, label: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const colors = CARD_COLORS[card.cardType as 'CREDIT' | 'DEBIT'] ?? CARD_COLORS.CREDIT;
  return (
    <View>
      <View style={[styles.visual, { backgroundColor: colors.mid }]}>
        {/* Gradient stand-in: the "from" and "to" colours of the dashboard gradient at the two corners. */}
        <View pointerEvents="none" style={[styles.capTop, { backgroundColor: colors.edge }]} />
        <View pointerEvents="none" style={[styles.capBottom, { backgroundColor: colors.edge }]} />

        <View style={styles.visualHead}>
          <View style={styles.flex1}>
            <ThemedText numberOfLines={1} style={styles.bank}>{card.bankName}</ThemedText>
            <ThemedText numberOfLines={1} style={styles.cardLabel}>{card.label}</ThemedText>
          </View>
          <View style={styles.chip}>
            <View style={styles.chipCell} /><View style={styles.chipCell} />
            <View style={styles.chipCell} /><View style={styles.chipCell} />
          </View>
        </View>

        <View style={styles.numberRow}>
          <ThemedText style={styles.number} selectable={!!revealedNum} numberOfLines={1} adjustsFontSizeToFit>{revealedNum || card.cardNumber}</ThemedText>
          <IconButton name={revealedNum ? 'eye-off-outline' : 'eye-outline'} label={revealedNum ? 'Hide number' : 'Reveal number'} onPress={onRevealNum} color={WHITE} />
          {revealedNum ? <IconButton name="copy-outline" label="Copy number" onPress={() => onCopy(revealedNum, 'Card number')} color={WHITE} /> : null}
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.flex1}>
            <ThemedText style={styles.caption}>CARDHOLDER</ThemedText>
            <ThemedText style={styles.onCard} numberOfLines={1}>{card.cardholderName}</ThemedText>
          </View>
          <View style={styles.mid}>
            <ThemedText style={styles.caption}>EXPIRES</ThemedText>
            <ThemedText style={styles.onCard}>{card.expiry}</ThemedText>
          </View>
          <View style={styles.mid}>
            <ThemedText style={styles.caption}>CVV</ThemedText>
            <View style={styles.cvvRow}>
              <ThemedText style={[styles.onCard, styles.mono]} selectable={!!revealedCvv}>{revealedCvv || '•••'}</ThemedText>
              <IconButton name={revealedCvv ? 'eye-off-outline' : 'eye-outline'} label={revealedCvv ? 'Hide CVV' : 'Reveal CVV'} onPress={onRevealCvv} color={WHITE} size={14} />
              {revealedCvv ? <IconButton name="copy-outline" label="Copy CVV" onPress={() => onCopy(revealedCvv, 'CVV')} color={WHITE} size={14} /> : null}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <ThemedText themeColor="textMuted" numberOfLines={1} style={[styles.flex1, styles.footText]}>
          Added by {card.addedBy?.name || 'Unknown'} · {fmtDate(card.createdAt)}
        </ThemedText>
        {canManage && (
          <View style={styles.actions}>
            <SmallButton label="Edit" onPress={onEdit} color={theme.primary} />
            <SmallButton label="Delete" onPress={onDelete} color="#dc2626" />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  mono: { fontFamily: Fonts?.mono },
  card: { borderRadius: Radii.lg, borderWidth: 1, padding: 16, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  link: { color: '#3b82f6', fontSize: 12, lineHeight: 16 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  field: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 8 },
  fieldLabel: { fontSize: 12, lineHeight: 16 },
  fieldValue: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  notes: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  iconBtn: { padding: 6 },
  smallBtn: { paddingVertical: 4 },
  smallBtnText: { fontSize: 12, lineHeight: 16 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  footerRule: { borderTopWidth: 1, paddingTop: 12 },
  footText: { fontSize: 12, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 12 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 4 },
  visual: { borderRadius: 16, padding: 24, minHeight: 200, justifyContent: 'space-between', overflow: 'hidden' },
  capTop: { position: 'absolute', top: 0, left: 0, width: '55%', height: '55%', opacity: 0.55, borderBottomRightRadius: 200 },
  capBottom: { position: 'absolute', bottom: 0, right: 0, width: '55%', height: '55%', opacity: 0.55, borderTopLeftRadius: 200 },
  visualHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bank: { color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 16, textTransform: 'uppercase', letterSpacing: 1 },
  cardLabel: { color: WHITE, fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, marginTop: 2 },
  onCard: { color: WHITE, fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  chip: { width: 40, height: 28, borderRadius: 4, backgroundColor: '#facc15', flexDirection: 'row', flexWrap: 'wrap', padding: 4, gap: 2 },
  chipCell: { width: '47%', height: '45%', borderRadius: 2, backgroundColor: '#ca8a04' },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  number: { flex: 1, color: WHITE, fontFamily: Fonts?.mono, fontSize: 16, lineHeight: 22, letterSpacing: 2, opacity: 0.9 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  mid: { alignItems: 'center' },
  caption: { color: 'rgba(255,255,255,0.6)', fontSize: 10, lineHeight: 14, letterSpacing: 0.5 },
  cvvRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
