import { type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Block backdrop / back-button dismissal while a request is running. */
  locked?: boolean;
  /** Tall sheet for long forms (92% of the screen instead of 85%). */
  fullHeight?: boolean;
};

// The dashboard's centred modals, as a bottom sheet (same pattern as ui/Select).
export function Sheet({ visible, onClose, title, subtitle, children, footer, locked, fullHeight }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const close = () => { if (!locked) onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
        <View style={[styles.sheet, fullHeight && { height: '92%', maxHeight: '92%' }, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
          <View style={styles.header}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            {subtitle ? <ThemedText themeColor="textMuted" style={styles.subtitle}>{subtitle}</ThemedText> : null}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>{children}</ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { width: '100%', maxWidth: 600, maxHeight: '85%', borderTopLeftRadius: Radii.lg, borderTopRightRadius: Radii.lg, borderWidth: 1, borderBottomWidth: 0 },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 4 },
  title: { fontSize: 18, lineHeight: 24, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20 },
  body: { paddingHorizontal: 20, paddingVertical: 8, gap: Spacing.three },
  footer: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: 20, paddingTop: 8 },
});
