// Pure helpers for the dialer pad (no React Native imports, so `npm test` can run them).
// Contract: POST /calls/dial { phone, idempotencyKey, confirm: true } (dashboard backend, routes/calls.ts). The backend decides who is
// called first (the signed-in user's own phone) and takes no other field; Exotel credentials never reach the app.

export const MOBILE_DIGITS = /^[6-9]\d{9}$/;

// The pad takes a 10-digit Indian mobile; the backend wants a complete E.164 number.
export function toE164India(digits: string): string | null {
  return MOBILE_DIGITS.test(digits) ? `+91${digits}` : null;
}

// One key per confirmed attempt; the backend accepts /^[A-Za-z0-9_-]{8,64}$/ and returns the same call for a repeated key.
export function newDialKey(now: number = Date.now(), random: () => number = Math.random): string {
  const rand = Array.from({ length: 12 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(random() * 36)]).join('');
  return `dial-${now.toString(36)}-${rand}`;
}

// Why the pad cannot place a call, from /calls/capabilities. null = it can.
// `callBack`: calling back a number from the call history does not need the dial pad switched on.
export function dialBlockedReason(caps: { callingEnabled?: boolean; canDial?: boolean; dialPadEnabled?: boolean } | null, opts: { callBack?: boolean } = {}): string | null {
  if (!caps) return "Can't reach the server. Check your internet and try again.";
  if (!caps.callingEnabled) return "Calling isn't available yet. Contact your manager.";
  if (!opts.callBack && (caps.dialPadEnabled === false || caps.dialPadEnabled === undefined)) return 'Calling from the dial pad is switched off. Contact your manager.';
  if (!caps.canDial) return 'Your account is not allowed to place calls.';
  return null;
}

export type DialErrorLike = { response?: { status?: number; data?: { error?: string; message?: string } } } | null | undefined;

// The server's own message is already specific (own number, no phone on profile, rate limit...). No response at all means the request
// may or may not have arrived, so the same idempotency key must be reused for a retry (a second call is never placed).
export function dialErrorText(err: DialErrorLike): { text: string; keepKey: boolean } {
  const data = err?.response?.data;
  if (!err?.response) return { text: 'Could not reach the server. Check your connection. If you try again, no second call is placed for this attempt.', keepKey: true };
  return { text: data?.message ?? data?.error ?? 'The call could not be placed.', keepKey: false };
}
