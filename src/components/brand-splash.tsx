import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const LOGO_W = 190;
const LOGO_H = LOGO_W * (2402 / 2929);
const SPLIT = 34; // how far (dp) each half slides outward

/**
 * Opening animation shown right after the native splash. The logo fades in and keeps zooming towards the viewer while its left and right
 * halves part,; then the overlay fades into the app. Purely cosmetic: it ignores touches and calls onDone
 * when finished (about 1.7 s).
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const zoom = useSharedValue(1);
  const logo = useSharedValue(0);
  const split = useSharedValue(0);
  const overlay = useSharedValue(1);

  useEffect(() => {
    const out = Easing.out(Easing.cubic);
    logo.value = withTiming(1, { duration: 350, easing: out });
    // The logo keeps zooming in (towards the viewer) while the halves part, then the app shows through.
    zoom.value = withTiming(2.6, { duration: 1600, easing: Easing.in(Easing.quad) });
    split.value = withDelay(350, withTiming(1, { duration: 1200, easing: Easing.in(Easing.cubic) }));
    overlay.value = withDelay(
      1200,
      withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }, (finished) => {
        if (finished) runOnJS(onDone)();
      }),
    );
  }, [zoom, logo, split, overlay, onDone]);

  const group = useAnimatedStyle(() => ({ opacity: logo.value, transform: [{ scale: zoom.value }] }));
  const left = useAnimatedStyle(() => ({ transform: [{ translateX: -split.value * SPLIT }] }));
  const right = useAnimatedStyle(() => ({ transform: [{ translateX: split.value * SPLIT }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value }));

  return (
    <Animated.View style={[styles.fill, overlayStyle]} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View style={[styles.row, group]}>
          <Animated.View style={left}>
            <Image source={require('../../assets/images/splash-left.png')} style={{ width: LOGO_W / 2, height: LOGO_H }} contentFit="fill" />
          </Animated.View>
          <Animated.View style={right}>
            <Image source={require('../../assets/images/splash-right.png')} style={{ width: LOGO_W / 2, height: LOGO_H }} contentFit="fill" />
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF', zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
});
