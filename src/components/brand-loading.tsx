import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

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

/**
 * Full-screen "Loading ..." shown between pressing Sign In and the app opening: two cars drift round a circle, leaving skid marks. White
 * background, black cars, red label. Fades in after a short beat, so a very fast sign-in never flashes it.
 */
export function BrandLoading() {
  const spin = useSharedValue(0);
  const appear = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    appear.value = withDelay(160, withTiming(1, { duration: 260 }));
    spin.value = withRepeat(withTiming(360, { duration: 3600, easing: Easing.linear }), -1, false);
    pulse.value = withRepeat(withSequence(withTiming(0.45, { duration: 900 }), withTiming(1, { duration: 900 })), -1, false);
    return () => { cancelAnimation(spin); cancelAnimation(pulse); };
  }, [spin, appear, pulse]);

  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const wrap = useAnimatedStyle(() => ({ opacity: appear.value }));
  const label = useAnimatedStyle(() => ({ opacity: pulse.value }));

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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', zIndex: 50, elevation: 50 },
  stage: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  label: { color: RED, fontSize: 30, fontWeight: '500', letterSpacing: 0.5 },
});
