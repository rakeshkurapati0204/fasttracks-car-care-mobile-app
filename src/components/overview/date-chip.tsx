import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fromYmd, toYmd } from '@/lib/overview-format';

type Props = {
  value: string; // YYYY-MM-DD
  max: string; // YYYY-MM-DD — the dashboard's date input has max = today
  onChange: (ymd: string) => void;
  accessibilityLabel: string;
};

// "28/10/2026" — how the dashboard's <input type="date"> shows the value.
function dmy(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

// Bordered date box with a calendar icon that opens the native date picker
// (same picker pattern as hr-reports.tsx).
export function DateChip({ value, max, onChange, accessibilityLabel }: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText style={styles.label}>{dmy(value)}</ThemedText>
        <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
      </Pressable>
      {open && (
        <DateTimePicker
          value={fromYmd(value)}
          mode="date"
          maximumDate={fromYmd(max)}
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: Radii.sm },
  label: { fontSize: 14, lineHeight: 20 },
  done: { alignSelf: 'flex-end', padding: Spacing.two },
});
