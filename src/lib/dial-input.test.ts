import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deleteBack, digitsFromClipboard, insertDigit, mobileFromPaste, spaced, type DialInput } from './dial-input.ts';

const S = (digits: string, start = digits.length, end = start): DialInput => ({ digits, start, end });

test('the number is grouped like the phone dialer', () => {
  assert.equal(spaced('98480'), '98480');
  assert.equal(spaced('9848012345'), '98480 12345');
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

test('Paste takes the mobile number out of copied text, or its digits, or nothing', () => {
  assert.equal(digitsFromClipboard('+91 98480 12345'), '9848012345');
  assert.equal(digitsFromClipboard('Call Rohit on 09848012345 today'), '9848012345');
  assert.equal(digitsFromClipboard('98480 123'), '98480123');
  assert.equal(digitsFromClipboard('12345678901234'), '1234567890');
  assert.equal(digitsFromClipboard('no number here'), null);
  assert.equal(digitsFromClipboard(''), null);
});
