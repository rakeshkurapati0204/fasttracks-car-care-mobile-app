import type { VoipEngine, VoipEngineEvent, VoipSession } from './types.ts';

// What the native module (modules/exotel-voice) offers. Declared here, not imported, so this file stays free of React Native and runs under `npm test`.
export type NativeVoipModule = {
  sdkEnabled: boolean;
  initialize(hostname: string, accountSid: string, subscriberName: string, displayName: string, subscriberToken: string): Promise<void>;
  armIncoming(callRef: string): void;
  disarmIncoming(): void;
  hangup(): void;
  mute(on: boolean): void;
  speaker(on: boolean): void;
  addListener(event: 'onVoipEvent', listener: (e: { type: string; reason?: string | null }) => void): { remove(): void };
};

const KNOWN = new Set(['initiated', 'agent_leg', 'ringing', 'established', 'ended', 'failed']);

// Adapter from the native module to VoipEngine. Defence in depth for the CCM flow: even if the native side misbehaves, `agent_leg` is only passed on while the
// app is armed, so a stray leg can never move the call forward; and this adapter has no incoming-call path at all (no Answer, no ringtone, no notification).
export function createNativeVoipEngine(native: NativeVoipModule): VoipEngine {
  const listeners = new Set<(e: VoipEngineEvent) => void>();
  let sub: { remove(): void } | null = null;
  let armed = false;

  const emit = (e: VoipEngineEvent) => { for (const l of [...listeners]) l(e); };
  const onNative = (e: { type: string; reason?: string | null }) => {
    if (!KNOWN.has(e.type)) return;
    if (e.type === 'agent_leg' && !armed) return;
    if (e.type === 'ended' || e.type === 'failed') armed = false;
    emit({ type: e.type as VoipEngineEvent['type'], reason: e.reason ?? undefined });
  };

  return {
    isMock: false,
    async initialize(session: VoipSession) {
      if (!native.sdkEnabled) throw new Error('In-app calling is not available in this app build yet.');
      sub ??= native.addListener('onVoipEvent', onNative);
      await native.initialize(session.hostname, session.accountSid, session.subscriberName, session.displayName, session.subscriberToken);
    },
    dial() {
      // The Dial Whom flow (app dials the SIP Exophone) is not implemented natively: only the CCM flow is. Fail loudly instead of doing nothing.
      emit({ type: 'failed', reason: 'This build only supports the connect-agent calling flow.' });
    },
    armIncoming(callRef) { armed = true; native.armIncoming(callRef); },
    disarmIncoming() { armed = false; native.disarmIncoming(); },
    hangup() { armed = false; native.hangup(); },
    mute(on) { native.mute(on); },
    speaker(on) { native.speaker(on); },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
