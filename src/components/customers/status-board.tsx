import { Fragment, memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BOARD_STAGE_LABELS, BOARD_WALKOUT_REASON_LABELS } from '@/lib/customers-format';
import type { BoardStage, CjJobCard } from '@/types/api';

type CardProps = {
  job: CjJobCard;
  onAdvance: (job: CjJobCard, stage: BoardStage) => void;
  onWalkout: (job: CjJobCard) => void;
  disabled: boolean;
};

const RED = '#ef4444';

// Dashboard StatusBoardCard: vehicle + job number, customer line, stage track,
// and the one or two actions the stage allows.
function StatusBoardCardBase({ job, onAdvance, onWalkout, disabled }: CardProps) {
  const theme = useTheme();
  const done = job.boardStage === 'COLLECTED' || job.boardStage === 'WALKED_OUT';
  const track: BoardStage[] = job.boardStage === 'WALKED_OUT' ? ['CREATED', 'QUOTED', 'WALKED_OUT'] : ['CREATED', 'QUOTED', 'HANDED_OVER', 'COLLECTED'];
  const currentIdx = track.indexOf(job.boardStage);

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: done ? 0.55 : 1 }]}>
      <View style={styles.between}>
        <ThemedText style={[styles.vehicle, styles.flex1]} numberOfLines={1}>{job.vehicleNumber || 'Walk-in / No vehicle'}</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.small}>{job.jobNumber}</ThemedText>
      </View>
      <ThemedText themeColor="textMuted" style={styles.small}>
        {job.vehicle?.make ? `${job.vehicle.make}${job.vehicle.model ? ' ' + job.vehicle.model : ''} · ` : ''}
        {job.customer.name} · {job.customer.phone}
      </ThemedText>
      <ThemedText themeColor="textMuted" style={[styles.small, styles.gap]}>By {job.handledBy.name}</ThemedText>

      <View style={styles.track}>
        {track.map((stage, i) => (
          <Fragment key={stage}>
            {i > 0 && <View style={[styles.line, { backgroundColor: i <= currentIdx ? theme.primary : theme.border }]} />}
            <View style={[styles.dot, { backgroundColor: stage === 'WALKED_OUT' && i === currentIdx ? RED : i <= currentIdx ? theme.primary : theme.border }]} />
          </Fragment>
        ))}
      </View>
      <ThemedText themeColor="textMuted" style={[styles.small, styles.gap]}>{BOARD_STAGE_LABELS[job.boardStage]}</ThemedText>

      {job.boardStage === 'WALKED_OUT' && (
        <View>
          {job.boardWalkoutReason ? <ThemedText themeColor="textMuted" style={styles.small}>Reason: {BOARD_WALKOUT_REASON_LABELS[job.boardWalkoutReason] ?? job.boardWalkoutReason}</ThemedText> : null}
          {job.boardWalkoutRemarks ? <ThemedText themeColor="textMuted" style={[styles.small, styles.italic]}>“{job.boardWalkoutRemarks}”</ThemedText> : null}
        </View>
      )}

      {job.boardStage === 'CREATED' && <Button fullWidth disabled={disabled} onPress={() => onAdvance(job, 'QUOTED')}>Mark quoted</Button>}
      {job.boardStage === 'QUOTED' && (
        <View style={styles.actions}>
          <Button style={styles.flex1} disabled={disabled} onPress={() => onAdvance(job, 'HANDED_OVER')}>Handed over</Button>
          <Pressable
            onPress={() => onWalkout(job)}
            disabled={disabled}
            accessibilityRole="button"
            style={({ pressed }) => [styles.walkoutBtn, { backgroundColor: withAlpha(RED, 0.12) }, (disabled || pressed) && { opacity: 0.5 }]}>
            <ThemedText style={[styles.walkoutText, { color: RED }]}>Walkout</ThemedText>
          </Pressable>
        </View>
      )}
      {job.boardStage === 'HANDED_OVER' && <Button fullWidth disabled={disabled} onPress={() => onAdvance(job, 'COLLECTED')}>Mark collected</Button>}
    </View>
  );
}

// Memoised: the board passes stable callbacks.
export const StatusBoardCard = memo(StatusBoardCardBase);

export const BOARD_PAGE = 20;

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  card: { padding: Spacing.three, borderRadius: Radii.lg, borderWidth: 1, gap: 2 },
  between: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  vehicle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 18 },
  italic: { fontStyle: 'italic' },
  gap: { marginBottom: 8 },
  track: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  line: { flex: 1, height: 2 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  walkoutBtn: { paddingHorizontal: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radii.md },
  walkoutText: { fontSize: 14, fontFamily: FontWeights.semiBold },
});
