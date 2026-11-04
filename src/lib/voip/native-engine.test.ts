import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createNativeVoipEngine, type NativeVoipModule } from './native-engine.ts';
import type { VoipEngineEvent } from './types.ts';

const SESSION = { hostname: 'h', accountSid: 'a', subscriberName: 'ftabc', displayName: 'Sam', subscriberToken: 't' };

function fakeNative(sdkEnabled: boolean) {
  const calls: string[] = [];
  let listener: ((e: { type: string; reason?: string | null }) => void) | null = null;
  const mod: NativeVoipModule = {
    sdkEnabled,
    initialize: async () => { calls.push('initialize'); },
    armIncoming: (ref) => { calls.push(`arm:${ref}`); },
    disarmIncoming: () => { calls.push('disarm'); },
    hangup: () => { calls.push('hangup'); },
    mute: (on) => { calls.push(`mute:${on}`); },
    speaker: (on) => { calls.push(`speaker:${on}`); },
    addListener: (_e, l) => { listener = l; return { remove: () => { listener = null; } }; },
  };
  return { mod, calls, fire: (type: string, reason?: string) => listener?.({ type, reason }) };
}

test('while the SDK is not linked (current state) initialize refuses and nothing reaches the native side', async () => {
  const n = fakeNative(false);
  const engine = createNativeVoipEngine(n.mod);
  await assert.rejects(() => engine.initialize(SESSION), /not available in this app build/);
  assert.deepEqual(n.calls, []);
});

test('with the SDK enabled it forwards controls and events; agent_leg only counts while armed', async () => {
  const n = fakeNative(true);
  const engine = createNativeVoipEngine(n.mod);
  const seen: VoipEngineEvent[] = [];
  engine.subscribe((e) => seen.push(e));
  await engine.initialize(SESSION);
  n.fire('agent_leg'); // not armed: ignored
  engine.armIncoming('ftvabc');
  n.fire('agent_leg'); n.fire('ringing'); n.fire('established'); n.fire('bogus'); n.fire('ended', 'customer hung up');
  engine.mute(true); engine.speaker(true);
  assert.deepEqual(seen.map((e) => e.type), ['agent_leg', 'ringing', 'established', 'ended']);
  assert.equal(seen[3].reason, 'customer hung up');
  assert.deepEqual(n.calls, ['initialize', 'arm:ftvabc', 'mute:true', 'speaker:true']);
  n.fire('agent_leg'); // armed state was cleared by "ended": a stray leg is ignored again
  assert.equal(seen.length, 4);
  engine.disarmIncoming(); engine.hangup();
  assert.deepEqual(n.calls.slice(-2), ['disarm', 'hangup']);
});

test('the Dial Whom flow is not supported natively and says so', () => {
  const engine = createNativeVoipEngine(fakeNative(true).mod);
  const seen: VoipEngineEvent[] = [];
  engine.subscribe((e) => seen.push(e));
  engine.dial('sip:x', 'ftv');
  assert.equal(seen[0].type, 'failed');
});
