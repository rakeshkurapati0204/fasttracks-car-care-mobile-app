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
export function dialBlockedReason(caps: { callingEnabled?: boolean; canDial?: boolean; dialPadEnabled?: boolean } | null): string | null {
  if (!caps) return 'Could not check whether calling is available. Check your connection and try again.';
  if (!caps.callingEnabled) return "Exotel calling isn't set up on the server yet.";
  if (caps.dialPadEnabled === false || caps.dialPadEnabled === undefined) return 'The dial pad is switched off on the server.';
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
