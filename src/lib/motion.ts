// The one place that sets how things move in the app, so every screen has the same feel and tuning is a one-line change. Everything here runs on the UI thread
// (worklets), never on the JS thread. The helpers are module-level worklets on purpose: the React compiler lint rule rejects shared-value writes inside components.
import { cancelAnimation, Easing, ReduceMotion, withRepeat, withSequence, withSpring, withTiming, type EasingFunction, type SharedValue } from 'react-native-reanimated';

/** Fast start, long soft landing: menus, cards, anything that slides. */
export const EASE_OUT = Easing.bezier(0.22, 0.9, 0.25, 1);

/** Finger down: a quick, firm squish. */
export const PRESS_SPRING = { damping: 14, stiffness: 420, mass: 0.6 } as const;
/** Finger up: springs back with a slight overshoot. */
export const RELEASE_SPRING = { damping: 9, stiffness: 300, mass: 0.6 } as const;
/** Things that appear or disappear (a key, a chip). */
export const PRESENCE_SPRING = { damping: 16, stiffness: 300, mass: 0.6 } as const;

/** Slide a 0..1 progress value to `to` over `ms`. */
export function glide(p: SharedValue<number>, to: number, ms: number) {
  'worklet';
  p.value = withTiming(to, { duration: ms, easing: EASE_OUT });
}

/** Set a value directly (a drag that follows the finger). */
export function follow(p: SharedValue<number>, value: number) {
  'worklet';
  p.value = value;
}

/** Squish a pressable to `to` (e.g. 0.97) and back to 1 on release. */
export function squish(scale: SharedValue<number>, to: number) {
  'worklet';
  scale.value = withSpring(to, to === 1 ? RELEASE_SPRING : PRESS_SPRING);
}

/** A short sideways shake: something was refused (a wrong password, an invalid number). */
export function shake(x: SharedValue<number>) {
  'worklet';
  cancelAnimation(x);
  x.value = withSequence(withTiming(-9, { duration: 50 }), withTiming(9, { duration: 70 }), withTiming(-6, { duration: 70 }), withTiming(4, { duration: 60 }), withTiming(0, { duration: 50 }));
}

/** A tiny scale bump: something just changed (a digit typed). */
export function bump(s: SharedValue<number>) {
  'worklet';
  s.value = withSequence(withTiming(1.045, { duration: 70 }), withSpring(1, { damping: 10, stiffness: 400, mass: 0.5 }));
}

/** A pop: the thing just became available (the Call button once the number is complete). */
export function pop(scale: SharedValue<number>) {
  'worklet';
  scale.value = withSequence(withTiming(0.86, { duration: 80 }), withSpring(1, { damping: 7, stiffness: 260, mass: 0.7 }));
}

/**
 * Run a 0..1 value in an endless loop (a shimmer, a pulse, a spinner).
 * `essential`: the loop shows that the app is working (a loading indicator), so it keeps running even when the phone's "Remove animations" setting is on.
 * Without it, that setting makes Reanimated jump straight to the end value and a loader would look frozen. Decorative loops (a shimmer) leave it off and respect the setting.
 */
export function loop(p: SharedValue<number>, ms: number, opts?: { easing?: EasingFunction; essential?: boolean }) {
  'worklet';
  p.value = withRepeat(
    withTiming(1, { duration: ms, easing: opts?.easing ?? Easing.inOut(Easing.quad), reduceMotion: opts?.essential ? ReduceMotion.Never : ReduceMotion.System }),
    -1,
    false,
    undefined,
    opts?.essential ? ReduceMotion.Never : ReduceMotion.System,
  );
}

/** Stop a loop and put the value back at 0. */
export function stopLoop(p: SharedValue<number>) {
  'worklet';
  cancelAnimation(p);
  p.value = 0;
}
