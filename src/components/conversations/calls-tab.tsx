import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchConversationCallRecordings, fetchConversationCallSummaries, retranscribeCallRecording } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Conversation, ConversationCallRecording, ConversationCallSummary } from '@/types/api';

const fmtWhen = (iso: string) =>
  `${new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} ${new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
const fmtDur = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Play / pause with progress (the dashboard uses the browser's audio control).
function Player({ uri }: { uri: string }) {
  const theme = useTheme();
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const pct = status.duration > 0 ? Math.min(100, (status.currentTime / status.duration) * 100) : 0;
  return (
    <View style={[styles.player, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Pressable
        onPress={() => (status.playing ? player.pause() : player.play())}
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause' : 'Play'}
        style={[styles.playBtn, { backgroundColor: theme.primary }]}>
        <Ionicons name={status.playing ? 'pause' : 'play'} size={14} color="#ffffff" />
      </Pressable>
      <View style={[styles.track, { backgroundColor: theme.border }]}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.primary }]} /></View>
      <ThemedText themeColor="textMuted" style={styles.clock}>{`${clock(status.currentTime)} / ${clock(status.duration || 0)}`}</ThemedText>
    </View>
  );
}

function StatusPill({ status }: { status: ConversationCallRecording['transcriptStatus'] }) {
  const theme = useTheme();
  const tone =
    status === 'DONE' ? { bg: 'rgba(54,200,126,0.12)', fg: theme.success, label: 'Transcribed' }
    : status === 'FAILED' ? { bg: 'rgba(224,104,104,0.12)', fg: theme.danger, label: 'Failed' }
    : status === 'ECHO_REJECTED' ? { bg: 'rgba(224,104,104,0.12)', fg: theme.danger, label: 'Unreliable' }
    : status === 'TOO_SHORT' ? { bg: 'rgba(150,150,150,0.16)', fg: theme.textMuted, label: 'Too short' }
    : { bg: 'rgba(232,168,40,0.12)', fg: theme.warning, label: status === 'PROCESSING' ? 'Transcribing…' : 'Pending' };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}><ThemedText style={[styles.pillText, { color: tone.fg }]}>{tone.label}</ThemedText></View>
  );
}

function RecordingCard({ rec, onRetranscribe, retranscribing }: { rec: ConversationCallRecording; onRetranscribe: (id: string) => void; retranscribing: boolean }) {
  const theme = useTheme();
  const s = rec.transcriptStatus;
  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitle}>
          <ThemedText style={styles.emoji}>📞</ThemedText>
          <ThemedText style={styles.when}>{fmtWhen(rec.callTimestamp)}</ThemedText>
          {rec.durationSecs != null ? <ThemedText themeColor="textMuted" style={styles.dur}>{`· ${fmtDur(rec.durationSecs)}`}</ThemedText> : null}
        </View>
        <View style={styles.cardRight}>
          <StatusPill status={s} />
          <Pressable onPress={() => onRetranscribe(rec.id)} disabled={retranscribing} accessibilityRole="button" hitSlop={8} style={retranscribing && { opacity: 0.5 }}>
            <ThemedText style={[styles.retry, { color: theme.primary }]}>{retranscribing ? 'Queuing…' : 'Re-transcribe'}</ThemedText>
          </Pressable>
        </View>
      </View>

      <Player uri={rec.audioUrl} />

      {rec.transcriptText ? (
        <View style={[styles.transcript, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ThemedText themeColor="textSecondary" style={styles.transcriptText}>{rec.transcriptText}</ThemedText>
        </View>
      ) : null}
      {!rec.transcriptText && s === 'TOO_SHORT' ? <ThemedText themeColor="textMuted" style={styles.note}>Audio too short to transcribe reliably</ThemedText> : null}
      {!rec.transcriptText && s === 'ECHO_REJECTED' ? (
        <ThemedText style={[styles.note, { color: theme.danger }]}>Transcription unreliable for this recording — discarded rather than shown</ThemedText>
      ) : null}
      {!rec.transcriptText && s !== 'DONE' && s !== 'TOO_SHORT' && s !== 'ECHO_REJECTED' ? (
        <ThemedText themeColor="textMuted" style={styles.note}>{`Transcript ${s === 'PROCESSING' ? 'in progress…' : 'not yet available'}`}</ThemedText>
      ) : null}
    </View>
  );
}

// Salespeople get the summary only: no audio, no transcript, by design.
function SummaryCard({ s }: { s: ConversationCallSummary }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.cardTitle}>
        <ThemedText style={styles.emoji}>📞</ThemedText>
        <ThemedText style={styles.when}>{fmtWhen(s.callTimestamp)}</ThemedText>
        {s.durationSecs != null ? <ThemedText themeColor="textMuted" style={styles.dur}>{`· ${fmtDur(s.durationSecs)}`}</ThemedText> : null}
      </View>
      <ThemedText themeColor="textSecondary" style={styles.transcriptText}>{s.summary}</ThemedText>
    </View>
  );
}

// The conversation's "Calls" sub-tab. Owner / Store Manager: the recordings
// with audio and transcript (GET /call-recordings). Sales: their own call
// summaries, filtered to this customer (GET /call-recordings/my-summary). Any
// other role has neither route, so it shows the empty state.
export function CallsTab({ conv, onCount }: { conv: Conversation; onCount: (n: number) => void }) {
  const { user } = useAuth();
  const role = user?.role ?? '';
  const full = role === 'OWNER' || role === 'STORE_MANAGER';
  const summaryOnly = role === 'SALES';

  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<ConversationCallRecording[]>([]);
  const [summaries, setSummaries] = useState<ConversationCallSummary[]>([]);
  const [retranscribingId, setRetranscribingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load when the tab opens
    setLoading(true);
    const run = async () => {
      try {
        if (summaryOnly) {
          const all = await fetchConversationCallSummaries();
          // The server already scopes these to the caller; narrowing to this
          // customer is display only.
          if (!cancelled) setSummaries(all.filter((s) => s.customerName === conv.customerName));
        } else if (full) {
          const rows = await fetchConversationCallRecordings(conv.id);
          if (!cancelled) { setRecordings(rows); onCount(rows.length); }
        }
      } catch {
        /* an empty list: the dashboard shows the same empty state on failure */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [conv.id, conv.customerName, full, summaryOnly, onCount]);

  const retranscribe = async (id: string) => {
    setRetranscribingId(id);
    try {
      const res = await retranscribeCallRecording(id);
      if (res.success) setRecordings((prev) => prev.map((r) => (r.id === id ? { ...r, transcriptStatus: 'PENDING', transcriptText: null } : r)));
    } catch {
      /* the button simply re-enables */
    } finally {
      setRetranscribingId(null);
    }
  };

  const empty = (text: string) => <ThemedText themeColor="textMuted" style={styles.empty}>{text}</ThemedText>;

  return (
    <ScrollView contentContainerStyle={styles.pane}>
      {summaryOnly
        ? loading ? empty('Loading call summaries…') : summaries.length === 0 ? empty('No calls logged yet for this conversation.') : summaries.map((s) => <SummaryCard key={s.id} s={s} />)
        : loading ? empty('Loading recordings…') : recordings.length === 0 ? empty('No call recordings yet for this conversation.')
        : recordings.map((r) => <RecordingCard key={r.id} rec={r} onRetranscribe={retranscribe} retranscribing={retranscribingId === r.id} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pane: { padding: 12, gap: 12 },
  empty: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 40, fontStyle: 'italic' },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emoji: { fontSize: 14, lineHeight: 20 },
  when: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  dur: { fontSize: 11, lineHeight: 16 },
  pill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  retry: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.medium },
  player: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingHorizontal: 10, borderWidth: 1, borderRadius: 8 },
  playBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4 },
  clock: { fontSize: 10, lineHeight: 14 },
  transcript: { padding: 10, borderRadius: 8, borderWidth: 1 },
  transcriptText: { fontSize: 12, lineHeight: 18 },
  note: { fontSize: 11, lineHeight: 16, fontStyle: 'italic' },
});
