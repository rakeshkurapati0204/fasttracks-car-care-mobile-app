import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { elapsedText, isActive, isFinished, statusText } from '@/lib/voip/call-machine.ts';
import type { VoipState } from '@/lib/voip/types.ts';

type Props = { state: VoipState; mock: boolean; onHangup: () => void; onMute: (on: boolean) => void; onSpeaker: (on: boolean) => void; onClose: () => void };

function formatNumber(e164: string | null) {
  const d = (e164 ?? '').replace(/^\+91/, '');
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : (e164 ?? '');
}

// The in-call screen: the customer's number, the status, the timer and Mute, Speaker and End. There is no Answer: in this flow the salesman starts the
// call from the app and Exotel rings the customer; nobody calls the salesman.
export function InCallModal({ state, mock, onHangup, onMute, onSpeaker, onClose }: Props) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());
  const visible = state.phase !== 'idle';

  useEffect(() => {
    if (state.phase !== 'connected') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.phase]);

  const finished = isFinished(state);
  const controls = isActive(state);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={finished ? onClose : () => { /* a live call ends only with the End button, never with Back */ }}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={styles.top}>
          {mock ? <ThemedText type="small" style={{ color: theme.danger }}>TEST MODE: no real call is placed</ThemedText> : null}
          <ThemedText style={styles.number}>{formatNumber(state.number)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={state.phase === 'failed' ? { color: theme.danger } : undefined}>{statusText(state)}</ThemedText>
          {state.phase === 'connected' ? <ThemedText style={styles.timer}>{elapsedText(state, now)}</ThemedText> : null}
        </View>

        <View style={styles.row}>
          <Pressable
            disabled={!controls}
            onPress={() => onMute(!state.muted)}
            accessibilityRole="button"
            accessibilityLabel={state.muted ? 'Unmute' : 'Mute'}
            style={[styles.round, { backgroundColor: state.muted ? theme.primary : theme.backgroundElement }, !controls && styles.off]}>
            <Ionicons name={state.muted ? 'mic-off' : 'mic'} size={28} color={state.muted ? '#fff' : theme.text} />
          </Pressable>
          <Pressable
            disabled={!controls}
            onPress={() => onSpeaker(!state.speaker)}
            accessibilityRole="button"
            accessibilityLabel={state.speaker ? 'Speaker off' : 'Speaker on'}
            style={[styles.round, { backgroundColor: state.speaker ? theme.primary : theme.backgroundElement }, !controls && styles.off]}>
            <Ionicons name="volume-high" size={28} color={state.speaker ? '#fff' : theme.text} />
          </Pressable>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.labels}>Mute · Speaker</ThemedText>

        <Pressable
          onPress={finished ? onClose : onHangup}
          accessibilityRole="button"
          accessibilityLabel={finished ? 'Close' : 'End call'}
          style={[styles.end, { backgroundColor: finished ? theme.backgroundElement : theme.danger }]}>
          <Ionicons name={finished ? 'close' : 'call'} size={28} color={finished ? theme.text : '#fff'} style={finished ? undefined : { transform: [{ rotate: '135deg' }] }} />
          <ThemedText style={[styles.endLabel, { color: finished ? theme.text : '#fff' }]}>{finished ? 'Close' : 'End call'}</ThemedText>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: Spacing.four, paddingTop: 96, paddingBottom: 64 },
  top: { alignItems: 'center', gap: Spacing.two },
  number: { fontSize: 32, lineHeight: 42, fontWeight: '600', letterSpacing: 1 },
  timer: { fontSize: 22, lineHeight: 30, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', gap: 48 },
  round: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  off: { opacity: 0.35 },
  labels: { marginTop: -Spacing.three },
  end: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingHorizontal: 40, height: 64, borderRadius: 32 },
  endLabel: { fontWeight: '700', fontSize: 16 },
});
