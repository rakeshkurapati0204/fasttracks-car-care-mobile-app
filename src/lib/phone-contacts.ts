// The phone's own address book (Android). One place for every read and write, so they all use the same API.
// SDK 57: the old functions (getContactsAsync, addContactAsync, ...) THROW when imported from 'expo-contacts'; they only work from
// 'expo-contacts/legacy'. Every use in the app goes through this file for that reason.
import { Platform } from 'react-native';

import { mobileDigits, phoneBookRows, type DialContact } from '@/lib/contacts';

type Legacy = typeof import('expo-contacts/legacy');

async function api(): Promise<Legacy | null> {
  if (Platform.OS !== 'android') return null;
  try { return await import('expo-contacts/legacy'); } catch { return null; }
}

/** True when this build can use the address book at all. */
export async function phoneBookAvailable(): Promise<boolean> {
  return (await api()) !== null;
}

/** Contacts permission: 'granted' | 'denied' | 'undetermined'. `ask` shows Android's prompt when it has not been answered yet. */
export async function phoneBookPermission(ask: boolean): Promise<'granted' | 'denied' | 'undetermined' | 'unavailable'> {
  const C = await api();
  if (!C) return 'unavailable';
  try {
    const r = ask ? await C.requestPermissionsAsync() : await C.getPermissionsAsync();
    return r.granted ? 'granted' : (r.status as 'denied' | 'undetermined');
  } catch {
    return 'unavailable';
  }
}

/**
 * The address book one page at a time (`pageSize` contacts), so a book with thousands of entries is never crossed over to JavaScript and processed in one go:
 * the caller handles a page, lets the screen breathe, then asks for the next. Empty without permission.
 */
export async function* phoneBookPages(pageSize = 300): AsyncGenerator<{ name?: string; phoneNumbers?: { number?: string }[] }[]> {
  const C = await api();
  if (!C) return;
  try {
    if (!(await C.getPermissionsAsync()).granted) return;
    for (let offset = 0; ; offset += pageSize) {
      const { data, hasNextPage } = await C.getContactsAsync({ fields: [C.Fields.PhoneNumbers, C.Fields.Name], pageSize, pageOffset: offset });
      yield data.map((c) => ({ name: c.name, phoneNumbers: c.phoneNumbers?.map((p) => ({ number: p.number })) }));
      if (!hasNextPage) return;
    }
  } catch {
    /* a read that fails part way just ends: what was handled so far stands */
  }
}

/**
 * Every Indian mobile in the address book with its name (one row per number). Empty without permission. Read a page at a time with a breath between pages, so
 * a book of thousands of contacts never freezes the screen the person is typing on.
 */
export async function readPhoneBook(): Promise<DialContact[]> {
  const rows: DialContact[] = [];
  const seen = new Set<string>();
  for await (const page of phoneBookPages()) {
    rows.push(...phoneBookRows(page, seen));
    await new Promise<void>((resolve) => setTimeout(resolve, 16));
  }
  return rows;
}

/**
 * Saves a contact into the phone's own Contacts app too (the salesman sees it in the Samsung/Google dialer). Skipped when the number is already
 * in the phone. Asks for Contacts permission if it was never answered. Never throws.
 */
export async function saveToPhoneBook(name: string, phone10: string): Promise<'saved' | 'exists' | 'denied' | 'failed'> {
  const C = await api();
  if (!C) return 'failed';
  const digits = mobileDigits(phone10);
  if (!digits) return 'failed';
  try {
    const perm = await C.requestPermissionsAsync();
    if (!perm.granted) return 'denied';
    const book = await readPhoneBook();
    if (book.some((c) => c.phone === digits)) return 'exists';
    const clean = name.trim();
    await C.addContactAsync({
      contactType: C.ContactTypes.Person,
      name: clean,
      firstName: clean,
      phoneNumbers: [{ label: 'mobile', number: `+91${digits}` }],
    } as Parameters<Legacy['addContactAsync']>[0]);
    return 'saved';
  } catch {
    return 'failed';
  }
}
