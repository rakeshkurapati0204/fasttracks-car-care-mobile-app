import assert from 'node:assert/strict';
import test from 'node:test';

import { downloadFailureText, downloadStatus } from './download-errors.ts';

test('the status comes from the error itself or from an axios-style response', () => {
  assert.equal(downloadStatus({ status: 403 }), 403);
  assert.equal(downloadStatus({ response: { status: 500 } }), 500);
  assert.equal(downloadStatus(new Error('network')), null);
  assert.equal(downloadStatus(undefined), null);
  assert.equal(downloadStatus({ status: 0 }), null);
});

test('each kind of failure gets its own sentence, never the same line for all', () => {
  const texts = new Set([401, 403, 404, 413, 500, 418, undefined].map((status) => downloadFailureText(status === undefined ? null : { status }, 'The CSV')));
  assert.equal(texts.size, 7);
  assert.match(downloadFailureText({ status: 403 }, 'The CSV'), /not allowed/);
  assert.match(downloadFailureText({ status: 404 }), /does not have the download yet/);
  assert.match(downloadFailureText({ status: 500 }, 'The CSV'), /error 500/);
  assert.match(downloadFailureText({ status: 504 }), /shorter date range/);
  assert.match(downloadFailureText(null), /Could not reach the server/);
});
