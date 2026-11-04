import assert from 'node:assert/strict';
import { test } from 'node:test';

import { statusText, voipReducer, IDLE } from './call-machine.ts';
import { MockVoipEngine } from './mock-engine.ts';
import { placeVoipCcmCall, type VoipCcmApi } from './place-call-ccm.ts';
import type { VoipState } from './types.ts';

const TOKEN = { mock: true, hostname: 'mock://x', accountSid: 'a', subscriberName: 'ftabc', displayName: 'Sam', subscriberToken: 'mock-t' };
const PREPARED = { callRef: 'ftv0123456789abcdef01234567', sipExophone: null, subscriberName: 'ftabc', toDisplay: '+91 94594 51086' };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FAST = { agentLeg: 5, ringing: 5, established: 5, initiated: 1 };

type Log = { calls: string[] };
function fakeApi(over: Partial<VoipCcmApi> = {}): VoipCcmApi & Log {
  const calls: string[] = [];
  return {
    calls,
    prepare: async () => { calls.push('prepare'); return PREPARED; },
    token: async () => { calls.push('token'); return TOKEN },
    start: async (ref) => { calls.push(`start:${ref}`); return { callSid: 'CCMSID0001', deduped: false }; },
    cancel: async (ref, reason) => { calls.push(`cancel:${reason}`); void ref; },
    ...over,
  };
}
const phases = (seen: string[]) => (s: VoipState) => { if (seen.at(-1) !== s.phase) seen.push(s.phase); };

test('machine: agent leg answered silently moves to "Calling customer", then ringing, then connected', () => {
  let s = voipReducer(IDLE, { type: 'START', number: '+919459451086' });
  s = voipReducer(voipReducer(s, { type: 'PREPARED' }), { type: 'AGENT_LEG' });
  assert.equal(s.phase, 'calling');
  assert.equal(statusText(s), 'Calling customer...');
  s = voipReducer(s, { type: 'RINGING' });
  assert.equal(statusText(s), 'Customer ringing...');
  assert.equal(voipReducer(s, { type: 'ESTABLISHED', at: 5 }).phase, 'connected');
  assert.equal(voipReducer(voipReducer(s, { type: 'ENDED' }), { type: 'AGENT_LEG' }).phase, 'ended'); // a late agent leg cannot revive a finished call
});

test('CCM flow: prepare, token, arm, start, silent auto-answer, customer ringing, connected', async () => {
  const engine = new MockVoipEngine({ delays: FAST });
  const api = fakeApi();
  const seen: string[] = [];
  const h = placeVoipCcmCall({ api, engine, digits: '9459451086', onState: phases(seen), now: () => 77 });
  await wait(80);
  assert.deepEqual(api.calls, ['prepare', 'token', `start:${PREPARED.callRef}`]);
  assert.equal(engine.armedFor, PREPARED.callRef);
  assert.deepEqual(seen, ['preparing', 'dialing', 'calling', 'ringing', 'connected']);
  assert.equal(h.getState().connectedAt, 77);
  h.mute(true); h.speaker(true);
  assert.deepEqual([engine.muted, engine.speakerOn], [true, true]);
  h.hangup();
  assert.equal(h.getState().phase, 'ended');
  assert.ok(!api.calls.some((c) => c.startsWith('cancel')), 'a connected call is ended, not cancelled at the backend');
  h.dispose();
});

test('the agent leg is answered with NO ringtone, NO incoming screen and NO Answer button, and only when armed', async () => {
  const engine = new MockVoipEngine({ delays: FAST });
  const h = placeVoipCcmCall({ api: fakeApi(), engine, digits: '9459451086', onState: () => {} });
  await wait(60);
  assert.equal(engine.autoAnswered, true);
  assert.equal(engine.incomingUiShown, false);
  h.dispose();

  // disarmed before the leg arrives: it is rejected, never answered
  const late = new MockVoipEngine({ delays: { agentLeg: 20 } });
  late.armIncoming('ftvx');
  late.disarmIncoming();
  await wait(60);
  assert.equal(late.autoAnswered, false);
  assert.equal(late.rejectedLegs, 1);
});

test('agent leg never arrives within the wait: the call fails, the engine is released and the BACKEND IS TOLD', async () => {
  const engine = new MockVoipEngine({ agentLeg: 'never' });
  const api = fakeApi();
  const seen: string[] = [];
  const states: VoipState[] = [];
  placeVoipCcmCall({ api, engine, digits: '9459451086', onState: (s) => { phases(seen)(s); states.push(s); }, agentLegWaitMs: 40 });
  await wait(120);
  assert.equal(seen.at(-1), 'failed');
  assert.match(states.at(-1)?.error ?? '', /Could not connect your phone/);
  assert.ok(api.calls.includes('cancel:agent-leg-timeout'));
  assert.equal(engine.armedFor, null);
});

