import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactFormError, filterContacts, matchDialContacts, mobileDigits, pastedMobile, phoneBookRows, showPhone, type MyContact } from './contacts.ts';

const C = (name: string, phone: string, reason: string | null = null): MyContact => ({ id: name, phone, name, reason, createdAt: '2026-11-05T10:00:00Z' });

test('mobileDigits accepts the usual ways of writing an Indian mobile', () => {
  for (const v of ['9848012345', '98480 12345', '+91 98480 12345', '919848012345', '09848012345', '98480-12345']) assert.equal(mobileDigits(v), '9848012345', v);
});

test('mobileDigits refuses short, long, landline-style and non-mobile numbers', () => {
  for (const v of ['', '12345', '98480123', '98480123456', '5848012345', '04045901128', 'abcdefghij']) assert.equal(mobileDigits(v), null, v);
});

test('the form needs a name and a valid number', () => {
  assert.equal(contactFormError('Ravi', '9848012345'), null);
  assert.match(contactFormError('  ', '9848012345') ?? '', /name/i);
  assert.match(contactFormError('Ravi', '123') ?? '', /10-digit/);
  assert.match(contactFormError('A'.repeat(81), '9848012345') ?? '', /too long/);
});

test('showPhone groups +91 numbers and leaves others alone', () => {
  assert.equal(showPhone('+919848012345'), '+91 98480 12345');
  assert.equal(showPhone('+14155550123'), '+14155550123');
});

test('filterContacts finds by name, note or any part of the number', () => {
  const list = [C('Ravi Kumar', '+919848012345', 'Swift coating'), C('Anil', '+918019275252')];
  assert.deepEqual(filterContacts(list, 'ravi').map((c) => c.name), ['Ravi Kumar']);
  assert.deepEqual(filterContacts(list, 'COATING').map((c) => c.name), ['Ravi Kumar']);
  assert.deepEqual(filterContacts(list, '75252').map((c) => c.name), ['Anil']);
  assert.deepEqual(filterContacts(list, '+91 98480').map((c) => c.name), ['Ravi Kumar']);
  assert.equal(filterContacts(list, '  ').length, 2);
  assert.equal(filterContacts(list, 'zzz').length, 0);
});

test('pastedMobile finds the number inside pasted text, and refuses text without one', () => {
  for (const v of ['+91 98480 12345', 'Call 9848012345 now', '98480-12345', 'Ravi: +919848012345.', '09848012345']) assert.equal(pastedMobile(v), '9848012345', v);
  for (const v of ['', 'hello', '12345', '98480123456789', '5848012345']) assert.equal(pastedMobile(v), null, v);
});

test('phoneBookRows keeps each valid mobile once, with its contact name', () => {
  const rows = phoneBookRows([
    { name: ' Ravi Kumar ', phoneNumbers: [{ number: '+91 98480 12345' }, { number: '040 4590 1128' }, { number: '80192 75252' }] },
    { name: 'Ravi duplicate', phoneNumbers: [{ number: '9848012345' }] },
    { name: '', phoneNumbers: [{ number: '9000000001' }] },
    { name: 'No number', phoneNumbers: [] },
    { name: 'Nulls', phoneNumbers: null },
    { name: 'Anil', phoneNumbers: [{ number: null }, { number: '7396135252' }] },
  ]);
  assert.deepEqual(rows, [{ name: 'Ravi Kumar', phone: '9848012345' }, { name: 'Ravi Kumar', phone: '8019275252' }, { name: 'Anil', phone: '7396135252' }]);
});

test('dial pad shows the contact whose number is typed, and suggestions while typing', () => {
  const book = [{ name: 'Ravi', phone: '9848012345' }, { name: 'Anil', phone: '9000098480' }, { name: 'Ravi (app)', phone: '9848012345' }, { name: 'Zed', phone: '7000000001' }];
  assert.deepEqual(matchDialContacts(book, '98'), { exact: null, suggestions: [] }); // too short
  assert.deepEqual(matchDialContacts(book, '9848012345').exact, { name: 'Ravi', phone: '9848012345' }); // first source wins
  assert.deepEqual(matchDialContacts(book, '98480').suggestions.map((c) => c.name), ['Ravi', 'Anil']); // starts-with first
  assert.deepEqual(matchDialContacts(book, '9876543210'), { exact: null, suggestions: [] }); // unknown number
});
