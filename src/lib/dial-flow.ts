// One way to place a billed Exotel click-to-call, shared by the dial pad and the "call back" button in the call history. Exotel rings the salesman's own
// phone first; when Fasttracks is the phone app that call is answered automatically and the in-call screen opens, otherwise the salesman answers by hand.
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';

import { dialErrorText } from '@/lib/dial';
import { dialNumber, fetchCallAutoAnswerHint, initiateCall } from '@/lib/api';
import { armAutoAnswer, disarmAutoAnswer, enableAutoAnswer, sanitizeHint, type DialerNative } from '@/lib/auto-answer/arm.ts';
import { shouldAskForRole } from '@/lib/auto-answer/setup.ts';

// `customerId`: the customer page's Call button (POST /calls/initiate, the server looks the number up). The others are the dial pad and the history's call back (POST /calls/dial).
export type DialTarget = { phone: string } | { fromCallId: string } | { customerId: string };

export type DialOutcome =
  /** autoAnswerOff: auto-answer is available on this build but this phone is not set up for it, so the salesman has to pick up. */
  | { kind: 'placed'; autoAnswered: boolean; autoAnswerOff: boolean }
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

// The Exotel caller ID the callback will show. A phone-app build arms automatic answer BEFORE it sends the dial request (Exotel can ring the phone before the server's
// reply has arrived), so the ID has to be known already when Call is pressed. It is kept on the phone, and refreshed from the server when the dial pad opens and from
// every dial reply. Pressing Call never waits for the network to learn it.
const CALLER_IDS_KEY = 'ft_autoanswer_callerids';
const REFRESH_EVERY_MS = 5 * 60_000;
let knownCallerIds: string[] | null = null;
let knownLoaded = false;
let lastRefreshAt = 0;

/** Reads the remembered caller IDs, then refreshes them from the server in the background (at most every 5 minutes). Call it when the dial pad opens. */
export async function warmAutoAnswerHint(): Promise<void> {
  if (!knownLoaded) {
    try {
      const raw = await SecureStore.getItemAsync(CALLER_IDS_KEY);
      const ids = raw ? (JSON.parse(raw) as unknown) : null;
      knownCallerIds = Array.isArray(ids) ? sanitizeHint({ callerIds: ids, windowSeconds: 60 })?.callerIds ?? null : null;
    } catch {
      knownCallerIds = null;
    }
    knownLoaded = true;
  }
  if (Date.now() - lastRefreshAt < REFRESH_EVERY_MS) return;
  lastRefreshAt = Date.now();
  const hint = sanitizeHint(await fetchCallAutoAnswerHint().catch(() => null));
  if (hint) rememberCallerIds(hint.callerIds);
}

function rememberCallerIds(ids: string[]): void {
  knownCallerIds = ids;
  knownLoaded = true;
  SecureStore.setItemAsync(CALLER_IDS_KEY, JSON.stringify(ids)).catch(() => { /* the next call arms from the server's reply */ });
}

const PRE_ARM_SECONDS = 60;

// Both endpoints answer a NEW call with the same autoAnswer hint, so the arming below is identical for every kind of call.
function requestCall(target: DialTarget, key: string) {
  return 'customerId' in target ? initiateCall(target.customerId, key) : dialNumber(target, key);
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
  // The call screen opens the moment Call is pressed ("Calling...", End Call) and follows Exotel's call when it arrives. Only when this phone can answer that call itself.
  const screen = o.autoOn && o.isPhoneApp;
  if (screen) { try { o.native?.showCallScreen?.(o.display); } catch { /* an older native build: no early screen */ } }
  // Ready to answer BEFORE the request leaves: no network wait here, the caller ID was learned when the dial pad opened (or from the last call). Only for a phone that can
  // answer the callback itself. The window is short: if the request then fails it is disarmed below.
  if (o.autoOn && o.isPhoneApp && knownCallerIds) armAutoAnswer(o.native, { callerIds: knownCallerIds, windowSeconds: PRE_ARM_SECONDS });
  try {
    const r = await requestCall(o.target, o.key);
    const hint = sanitizeHint(r.autoAnswer);
    if (hint) rememberCallerIds(hint.callerIds);
    const armed = o.autoOn ? armAutoAnswer(o.native, r.autoAnswer) : null; // refreshed from this reply (one attempt, only for a NEW call: a repeat carries no hint)
    if (armed?.armed) { try { o.native?.setCallLabel?.(o.display); } catch { /* the call screen then shows the number */ } }
    return { kind: 'placed', autoAnswered: !!armed?.armed, autoAnswerOff: o.autoOn && !o.isPhoneApp };
  } catch (err) {
    if (o.autoOn) disarmAutoAnswer(o.native); // no call is coming: leave no answer window open
    if (screen) { try { o.native?.dismissCallScreen?.(); } catch { /* nothing to close */ } }
    const e = dialErrorText(err as Parameters<typeof dialErrorText>[0]);
    return { kind: 'failed', text: e.text, keepKey: e.keepKey };
  }
}
