import { useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, type AccessibilityRole, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// Small, reusable motion pieces for the dial pad. Everything runs on the UI thread (no JS-thread work per frame).

const SPRING = { damping: 14, stiffness: 420, mass: 0.6 };

function pressIn(scale: SharedValue<number>, glow: SharedValue<number>, to: number) {
  'worklet';
  scale.value = withSpring(to, SPRING);
  glow.value = withTiming(1, { duration: 70 });
}
function pressOut(scale: SharedValue<number>, glow: SharedValue<number>) {
  'worklet';
  scale.value = withSpring(1, { damping: 9, stiffness: 300, mass: 0.6 }); // slight overshoot = the key "springs back"
  glow.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) });
}

/** A pressable that squishes under the finger, lights a soft disc behind it and springs back with a little overshoot. */
export function MotionPressable({
  children, onPress, onLongPress, disabled, style, glowColor, scaleTo = 0.88, accessibilityLabel, accessibilityRole = 'button', hitSlop,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  glowColor: string;
  scaleTo?: number;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  hitSlop?: number;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const body = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const disc = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => pressIn(scale, glow, scaleTo)}
      onPressOut={() => pressOut(scale, glow)}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}>
      <Animated.View style={[style, body]}>
        <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 999, backgroundColor: glowColor }, disc]} pointerEvents="none" />
        {children}
      </Animated.View>
    </Pressable>
  );
}

function pop(scale: SharedValue<number>) {
  'worklet';
  scale.value = withSequence(withTiming(0.86, { duration: 80 }), withSpring(1, { damping: 7, stiffness: 260, mass: 0.7 }));
}

/** Fades between a dimmed and a full state, with a small pop the moment it becomes enabled (e.g. the Call button when the number is complete). */
export function EnableFade({ enabled, dimmedTo = 0.4, children, style }: { enabled: boolean; dimmedTo?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const level = useSharedValue(enabled ? 1 : 0);
  const scale = useSharedValue(1);
  const first = useSharedValue(true);
  useEffect(() => {
    level.value = withTiming(enabled ? 1 : 0, { duration: 220, easing: Easing.out(Easing.quad) });
    if (enabled && !first.value) pop(scale);
    first.value = false;
  }, [enabled, level, scale, first]);
  const anim = useAnimatedStyle(() => ({ opacity: dimmedTo + (1 - dimmedTo) * level.value, transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Slides/fades its child in and out (e.g. the delete key, which exists only while there is something to delete). */
export function PresenceScale({ show, children, style }: { show: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const level = useSharedValue(show ? 1 : 0);
  useEffect(() => {
    level.value = withSpring(show ? 1 : 0, { damping: 16, stiffness: 300, mass: 0.6 });
  }, [show, level]);
  const anim = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, level.value)), transform: [{ scale: 0.6 + 0.4 * level.value }, { translateX: (1 - level.value) * 10 }] }));
  return <Animated.View
      style={[style, anim]}
      pointerEvents={show ? 'auto' : 'none'}
      accessibilityElementsHidden={!show}
      importantForAccessibility={show ? 'auto' : 'no-hide-descendants'}>
      {children}
    </Animated.View>;
}

function nudge(x: SharedValue<number>) {
  'worklet';
  cancelAnimation(x);
  x.value = withSequence(
    withTiming(-9, { duration: 50 }), withTiming(9, { duration: 70 }), withTiming(-6, { duration: 70 }), withTiming(4, { duration: 60 }), withTiming(0, { duration: 50 }),
  );
}
function bump(s: SharedValue<number>) {
  'worklet';
  s.value = withSequence(withTiming(1.045, { duration: 70 }), withSpring(1, { damping: 10, stiffness: 400, mass: 0.5 }));
}

/**
 * Wraps the number display. `shake` going true shakes it sideways (invalid number); `token` changing (digit typed or removed) gives it a
 * tiny scale bump so every key press has visible feedback.
 */
export function NumberMotion({ shake, token, children }: { shake: boolean; token: string; children: ReactNode }) {
  const x = useSharedValue(0);
  const s = useSharedValue(1);
  const first = useSharedValue(true);
  useEffect(() => { if (shake) nudge(x); }, [shake, x]);
  useEffect(() => {
    if (!first.value) bump(s);
    first.value = false;
  }, [token, s, first]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { scale: s.value }] }));
  return <Animated.View style={anim}>{children}</Animated.View>;
}
