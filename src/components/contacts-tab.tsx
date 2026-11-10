import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Layout, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addMyContact, fetchMyContacts, getErrorMessage, importMyContacts } from '@/lib/api';
import { contactFormError, filterContacts, mobileDigits, showPhone, type MyContact } from '@/lib/contacts';
import { forgetDialContacts } from '@/lib/dial-contacts';
import { phoneBookAvailable, phoneBookPermission, readPhoneBook, saveToPhoneBook } from '@/lib/phone-contacts';

// The salesman's own saved customers. Everything saved here is also visible to the owner (contacts directory, and the name shows on that number in the
// call logs), so the form says so. Tapping a contact opens the Dialer with that number ready; the call itself goes through the normal, recorded flow.
export function ContactsTab({ onCall, newPhone = '' }: { onCall: (digits: string) => void; newPhone?: string }) {
  const theme = useTheme();
  const [list, setList] = useState<MyContact[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(!!newPhone); // opened from the dial pad's "Add to contacts": the form starts open with that number
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(newPhone);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try { setList(await fetchMyContacts()); } catch (err) { setLoadError(getErrorMessage(err, 'Could not load your contacts.')); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => filterContacts(list ?? [], query), [list, query]);

  const save = async () => {
    const problem = contactFormError(name, phone);
    if (problem) { setFormError(problem); return; }
    setSaving(true); setFormError(null);
    try {
      const digits = mobileDigits(phone)!;
      const created = await addMyContact({ name: name.trim(), phone: digits, ...(note.trim() ? { note: note.trim() } : {}) });
      setList((cur) => [created, ...(cur ?? [])]);
      // Also into the phone's own Contacts app (skipped if the number is already there), so it shows in the normal dialer and WhatsApp.
      const onPhone = await saveToPhoneBook(name, digits);
      forgetDialContacts();
      setImportNote(onPhone === 'saved' ? 'Saved here and in your phone contacts.' : onPhone === 'exists' ? 'Saved. It was already in your phone contacts.' : onPhone === 'denied' ? 'Saved here. Allow Contacts permission to also save it in your phone.' : null);
      setName(''); setPhone(''); setNote(''); setAdding(false);
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save the contact.'));
    } finally {
      setSaving(false);
    }
  };

  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  // Copies the phone's address book (Indian mobiles only) into the app. Asks Android for permission, then asks the salesman to confirm, because the
  // owner can see what is saved here. Sent in batches; numbers already saved by anyone are skipped by the server.
  const importFromPhone = async () => {
    setImportNote(null);
    if (!(await phoneBookAvailable())) { setImportNote('Phone contacts can only be read on the Android app.'); return; }
    setImporting(true);
    try {
      if ((await phoneBookPermission(true)) !== 'granted') { setImportNote('Allow Contacts permission to copy your phone contacts.'); return; }
      const rows = await readPhoneBook();
      if (rows.length === 0) { setImportNote('No mobile numbers found in your phone contacts.'); return; }
      const ok = await new Promise<boolean>((resolve) => Alert.alert(`Copy ${rows.length} contacts?`, 'They are saved in Fasttracks and the owner can see them.', [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Copy', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) }));
      if (!ok) return;
      let added = 0, already = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const r = await importMyContacts(rows.slice(i, i + 500));
        added += r.added; already += r.alreadySaved;
      }
      setImportNote(`${added} contacts copied${already ? `, ${already} were already saved` : ''}.`);
      await load();
    } catch (err) {
      setImportNote(getErrorMessage(err, 'Could not copy your phone contacts. Try again.'));
    } finally {
      setImporting(false);
    }
  };

  const field = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }];

  return (
    <ThemedView style={styles.flex1}>
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {adding ? (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="smallBold">New contact</ThemedText>
              <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={theme.textSecondary} maxLength={80} style={field} autoFocus />
              <TextInput value={phone} onChangeText={setPhone} placeholder="Mobile number (10 digits)" placeholderTextColor={theme.textSecondary} keyboardType="phone-pad" maxLength={16} style={field} />
              <TextInput value={note} onChangeText={setNote} placeholder="Note (optional), e.g. car and what they want" placeholderTextColor={theme.textSecondary} maxLength={300} style={field} />
              <ThemedText type="small" themeColor="textSecondary">The owner can see the contacts you save.</ThemedText>
              {formError ? <ThemedText type="small" style={{ color: theme.danger }}>{formError}</ThemedText> : null}
              <View style={styles.row}>
                <Pressable onPress={() => { setAdding(false); setFormError(null); }} accessibilityRole="button" style={[styles.btn, { backgroundColor: theme.background }]}>
                  <ThemedText>Cancel</ThemedText>
                </Pressable>
                <Pressable onPress={save} disabled={saving} accessibilityRole="button" style={[styles.btn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
                  {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.btnLabel}>Save</ThemedText>}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="Add contact" style={[styles.btn, { backgroundColor: theme.primary }]}>
              <Ionicons name="person-add" size={18} color="#ffffff" />
              <ThemedText style={styles.btnLabel}>Add contact</ThemedText>
            </Pressable>
          )}

          <Pressable onPress={importFromPhone} disabled={importing} accessibilityRole="button" accessibilityLabel="Import phone contacts" style={[styles.btn, { backgroundColor: theme.backgroundElement, opacity: importing ? 0.6 : 1 }]}>
            {importing ? <ActivityIndicator /> : <Ionicons name="download-outline" size={18} color={theme.text} />}
            <ThemedText>{importing ? 'Copying...' : 'Import from phone'}</ThemedText>
          </Pressable>
          {importNote ? <ThemedText type="small" themeColor="textSecondary">{importNote}</ThemedText> : null}

          {list && list.length > 0 ? (
            <TextInput value={query} onChangeText={setQuery} placeholder="Search name or number" placeholderTextColor={theme.textSecondary} style={field} />
          ) : null}

          {loadError ? (
            <View style={styles.gap}>
              <ThemedText type="small" style={{ color: theme.danger }}>{loadError}</ThemedText>
              <Pressable onPress={load} accessibilityRole="button" style={[styles.btn, { backgroundColor: theme.backgroundElement }]}><ThemedText>Retry</ThemedText></Pressable>
            </View>
          ) : list === null ? (
            <ActivityIndicator style={styles.spinner} />
          ) : list.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">No contacts yet. Tap Add contact to save your first customer.</ThemedText>
          ) : shown.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">No contact matches.</ThemedText>
          ) : (
            <View>
              <ThemedText type="smallBold" themeColor="textSecondary" style={styles.count}>{shown.length} contact{shown.length === 1 ? '' : 's'}</ThemedText>
              {shown.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => onCall(c.phone.replace(/^\+91/, ''))}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${c.name ?? c.phone}`}
                  style={({ pressed }) => [styles.item, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
                  <View style={styles.flex1}>
                    <ThemedText type="smallBold" numberOfLines={1}>{c.name ?? c.phone}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{showPhone(c.phone)}{c.reason ? ` · ${c.reason}` : ''}</ThemedText>
                  </View>
                  <Ionicons name="call" size={20} color={theme.primary} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  card: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.two },
  input: { height: 46, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15 },
  row: { flexDirection: 'row', gap: Spacing.two },
  btn: { flex: 1, flexDirection: 'row', gap: Spacing.one, alignItems: 'center', justifyContent: 'center', borderRadius: Spacing.two, minHeight: Layout.minTouchTarget },
  btnLabel: { color: '#ffffff', fontWeight: '600' },
  gap: { gap: Spacing.two },
  spinner: { marginTop: Spacing.three },
  count: { marginBottom: Spacing.one },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, minHeight: Layout.minTouchTarget, borderBottomWidth: StyleSheet.hairlineWidth },
});
