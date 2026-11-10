// One way to place a billed Exotel click-to-call, shared by the dial pad and the "call back" button in the call history. Exotel rings the salesman's own
// phone first; when Fasttracks is the phone app that call is answered automatically and the in-call screen opens, otherwise the salesman answers by hand.
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';

import { dialErrorText } from '@/lib/dial';
import { dialNumber } from '@/lib/api';
import { armAutoAnswer, disarmAutoAnswer, enableAutoAnswer, type DialerNative } from '@/lib/auto-answer/arm.ts';

export type DialTarget = { phone: string } | { fromCallId: string };

export type DialOutcome =
  | { kind: 'placed'; autoAnswered: boolean }
  | { kind: 'cancelled' }
  | { kind: 'failed'; text: string; keepKey: boolean };

// Alert has no buttons on web, so web uses the browser's own confirm.
export function confirmCall(title: string, message = ''): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  return new Promise((resolve) => {
    Alert.alert(title, message || undefined, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Call', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

// The "make Fasttracks your phone app?" question is asked until the salesman answers it once: a "no" is remembered, so it does not pop up on every call.
// The "Turn on auto-answer" link on the dial pad still lets them change their mind.
const DECLINED_KEY = 'ft_auto_answer_declined';
async function declinedBefore(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(DECLINED_KEY)) === '1'; } catch { return false; }
}
async function rememberDeclined(): Promise<void> {
  try { await SecureStore.setItemAsync(DECLINED_KEY, '1'); } catch { /* it just asks again next time */ }
}

export type PlaceCallOptions = {
  target: DialTarget;
  /** What the salesman sees on the confirmation and on the call screen: the typed number, or the customer's name/number from the history. */
  display: string;
  key: string;
  native: DialerNative | null;
  /** The backend allows automatic answer AND this build has the phone-app module. */
  autoOn: boolean;
  isPhoneApp: boolean;
  onBecamePhoneApp?: () => void;
  /** Ask "Call X?" first. The dial pad passes false: pressing its green Call button is already the decision. A one-tap "call back" keeps the question. */
  confirm?: boolean;
};

export async function placeCall(o: PlaceCallOptions): Promise<DialOutcome> {
  // Ask Android ("make this the default phone app?") when the salesman presses Call. If they decline, the call still goes ahead and is answered by hand.
  if (o.autoOn && !o.isPhoneApp && !(await declinedBefore())) {
    const r = await enableAutoAnswer(o.native);
    if (r === 'enabled') o.onBecamePhoneApp?.();
    else if (r === 'declined') await rememberDeclined();
  }
  if (o.confirm !== false && !(await confirmCall(`Call ${o.display}?`))) return { kind: 'cancelled' };
  try {
    const r = await dialNumber(o.target, o.key);
    const armed = o.autoOn ? armAutoAnswer(o.native, r.autoAnswer) : null; // one attempt, only for a NEW call (a repeat carries no hint)
    if (armed?.armed) { try { o.native?.setCallLabel?.(o.display); } catch { /* the call screen then shows the number */ } }
    return { kind: 'placed', autoAnswered: !!armed?.armed };
  } catch (err) {
    if (o.autoOn) disarmAutoAnswer(o.native); // no call is coming: leave no answer window open
    const e = dialErrorText(err as Parameters<typeof dialErrorText>[0]);
    return { kind: 'failed', text: e.text, keepKey: e.keepKey };
  }
}
