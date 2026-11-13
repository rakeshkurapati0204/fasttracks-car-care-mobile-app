import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { FontWeights, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type EmptyStateProps = {
  message: string;
  title?: string;
  /** Ionicons name. */
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ message, title, icon = 'file-tray-outline', actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={40} color={theme.textMuted} />
      {title ? <ThemedText style={styles.title}>{title}</ThemedText> : null}
      <ThemedText type="small" themeColor="textSecondary" style={styles.message}>{message}</ThemedText>
      {actionLabel && onAction ? <Button onPress={onAction} variant="outline">{actionLabel}</Button> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, paddingHorizontal: Spacing.three },
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold, textAlign: 'center' },
  message: { textAlign: 'center', maxWidth: 360, marginBottom: Spacing.one },
});
