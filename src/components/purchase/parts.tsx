import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Monospace money / numbers.
export function Mono({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <ThemedText style={[styles.mono, style]}>{children}</ThemedText>;
}

// Dashboard-style "Show inactive only" checkbox.
export function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.check}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? theme.primary : theme.textMuted} />
      <ThemedText themeColor="textSecondary" style={styles.checkLabel}>{label}</ThemedText>
    </Pressable>
  );
}

export function LinkButton({ children, onPress }: { children: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8} style={styles.link}>
      <ThemedText style={[styles.linkText, { color: theme.primary }]}>{children}</ThemedText>
    </Pressable>
  );
}

export type Column<T> = {
  key: string;
  header: string;
  /** Wide-table width (cells also grow to fill spare room). */
  width: number;
  render: (row: T) => ReactNode;
  /** The trailing buttons column: shown below the card on a phone. */
  action?: boolean;
};

type TableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  keyOf: (row: T) => string;
  wide: boolean;
  empty: string;
};

function cell(v: ReactNode) {
  return typeof v === 'string' || typeof v === 'number' ? <ThemedText style={styles.cellText}>{v}</ThemedText> : v;
}

// The dashboard's Table: a real table when the content area is wide (scrolls
// sideways when the columns don't fit), one card per row on a phone.
export function DataTable<T>({ columns, rows, keyOf, wide, empty }: TableProps<T>) {
  const theme = useTheme();

  if (rows.length === 0) {
    return <ThemedText themeColor="textMuted" style={styles.empty}>{empty}</ThemedText>;
  }

  if (!wide) {
    const [first, ...rest] = columns;
    const data = rest.filter((c) => !c.action);
    const action = rest.find((c) => c.action);
    return (
      <View style={styles.cards}>
        {rows.map((r) => {
          const actions = action ? action.render(r) : null;
          return (
            <View key={keyOf(r)} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {cell(first.render(r))}
              {data.map((c) => (
                <View key={c.key} style={styles.kv}>
                  <ThemedText themeColor="textMuted" style={styles.k}>{c.header}</ThemedText>
                  <View style={styles.v}>{cell(c.render(r))}</View>
                </View>
              ))}
              {actions ? <View style={styles.actions}>{actions}</View> : null}
            </View>
          );
        })}
      </View>
    );
  }

  const min = columns.reduce((s, c) => s + c.width, 0);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.hscroll}>
      <View style={[styles.table, { minWidth: min }]}>
        <View style={[styles.tr, { borderBottomColor: theme.border }]}>
          {columns.map((c) => (
            <View key={c.key} style={[styles.td, { flexBasis: c.width, flexGrow: c.width }]}>
              <ThemedText themeColor="textMuted" style={styles.th}>{c.header}</ThemedText>
            </View>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={keyOf(r)} style={[styles.tr, i < rows.length - 1 && { borderBottomColor: theme.border }, i === rows.length - 1 && styles.noBorder]}>
            {columns.map((c) => (
              <View key={c.key} style={[styles.td, { flexBasis: c.width, flexGrow: c.width }]}>{cell(c.render(r))}</View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: Fonts?.mono, fontSize: 14, lineHeight: 20 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  checkLabel: { fontSize: 14, lineHeight: 20 },
  link: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 32 },
  cellText: { fontSize: 14, lineHeight: 20 },
  cards: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  kv: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  k: { width: 108, fontSize: 12, lineHeight: 20 },
  v: { flex: 1, minWidth: 0 },
  actions: { paddingTop: 4 },
  hscroll: { flexGrow: 1 },
  table: { flexGrow: 1 },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent' },
  noBorder: { borderBottomWidth: 0 },
  td: { paddingHorizontal: 8, paddingVertical: 10, minWidth: 0 },
  th: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
});
