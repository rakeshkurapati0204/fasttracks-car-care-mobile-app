import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { loop, stopLoop } from '@/lib/motion';

const SIZE = 250;
const C = SIZE / 2;
const R = 92;
const RED = '#D3202F';
const CAR_W = 22;
const CAR_H = 54;

const at = (deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: C + R * Math.sin(a), y: C - R * Math.cos(a) };
};

// A short fading skid mark behind a car: segments of the circle it drives on, darker near the car.
function Trail({ from }: { from: number }) {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a0 = from - (i + 1) * 7;
    const a1 = from - i * 7;
    const p0 = at(a0);
    const p1 = at(a1);
    parts.push(
      <Path
        key={i}
        d={`M ${p0.x} ${p0.y} A ${R} ${R} 0 0 1 ${p1.x} ${p1.y}`}
        stroke="#111"
        strokeWidth={3}
        strokeLinecap="round"
        opacity={0.5 * (1 - i / 9)}
        fill="none"
      />,
    );
  }
  return <>{parts}</>;
}

// The sedan from the reference design, recoloured black with white glass (assets/images/loading-car.png, nose up). It drives clockwise,
// so on the circle it is turned to face along the tangent.
function Car({ deg, heading }: { deg: number; heading: number }) {
  const p = at(deg);
  return (
    <Image
      source={require('../../assets/images/loading-car.png')}
      style={{ position: 'absolute', width: CAR_W, height: CAR_H, left: p.x - CAR_W / 2, top: p.y - CAR_H / 2, transform: [{ rotate: `${heading}deg` }] }}
      resizeMode="contain"
    />
  );
}

const SLOW_AFTER_MS = 6000;

/**
 * Full-screen "Loading ..." shown between pressing Sign In and the app opening: two cars drift round a circle, leaving skid marks. White
 * background, black cars, red label. Fades in after a short beat, so a very fast sign-in never flashes it.
 * It is the "the app is working" signal, so its motion is essential (it keeps running when the phone has animations switched off); if the wait goes past
 * a few seconds it says so and offers Cancel (`onCancel`), so a slow connection is never a dead end.
 */
export function BrandLoading({ onCancel }: { onCancel?: () => void }) {
  const spin = useSharedValue(0);
  const pulse = useSharedValue(0);
  const appear = useSharedValue(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    appear.value = withDelay(160, withTiming(1, { duration: 260 }));
    loop(spin, 3600, { easing: Easing.linear, essential: true });
    loop(pulse, 900, { essential: true });
    const t = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => { clearTimeout(t); stopLoop(spin); stopLoop(pulse); };
  }, [spin, pulse, appear]);

  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const wrap = useAnimatedStyle(() => ({ opacity: appear.value }));
  // The label breathes between full and 45%: the loop value goes 0 -> 1 and is folded into a triangle wave.
  const label = useAnimatedStyle(() => ({ opacity: 1 - 0.55 * Math.abs(2 * pulse.value - 1) }));

  return (
    <Animated.View style={[styles.fill, wrap]} accessibilityRole="progressbar" accessibilityLabel="Loading">
      <View style={styles.stage}>
        <Animated.View style={[StyleSheet.absoluteFill, ring]}>
          <Svg width={SIZE} height={SIZE}>
            <Trail from={0} />
            <Trail from={180} />
          </Svg>
          <Car deg={0} heading={90} />
          <Car deg={180} heading={-90} />
        </Animated.View>
        <Animated.Text style={[styles.label, label]}>Loading ...</Animated.Text>
      </View>
      {slow ? (
        <View style={styles.slow}>
          <Text style={styles.slowText}>Taking longer than usual. Check your connection.</Text>
          {onCancel ? (
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancel sign in" hitSlop={8} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 50, elevation: 50 },
  stage: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  label: { color: RED, fontSize: 30, fontWeight: '500', letterSpacing: 0.5 },
  slow: { position: 'absolute', left: 24, right: 24, bottom: 72, alignItems: 'center', gap: 12 },
  slowText: { color: '#6b6b73', fontSize: 14, textAlign: 'center' },
  cancel: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: RED },
  cancelText: { color: RED, fontSize: 14, fontWeight: '600' },
});
