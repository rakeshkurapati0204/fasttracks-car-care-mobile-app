// Click-to-call, automatic answer on a company phone where Fasttracks is the phone app. The backend sends a hint with a freshly placed call (the ExoPhone that
// will ring this phone, and a short window); this file turns it into ONE armed attempt in the native module. Nothing here imports React Native, so it runs under
// `npm test`. The decision to answer is NOT made here: it is made natively, per incoming call (modules/fasttracks-dialer AutoAnswerPolicy).

export type AutoAnswerHint = { callerIds: string[]; windowSeconds: number };

export type DialerCallEvent = { type: string; exotel: boolean; state: string; number?: string | null };

// The part of the native module this file uses.
export type DialerNative = {
  isDefaultDialer(): boolean;
  requestDialerRole(): Promise<boolean>;
  armAutoAnswer(callerIds: string[], windowSeconds: number): boolean;
  disarmAutoAnswer(): void;
  /** The customer shown on the call screen of the click-to-call call. Optional so an older native build without it still works. */
  setCallLabel?(label: string): void;
};

export type ArmResult =
  | { armed: true; windowSeconds: number }
  | { armed: false; reason: 'no_hint' | 'invalid_hint' | 'not_available' | 'not_default_dialer' | 'native_refused' };

export const MAX_WINDOW_SECONDS = 180;
const MIN_DIGITS = 10;

// Only caller IDs with at least 10 digits are accepted (a short or empty one would make the match too broad); the window is clamped to 1..180 seconds.
export function sanitizeHint(hint: unknown): AutoAnswerHint | null {
  const h = hint as { callerIds?: unknown; windowSeconds?: unknown } | null | undefined;
  if (!h || !Array.isArray(h.callerIds)) return null;
  const ids = [...new Set(h.callerIds.filter((c): c is string => typeof c === 'string' && c.replace(/\D/g, '').length >= MIN_DIGITS))];
  const secs = typeof h.windowSeconds === 'number' && Number.isFinite(h.windowSeconds) ? Math.floor(h.windowSeconds) : NaN;
  if (ids.length === 0 || !(secs >= 1)) return null;
  return { callerIds: ids, windowSeconds: Math.min(secs, MAX_WINDOW_SECONDS) };
}

// Arms one attempt right after the backend accepted a NEW call. Never throws; the call itself is unaffected whatever this returns.
export function armAutoAnswer(native: DialerNative | null | undefined, hint: unknown): ArmResult {
  if (hint === undefined || hint === null) return { armed: false, reason: 'no_hint' };
  const clean = sanitizeHint(hint);
  if (!clean) return { armed: false, reason: 'invalid_hint' };
  if (!native) return { armed: false, reason: 'not_available' };
  try {
    if (!native.isDefaultDialer()) return { armed: false, reason: 'not_default_dialer' };
    return native.armAutoAnswer(clean.callerIds, clean.windowSeconds) ? { armed: true, windowSeconds: clean.windowSeconds } : { armed: false, reason: 'native_refused' };
  } catch {
    return { armed: false, reason: 'native_refused' };
  }
}

// The call failed or was refused after all: do not leave an answer window open for a call that is not coming.
export function disarmAutoAnswer(native: DialerNative | null | undefined): void {
  try { native?.disarmAutoAnswer(); } catch { /* nothing to disarm */ }
}

// The salesman's explicit approval: Android shows its own "make Fasttracks your phone app?" dialog.
export async function enableAutoAnswer(native: DialerNative | null | undefined, onError?: (message: string) => void): Promise<'enabled' | 'declined' | 'not_available'> {
  if (!native) return 'not_available';
  try {
    return (await native.requestDialerRole()) ? 'enabled' : 'declined';
  } catch (err) {
    onError?.(err instanceof Error ? err.message : String(err)); // the native side says why (no screen, role unavailable): do not swallow it
    return 'not_available';
  }
}

// One line for the dialer screen. Personal calls (exotel=false) produce no text: they are the phone's business, not ours. Learn mode (a test aid, off by default)
// is the one exception: it shows the caller ID of the call that arrived during an armed window, which is how the real Exotel caller ID is checked on a device.
export function describeDialerEvent(e: DialerCallEvent): string | null {
  if (e.type === 'learn') return `Learn mode: the call that came in showed ${e.number ?? 'no number'}. It was NOT answered.`; // only while an attempt is armed
  if (!e.exotel) return null;
  if (e.type === 'auto_answered') return 'Answered automatically. Connecting the customer...';
  if (e.type === 'active') return 'Call connected.';
  if (e.type === 'ended') return 'Call ended.';
  return null;
}
