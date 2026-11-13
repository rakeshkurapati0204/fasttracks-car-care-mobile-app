// One way to place a billed Exotel click-to-call, shared by the dial pad and the "call back" button in the call history. Exotel rings the salesman's own
// phone first; when Fasttracks is the phone app that call is answered automatically and the in-call screen opens, otherwise the salesman answers by hand.
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';

import { dialErrorText } from '@/lib/dial';
import { dialNumber } from '@/lib/api';
import { armAutoAnswer, disarmAutoAnswer, enableAutoAnswer, sanitizeHint, type ArmResult, type DialerNative } from '@/lib/auto-answer/arm.ts';
import { shouldAskForRole } from '@/lib/auto-answer/setup.ts';

export type DialTarget = { phone: string } | { fromCallId: string };

export type DialOutcome =
  /** autoAnswerOff: auto-answer is available on this build but this phone is not set up for it, so the salesman has to pick up. */
  | { kind: 'placed'; autoAnswered: boolean; autoAnswerOff: boolean; /** Why the call is NOT answered automatically, in words the salesman can act on. */ note?: string }
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

// The "make Fasttracks your phone app?" question is asked UP FRONT when the dial pad opens (askForPhoneAppRole), never in the middle of pressing Call, so Call
// goes out at once. A "no" is asked again after a day (setup.ts); the "Turn on auto-answer" link on the dial pad always lets them do it right away.
const ASKED_KEY = 'ft_auto_answer_asked_at';
async function lastAskedAt(): Promise<number | null> {
  try { const v = await SecureStore.getItemAsync(ASKED_KEY); const n = v ? Number(v) : NaN; return Number.isFinite(n) ? n : null; } catch { return null; }
}
async function rememberAsked(): Promise<void> {
  try { await SecureStore.setItemAsync(ASKED_KEY, String(Date.now())); } catch { /* it just asks again next time */ }
}

/** Opens Android's "make Fasttracks your phone app?" dialog if a new/unset phone should be asked now. Returns true when Fasttracks became the phone app. */
export async function askForPhoneAppRole(native: DialerNative | null, autoOn: boolean, isPhoneApp: boolean, force = false): Promise<boolean> {
  if (!native || !autoOn || isPhoneApp) return false;
  if (!force && !shouldAskForRole({ autoOn, isPhoneApp, lastAskedAt: await lastAskedAt(), now: Date.now() })) return false;
  await rememberAsked();
  return (await enableAutoAnswer(native)) === 'enabled';
}

// The Exotel caller IDs from the last call the server accepted. A phone-app build can arm automatic answer BEFORE it sends the request (the Exotel call can ring
// the phone before the server's reply has arrived, e.g. on a slow connection or while the app is busy), using what the server said last time.
const CALLER_IDS_KEY = 'ft_autoanswer_callerids';
let knownCallerIds: string[] | null = null;
let knownLoaded = false;

/** Reads the remembered caller IDs from the phone (call this when the dial pad opens, so Call itself never waits for it). */
export async function warmAutoAnswerHint(): Promise<void> {
  if (knownLoaded) return;
  try {
    const raw = await SecureStore.getItemAsync(CALLER_IDS_KEY);
    const ids = raw ? (JSON.parse(raw) as unknown) : null;
    knownCallerIds = Array.isArray(ids) ? sanitizeHint({ callerIds: ids, windowSeconds: 60 })?.callerIds ?? null : null;
  } catch {
    knownCallerIds = null;
  }
  knownLoaded = true;
}

function rememberCallerIds(ids: string[]): void {
  knownCallerIds = ids;
  knownLoaded = true;
  SecureStore.setItemAsync(CALLER_IDS_KEY, JSON.stringify(ids)).catch(() => { /* the next call arms from the server's reply */ });
}

const PRE_ARM_SECONDS = 60;

/** What to tell the salesman when the call will NOT be answered by the app. */
function noteFor(armed: ArmResult | null, autoOn: boolean): string | undefined {
  if (!autoOn || !armed || armed.armed) return undefined;
  switch (armed.reason) {
    case 'not_default_dialer': return 'Instant calling is off on this phone: turn it on above.';
    case 'no_hint': return 'The server did not enable instant calling for this call.';
    case 'invalid_hint': return 'The server sent an unusable caller ID for instant calling.';
    case 'native_refused': return 'This phone did not accept instant calling for this call.';
    default: return undefined;
  }
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
  /** Ask "Call X?" first. The dial pad passes false: pressing its green Call button is already the decision. A one-tap "call back" keeps the question. */
  confirm?: boolean;
};

export async function placeCall(o: PlaceCallOptions): Promise<DialOutcome> {
  // Nothing is awaited before the request except the optional "Call X?" of a one-tap call back: the dial pad's Call goes out the moment it is pressed.
  if (o.confirm !== false && !(await confirmCall(`Call ${o.display}?`))) return { kind: 'cancelled' };
  // Ready to answer BEFORE the request leaves (the call can ring before the reply arrives). Needs the phone app role and the caller IDs the server gave last time.
  if (o.autoOn && o.isPhoneApp && knownCallerIds) armAutoAnswer(o.native, { callerIds: knownCallerIds, windowSeconds: PRE_ARM_SECONDS });
  try {
    const r = await dialNumber(o.target, o.key);
    const hint = sanitizeHint(r.autoAnswer);
    if (hint) rememberCallerIds(hint.callerIds);
    const armed = o.autoOn ? armAutoAnswer(o.native, r.autoAnswer) : null; // refreshed from this reply (one attempt, only for a NEW call: a repeat carries no hint)
    if (armed?.armed) { try { o.native?.setCallLabel?.(o.display); } catch { /* the call screen then shows the number */ } }
    return { kind: 'placed', autoAnswered: !!armed?.armed, autoAnswerOff: o.autoOn && !o.isPhoneApp, note: noteFor(armed, o.autoOn) };
  } catch (err) {
    if (o.autoOn) disarmAutoAnswer(o.native); // no call is coming: leave no answer window open
    const e = dialErrorText(err as Parameters<typeof dialErrorText>[0]);
    return { kind: 'failed', text: e.text, keepKey: e.keepKey };
  }
}
