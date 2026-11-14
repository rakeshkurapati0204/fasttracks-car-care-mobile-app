// The dial pad's number field, as plain functions (no React, so node --test runs them). The field shows the digits grouped "98480 12345" and has a
// real cursor: keypad presses and Delete work at the cursor, and Android's own long-press menu (Paste / Copy / Cut / Select all) works on it.
// Positions: "digit index" counts digits only; "field index" counts characters on screen, including the one space after the 5th digit.
import { pastedMobile } from './contacts.ts';

export const MAX_DIGITS = 10;

export type DialInput = { digits: string; start: number; end: number };

export function spaced(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

const clamp = (s: DialInput): DialInput => {
  const start = Math.max(0, Math.min(s.digits.length, s.start));
  return { digits: s.digits, start, end: Math.max(start, Math.min(s.digits.length, s.end)) };
};

/** A keypad press: replaces the selection, or inserts at the cursor. Ignored when the number is full and nothing is selected. */
export function insertDigit(s: DialInput, d: string): DialInput {
  const c = clamp(s);
  if (c.start === c.end && c.digits.length >= MAX_DIGITS) return c;
  const digits = (c.digits.slice(0, c.start) + d + c.digits.slice(c.end)).slice(0, MAX_DIGITS);
  const at = Math.min(c.start + 1, digits.length);
  return { digits, start: at, end: at };
}

/** Delete: removes the selection, or the digit before the cursor. */
export function deleteBack(s: DialInput): DialInput {
  const c = clamp(s);
  if (c.start !== c.end) return { digits: c.digits.slice(0, c.start) + c.digits.slice(c.end), start: c.start, end: c.start };
  if (c.start === 0) return c;
  return { digits: c.digits.slice(0, c.start - 1) + c.digits.slice(c.start), start: c.start - 1, end: c.start - 1 };
}

// Copied numbers often carry invisible characters: direction marks from contacts/WhatsApp, non-breaking spaces, brackets. They are removed first.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** Text copied from anywhere -> the 10 digits of the Indian mobile in it, or null. */
export function mobileFromPaste(text: string): string | null {
  const cleaned = text.replace(INVISIBLE, '').replace(/[\u00A0\u2007\u202F]/g, ' ');
  const hit = pastedMobile(cleaned);
  if (hit) return hit;
  let d = cleaned.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/** What the Paste button puts in the field: the mobile number found in the copied text, else its digits (up to 10); null when it holds no digit. */
export function digitsFromClipboard(text: string): string | null {
  const full = mobileFromPaste(text);
  if (full) return full;
  // Not a valid mobile (the dial pad will say so), but a +91 or leading 0 is still a prefix, not part of the number.
  let d = text.replace(INVISIBLE, '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, MAX_DIGITS);
  return d.length > 0 ? d : null;
}

