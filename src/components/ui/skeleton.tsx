import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { makeMutable, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';

import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { follow, loop, stopLoop } from '@/lib/motion';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  /** Fully round (avatars). */
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
};

// A soft light band sweeps across the blocks (the dashboard's .skeleton shimmer). ONE loop drives every block on the screen, so a list of thirty placeholders costs the
// same as one and they all shimmer in step; it runs only while at least one block is mounted. The band is three stacked translucent strips so its edges fade
// instead of cutting off. With "Reduce motion" on, the blocks just stay still.
const sweep = makeMutable(0);
let live = 0;
function acquire() { if (live++ === 0) loop(sweep, 1300); }
function release() { if (--live === 0) stopLoop(sweep); }

export function Skeleton({ width = '100%', height = 16, circle = false, style }: SkeletonProps) {
  const theme = useTheme();
  const reduce = useReducedMotion();
  const w = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    acquire();
    return release;
  }, [reduce]);

  const band = useAnimatedStyle(() => ({ width: w.value * 0.6, transform: [{ translateX: -w.value * 0.6 + sweep.value * w.value * 1.9 }] }));
  const onLayout = (e: LayoutChangeEvent) => follow(w, e.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[{ width, height, backgroundColor: theme.border, borderRadius: circle ? height / 2 : 6, overflow: 'hidden' }, style]}>
      {reduce ? null : (
        <Animated.View style={[styles.band, band]} pointerEvents="none">
          <View style={[styles.strip, { opacity: 0.18 }]} />
          <View style={[styles.strip, { opacity: 0.4, flex: 2 }]} />
          <View style={[styles.strip, { opacity: 0.18 }]} />
        </Animated.View>
      )}
    </View>
  );
}

// Dashboard SkeletonKPI / SkeletonCard: stat-tile placeholder.
export function SkeletonCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      <View style={styles.cardTop}>
        <Skeleton width={120} height={12} />
        <Skeleton width={44} height={44} style={styles.icon} />
      </View>
      <Skeleton width={160} height={32} />
      <Skeleton width={80} height={12} />
    </View>
  );
}

// Dashboard SkeletonList: avatar + two lines + trailing text, repeated.
export function SkeletonList({ items = 5 }: { items?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: items }).map((_, i) => (
        <View key={i} style={styles.listRow}>
          <Skeleton width={40} height={40} circle />
          <View style={styles.listText}>
            <Skeleton width="60%" height={13} />
            <Skeleton width="40%" height={11} />
          </View>
          <Skeleton width={60} height={11} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
  strip: { flex: 1, backgroundColor: '#ffffff' },
  card: { borderWidth: 1, borderRadius: Radii.md, padding: 24, gap: Spacing.three },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  icon: { borderRadius: Radii.md },
  list: { gap: Spacing.three },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.two },
  listText: { flex: 1, gap: Spacing.two },
});
