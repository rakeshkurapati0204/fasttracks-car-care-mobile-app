import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyFieldText, deleteBack, insertDigit, mobileFromPaste, spaced, toDigit, toField, type DialInput } from './dial-input.ts';

const S = (digits: string, start = digits.length, end = start): DialInput => ({ digits, start, end });

test('the number is grouped like the phone dialer', () => {
  assert.equal(spaced('98480'), '98480');
  assert.equal(spaced('9848012345'), '98480 12345');
});

test('cursor positions map across the space', () => {
  assert.equal(toField(5, 10), 5);
  assert.equal(toField(6, 10), 7);
  assert.equal(toDigit(6, 10), 5); // right after the space = after the 5th digit
  assert.equal(toDigit(7, 10), 6);
  assert.equal(toDigit(99, 10), 10);
  assert.equal(toDigit(3, 4), 3);
});

test('keypad types at the cursor, not only at the end', () => {
  assert.deepEqual(insertDigit(S('98480'), '1'), S('984801'));
  assert.deepEqual(insertDigit(S('98480', 2), '7'), S('987480', 3));
  assert.deepEqual(insertDigit(S('9848012345'), '6'), S('9848012345')); // full: ignored
  assert.deepEqual(insertDigit(S('9848012345', 0, 10), '7'), S('7', 1)); // all selected: replaced
});

test('delete removes the digit before the cursor, or the selection', () => {
  assert.deepEqual(deleteBack(S('98480')), S('9848'));
  assert.deepEqual(deleteBack(S('98480', 2)), S('9480', 1));
  assert.deepEqual(deleteBack(S('98480', 0)), S('98480', 0));
  assert.deepEqual(deleteBack(S('9848012345', 2, 7)), S('98345', 2));
});

test('pasted numbers are found even with invisible characters from contacts or WhatsApp', () => {
  for (const v of [
    '+91 98480 12345', '\u202A+91 98480 12345\u202C', '+91\u00A098480\u00A012345', '(+91) 98480-12345', '+91-98480-12345',
    '919848012345', '09848012345', '\u2066+919848012345\u2069', 'Ravi Kumar\n+91 98480 12345', '98480\u200B12345',
  ]) assert.equal(mobileFromPaste(v), '9848012345', JSON.stringify(v));
  for (const v of ['', 'hello', '12345', '5848012345', '040 4590 1128']) assert.equal(mobileFromPaste(v), null, v);
});

test('pasting a full number into the field replaces what was there', () => {
  assert.deepEqual(applyFieldText(S(''), '\u202A+91 98480 12345\u202C'), S('9848012345'));
  assert.deepEqual(applyFieldText(S('123'), '123+91 98480 12345'), S('9848012345'));
});

test('cut and typing through the field keep the digits', () => {
  assert.deepEqual(applyFieldText(S('9848012345', 0, 10), ''), S(''));
  assert.deepEqual(applyFieldText(S('98480'), '984801'), S('984801'));
  assert.deepEqual(applyFieldText(S('98480', 2), '987480'), S('987480', 3));
});
