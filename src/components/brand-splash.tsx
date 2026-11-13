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

// The native splash screen (app.json) shows this same logo, centred, at this width, so the hand-over to this animation is invisible: nothing jumps or blinks.
const LOGO_W = 100;
const LOGO_H = LOGO_W * (840 / 1024);
const SPLIT = 18; // how far (dp, before the zoom) each half slides outward
const ZOOM_TO = 4.9; // 100 dp -> about 490 dp wide: past the edges of a phone
const ZOOM_MS = 1600;
const FADE_AT_MS = 1200;
const FADE_MS = 520;

/**
 * Opening animation, played right after the native splash screen: the logo keeps zooming towards the viewer while its left and right halves part, then the
 * whole thing fades into the app. Purely cosmetic: it ignores touches. `onDone` is called when it has finished, and ALWAYS: a timer backs up the animation's
 * own callback, so this opaque layer can never get stuck over the app (for example if the phone has animations switched off).
 */
export function BrandSplash({ onDone }: { onDone: () => void }) {
  const zoom = useSharedValue(1);
  const split = useSharedValue(0);
  const overlay = useSharedValue(1);

  useEffect(() => {
    zoom.value = withTiming(ZOOM_TO, { duration: ZOOM_MS, easing: Easing.in(Easing.quad) });
    split.value = withDelay(350, withTiming(1, { duration: 1200, easing: Easing.in(Easing.cubic) }));
    overlay.value = withDelay(FADE_AT_MS, withTiming(0, { duration: FADE_MS, easing: Easing.inOut(Easing.quad) }, (finished) => {
      if (finished) runOnJS(onDone)();
    }));
    const backstop = setTimeout(onDone, FADE_AT_MS + FADE_MS + 300);
    return () => clearTimeout(backstop);
  }, [zoom, split, overlay, onDone]);

  const group = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
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
