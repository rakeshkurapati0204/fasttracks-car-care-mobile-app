import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { fmtDateTime, scoreVariant } from '@/components/applications/application-format';
import { isDegradedScreening } from '@/components/applications/scoring';
import { CollapseToggle } from '@/components/applications/scorecard-panel';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getErrorMessage, runAiScreening } from '@/lib/api';
import type { ApplicationRowData } from '@/types/api';

type Props = {
  application: ApplicationRowData;
  onChanged: (a: ApplicationRowData) => void;
};

// Dashboard "AI Screening (advisory only)" panel: score badge, date and model,
// Re-run, and collapsed-by-default skills / summary / rationale. A screening
// that couldn't run shows "Not scored" with the reason, never a score of 0.
export function AiScreeningPanel({ application, onChanged }: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [screening, setScreening] = useState(false);
  const [error, setError] = useState('');

  const result = application.aiScreeningResult ?? null;
  if (!result) return null;

  const degraded = isDegradedScreening(result);
  const hasDetails = result.skillsMatched.length > 0 || !!result.experienceSummary || !!result.rationale;
  const inPipeline = !application.convertedUserId && application.status !== 'REJECTED';
  const screeningStage = inPipeline && (application.status === 'APPLIED' || application.status === 'AI_SCREENING');
  // Screening needs a résumé to read and a role to screen against.
  const canScreen = screeningStage && !!application.resumeFilename;
  const blockedReason = !application.roleApplied ? 'Set the role applied for before running AI screening.' : '';

  const rerun = async () => {
    setScreening(true);
    setError('');
    try {
      onChanged((await runAiScreening(application.id)) as ApplicationRowData);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to run AI screening.'));
    } finally {
      setScreening(false);
    }
  };

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <ThemedText themeColor="textMuted" style={styles.title}>AI SCREENING (ADVISORY ONLY)</ThemedText>
      <View style={styles.badges}>
        {degraded ? <Badge size="sm" variant="warning">Not scored</Badge> : <Badge size="sm" variant={scoreVariant(result.fitScore)}>Fit Score: {result.fitScore}</Badge>}
        {canScreen ? <Button size="sm" variant="secondary" loading={screening} disabled={!!blockedReason} onPress={rerun}>{screening ? 'Screening…' : 'Re-run'}</Button> : null}
      </View>
      {/* Date AND time: a same-day re-run must visibly change this. */}
      <ThemedText themeColor="textMuted" style={styles.small}>{fmtDateTime(application.aiScreenedAt)} · {result.modelUsed}</ThemedText>
      {blockedReason && canScreen ? <ThemedText themeColor="textMuted" style={styles.small}>{blockedReason}</ThemedText> : null}
      {error ? <ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText> : null}

      {degraded ? (
        <ThemedText style={[styles.small, { color: theme.warning }]}>Screening didn&apos;t produce a score: {result.rationale}</ThemedText>
      ) : hasDetails ? (
        <>
          <CollapseToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
          {expanded ? (
            <View style={styles.details}>
              {result.skillsMatched.length > 0 ? (
                <View style={styles.badges}>
                  {result.skillsMatched.map((skill, i) => <Badge key={i} size="sm" variant="secondary">{skill}</Badge>)}
                </View>
              ) : null}
              {result.experienceSummary ? <ThemedText style={styles.body}>{result.experienceSummary}</ThemedText> : null}
              {result.rationale ? <ThemedText themeColor="textSecondary" style={[styles.body, styles.italic]}>{result.rationale}</ThemedText> : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: 16, gap: 8, borderRadius: Radii.md, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  small: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 20 },
  italic: { fontStyle: 'italic' },
  details: { gap: 8 },
});
