// Names for the dial pad: the phone's own address book (read straight from Android, so a contact saved a second ago shows at once, like the
// Samsung dialer) plus the contacts saved in Fasttracks. Never asks for permission here: the phone book is read only if Contacts access was
// already granted (asked once after login, contact-sync-runner.ts). Any failure just means fewer names.
import { Platform } from 'react-native';

import { fetchMyContacts } from '@/lib/api';
import { phoneBookRows, type DialContact } from '@/lib/contacts';

async function phoneBook(): Promise<DialContact[]> {
  if (Platform.OS !== 'android') return [];
  try {
    const Contacts = await import('expo-contacts');
    if (!(await Contacts.getPermissionsAsync()).granted) return [];
    const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name] });
    return phoneBookRows(data.map((c) => ({ name: c.name, phoneNumbers: c.phoneNumbers?.map((p) => ({ number: p.number })) })));
  } catch {
    return [];
  }
}

async function appContacts(): Promise<DialContact[]> {
  try {
    const list = await fetchMyContacts();
    return list.filter((c) => c.name && /^\+91[6-9]\d{9}$/.test(c.phone)).map((c) => ({ name: c.name as string, phone: c.phone.slice(3) }));
  } catch {
    return [];
  }
}

let cache: { at: number; list: DialContact[] } | null = null;
const FRESH_MS = 45_000;

/** Phone book first (its names win), then the app's. Re-read at most every 45 s, so a contact saved a moment ago shows soon without the
 *  whole address book being read on every tab switch. */
export async function loadDialContacts(): Promise<DialContact[]> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.list;
  const [book, app] = await Promise.all([phoneBook(), appContacts()]);
  cache = { at: Date.now(), list: [...book, ...app] };
  return cache.list;
}
