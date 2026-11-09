import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, FadeIn, PRESSED_OPACITY, SectionTitle } from '@/components/call-tracker/primitives';
import { ThemedText } from '@/components/themed-text';
import { Skeleton } from '@/components/ui';
import { FontWeights, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClock, type CallTrackerEntry } from '@/lib/call-tracker';
import { dayHeading, dayKey, timeLabel } from '@/lib/call-tracker-format';

const TABULAR = { fontVariant: ['tabular-nums' as const] };
const TEXT_INSET = Spacing.three + 40 + 12; // row padding + avatar + gap: where the divider starts

function Indicator({ icon, label, done }: { icon: keyof typeof Ionicons.glyphMap; label: string; done: boolean }) {
  const theme = useTheme();
  const color = done ? theme.success : theme.textMuted;
  return (
    <View style={styles.indicator}>
      <Ionicons name={icon} size={13} color={color} />
      <ThemedText style={[styles.indicatorText, { color }]}>{label}</ThemedText>
    </View>
  );
}

type RowProps = { call: CallTrackerEntry; selected?: boolean; onPress: () => void; divider: boolean };

export function CallRow({ call, selected, onPress, divider }: RowProps) {
  const theme = useTheme();
  const outgoing = call.direction === 'OUTBOUND';

  return (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Call with ${call.customerName ?? call.customerPhone} by ${call.salesperson}`}
        style={({ pressed }) => [
          styles.row,
          selected && { backgroundColor: withAlpha(theme.primary, 0.08) },
          pressed && { opacity: PRESSED_OPACITY },
        ]}>
        <Avatar name={call.salesperson} />
        <View style={styles.middle}>
          <ThemedText style={[styles.title, TABULAR]} numberOfLines={1}>{call.customerName ?? call.customerPhone}</ThemedText>
          <View style={styles.meta}>
            <Ionicons name={outgoing ? 'arrow-up-outline' : 'arrow-down-outline'} size={13} color={outgoing ? theme.textSecondary : theme.success} style={outgoing ? styles.outArrow : styles.inArrow} />
            <ThemedText themeColor="textMuted" style={styles.secondary} numberOfLines={1}>
              {call.customerName ? `${call.customerPhone} · ` : ''}{call.salesperson} · {timeLabel(call.startedAt)}
            </ThemedText>
          </View>
          <View style={styles.indicators}>
            <Indicator icon="headset-outline" label="Audio" done={call.recordingStatus === 'available'} />
            <Indicator icon="document-text-outline" label="Transcript" done={call.transcriptStatus === 'completed'} />
            <Indicator icon="sparkles-outline" label="Summary" done={call.summaryStatus === 'completed'} />
          </View>
        </View>
        <View style={styles.right}>
          <ThemedText style={[styles.duration, TABULAR]}>{formatClock(call.durationSeconds)}</ThemedText>
          <ThemedText themeColor="textMuted" style={[styles.talk, TABULAR]}>talk {formatClock(call.talkTimeSeconds)}</ThemedText>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
      </Pressable>
      {divider ? <View style={[styles.divider, { backgroundColor: theme.border, marginLeft: TEXT_INSET }]} /> : null}
    </View>
  );
}

// Same shape as a real row.
export function CallRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={40} height={40} circle />
      <View style={styles.middle}>
        <Skeleton width={110} height={16} />
        <Skeleton width={160} height={13} style={styles.skelGap} />
        <Skeleton width={190} height={12} style={styles.skelGap} />
      </View>
      <View style={styles.right}>
        <Skeleton width={36} height={15} />
        <Skeleton width={52} height={12} style={styles.skelGap} />
      </View>
    </View>
  );
}

type Group = { key: string; calls: CallTrackerEntry[] };

// Newest first, grouped by calendar day.
function groupByDay(calls: CallTrackerEntry[]): Group[] {
  const sorted = [...calls].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const groups: Group[] = [];
  for (const c of sorted) {
    const key = dayKey(c.startedAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.calls.push(c);
    else groups.push({ key, calls: [c] });
  }
  return groups;
}

export function CallList({ calls, todayYmd, selectedId, onSelect }: { calls: CallTrackerEntry[]; todayYmd: string; selectedId?: string; onSelect: (c: CallTrackerEntry) => void }) {
  let index = 0;
  return (
    <View>
      {groupByDay(calls).map((g) => (
        <View key={g.key}>
          <SectionTitle style={styles.sectionHead}>{dayHeading(g.key, todayYmd)}</SectionTitle>
          {g.calls.map((c, i) => (
            <FadeIn key={c.callId} delay={Math.min(index++, 8) * 40}>
              <CallRow call={c} selected={c.callId === selectedId} onPress={() => onSelect(c)} divider={i < g.calls.length - 1} />
            </FadeIn>
          ))}
        </View>
      ))}
    </View>
  );
}

// Used by the screen to order calls the same way the list does.
export function orderCalls(calls: CallTrackerEntry[]) {
  return groupByDay(calls).flatMap((g) => g.calls);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.three, paddingVertical: 12, minHeight: 72 },
  middle: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  outArrow: { transform: [{ rotate: '45deg' }] },
  inArrow: { transform: [{ rotate: '45deg' }] },
  secondary: { flexShrink: 1, fontSize: 13, lineHeight: 18 },
  indicators: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  indicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  indicatorText: { fontSize: 12, lineHeight: 16 },
  right: { alignItems: 'flex-end', gap: 2 },
  duration: { fontSize: 15, lineHeight: 20, fontFamily: FontWeights.semiBold },
  talk: { fontSize: 12, lineHeight: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  sectionHead: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.one },
  skelGap: { marginTop: 6 },
});
