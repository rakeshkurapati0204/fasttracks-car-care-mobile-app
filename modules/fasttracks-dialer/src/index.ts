// JS side of the local module. `requireOptionalNativeModule` returns null in Expo Go, on web and in any build without the module: the app then simply has
// no automatic answer and the existing calling flow is unchanged.
import { requireOptionalNativeModule } from 'expo-modules-core';

export type DialerCallEvent = {
  /** incoming | auto_answered | active | ringing | dialing | holding | disconnected | outgoing | ended | learn */
  type: string;
  /** true only for a call this app auto-answered */
  exotel: boolean;
  state: string;
  /** only in learn mode */
  number?: string | null;
};

export type FasttracksDialerNative = {
  isDefaultDialer(): boolean;
  getStatus(): { isDefaultDialer: boolean; sdkInt: number; armed: boolean; learnOnly: boolean };
  requestDialerRole(): Promise<boolean>;
  armAutoAnswer(callerIds: string[], windowSeconds: number): boolean;
  disarmAutoAnswer(): void;
  setCallLabel?(label: string): void;
  setLearnMode(on: boolean): void;
  addListener(event: 'onCallEvent', listener: (e: DialerCallEvent) => void): { remove(): void };
};

export const FasttracksDialer = requireOptionalNativeModule<FasttracksDialerNative>('FasttracksDialer');
