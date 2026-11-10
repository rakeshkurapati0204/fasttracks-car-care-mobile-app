// Contacts a salesman saves (name + number). No imports on purpose, so it runs under the plain test runner.

export type MyContact = { id: string; phone: string; name: string | null; reason: string | null; createdAt: string };

// Typed number -> the 10 digits of an Indian mobile, or null. A pasted +91 / 91 / 0 prefix is dropped (only when the number is longer than 10 digits).
export function mobileDigits(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

// What to tell the salesman about the form, or null when it can be saved.
export function contactFormError(name: string, phone: string): string | null {
  if (!name.trim()) return 'Enter the name.';
  if (name.trim().length > 80) return 'Name is too long (80 characters at most).';
  if (!mobileDigits(phone)) return 'Enter a valid 10-digit mobile number.';
  return null;
}

// "+919848012345" -> "+91 98480 12345".
export function showPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

// Search by name, or by the number as typed in any form ("98480", "+91 98480 12345").
export function filterContacts(list: MyContact[], query: string): MyContact[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const qd = q.replace(/\D/g, '');
  return list.filter((c) => (c.name ?? '').toLowerCase().includes(q) || (c.reason ?? '').toLowerCase().includes(q) || (qd.length > 0 && c.phone.replace(/\D/g, '').includes(qd)));
}

// Text pasted into the dial pad ("+91 98480 12345", "Call 9848012345 now", "98480-12345") -> the 10 digits, or null when it holds no Indian mobile.
export function pastedMobile(text: string): string | null {
  const whole = mobileDigits(text);
  if (whole) return whole;
  const m = /(?:^|\D)(?:\+?91[\s-]?|0)?([6-9]\d{4}[\s-]?\d{5})(?!\d)/.exec(text);
  return m ? mobileDigits(m[1]) : null;
}

type PhoneBookEntry = { name?: string | null; phoneNumbers?: { number?: string | null }[] | null };

// The phone's address book -> rows for POST /contacts/mine/bulk. One row per valid Indian mobile; a contact with several numbers gives several
// rows with the same name; entries without a name or a valid number are dropped; a number repeated across entries is kept once.
export function phoneBookRows(entries: PhoneBookEntry[]): { name: string; phone: string }[] {
  const seen = new Set<string>();
  const rows: { name: string; phone: string }[] = [];
  for (const e of entries) {
    const name = (e.name ?? '').trim();
    if (!name) continue;
    for (const p of e.phoneNumbers ?? []) {
      const d = mobileDigits(p.number ?? '');
      if (!d || seen.has(d)) continue;
      seen.add(d);
      rows.push({ name: name.slice(0, 80), phone: d });
    }
  }
  return rows;
}

export type DialContact = { name: string; phone: string }; // phone: 10 digits

/**
 * What the dial pad shows while a number is typed, like the phone's own dialer: the contact whose number it is (exact), else the best contacts whose
 * number contains what was typed (from 3 digits on). Same number in both lists (phone book and app) is kept once; the phone book's name wins.
 */
export function matchDialContacts(list: DialContact[], typed: string, max = 3): { exact: DialContact | null; suggestions: DialContact[] } {
  if (typed.length < 3) return { exact: null, suggestions: [] };
  const seen = new Set<string>();
  const unique = list.filter((c) => (seen.has(c.phone) ? false : (seen.add(c.phone), true)));
  const exact = typed.length === 10 ? unique.find((c) => c.phone === typed) ?? null : null;
  if (exact) return { exact, suggestions: [] };
  const hits = unique.filter((c) => c.phone.includes(typed));
  hits.sort((a, b) => Number(!a.phone.startsWith(typed)) - Number(!b.phone.startsWith(typed)) || a.name.localeCompare(b.name));
  return { exact: null, suggestions: hits.slice(0, max) };
}
