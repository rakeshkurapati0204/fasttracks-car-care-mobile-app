import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, FadeIn, PRESSED_OPACITY, Segmented } from '@/components/call-tracker/primitives';
import { ThemedText } from '@/components/themed-text';
import { Badge, type BadgeVariant } from '@/components/ui';
import { Fonts, FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage } from '@/lib/api';
import { callAudioSource, directionLabel, fetchCallTrackerDetail, formatClock, type CallSummaryData, type CallTrackerEntry, type CallTurn } from '@/lib/call-tracker';
import { longDay, timeRange } from '@/lib/call-tracker-format';

const TABULAR = { fontVariant: ['tabular-nums' as const] };

type DetailTab = 'summary' | 'transcript' | 'details';
const TABS = [
  { value: 'summary', label: 'Summary' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'details', label: 'Details' },
];

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  available: 'success',
  completed: 'success',
  processing: 'warning',
  pending: 'muted',
  failed: 'danger',
  missing: 'danger',
  none: 'muted',
};

function Metric({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText themeColor="textMuted" style={styles.metricLabel}>{label}</ThemedText>
      <ThemedText style={[styles.metricValue, TABULAR]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{value}</ThemedText>
    </View>
  );
}

const LOAD_TIMEOUT_MS = 15000;

// Plays the call's recording through the backend audio route (OWNER only, bearer token as a header). The audio is only fetched when
// the user presses play. The player is released when the detail closes (expo-audio frees it on unmount).
function PlayerCard({ call }: { call: CallTrackerEntry }) {
  const theme = useTheme();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const blobUrl = useRef<string | null>(null);
  const hasAudio = !!call.audioUrl;
  const total = status.duration > 0 ? status.duration : call.durationSeconds;

  useEffect(() => {
    if (phase === 'loading' && status.isLoaded) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to the player's loaded status
      setPhase('ready');
    }
  }, [phase, status.isLoaded]);

  // Release a web blob: URL when the detail closes.
  useEffect(() => () => { if (blobUrl.current) URL.revokeObjectURL(blobUrl.current); }, []);

  useEffect(() => {
    if (phase !== 'loading') return;
    const t = setTimeout(() => {
      player.pause();
      setPhase('error');
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [phase, player]);

  const toggle = async () => {
    if (!call.audioUrl || phase === 'loading') return;
    if (phase === 'ready') {
      if (status.playing) { player.pause(); return; }
      if (status.didJustFinish) await player.seekTo(0);
      player.play();
      return;
    }
    setPhase('loading');
    try {
      const source = await callAudioSource(call.audioUrl);
      if (source.uri.startsWith('blob:')) blobUrl.current = source.uri;
      player.replace(source);
      player.play();
    } catch {
      setPhase('error');
    }
  };

  const note = !hasAudio ? 'No recording available for this call'
    : phase === 'error' ? 'Could not load the recording. Tap to try again'
      : phase === 'loading' ? 'Loading recording...'
        : null;
  const ratio = phase === 'ready' && total > 0 ? Math.min(1, status.currentTime / total) : 0;

  return (
    <View style={[styles.player, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.playerRow}>
        <Pressable
          onPress={toggle}
          disabled={!hasAudio || phase === 'loading'}
          accessibilityRole="button"
          accessibilityLabel={!hasAudio ? 'Recording unavailable' : status.playing ? 'Pause recording' : 'Play recording'}
          accessibilityState={{ disabled: !hasAudio || phase === 'loading' }}
          style={({ pressed }) => [styles.play, { backgroundColor: hasAudio ? theme.primary : withAlpha(theme.primary, 0.35) }, pressed && { opacity: PRESSED_OPACITY }]}>
          {phase === 'loading'
            ? <ActivityIndicator color="#FFFFFF" />
            : <Ionicons name={status.playing ? 'pause' : 'play'} size={24} color="#FFFFFF" style={status.playing ? undefined : styles.playIcon} />}
        </Pressable>
        <View style={styles.flex1}>
          <View style={[styles.progress, { backgroundColor: theme.border }]}>
            <View style={{ height: 4, borderRadius: 2, width: `${ratio * 100}%`, backgroundColor: theme.primary }} />
          </View>
          <ThemedText themeColor="textMuted" style={[styles.time, TABULAR]}>
            {formatClock(phase === 'ready' ? status.currentTime : 0)} / {formatClock(total)}
          </ThemedText>
        </View>
      </View>
      {note ? <ThemedText themeColor={phase === 'error' ? undefined : 'textMuted'} style={[styles.playerNote, phase === 'error' && { color: theme.danger }]}>{note}</ThemedText> : null}
    </View>
  );
}

function SummaryBlock({ summary }: { summary: CallSummaryData }) {
  if (summary.notice) return <ThemedText themeColor="textMuted" style={styles.prose}>{summary.notice}</ThemedText>;
  const empty = !summary.intent && !summary.nextSteps && ![summary.keyPoints, summary.decisions, summary.actionItems, summary.objections].some((l) => l.length);
  // Older records (before the current summary format) have none of the current fields: say so rather than show a blank tab.
  if (empty) return <ThemedText themeColor="textMuted" style={styles.prose}>The saved summary has no usable content (older format or nothing was said).</ThemedText>;
  const lists: { label: string; items: string[] }[] = [
    { label: 'Key points', items: summary.keyPoints },
    { label: 'Decisions', items: summary.decisions },
    { label: 'Action items', items: summary.actionItems },
    { label: 'Objections', items: summary.objections },
  ];
  return (
    <View style={styles.sections}>
      {summary.intent ? <Section label="Intent"><ThemedText style={styles.prose}>{summary.intent}</ThemedText></Section> : null}
      {lists.filter((l) => l.items.length).map((l) => (
        <Section key={l.label} label={l.label}>
          {l.items.map((item, i) => <ThemedText key={i} style={styles.prose}>{`\u2022 ${item}`}</ThemedText>)}
        </Section>
      ))}
      {summary.nextSteps ? <Section label="Next steps"><ThemedText style={styles.prose}>{summary.nextSteps}</ThemedText></Section> : null}
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText themeColor="textMuted" style={styles.sectionLabel}>{label}</ThemedText>
      {children}
    </View>
  );
}

// Speaker = recording channel: channel 0 is the salesman, channel 1 the customer.
function TranscriptView({ turns }: { turns: CallTurn[] }) {
  const theme = useTheme();
  return (
    <View style={styles.sections}>
      {turns.map((t, i) => (
        <View key={i} style={styles.turn}>
          <ThemedText style={[styles.speaker, { color: t.speaker === 'SALESMAN' ? theme.primary : theme.textSecondary }]}>
            {t.speaker === 'SALESMAN' ? 'Salesman' : t.speaker === 'CUSTOMER' ? 'Customer' : t.speaker}
          </ThemedText>
          <ThemedText style={styles.prose}>{t.text}</ThemedText>
        </View>
      ))}
    </View>
  );
}

// Why a tab has nothing to show, from the stage status (never a made-up placeholder).
function emptyText(what: 'summary' | 'transcript', status: CallTrackerEntry['transcriptStatus'], failure?: string) {
  if (status === 'failed') return `The ${what} failed${failure ? `: ${failure}` : '.'}`;
  if (status === 'processing') return `The ${what} is still being prepared.`;
  return `No ${what} yet for this call.`;
}

function KeyValue({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.kv, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <ThemedText themeColor="textMuted" style={styles.kvLabel}>{label}</ThemedText>
      <View style={styles.kvValue}>{children}</View>
    </View>
  );
}

function CopyButton({ text }: { text: string }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Pressable onPress={copy} hitSlop={Spacing.two} accessibilityRole="button" accessibilityLabel="Copy call ID" style={({ pressed }) => [styles.copy, pressed && { opacity: PRESSED_OPACITY }]}>
      <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={copied ? theme.success : theme.textSecondary} />
    </Pressable>
  );
}

// The selected call: header, metrics, player and Summary / Transcript / Details.
// Give it key={callId} so the tab resets when the call changes.
export function CallDetail({ call: listCall }: { call: CallTrackerEntry }) {
  const theme = useTheme();
  const [tab, setTab] = useState<DetailTab>('summary');
  const [call, setCall] = useState(listCall);
  const [detailError, setDetailError] = useState<string | null>(null);
  const wantsDetail = !listCall.detailLoaded && (listCall.transcriptStatus === 'completed' || listCall.summaryStatus === 'completed');

  useEffect(() => {
    if (!wantsDetail) return;
    let cancelled = false;
    fetchCallTrackerDetail(listCall)
      .then((full) => { if (!cancelled) setCall(full); })
      .catch((err) => { if (!cancelled) setDetailError(getErrorMessage(err, 'Could not load the transcript and summary.')); });
    return () => { cancelled = true; };
  }, [listCall, wantsDetail]);

  return (
    <View style={styles.detail}>
      <View style={styles.hero}>
        <Avatar name={call.salesperson} size={56} />
        <View style={styles.flex1}>
          <ThemedText style={[styles.number, TABULAR]}>{call.customerPhoneMasked}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.when}>{longDay(call.startedAt)} · {timeRange(call.startedAt, call.endedAt)}</ThemedText>
        </View>
      </View>
      <View style={[styles.pill, { backgroundColor: withAlpha(theme.primary, 0.1) }]}>
        <Ionicons name={call.direction === 'OUTBOUND' ? 'arrow-up-outline' : 'arrow-down-outline'} size={14} color={theme.primary} style={styles.pillIcon} />
        <ThemedText style={[styles.pillText, { color: theme.primary }]}>{directionLabel(call.direction)}</ThemedText>
      </View>

      <View style={styles.metrics}>
        <Metric label="Duration" value={formatClock(call.durationSeconds)} />
        <Metric label="Talk time" value={formatClock(call.talkTimeSeconds)} />
        <Metric label="Salesperson" value={call.salesperson} />
      </View>

      <PlayerCard call={call} />

      <Segmented options={TABS} value={tab} onChange={(v) => setTab(v as DetailTab)} />

      {/* Fixed minimum height so switching tabs does not make the page jump. */}
      <View style={styles.tabBody}>
        <FadeIn key={tab}>
          {tab === 'summary' ? (
            call.summaryData ? <SummaryBlock summary={call.summaryData} />
              : <ThemedText themeColor="textMuted" style={styles.prose}>{detailError ?? (wantsDetail ? 'Loading...' : emptyText('summary', call.summaryStatus, call.failureReason))}</ThemedText>
          ) : tab === 'transcript' ? (
            call.turns ? <TranscriptView turns={call.turns} />
              : call.transcript ? <ThemedText style={[styles.prose, styles.transcript]}>{call.transcript}</ThemedText>
                : <ThemedText themeColor="textMuted" style={styles.prose}>{detailError ?? (wantsDetail ? 'Loading...' : emptyText('transcript', call.transcriptStatus, call.failureReason))}</ThemedText>
          ) : (
            <View>
              <KeyValue label="Call ID">
                <ThemedText style={styles.mono} selectable numberOfLines={1} ellipsizeMode="middle">{call.callId}</ThemedText>
                <CopyButton text={call.callId} />
              </KeyValue>
              <KeyValue label="Salesperson no."><ThemedText style={[styles.kvText, TABULAR]}>{call.salespersonPhoneMasked}</ThemedText></KeyValue>
              <KeyValue label="Source"><ThemedText style={styles.kvText}>{call.source}</ThemedText></KeyValue>
              <KeyValue label="Recording"><Badge size="sm" variant={STATUS_VARIANT[call.recordingStatus]}>{call.recordingStatus}</Badge></KeyValue>
              <KeyValue label="Transcript"><Badge size="sm" variant={STATUS_VARIANT[call.transcriptStatus]}>{call.transcriptStatus}</Badge></KeyValue>
              <KeyValue label="Summary" last><Badge size="sm" variant={STATUS_VARIANT[call.summaryStatus]}>{call.summaryStatus}</Badge></KeyValue>
            </View>
          )}
        </FadeIn>
      </View>
    </View>
  );
}

// Phone: full-height sheet with a close button.
export function CallDetailModal({ call, onClose }: { call: CallTrackerEntry | null; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!call} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && { opacity: PRESSED_OPACITY }]}>
            <Ionicons name="chevron-down" size={26} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.modalTitle}>Call details</ThemedText>
          <View style={styles.close} />
        </View>
        {call ? (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.four }}>
            <CallDetail key={call.callId} call={call} />
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  detail: { padding: Spacing.three, gap: Spacing.three },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  number: { fontSize: 22, lineHeight: 28, fontFamily: FontWeights.bold },
  when: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, paddingHorizontal: 12, minHeight: 28, borderRadius: Radii.pill },
  pillIcon: { transform: [{ rotate: '45deg' }] },
  pillText: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
  metrics: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, minWidth: 0, gap: 4, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.md },
  metricLabel: { fontSize: 12, lineHeight: 16 },
  metricValue: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  player: { gap: 12, padding: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radii.md },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  play: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  playIcon: { marginLeft: 3 },
  progress: { height: 4, borderRadius: 2 },
  time: { fontSize: 12, lineHeight: 16, marginTop: Spacing.two },
  playerNote: { fontSize: 13, lineHeight: 18 },
  tabBody: { minHeight: 240 },
  prose: { fontSize: 15, lineHeight: 22 },
  transcript: { lineHeight: 22 },
  sections: { gap: Spacing.three },
  section: { gap: 4 },
  sectionLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  turn: { gap: 2 },
  speaker: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  kv: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: 48 },
  kvLabel: { width: 110, fontSize: 13, lineHeight: 18 },
  kvValue: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.two },
  kvText: { fontSize: 15, lineHeight: 22 },
  mono: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontFamily: Fonts?.mono },
  copy: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.two },
  modalTitle: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
