import { newDialKey, toE164India } from '../dial.ts';
import { IDLE, voipReducer } from './call-machine.ts';
import type { VoipEngine, VoipEvent, VoipPrepared, VoipState, VoipToken } from './types.ts';

export type VoipApi = {
  prepare(phoneE164: string, idempotencyKey: string): Promise<VoipPrepared>;
  token(): Promise<VoipToken>;
};

export type VoipCallHandle = {
  getState(): VoipState;
  hangup(): void;
  mute(on: boolean): void;
  speaker(on: boolean): void;
  dispose(): void;
};

// Salesman taps Call: 1) the backend validates the customer's number and returns a callRef, 2) the SDK is initialised with the subscriber token,
// 3) the SDK dials Exotel's SIP Exophone with the callRef, 4) Exotel asks the backend whom to connect and rings the CUSTOMER. The salesman is not called.
// `onState` gets every state change. Errors become a `failed` state; this function never throws.
export function placeVoipCall(deps: { api: VoipApi; engine: VoipEngine; onState: (s: VoipState) => void; now?: () => number; digits: string }): VoipCallHandle {
  const { api, engine, onState } = deps;
  const now = deps.now ?? Date.now;
  let state = IDLE;
  let off: (() => void) | null = null;
  let disposed = false;

  const dispatch = (e: VoipEvent) => {
    const next = voipReducer(state, e);
    if (next !== state && !disposed) { state = next; onState(state); }
  };

  const e164 = toE164India(deps.digits);
  if (!e164) {
    dispatch({ type: 'START', number: deps.digits });
    dispatch({ type: 'FAILED', error: 'Enter a complete 10-digit mobile number.' });
    return handle();
  }
  dispatch({ type: 'START', number: e164 });

  void (async () => {
    try {
      const prepared = await api.prepare(e164, newDialKey());
      dispatch({ type: 'PREPARED' });
      const token = await api.token();
      await engine.initialize({ hostname: token.hostname, accountSid: token.accountSid, subscriberName: token.subscriberName, displayName: token.displayName, subscriberToken: token.subscriberToken });
      const sip = prepared.sipExophone ?? token.sipExophone;
      if (!sip) throw new Error('In-app calling has no SIP number configured yet.');
      off = engine.subscribe((ev) => {
        if (ev.type === 'initiated') dispatch({ type: 'INITIATED' });
        else if (ev.type === 'ringing') dispatch({ type: 'RINGING' });
        else if (ev.type === 'established') dispatch({ type: 'ESTABLISHED', at: now() });
        else if (ev.type === 'ended') dispatch({ type: 'ENDED', reason: ev.reason });
        else dispatch({ type: 'FAILED', error: ev.reason ?? 'The call failed.' });
      });
      engine.dial(sip, prepared.callRef);
    } catch (err) {
      dispatch({ type: 'FAILED', error: messageOf(err) });
    }
  })();

  function handle(): VoipCallHandle {
    return {
      getState: () => state,
      hangup: () => { engine.hangup(); dispatch({ type: 'ENDED', reason: 'hung up' }); },
      mute: (on) => { engine.mute(on); dispatch({ type: 'MUTE', value: on }); },
      speaker: (on) => { engine.speaker(on); dispatch({ type: 'SPEAKER', value: on }); },
      dispose: () => { disposed = true; off?.(); },
    };
  }
  return handle();
}

// The server's own message is specific ("Too many calls in a minute", "That is the company calling number"): show it as is.
export function messageOf(err: unknown): string {
  const e = err as { response?: { data?: { message?: string; error?: string } }; message?: string } | null;
  return e?.response?.data?.message ?? e?.response?.data?.error ?? e?.message ?? 'The call could not be placed.';
}
