import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';

import { importMyContacts } from '@/lib/api';
import { canSyncContacts, nextSyncStep, parseSyncState, syncKey, type ContactSyncState } from '@/lib/contact-sync';
import { phoneBookPermission, readPhoneBook } from '@/lib/phone-contacts';

let running = false;

async function loadState(userId: string): Promise<ContactSyncState> {
  try { return parseSyncState(await SecureStore.getItemAsync(syncKey(userId))); } catch { return parseSyncState(null); }
}
async function saveState(userId: string, state: ContactSyncState): Promise<void> {
  try { await SecureStore.setItemAsync(syncKey(userId), JSON.stringify(state)); } catch { /* it will just ask or copy again next time */ }
}

function askOnce(): Promise<boolean> {
  return new Promise((resolve) => Alert.alert(
    'Save your phone contacts in Fasttracks?',
    'Your contacts are copied here so callers show by name and you can call them from the app. The owner can see the contacts saved in Fasttracks.',
    [{ text: 'Not now', style: 'cancel', onPress: () => resolve(false) }, { text: 'Allow', onPress: () => resolve(true) }],
    { cancelable: false },
  ));
}

// Copies the phone's address book (Indian mobiles only) into the app, with no button to press: asks once after login, then quietly looks for new
// contacts once a day. Numbers already saved by anyone are skipped by the server. Never throws: a failure just means it tries again next launch.
export async function runContactSync(user: { id: string; role: string }): Promise<void> {
  if (Platform.OS !== 'android' || running || !canSyncContacts(user.role)) return;
  running = true;
  try {
    let state = await loadState(user.id);
    const step = nextSyncStep(state, Date.now());
    if (step === 'skip') return;

    if (step === 'ask') {
      const yes = await askOnce();
      state = { asked: true, agreed: yes, lastSyncAt: null };
      await saveState(user.id, state);
      if (!yes) return;
      if ((await phoneBookPermission(true)) !== 'granted') { await saveState(user.id, { asked: true, agreed: false, lastSyncAt: null }); return; }
    } else if ((await phoneBookPermission(false)) !== 'granted') {
      return;
    }

    const rows = await readPhoneBook();
    for (let i = 0; i < rows.length; i += 500) await importMyContacts(rows.slice(i, i + 500));
    await saveState(user.id, { asked: true, agreed: true, lastSyncAt: new Date().toISOString() });
  } catch {
    // offline, server error, permission revoked: try again next launch
  } finally {
    running = false;
  }
}
