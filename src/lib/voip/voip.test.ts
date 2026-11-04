import assert from 'node:assert/strict';
import { test } from 'node:test';

import { elapsedText, IDLE, isActive, isFinished, statusText, voipReducer } from './call-machine.ts';
import { MockVoipEngine } from './mock-engine.ts';
import { messageOf, placeVoipCall, type VoipApi } from './place-call.ts';
import type { VoipState } from './types.ts';

const TOKEN = { mock: true, hostname: 'mock://x', accountSid: 'a', subscriberName: 'ftabc', displayName: 'Sam', subscriberToken: 'mock-t', sipExophone: 'sip:mock' };
const PREPARED = { callRef: 'ftv0123456789abcdef01234567', sipExophone: 'sip:mock-exophone', subscriberName: 'ftabc', toDisplay: '+91 94594 51086' };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fakeApi(over: Partial<VoipApi> = {}): VoipApi & { prepared: string[] } {
  const prepared: string[] = [];
  return { prepared, prepare: async (p) => { prepared.push(p); return PREPARED; }, token: async () => TOKEN, ...over };
}

test('state machine: the normal call goes preparing > dialing > ringing > connected > ended', () => {
  let s: VoipState = voipReducer(IDLE, { type: 'START', number: '+919459451086' });
  assert.equal(s.phase, 'preparing');
  for (const [e, phase] of [[{ type: 'PREPARED' }, 'dialing'], [{ type: 'RINGING' }, 'ringing'], [{ type: 'ESTABLISHED', at: 1000 }, 'connected'], [{ type: 'ENDED', reason: 'hung up' }, 'ended']] as const) {
    s = voipReducer(s, e);
    assert.equal(s.phase, phase);
  }
  assert.equal(s.connectedAt, 1000);
  assert.equal(isFinished(s), true);
});

test('state machine: a finished call is never revived by a late event; a new START is possible only after it', () => {
  let s = voipReducer(voipReducer(IDLE, { type: 'START', number: '+919459451086' }), { type: 'FAILED', error: 'x' });
  for (const e of [{ type: 'RINGING' }, { type: 'ESTABLISHED', at: 5 }, { type: 'ENDED' }, { type: 'MUTE', value: true }] as const) assert.equal(voipReducer(s, e).phase, 'failed');
  assert.equal(voipReducer(s, { type: 'MUTE', value: true }).muted, false);
  s = voipReducer(s, { type: 'START', number: '+919000000001' });
  assert.equal(s.phase, 'preparing');
  assert.equal(voipReducer(s, { type: 'START', number: '+919000000002' }), s); // a second START while active is ignored
});

test('controls only work during a call, and the timer starts when it connects', () => {
  assert.equal(voipReducer(IDLE, { type: 'MUTE', value: true }).muted, false);
  let s = voipReducer(voipReducer(IDLE, { type: 'START', number: '+919459451086' }), { type: 'SPEAKER', value: true });
  assert.equal(s.speaker, true);
  assert.equal(elapsedText(s, 10_000), '0:00');
  s = voipReducer(voipReducer(s, { type: 'PREPARED' }), { type: 'ESTABLISHED', at: 1_000 });
  assert.equal(elapsedText(s, 66_000), '1:05');
  assert.equal(isActive(s), true);
  assert.match(statusText(voipReducer(s, { type: 'ENDED', reason: 'hung up' })), /ended \(hung up\)/);
});

test('place a call: validate and prepare, initialise, dial the SIP Exophone with the callRef, then ring and connect', async () => {
  const engine = new MockVoipEngine({ delays: { initiated: 1, ringing: 5, established: 5 } });
  const api = fakeApi();
  const seen: string[] = [];
  const h = placeVoipCall({ api, engine, digits: '9459451086', onState: (s) => { if (seen.at(-1) !== s.phase) seen.push(s.phase); }, now: () => 42 });
  await wait(80);
  assert.deepEqual(api.prepared, ['+919459451086']);
  assert.deepEqual(engine.dialled, { sipExophone: 'sip:mock-exophone', callRef: PREPARED.callRef });
  assert.equal(engine.initialisedWith?.subscriberName, 'ftabc');
  assert.deepEqual(seen, ['preparing', 'dialing', 'ringing', 'connected']);
  assert.equal(h.getState().connectedAt, 42);
  h.mute(true); h.speaker(true);
  assert.deepEqual([engine.muted, engine.speakerOn, h.getState().muted, h.getState().speaker], [true, true, true, true]);
  h.hangup();
  assert.equal(h.getState().phase, 'ended');
  h.dispose();
});