test('a leg that arrives after the timeout is not answered and cannot revive the call', async () => {
  const engine = new MockVoipEngine({ delays: { agentLeg: 80, ringing: 5, established: 5 } });
  const seen: string[] = [];
  placeVoipCcmCall({ api: fakeApi(), engine, digits: '9459451086', onState: phases(seen), agentLegWaitMs: 30 });
  await wait(200);
  assert.equal(seen.at(-1), 'failed');
  assert.ok(!seen.includes('calling'));
  assert.equal(engine.autoAnswered, false);
});

test('customer does not answer: the call ends and the backend is told it was never connected', async () => {
  const engine = new MockVoipEngine({ delays: FAST, customer: 'no-answer' });
  const api = fakeApi();
  const states: VoipState[] = [];
  placeVoipCcmCall({ api, engine, digits: '9459451086', onState: (s) => states.push(s) });
  await wait(120);
  assert.equal(states.at(-1)?.phase, 'ended');
  assert.equal(states.at(-1)?.endedReason, 'customer did not answer');
  assert.ok(!states.some((s) => s.phase === 'connected'));
});

test('network lost mid-call: a clear message, the call is stopped', async () => {
  const engine = new MockVoipEngine({ delays: FAST, customer: 'network-loss' });
  const states: VoipState[] = [];
  placeVoipCcmCall({ api: fakeApi(), engine, digits: '9459451086', onState: (s) => states.push(s) });
  await wait(100);
  assert.equal(states.at(-1)?.phase, 'failed');
  assert.match(states.at(-1)?.error ?? '', /Network lost/);
});

test('start lost on the network (no reply): retried ONCE with the SAME callRef (the backend is idempotent), then the call goes on', async () => {
  let n = 0;
  const api = fakeApi({ start: async (ref) => { n++; api.calls.push(`start:${ref}`); if (n === 1) throw new Error('Network Error'); return { callSid: 'CCMSID0001', deduped: true }; } });
  const engine = new MockVoipEngine({ delays: FAST });
  const seen: string[] = [];
  placeVoipCcmCall({ api, engine, digits: '9459451086', onState: phases(seen), retryDelayMs: 5 });
  await wait(120);
  assert.equal(n, 2);
  assert.equal(api.calls.filter((c) => c.startsWith('start:')).length, 2);
  assert.ok(new Set(api.calls.filter((c) => c.startsWith('start:'))).size === 1, 'same callRef both times');
  assert.equal(seen.at(-1), 'connected');
});

test('start fails twice: the call fails, the engine is released, backend told', async () => {
  const api = fakeApi({ start: async () => { throw new Error('Network Error'); } });
  const engine = new MockVoipEngine({ delays: FAST });
  const states: VoipState[] = [];
  placeVoipCcmCall({ api, engine, digits: '9459451086', onState: (s) => states.push(s), retryDelayMs: 5 });
  await wait(100);
  assert.equal(states.at(-1)?.phase, 'failed');
  assert.ok(api.calls.includes('cancel:start-failed'));
  assert.equal(engine.armedFor, null);
});

test('the server refusing the start (agent busy) is NOT retried and its own message is shown', async () => {
  let n = 0;
  const api = fakeApi({ start: async () => { n++; throw { response: { data: { error: 'AGENT_BUSY', message: 'You are already on another call.' } } }; } });
  const states: VoipState[] = [];
  placeVoipCcmCall({ api, engine: new MockVoipEngine({ delays: FAST }), digits: '9459451086', onState: (s) => states.push(s), retryDelayMs: 5 });
  await wait(100);
  assert.equal(n, 1);
  assert.equal(states.at(-1)?.error, 'You are already on another call.');
});

test('hanging up while waiting for the agent leg cancels at the backend and the engine never answers later', async () => {
  const engine = new MockVoipEngine({ delays: { agentLeg: 60, ringing: 5, established: 5 } });
  const api = fakeApi();
  const h = placeVoipCcmCall({ api, engine, digits: '9459451086', onState: () => {} });
  await wait(20);
  h.hangup();
  await wait(150);
  assert.equal(h.getState().phase, 'ended');
  assert.ok(api.calls.includes('cancel:user-hangup'));
  assert.equal(engine.autoAnswered, false);
});

test('an invalid number fails at once and calls nothing', async () => {
  const api = fakeApi();
  const states: VoipState[] = [];
  placeVoipCcmCall({ api, engine: new MockVoipEngine(), digits: '12345', onState: (s) => states.push(s) });
  await wait(10);
  assert.equal(states.at(-1)?.phase, 'failed');
  assert.deepEqual(api.calls, []);
});
