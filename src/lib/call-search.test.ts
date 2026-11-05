// The owner searches calls by a number: as shown, as plain digits, or by its last digits.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { callMatchesSearch } from './call-search.ts';

const call = (id: string, customer: string) => ({ callId: id, salesperson: 'Vamsi', salespersonPhone: '+91 80192 15252', customerPhone: customer });
const calls = [call('a', '+91 98480 12345'), call('b', '+91 90000 11111'), call('c', '****1086')];
const find = (q: string) => calls.filter((c) => callMatchesSearch(c, q)).map((c) => c.callId);

test('a number is found as shown, as plain digits, and by its last digits', () => {
  assert.deepEqual(find('+91 98480 12345'), ['a']);
  assert.deepEqual(find('9848012345'), ['a']);
  assert.deepEqual(find('12345'), ['a']);
  assert.deepEqual(find('11111'), ['b']);
});

test('the salesperson number, a masked number and the transcript are searchable; an unknown number finds nothing; empty finds all', () => {
  assert.deepEqual(find('8019215252'), ['a', 'b', 'c']);
  assert.deepEqual(find('1086'), ['c']);
  assert.deepEqual(find('7777777'), []);
  assert.deepEqual(find('  '), ['a', 'b', 'c']);
  assert.equal(callMatchesSearch({ ...calls[0], transcript: 'CUSTOMER: ceramic coating' }, 'ceramic'), true);
});
