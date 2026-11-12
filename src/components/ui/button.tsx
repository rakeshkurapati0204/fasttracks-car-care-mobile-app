import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  children: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  /** Ionicons name shown before the label. */
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Dashboard sizes: sm px-3 py-1.5 text-xs rounded-lg · md px-4 py-2 text-sm
// rounded-lg · lg px-5 py-2.5 text-base rounded-xl. Height never drops below
// the 44pt touch minimum on a phone.
const SIZES = {
  sm: { px: 12, py: 6, font: 12, radius: Radii.sm, gap: 6 },
  md: { px: 16, py: 8, font: 14, radius: Radii.sm, gap: 8 },
  lg: { px: 20, py: 10, font: 16, radius: Radii.md, gap: 8 },
} as const;

const APressable = Animated.createAnimatedComponent(Pressable);

function squish(scale: { value: number }, to: number) {
  'worklet';
  scale.value = withSpring(to, { damping: 14, stiffness: 420, mass: 0.6 });
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = false,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const s = SIZES[size];
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);
  const press = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const look = {
    primary: { bg: theme.primary, fg: '#ffffff', border: 'transparent' },
    danger: { bg: theme.danger, fg: '#ffffff', border: 'transparent' },
    secondary: { bg: theme.surface, fg: theme.text, border: theme.border },
    ghost: { bg: 'transparent', fg: theme.textSecondary, border: 'transparent' },
    outline: { bg: 'transparent', fg: theme.text, border: theme.border },
  }[variant];

  return (
    <APressable
      onPress={onPress}
      onPressIn={() => squish(scale, 0.97)}
      onPressOut={() => squish(scale, 1)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        {
          backgroundColor: look.bg,
          borderColor: look.border,
          paddingHorizontal: s.px,
          paddingVertical: s.py,
          borderRadius: s.radius,
          gap: s.gap,
        },
        fullWidth && styles.full,
        isDisabled && styles.disabled,
        style,
        press,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={look.fg} />
      ) : icon ? (
        <Ionicons name={icon} size={s.font + 4} color={look.fg} />
      ) : null}
      <ThemedText style={[styles.label, { color: look.fg, fontSize: s.font, lineHeight: s.font + 6 }]}>{children}</ThemedText>
    </APressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderWidth: 1, alignSelf: 'flex-start' },
  full: { alignSelf: 'stretch' },
  disabled: { opacity: 0.5 },
  label: { fontFamily: FontWeights.medium },
});