test('the salesman is never called: the flow has no incoming-call path at all', async () => {
  const engine = new MockVoipEngine({ delays: { initiated: 1, ringing: 2, established: 2 } });
  const events: string[] = [];
  engine.subscribe((e) => events.push(e.type));
  placeVoipCall({ api: fakeApi(), engine, digits: '9459451086', onState: () => {} });
  await wait(60);
  assert.ok(!events.includes('incoming' as never));
  assert.deepEqual(events, ['initiated', 'ringing', 'established']);
});

test('an invalid number fails at once and calls nothing', async () => {
  const api = fakeApi();
  const engine = new MockVoipEngine();
  const states: VoipState[] = [];
  placeVoipCall({ api, engine, digits: '12345', onState: (s) => states.push(s) });
  await wait(10);
  assert.equal(states.at(-1)?.phase, 'failed');
  assert.deepEqual(api.prepared, []);
  assert.equal(engine.dialled, null);
});

test('the server\'s own message is shown when the backend refuses (rate limit, company number...)', async () => {
  const api = fakeApi({ prepare: async () => { throw { response: { data: { error: 'RATE_LIMITED', message: 'Too many calls in a minute. Wait a moment.' } } }; } });
  const engine = new MockVoipEngine();
  const states: VoipState[] = [];
  placeVoipCall({ api, engine, digits: '9459451086', onState: (s) => states.push(s) });
  await wait(20);
  assert.equal(states.at(-1)?.phase, 'failed');
  assert.equal(states.at(-1)?.error, 'Too many calls in a minute. Wait a moment.');
  assert.equal(engine.dialled, null);
});

test('failures at each step end the call cleanly: token, initialise, no SIP number, SDK failure', async () => {
  const cases: [string, VoipApi, MockVoipEngine, RegExp][] = [
    ['token', fakeApi({ token: async () => { throw new Error('token down'); } }), new MockVoipEngine(), /token down/],
    ['initialise', fakeApi(), new MockVoipEngine({ failInit: 'auth failed' }), /auth failed/],
    ['no sip', fakeApi({ prepare: async () => ({ ...PREPARED, sipExophone: null }), token: async () => ({ ...TOKEN, sipExophone: undefined }) }), new MockVoipEngine(), /no SIP number/],
    ['sdk', fakeApi(), new MockVoipEngine({ delays: { initiated: 1, ringing: 2 }, failDial: 'CONGESTION_ERROR' }), /CONGESTION_ERROR/],
  ];
  for (const [name, api, engine, re] of cases) {
    const states: VoipState[] = [];
    placeVoipCall({ api, engine, digits: '9459451086', onState: (s) => states.push(s) });
    await wait(40);
    assert.equal(states.at(-1)?.phase, 'failed', name);
    assert.match(states.at(-1)?.error ?? '', re, name);
  }
});

test('hanging up before the call connects ends it and stops the mock\'s later events', async () => {
  const engine = new MockVoipEngine({ delays: { initiated: 1, ringing: 30, established: 30 } });
  const states: string[] = [];
  const h = placeVoipCall({ api: fakeApi(), engine, digits: '9459451086', onState: (s) => states.push(s.phase) });
  await wait(15);
  h.hangup();
  await wait(100);
  assert.equal(states.at(-1), 'ended');
  assert.ok(!states.includes('connected'));
});

test('messageOf prefers the server message, then the error text', () => {
  assert.equal(messageOf({ response: { data: { message: 'm', error: 'E' } } }), 'm');
  assert.equal(messageOf({ response: { data: { error: 'E' } } }), 'E');
  assert.equal(messageOf(new Error('boom')), 'boom');
  assert.equal(messageOf(null), 'The call could not be placed.');
});
