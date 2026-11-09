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

/** Every Indian mobile in the address book with its name (one row per number). Empty without permission. */
export async function readPhoneBook(): Promise<DialContact[]> {
  const C = await api();
  if (!C) return [];
  try {
    if (!(await C.getPermissionsAsync()).granted) return [];
    const { data } = await C.getContactsAsync({ fields: [C.Fields.PhoneNumbers, C.Fields.Name] });
    return phoneBookRows(data.map((c) => ({ name: c.name, phoneNumbers: c.phoneNumbers?.map((p) => ({ number: p.number })) })));
  } catch {
    return [];
  }
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
