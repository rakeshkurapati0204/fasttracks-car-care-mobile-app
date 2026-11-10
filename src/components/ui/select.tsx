import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Layout, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  options: SelectOption[];
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Small inline field (32pt tall, 12px text), e.g. the job card's "By" picker. */
  compact?: boolean;
};

// Dashboard Select, mobile style: an input-looking field that opens a bottom
// sheet (react-native Modal) with the options. Single-select only.
export function Select({ options, value, onChange, label, placeholder = 'Select…', error, required, disabled, compact }: SelectProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value);
  const accent = error ? theme.danger : theme.primary;

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <View>
      {label ? (
        <ThemedText themeColor={error ? 'danger' : 'textSecondary'} style={styles.label}>
          {label}
          {required ? ' *' : ''}
        </ThemedText>
      ) : null}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ?? placeholder}
        style={[
          styles.field,
          { backgroundColor: theme.surface, borderColor: error || open ? accent : theme.border },
          compact && styles.fieldCompact,
          disabled && styles.disabled,
        ]}>
        <ThemedText numberOfLines={1} style={[styles.value, compact && styles.valueCompact, !selected && { color: theme.textMuted }]}>
          {selected ? selected.label : placeholder}
        </ThemedText>
        <Ionicons name="chevron-down" size={18} color={theme.textMuted} />
      </Pressable>
      {error ? <ThemedText themeColor="danger" style={styles.helper}>{error}</ThemedText> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
          <View
            style={[
              styles.sheet,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border, paddingBottom: insets.bottom + Spacing.two },
            ]}>
            <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
              <ThemedText style={styles.sheetTitle} numberOfLines={1}>{label ?? placeholder}</ThemedText>
              <Pressable onPress={() => setOpen(false)} hitSlop={Spacing.two} accessibilityRole="button" accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView>
              {options.map((o) => {
                const active = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => choose(o.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.option,
                      { borderBottomColor: theme.border },
                      (active || pressed) && { backgroundColor: withAlpha(theme.primary, active ? 0.12 : 0.06) },
                    ]}>
                    <ThemedText style={[styles.optionLabel, active && { color: theme.primary, fontFamily: FontWeights.semiBold }]}>
                      {o.label}
                    </ThemedText>
                    {active ? <Ionicons name="checkmark" size={20} color={theme.primary} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium, marginBottom: 4 },
  field: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14, paddingVertical: 10 },
  value: { flex: 1, fontSize: 14, lineHeight: 20 },
  fieldCompact: { minHeight: 32, paddingVertical: 4, paddingHorizontal: 8, gap: 4 },
  valueCompact: { fontSize: 12, lineHeight: 16 },
  disabled: { opacity: 0.5 },
  helper: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)' },
  // Capped width so the sheet doesn't stretch across a tablet.
  sheet: { width: '100%', maxWidth: 600, maxHeight: '70%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, borderBottomWidth: 0 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle: { flex: 1, fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  option: { minHeight: Layout.minTouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth },
  optionLabel: { flex: 1, fontSize: 15 },
});
