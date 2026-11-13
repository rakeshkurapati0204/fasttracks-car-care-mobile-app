import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runInOrder } from './post-login.ts';

test('tasks run one at a time, in order: the next starts only after the previous has finished', async () => {
  const log: string[] = [];
  const slow = (name: string, ms: number) => async () => { log.push(`${name}:start`); await new Promise((r) => setTimeout(r, ms)); log.push(`${name}:end`); };
  await runInOrder([slow('push', 20), slow('contacts', 5)], () => false);
  assert.deepEqual(log, ['push:start', 'push:end', 'contacts:start', 'contacts:end']);
});

test('a task that throws does not stop the next one', async () => {
  const log: string[] = [];
  await runInOrder([async () => { throw new Error('boom'); }, async () => { log.push('second'); }], () => false);
  assert.deepEqual(log, ['second']);
});

test('cancelling (signing out) stops whatever has not started', async () => {
  let cancelled = false;
  const log: string[] = [];
  await runInOrder([async () => { log.push('first'); cancelled = true; }, async () => { log.push('second'); }], () => cancelled);
  assert.deepEqual(log, ['first']);
});
