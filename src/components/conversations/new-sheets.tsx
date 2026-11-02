import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createConversation, fetchStaffPhoneNumbers, fetchWabaNumbers, getErrorMessage, saveStaffPhoneNumber } from '@/lib/api';
import type { Conversation, ConversationCategory, StaffPhoneNumberRow, WabaNumber } from '@/types/api';

type Staff = { id: string; name: string };

// The dashboard's categories for a new conversation (Instagram is a placeholder, so it isn't offered).
const CATEGORY_OPTIONS: { value: ConversationCategory; label: string }[] = [
  { value: 'CUSTOMER_WHATSAPP', label: 'Customer' },
  { value: 'CALL', label: 'Calls' },
  { value: 'EMPLOYEE', label: 'Employee Messages' },
  { value: 'OWNER', label: 'Founder' },
];

// ─── New Conversation ────────────────────────────────────────────────────────
// Manager roles only on the server (POST /conversations).
export function NewConversationSheet({
  initialCategory, staffList, onClose, onCreated,
}: { initialCategory: ConversationCategory; staffList: Staff[]; onClose: () => void; onCreated: (c: Conversation) => void }) {
  const theme = useTheme();
  const [category, setCategory] = useState<ConversationCategory>(initialCategory);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!customerName.trim() || !customerPhone.trim() || !assignedToId) {
      setError('All fields are required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const conv = await createConversation({ customerName, customerPhone, assignedToId, category });
      onCreated(conv);
      onClose();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create conversation.'));
      setLoading(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={loading}
      title="New Conversation"
      footer={
        <>
          <Button variant="ghost" onPress={onClose} style={styles.flex1}>Cancel</Button>
          <Button onPress={create} loading={loading} style={styles.flex1}>Create</Button>
        </>
      }>
      {error ? (
        <View style={styles.errBox}><ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText></View>
      ) : null}
      <Select label="Category" value={category} onChange={(v) => setCategory(v as ConversationCategory)} options={CATEGORY_OPTIONS} />
      <Input label="Contact Name" required value={customerName} onChangeText={setCustomerName} placeholder="e.g. Sanjay Mehta" />
      <Input label="Phone Number" required value={customerPhone} onChangeText={setCustomerPhone} placeholder="919876543210" keyboardType="phone-pad" />
      <Select
        label="Assign To"
        required
        placeholder="Select staff…"
        value={assignedToId}
        onChange={setAssignedToId}
        options={staffList.map((s) => ({ value: s.id, label: s.name }))}
      />
    </Sheet>
  );
}

// ─── Manage Staff Numbers (Owner only) ──────────────────────────────────────
export function ManageNumbersSheet({ staffList, onClose, onUpdated }: { staffList: Staff[]; onClose: () => void; onUpdated: () => void }) {
  const theme = useTheme();
  const [waba, setWaba] = useState<WabaNumber[]>([]);
  const [mappings, setMappings] = useState<StaffPhoneNumberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchWabaNumbers().catch(() => []), fetchStaffPhoneNumbers().catch(() => [])])
      .then(([w, m]) => { setWaba(w); setMappings(m); })
      .finally(() => setLoading(false));
  }, []);

  const assign = async (phoneNumberId: string, displayPhone: string, employeeId: string | null) => {
    setSaving(phoneNumberId);
    setError('');
    try {
      await saveStaffPhoneNumber({ phoneNumberId, displayPhone, employeeId });
      setMappings(await fetchStaffPhoneNumbers());
      onUpdated();
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to save assignment. Please try again.'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet visible fullHeight onClose={onClose} title="Manage Staff Numbers" subtitle="Assign each WhatsApp business number to a staff member">
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          <ThemedText themeColor="textMuted" style={styles.small}>Loading WABA numbers…</ThemedText>
        </View>
      ) : waba.length === 0 ? (
        <ThemedText themeColor="textMuted" style={styles.empty}>No phone numbers found on WABA. Check your WhatsApp Business Account.</ThemedText>
      ) : (
        waba.map((num) => {
          const mapping = mappings.find((m) => m.phoneNumberId === num.id);
          const isSaving = saving === num.id;
          const good = num.quality_rating === 'GREEN';
          return (
            <View key={num.id} style={[styles.numCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={styles.numHead}>
                <View style={styles.flex1}>
                  <ThemedText style={styles.numPhone}>{num.display_phone_number}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.small}>{`${num.verified_name} · ID: ${num.id} · ${num.status}`}</ThemedText>
                </View>
                <View style={[styles.quality, { backgroundColor: good ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)' }]}>
                  <ThemedText style={[styles.qualityText, { color: good ? '#10b981' : '#f59e0b' }]}>{num.quality_rating}</ThemedText>
                </View>
              </View>
              <View style={styles.assignRow}>
                <View style={styles.flex1}>
                  <Select
                    compact
                    value={mapping?.employeeId || ''}
                    onChange={(v) => assign(num.id, num.display_phone_number, v || null)}
                    disabled={isSaving}
                    options={[{ value: '', label: '— Unassigned —' }, ...staffList.map((s) => ({ value: s.id, label: s.name }))]}
                  />
                </View>
                {isSaving ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                {mapping?.employeeId && !isSaving ? <ThemedText style={{ color: '#10b981', fontSize: 12 }}>✓</ThemedText> : null}
              </View>
            </View>
          );
        })
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  small: { fontSize: 12, lineHeight: 16 },
  errBox: { padding: 10, borderRadius: 8, backgroundColor: 'rgba(224,104,104,0.1)' },
  center: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 24 },
  numCard: { borderWidth: 1, borderRadius: Radii.lg, padding: 14, gap: 12 },
  numHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  numPhone: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  quality: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  qualityText: { fontSize: 10, lineHeight: 14 },
  assignRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
