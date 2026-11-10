import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canSyncContacts, EMPTY_SYNC_STATE, nextSyncStep, parseSyncState, RESYNC_AFTER_MS, syncKey } from './contact-sync.ts';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

test('a new user is asked once', () => {
  assert.equal(nextSyncStep(EMPTY_SYNC_STATE, NOW), 'ask');
});

test('someone who said no is never asked or synced again', () => {
  assert.equal(nextSyncStep({ asked: true, agreed: false, lastSyncAt: null }, NOW), 'skip');
});

test('someone who said yes is copied straight away, then at most once a day', () => {
  assert.equal(nextSyncStep({ asked: true, agreed: true, lastSyncAt: null }, NOW), 'sync');
  assert.equal(nextSyncStep({ asked: true, agreed: true, lastSyncAt: ago(60_000) }, NOW), 'skip');
  assert.equal(nextSyncStep({ asked: true, agreed: true, lastSyncAt: ago(RESYNC_AFTER_MS + 1000) }, NOW), 'sync');
});

test('a corrupt saved state starts over instead of crashing', () => {
  assert.deepEqual(parseSyncState('not json'), EMPTY_SYNC_STATE);
  assert.deepEqual(parseSyncState(null), EMPTY_SYNC_STATE);
  assert.equal(nextSyncStep({ asked: true, agreed: true, lastSyncAt: 'garbage' }, NOW), 'sync');
});

test('only roles that can save contacts are synced; the key is storage-safe', () => {
  for (const r of ['OWNER', 'STORE_MANAGER', 'SALES']) assert.equal(canSyncContacts(r), true);
  for (const r of ['STAFF', 'HR', '', undefined, null]) assert.equal(canSyncContacts(r as string), false);
  assert.match(syncKey('a1b2-c3d4'), /^[A-Za-z0-9._-]+$/);
  assert.match(syncKey('we ird/id'), /^[A-Za-z0-9._-]+$/);
});
