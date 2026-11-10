import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ₹1,200: Indian grouping, no decimals (the dashboard's Intl INR format).
export function fmt(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

// The dashboard parses the YYYY-MM-DD part locally so the day never shifts.
export function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  PENDING: { bg: 'rgba(245,158,11,0.12)', color: '#b45309', label: 'Pending' },
  APPROVED: { bg: 'rgba(34,197,94,0.12)', color: '#15803d', label: 'Approved' },
  REJECTED: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', label: 'Rejected' },
};

// The dashboard's fixed top-right toast (solid green / red), as a full-width strip.
export function Toast({ toast }: { toast: { type: 'success' | 'error'; msg: string } | null }) {
  if (!toast) return null;
  return (
    <View style={[styles.toast, { backgroundColor: toast.type === 'success' ? '#22c55e' : '#ef4444' }]}>
      <ThemedText style={styles.toastText}>{toast.msg}</ThemedText>
    </View>
  );
}

// Dashed green "+ Enter actual hours" button.
export function DashedButton({ label, onPress, full }: { label: string; onPress: () => void; full?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={[styles.dashed, full && styles.dashedFull]}>
      <ThemedText style={styles.dashedLabel}>{label}</ThemedText>
    </Pressable>
  );
}

// "Update Actual Hours" / "Enter Actual Hours" sheet. Valid = a positive number.
export function ActualHoursSheet({
  title, message, saving, onCancel, onSave,
}: { title: string; message: string; saving: boolean; onCancel: () => void; onSave: (hours: number) => void }) {
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const save = () => {
    const hrs = parseFloat(value);
    if (isNaN(hrs) || hrs <= 0) { setError('Enter valid hours.'); return; }
    setError('');
    onSave(hrs);
  };

  return (
    <Sheet
      visible
      onClose={onCancel}
      locked={saving}
      title={title}
      footer={
        <>
          <Button variant="outline" onPress={onCancel} style={styles.flex1}>Cancel</Button>
          <Button onPress={save} loading={saving} style={styles.flex1}>{saving ? 'Saving…' : 'Save'}</Button>
        </>
      }>
      <ThemedText themeColor="textMuted" style={styles.body}>{message}</ThemedText>
      <Input value={value} onChangeText={setValue} placeholder="e.g. 2.5" keyboardType="decimal-pad" />
      {error ? <ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  toast: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  toastText: { color: '#ffffff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  dashedLabel: { color: '#15803d', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, textAlign: 'center' },
  dashed: { minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#22c55e', borderRadius: 12, backgroundColor: 'rgba(34,197,94,0.1)', alignSelf: 'flex-start' },
  dashedFull: { alignSelf: 'stretch' },
});
