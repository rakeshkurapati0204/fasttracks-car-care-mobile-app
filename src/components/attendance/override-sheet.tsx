import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { S } from '@/components/attendance/attendance-format';
import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { getErrorMessage, overrideAttendance } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const STATUS_OPTIONS = ['PRESENT', 'LATE', 'HALF_DAY', 'ABSENT', 'LEAVE'].map((s) => ({ value: s, label: s.replace('_', ' ') }));

type Props = {
  target: { empId: string; empName: string; date: string; currentStatus: string };
  onClose: () => void;
  /** Called after a successful save so the register can refresh (the ✏️ marker appears). */
  onSaved: () => void;
};

// Dashboard "Override Attendance" modal as a bottom sheet: the current status,
// a New Status picker, an optional reason, feedback, and the guard that a Store
// Manager can't change their own attendance. Owner / Store Manager only (the
// caller decides who can open it).
export function OverrideSheet({ target, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [status, setStatus] = useState(target.currentStatus || 'ABSENT');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const selfOverride = user?.role === 'STORE_MANAGER' && target.empId === user?.id;
  const sc = S[target.currentStatus];

  const save = async () => {
    if (loading || selfOverride) return;
    setLoading(true);
    setMsg(null);
    try {
      await overrideAttendance(target.empId, target.date, { status, reason });
      setMsg({ ok: true, text: '✓ Attendance updated' });
      onSaved();
      timer.current = setTimeout(onClose, 900);
    } catch (err: unknown) {
      setMsg({ ok: false, text: getErrorMessage(err, 'Failed') });
    } finally {
      setLoading(false);
    }
  };

  const when = new Date(`${target.date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={loading}
      title="Override Attendance"
      subtitle={`${target.empName} · ${when}`}
      footer={
        <>
          <Button style={styles.flex1} loading={loading} disabled={selfOverride} onPress={save}>{loading ? 'Saving…' : 'Save'}</Button>
          <Button style={styles.flex1} variant="secondary" disabled={loading} onPress={onClose}>Cancel</Button>
        </>
      }>
      <View style={styles.current}>
        <ThemedText themeColor="textMuted" style={styles.small}>Current:</ThemedText>
        {sc ? (
          <View style={[styles.badge, { backgroundColor: sc.bg }]}><ThemedText style={styles.badgeText}>{target.currentStatus}</ThemedText></View>
        ) : (
          <ThemedText themeColor="textMuted" style={styles.small}>No record</ThemedText>
        )}
      </View>

      <Select label="New Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
      <Input label="Reason (optional)" value={reason} onChangeText={setReason} placeholder="e.g. Device didn't sync" returnKeyType="done" onSubmitEditing={save} />

      {msg ? (
        <View style={[styles.msg, { backgroundColor: msg.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }]}>
          <ThemedText style={[styles.msgText, { color: msg.ok ? '#16a34a' : '#dc2626' }]}>{msg.text}</ThemedText>
        </View>
      ) : null}

      {selfOverride ? (
        <View style={[styles.msg, styles.guard]}>
          <ThemedText style={[styles.msgText, { color: '#dc2626' }]}>You cannot modify your own attendance. Contact Rakesh Sir.</ThemedText>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  current: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  small: { fontSize: 12, lineHeight: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  msg: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  guard: { backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)' },
  msgText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
});
