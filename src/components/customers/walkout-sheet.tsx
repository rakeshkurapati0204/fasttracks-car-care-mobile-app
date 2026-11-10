import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BOARD_WALKOUT_REASONS } from '@/lib/customers-format';
import type { CjJobCard } from '@/types/api';

type Props = {
  job: CjJobCard | null;
  onClose: () => void;
  /** Resolves on success, throws with a message to show inline. */
  onSubmit: (job: CjJobCard, reason: string, remarks: string) => Promise<void>;
};

// Status board walkout capture: reason (required) + remarks. Mount with
// key={job.id} semantics via the inner form so state resets per job.
export function WalkoutSheet({ job, onClose, onSubmit }: Props) {
  return (
    <Sheet visible={!!job} onClose={onClose} title="Mark walkout" subtitle={job ? `${job.vehicleNumber || 'Walk-in / No vehicle'} · ${job.customer.name}` : undefined}>
      {job ? <WalkoutForm key={job.id} job={job} onClose={onClose} onSubmit={onSubmit} /> : null}
    </Sheet>
  );
}

function WalkoutForm({ job, onClose, onSubmit }: { job: CjJobCard; onClose: () => void; onSubmit: Props['onSubmit'] }) {
  const theme = useTheme();
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!reason) { setError('Pick a reason.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSubmit(job, reason, remarks.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save walkout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={styles.block}>
        <ThemedText themeColor="textMuted" style={styles.label}>Reason</ThemedText>
        <View style={styles.reasons}>
          {BOARD_WALKOUT_REASONS.map((r) => {
            const active = reason === r.key;
            return (
              <Pressable
                key={r.key}
                onPress={() => setReason(r.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [styles.reason, { backgroundColor: active ? theme.primary : theme.backgroundElement, borderColor: active ? theme.primary : theme.border }, pressed && { opacity: 0.7 }]}>
                <ThemedText style={[styles.reasonText, { color: active ? '#fff' : theme.textMuted }]}>{r.label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.block}>
        <ThemedText themeColor="textMuted" style={styles.label}>Remarks</ThemedText>
        <TextInput
          value={remarks}
          onChangeText={setRemarks}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          placeholder="Anything worth noting — what was quoted, what they said, etc."
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
        />
      </View>

      {error ? <ThemedText themeColor="danger" style={styles.error}>{error}</ThemedText> : null}

      <View style={styles.buttons}>
        <Button variant="secondary" style={styles.flex1} disabled={saving} onPress={onClose}>Cancel</Button>
        <Button variant="danger" style={styles.flex1} loading={saving} onPress={submit}>{saving ? 'Saving…' : 'Confirm walkout'}</Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  block: { gap: 6 },
  label: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reason: { minHeight: 36, paddingHorizontal: 12, borderRadius: Radii.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  reasonText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  input: { minHeight: 84, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  error: { fontSize: 12, lineHeight: 18 },
  buttons: { flexDirection: 'row', gap: 8 },
});
