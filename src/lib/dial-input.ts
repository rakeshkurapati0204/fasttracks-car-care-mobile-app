// The dial pad's number field, as plain functions (no React, so node --test runs them). The field shows the digits grouped "98480 12345" and has a
// real cursor: keypad presses and Delete work at the cursor, and Android's own long-press menu (Paste / Copy / Cut / Select all) works on it.
// Positions: "digit index" counts digits only; "field index" counts characters on screen, including the one space after the 5th digit.
import { pastedMobile } from './contacts.ts';

export const MAX_DIGITS = 10;

export type DialInput = { digits: string; start: number; end: number };

export function spaced(digits: string): string {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

/** Digit index -> field index. */
export function toField(i: number, len: number): number {
  return len > 5 && i > 5 ? i + 1 : i;
}

/** Field index -> digit index (a cursor right after the space counts as after the 5th digit). */
export function toDigit(p: number, len: number): number {
  const d = len > 5 && p > 5 ? p - 1 : p;
  return Math.max(0, Math.min(len, d));
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

/**
 * The field's text changed by Android itself (Paste, Cut, a hardware keyboard). `prev` is the state before, `text` what the field now holds.
 * A pasted full mobile number replaces whatever was there (like the phone's dialer); otherwise the field keeps its digits, up to 10.
 */
export function applyFieldText(prev: DialInput, text: string): DialInput {
  const shown = spaced(prev.digits);
  const fs = toField(prev.start, prev.digits.length);
  const fe = toField(prev.end, prev.digits.length);
  const before = shown.slice(0, fs);
  const after = shown.slice(fe);
  if (text.length >= before.length + after.length && text.startsWith(before) && text.endsWith(after)) {
    const inserted = text.slice(before.length, text.length - after.length);
    const full = mobileFromPaste(inserted);
    if (full && inserted.replace(/\D/g, '').length >= 10) return { digits: full, start: 10, end: 10 };
    const add = inserted.replace(/\D/g, '');
    const b = prev.digits.slice(0, prev.start);
    const a = prev.digits.slice(prev.end);
    const digits = (b + add + a).slice(0, MAX_DIGITS);
    const at = Math.min(b.length + add.length, digits.length);
    return { digits, start: at, end: at };
  }
  const full = mobileFromPaste(text);
  if (full && text.replace(/\D/g, '').length > MAX_DIGITS) return { digits: full, start: 10, end: 10 };
  const digits = text.replace(/\D/g, '').slice(0, MAX_DIGITS);
  return { digits, start: digits.length, end: digits.length };
}
