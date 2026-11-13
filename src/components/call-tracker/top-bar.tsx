import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PRESSED_OPACITY } from '@/components/call-tracker/primitives';
import type { ActiveChip } from '@/components/call-tracker/filters';
import { ThemedText } from '@/components/themed-text';
import { Card, Skeleton } from '@/components/ui';
import { FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABULAR = { fontVariant: ['tabular-nums' as const] };

type Metric = { label: string; value: number };

// One card, four metrics split by hairlines. Wraps to 2x2 when the card itself
// is narrower than 360.
export function SummaryStrip({ metrics, loading }: { metrics: Metric[]; loading: boolean }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const cols = width > 0 && width < 360 ? 2 : 4;
  const rows: Metric[][] = [];
  for (let i = 0; i < metrics.length; i += cols) rows.push(metrics.slice(i, i + cols));

  return (
    <Card padding="none" style={styles.strip}>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {rows.map((row, r) => (
          <View key={r} style={[styles.metricRow, r > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
            {row.map((m, c) => (
              <View key={m.label} style={[styles.metric, c > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.border }]}>
                {loading ? <Skeleton width={32} height={22} /> : <ThemedText style={[styles.metricValue, TABULAR]}>{m.value}</ThemedText>}
                <ThemedText themeColor="textMuted" style={styles.metricLabel} numberOfLines={1}>{m.label}</ThemedText>
              </View>
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

type SearchProps = {
  value: string;
  onChange: (v: string) => void;
  activeCount: number;
  onOpenFilters: () => void;
  chips: ActiveChip[];
  onClearChip: (chip: ActiveChip) => void;
};

// Rounded search field + square filter button (with active-count badge), then
// removable chips for the active filters.
export function SearchBar({ value, onChange, activeCount, onOpenFilters, chips, onClearChip }: SearchProps) {
  const theme = useTheme();

  return (
    <View style={styles.searchWrap}>
      <View style={styles.searchRow}>
        <View style={[styles.field, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={18} color={theme.textMuted} />
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="Search calls"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search calls"
            style={[styles.input, { color: theme.text }]}
          />
          {value ? (
            <Pressable onPress={() => onChange('')} hitSlop={Spacing.two} accessibilityRole="button" accessibilityLabel="Clear search" style={({ pressed }) => pressed && { opacity: PRESSED_OPACITY }}>
              <Ionicons name="close-circle" size={18} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={onOpenFilters}
          accessibilityRole="button"
          accessibilityLabel={activeCount ? `Filters, ${activeCount} active` : 'Filters'}
          style={({ pressed }) => [styles.filterButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, pressed && { opacity: PRESSED_OPACITY }]}>
          <Ionicons name="options-outline" size={22} color={theme.text} />
          {activeCount > 0 ? (
            <View style={[styles.countBadge, { backgroundColor: theme.primary }]}>
              <ThemedText style={styles.countText}>{activeCount}</ThemedText>
            </View>
          ) : null}
        </Pressable>
      </View>

      {chips.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chips.map((chip) => (
            <Pressable
              key={chip.key}
              onPress={() => onClearChip(chip)}
              accessibilityRole="button"
              accessibilityLabel={`Remove filter ${chip.label}`}
              style={({ pressed }) => [styles.chip, { backgroundColor: withAlpha(theme.primary, 0.1) }, pressed && { opacity: PRESSED_OPACITY }]}>
              <ThemedText style={[styles.chipText, { color: theme.primary }]}>{chip.label}</ThemedText>
              <Ionicons name="close" size={14} color={theme.primary} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { borderRadius: Radii.md, overflow: 'hidden' },
  metricRow: { flexDirection: 'row' },
  metric: { flex: 1, minWidth: 0, paddingVertical: Spacing.three, paddingHorizontal: 12, gap: 4 },
  metricValue: { fontSize: 22, lineHeight: 28, fontFamily: FontWeights.bold },
  metricLabel: { fontSize: 12, lineHeight: 16 },
  searchWrap: { gap: 12 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  field: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.md },
  input: { flex: 1, minHeight: 44, fontSize: 16, paddingVertical: 0, fontFamily: FontWeights.regular },
  filterButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.md },
  countBadge: { position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  countText: { color: '#FFFFFF', fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold },
  chips: { gap: Spacing.two, paddingRight: Spacing.three },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: Radii.pill },
  chipText: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium },
});
