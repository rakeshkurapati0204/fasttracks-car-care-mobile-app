import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromYmd, toYmd } from '@/lib/overview-format';

type Props = {
  label: string;
  /** YYYY-MM-DD, or '' when no date is chosen. */
  value: string;
  onChange: (ymd: string) => void;
  /** Dashboard filter-bar look: no label above, card background, 12px corners. */
  compact?: boolean;
};

// Optional date filter: shows "dd/mm/yyyy" or a placeholder, opens the native
// picker (same pattern as the Overview DateChip), and can be cleared.
export function DateField({ label, value, onChange, compact }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [y, m, d] = value ? value.split('-') : [];

  return (
    <View>
      {compact ? null : <ThemedText themeColor="textSecondary" style={styles.label}>{label}</ThemedText>}
      <View style={[styles.field, { backgroundColor: compact ? theme.backgroundElement : theme.surface, borderColor: theme.border }, compact && { borderRadius: Radii.md }]}>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label} date`}
          style={styles.pick}>
          <ThemedText numberOfLines={1} style={[styles.value, !value && { color: theme.textMuted }]}>
            {value ? `${d}/${m}/${y}` : 'dd/mm/yyyy'}
          </ThemedText>
          <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
        </Pressable>
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={Spacing.two} accessibilityRole="button" accessibilityLabel={`Clear ${label} date`}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {open && (
        <DateTimePicker
          value={value ? fromYmd(value) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(_e, selected) => {
            setOpen(Platform.OS === 'ios');
            if (selected) onChange(toYmd(selected));
          }}
        />
      )}
      {open && Platform.OS === 'ios' && (
        <Pressable onPress={() => setOpen(false)} style={styles.done}>
          <ThemedText type="small">Done</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium, marginBottom: 4 },
  field: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14 },
  pick: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  value: { fontSize: 14, lineHeight: 20 },
  done: { alignSelf: 'flex-end', padding: Spacing.two },
});
