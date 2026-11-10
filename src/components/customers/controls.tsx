import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Option = { value: string; label: string };

type Props = { options: Option[]; value: string; onChange: (value: string) => void };

// Dashboard page tabs: a white pill container, the active tab raised on the
// surface colour in the primary text colour, the others muted.
export function TabPills({ options, value, onChange }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.tabs, { backgroundColor: theme.backgroundElement }]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [styles.tab, active && [styles.tabActive, { backgroundColor: theme.surface }], pressed && !active && { opacity: 0.6 }]}>
            <ThemedText style={[styles.tabText, { color: active ? theme.text : theme.textMuted }]} numberOfLines={1}>{o.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

// The "Name | Phone | Plate | Model" search-by control: joined buttons in a
// bordered box, the active one filled with the primary colour.
export function JoinedToggle({ options, value, onChange }: Props) {
  const theme = useTheme();
  return (
    <View style={[styles.joined, { borderColor: theme.border }]} accessibilityRole="tablist">
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.joinedItem,
              { backgroundColor: active ? theme.primary : theme.backgroundElement, borderRightColor: theme.border, borderRightWidth: i < options.length - 1 ? 1 : 0 },
              pressed && !active && { opacity: 0.7 },
            ]}>
            <ThemedText style={[styles.joinedText, { color: active ? '#fff' : theme.textMuted }]}>{o.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', alignSelf: 'flex-start', maxWidth: '100%', padding: 4, gap: 2, borderRadius: Radii.md },
  tab: { minHeight: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.sm, flexShrink: 1 },
  tabActive: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  tabText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  joined: { flexDirection: 'row', alignSelf: 'flex-start', borderWidth: 1, borderRadius: Radii.sm, overflow: 'hidden' },
  joinedItem: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  joinedText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
});
