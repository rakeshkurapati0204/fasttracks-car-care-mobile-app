import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** "shown / total" counter, displayed only while a query is typed. */
  shown?: number;
  total?: number;
};

// Dashboard SearchBar: search icon, clear button, and a "shown / total" counter.
export function SearchBar({ value, onChange, placeholder, shown, total }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.input, { color: theme.text }]}
        />
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search" style={[styles.clear, { backgroundColor: theme.border }]}>
            <Ionicons name="close" size={12} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {value && shown !== undefined && total !== undefined ? (
        <ThemedText themeColor="textMuted" style={styles.count}>{`${shown} / ${total}`}</ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10 },
  input: { flex: 1, fontSize: 14, paddingVertical: 8 },
  clear: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
});
