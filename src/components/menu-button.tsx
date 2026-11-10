import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { useDrawer, useIsDocked } from '@/lib/drawer-context';

/** Hamburger button that opens the side menu. Drop into a Stack header's
 * `headerLeft`, or float it over a custom hero. */
export function MenuButton({ tint }: { tint?: string }) {
  const { open } = useDrawer();
  const docked = useIsDocked();
  const theme = useTheme();
  // Docked sidebar is always visible, so there is nothing to open.
  if (docked) return null;
  return (
    <Pressable onPress={open} hitSlop={12} style={styles.button} accessibilityLabel="Open menu">
      <Ionicons name="menu" size={26} color={tint ?? theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
});
