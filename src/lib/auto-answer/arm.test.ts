import assert from 'node:assert/strict';
import { test } from 'node:test';

import { armAutoAnswer, describeDialerEvent, disarmAutoAnswer, enableAutoAnswer, sanitizeHint, type DialerNative } from './arm.ts';

function fakeNative(over: Partial<DialerNative> & { isDefault?: boolean; accept?: boolean } = {}) {
  const calls: string[] = [];
  const n: DialerNative = {
    isDefaultDialer: () => over.isDefault ?? true,
    requestDialerRole: async () => over.accept ?? true,
    armAutoAnswer: (ids, secs) => { calls.push(`arm:${ids.join(',')}:${secs}`); return true; },
    disarmAutoAnswer: () => { calls.push('disarm'); },
    ...over,
  };
  return { n, calls };
}
const HINT = { callerIds: ['+914045901128'], windowSeconds: 90 };

test('a good hint arms exactly one attempt with the ExoPhone and the window', () => {
  const { n, calls } = fakeNative();
  assert.deepEqual(armAutoAnswer(n, HINT), { armed: true, windowSeconds: 90 });
  assert.deepEqual(calls, ['arm:+914045901128:90']);
});

test('nothing is armed without a hint (flag off or a repeated request), without the native module, or when not the phone app', () => {
  const { n, calls } = fakeNative({ isDefault: false });
  assert.deepEqual(armAutoAnswer(n, undefined), { armed: false, reason: 'no_hint' });
  assert.deepEqual(armAutoAnswer(n, null), { armed: false, reason: 'no_hint' });
  assert.deepEqual(armAutoAnswer(null, HINT), { armed: false, reason: 'not_available' });
  assert.deepEqual(armAutoAnswer(n, HINT), { armed: false, reason: 'not_default_dialer' });
  assert.deepEqual(calls, []);
});

test('broad or broken hints are refused: short caller IDs, no IDs, no or silly window', () => {
  const { n, calls } = fakeNative();
  for (const bad of [{ callerIds: ['1128'], windowSeconds: 60 }, { callerIds: [], windowSeconds: 60 }, { callerIds: ['+914045901128'] }, { callerIds: ['+914045901128'], windowSeconds: 0 },
    { callerIds: ['+914045901128'], windowSeconds: -5 }, { callerIds: 'x', windowSeconds: 60 }, 'nope', 42, {}]) {
    assert.deepEqual(armAutoAnswer(n, bad), { armed: false, reason: 'invalid_hint' }, JSON.stringify(bad));
  }
  assert.deepEqual(calls, []);
});

test('the window is capped at 3 minutes and caller IDs are de-duplicated; short ones next to good ones are dropped', () => {
  assert.deepEqual(sanitizeHint({ callerIds: ['+914045901128', '+914045901128', '99'], windowSeconds: 9999 }), { callerIds: ['+914045901128'], windowSeconds: 180 });
});

test('a native refusal or a native exception never breaks the call flow', () => {
  assert.deepEqual(armAutoAnswer(fakeNative({ armAutoAnswer: () => false }).n, HINT), { armed: false, reason: 'native_refused' });
  assert.deepEqual(armAutoAnswer(fakeNative({ armAutoAnswer: () => { throw new Error('boom'); } }).n, HINT), { armed: false, reason: 'native_refused' });
});

test('disarm clears the attempt and never throws', () => {
  const { n, calls } = fakeNative();
  disarmAutoAnswer(n);
  disarmAutoAnswer(null);
  disarmAutoAnswer(fakeNative({ disarmAutoAnswer: () => { throw new Error('x'); } }).n);
  assert.deepEqual(calls, ['disarm']);
});

test('the phone-app role is requested only when the user taps and approves', async () => {
  assert.equal(await enableAutoAnswer(fakeNative({ accept: true }).n), 'enabled');
  assert.equal(await enableAutoAnswer(fakeNative({ accept: false }).n), 'declined');
  assert.equal(await enableAutoAnswer(null), 'not_available');
  assert.equal(await enableAutoAnswer(fakeNative({ requestDialerRole: async () => { throw new Error('no screen'); } }).n), 'not_available');
});

test('only Exotel calls produce screen text; personal calls produce none', () => {
  assert.match(describeDialerEvent({ type: 'auto_answered', exotel: true, state: 'answering' }) ?? '', /Answered automatically/);
  assert.equal(describeDialerEvent({ type: 'incoming', exotel: false, state: 'ringing' }), null);
  assert.equal(describeDialerEvent({ type: 'ended', exotel: false, state: 'disconnected' }), null);
  assert.match(describeDialerEvent({ type: 'learn', exotel: false, state: 'ringing', number: '+914045901128' }) ?? '', /NOT answered/); // test aid only
});

test('the native error is reported, not swallowed', async () => {
  let seen = '';
  await enableAutoAnswer(fakeNative({ requestDialerRole: async () => { throw new Error('NO_ACTIVITY'); } }).n, (m) => { seen = m; });
  assert.equal(seen, 'NO_ACTIVITY');
});
