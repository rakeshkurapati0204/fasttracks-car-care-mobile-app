// When to ask Android "make Fasttracks your phone app?". Automatic answer only works once Fasttracks is the phone app, so on a new phone the question is asked UP FRONT
// (when the dial pad opens), not in the middle of pressing Call, and a "no" is not remembered forever: it is asked again after a day. Pure, so it runs under `npm test`.

export const REASK_AFTER_MS = 24 * 60 * 60 * 1000;

export type AskInput = {
  /** The backend allows automatic answer AND this build has the phone-app module. */
  autoOn: boolean;
  /** Fasttracks is already the phone app. */
  isPhoneApp: boolean;
  /** When the question was last put to the salesman (ms since epoch), or null if never. */
  lastAskedAt: number | null;
  now: number;
};

export function shouldAskForRole(i: AskInput): boolean {
  if (!i.autoOn || i.isPhoneApp) return false;
  if (i.lastAskedAt === null) return true;
  return i.now - i.lastAskedAt >= REASK_AFTER_MS || i.lastAskedAt > i.now; // a clock that went backwards must not silence it for good
}
