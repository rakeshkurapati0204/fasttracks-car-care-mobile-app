import { newDialKey, toE164India } from '../dial.ts';
import { IDLE, voipReducer } from './call-machine.ts';
import { messageOf, type VoipApi, type VoipCallHandle } from './place-call.ts';
import type { VoipEngine, VoipEvent, VoipStarted, VoipState } from './types.ts';

export type VoipCcmApi = VoipApi & {
  /** Places the call at Exotel (backend POST /calls/voip/start). Idempotent per callRef, so repeating it is safe. */
  start(callRef: string): Promise<VoipStarted>;
  /** Tells the backend the app gave up (agent leg did not arrive) or the user cancelled. Best effort. */
  cancel(callRef: string, reason: string): Promise<void>;
};

export const AGENT_LEG_WAIT_MS = 15_000;

// CCM flow. Salesman taps Call once:
//   1) backend validates the number and returns a callRef  2) SDK initialised with the subscriber token  3) engine ARMED to answer the agent leg silently
//   4) backend asks Exotel to connect (agent = this app's SIP identity, customer = the number)  5) Exotel's agent leg reaches the app and is auto-answered
//   (no ringtone, no notification, no Answer button)  6) Exotel dials the customer, the screen shows "Customer ringing", then "Connected".
// If the agent leg is not here within 15 s the call is cancelled and the backend is told. This function never throws; errors become a `failed` state.
export function placeVoipCcmCall(deps: {
  api: VoipCcmApi; engine: VoipEngine; onState: (s: VoipState) => void; digits: string;
  now?: () => number; agentLegWaitMs?: number; retryDelayMs?: number;
}): VoipCallHandle {
  const { api, engine, onState } = deps;
  const now = deps.now ?? Date.now;
  const waitMs = deps.agentLegWaitMs ?? AGENT_LEG_WAIT_MS;
  let state = IDLE;
  let off: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let callRef: string | null = null;
  let disposed = false;
  let cancelSent = false;

  const dispatch = (e: VoipEvent) => {
    const next = voipReducer(state, e);
    if (next !== state && !disposed) { state = next; onState(state); }
  };
  const stopTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const cancelAtBackend = (reason: string) => {
    if (!callRef || cancelSent) return;
    cancelSent = true;
    void api.cancel(callRef, reason).catch(() => undefined);
  };
  const fail = (error: string, reason: string) => {
    stopTimer();
    cancelAtBackend(reason);
    dispatch({ type: 'FAILED', error }); // first, so the engine's own "ended" event during hangup cannot turn this into a plain ended call
    off?.(); off = null;
    engine.disarmIncoming();
    engine.hangup();
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
      callRef = prepared.callRef;
      dispatch({ type: 'PREPARED' });
      const token = await api.token();
      await engine.initialize({ hostname: token.hostname, accountSid: token.accountSid, subscriberName: token.subscriberName, displayName: token.displayName, subscriberToken: token.subscriberToken });
      off = engine.subscribe((ev) => {
        if (ev.type === 'agent_leg') { stopTimer(); dispatch({ type: 'AGENT_LEG' }); }
        else if (ev.type === 'ringing') { stopTimer(); dispatch({ type: 'RINGING' }); }
        else if (ev.type === 'established') { stopTimer(); dispatch({ type: 'ESTABLISHED', at: now() }); }
        else if (ev.type === 'ended') { stopTimer(); if (state.phase !== 'connected') cancelAtBackend('ended-early'); dispatch({ type: 'ENDED', reason: ev.reason }); }
        else if (ev.type === 'failed') fail(ev.reason === 'network lost' ? 'Network lost. The call was stopped. Check the connection and try again.' : (ev.reason ?? 'The call failed.'), 'engine-failed');
      });
      engine.armIncoming(prepared.callRef); // armed BEFORE Exotel is asked, so the agent leg can never arrive unanswered
      timer = setTimeout(() => {
        if (state.phase === 'dialing' || state.phase === 'preparing') fail('Could not connect your phone to the call. Try again.', 'agent-leg-timeout');
      }, waitMs);
      await startWithOneRetry(prepared.callRef);
    } catch (err) {
      fail(messageOf(err), 'start-failed');
    }
  })();

  // A lost reply (no HTTP answer at all) is retried once: the backend treats /start as idempotent per callRef, so the customer is never rung twice.
  async function startWithOneRetry(ref: string) {
    try {
      await api.start(ref);
    } catch (err) {
      const e = err as { response?: unknown } | null;
      if (e?.response) throw err; // the server answered: that is a real refusal, not a lost reply
      await new Promise((r) => setTimeout(r, deps.retryDelayMs ?? 500));
      if (disposed || state.phase === 'failed' || state.phase === 'ended') return;
      await api.start(ref);
    }
  }

  function handle(): VoipCallHandle {
    return {
      getState: () => state,
      hangup: () => {
        stopTimer();
        const wasConnected = state.phase === 'connected';
        if (!wasConnected) cancelAtBackend('user-hangup'); // before the engine's "ended" event, so the reason is the user's
        engine.disarmIncoming();
        engine.hangup();
        dispatch({ type: 'ENDED', reason: 'hung up' });
      },
      mute: (on) => { engine.mute(on); dispatch({ type: 'MUTE', value: on }); },
      speaker: (on) => { engine.speaker(on); dispatch({ type: 'SPEAKER', value: on }); },
      dispose: () => { disposed = true; stopTimer(); off?.(); },
    };
  }
  return handle();
}
