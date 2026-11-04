// In-app VoIP calling, app-originated: the app dials Exotel's SIP Exophone through Exotel's Voice SDK and Exotel rings the CUSTOMER. The salesman
// never receives a call (not on the SIM, not in the app), so there is no "Answer" anywhere in this flow.
// Nothing here imports React Native or the SDK, so it runs under `npm test`.

export type VoipPhase = 'idle' | 'preparing' | 'dialing' | 'calling' | 'ringing' | 'connected' | 'ended' | 'failed';

export type VoipState = {
  phase: VoipPhase;
  number: string | null;
  muted: boolean;
  speaker: boolean;
  connectedAt: number | null;
  error: string | null;
  endedReason: string | null;
};

export type VoipEvent =
  | { type: 'START'; number: string }
  | { type: 'PREPARED' }
  | { type: 'INITIATED' }
  | { type: 'AGENT_LEG' }
  | { type: 'RINGING' }
  | { type: 'ESTABLISHED'; at: number }
  | { type: 'ENDED'; reason?: string }
  | { type: 'FAILED'; error: string }
  | { type: 'MUTE'; value: boolean }
  | { type: 'SPEAKER'; value: boolean }
  | { type: 'RESET' };

// What the native SDK (or the mock) reports. Names follow the SDK's CallListener (onCallInitiated, onCallRinging, onCallEstablished, onCallEnded).
// `agent_leg` is only used by the CCM flow: Exotel's agent leg reached the app and the engine ANSWERED IT ITSELF (no ringtone, no notification, no Answer button).
export type VoipEngineEvent = { type: 'initiated' | 'agent_leg' | 'ringing' | 'established' | 'ended' | 'failed'; reason?: string };

export type VoipSession = {
  hostname: string;
  accountSid: string;
  subscriberName: string;
  displayName: string;
  subscriberToken: string;
};

export interface VoipEngine {
  /** True for the in-memory stand-in: it places no call and never reaches Exotel. */
  readonly isMock: boolean;
  initialize(session: VoipSession): Promise<void>;
  /** `callRef` is passed to the SDK as the call's CustomField; the backend binds the customer's number to it. */
  dial(sipExophone: string, callRef: string): void;
  /**
   * CCM flow: get ready for the ONE incoming agent leg that Exotel is about to send for `callRef`, and answer it silently the moment it arrives.
   * Contract for every engine (the native one too): never show an incoming-call screen, never ring, never post an incoming-call notification, and
   * never answer a leg while not armed. Emits `agent_leg` once answered, then `ringing` (customer's phone ringing) and `established` (customer answered).
   */
  armIncoming(callRef: string): void;
  /** Stop waiting for the agent leg (timeout, cancel). Any leg that arrives after this is rejected, not answered. */
  disarmIncoming(): void;
  hangup(): void;
  mute(on: boolean): void;
  speaker(on: boolean): void;
  subscribe(listener: (event: VoipEngineEvent) => void): () => void;
}

export type VoipStarted = { callSid: string; deduped: boolean };
export type VoipPrepared = { callRef: string; sipExophone: string | null; subscriberName: string; toDisplay: string };
export type VoipToken = { mock?: boolean; hostname: string; accountSid: string; subscriberName: string; displayName: string; subscriberToken: string; sipExophone?: string };
