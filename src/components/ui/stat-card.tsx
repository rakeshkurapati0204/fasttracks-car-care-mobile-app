import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fonts, FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useCountUp } from '@/hooks/use-count-up';
import { useTheme } from '@/hooks/use-theme';
import { SkeletonCard } from '@/components/ui/skeleton';

export type StatCardProps = {
  label: string;
  value: string | number;
  /** Small line under the value. */
  subtitle?: string;
  /** Ionicons name for the tinted icon tile (top right). */
  icon?: keyof typeof Ionicons.glyphMap;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  trend?: 'up' | 'down' | 'neutral';
  /** Text next to the value, e.g. "+12%". Coloured by `trend`. */
  trendValue?: string;
  /** Colour of the big number (the dashboard tints it: success for collections, danger for outstanding…). */
  valueColor?: string;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Dashboard KPICard: uppercase muted label, mono 24px semibold value, 10%
// tinted icon tile, trend in success/danger/muted.
export function StatCard({ label, value, subtitle, icon, color = 'primary', trend, trendValue, valueColor, loading = false, style }: StatCardProps) {
  const theme = useTheme();
  const counted = useCountUp(value);
  if (loading) return <SkeletonCard style={style} />;

  const accent = theme[color];
  const trendColor = trend === 'up' ? theme.success : trend === 'down' ? theme.danger : theme.textMuted;

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      <View style={styles.top}>
        <ThemedText themeColor="textMuted" style={styles.label} numberOfLines={1}>{label}</ThemedText>
        {icon ? (
          <View style={[styles.iconTile, { backgroundColor: withAlpha(accent, 0.1) }]}>
            <Ionicons name={icon} size={22} color={accent} />
          </View>
        ) : null}
      </View>
      <View style={styles.valueRow}>
        <ThemedText style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{counted}</ThemedText>
        {trend && trendValue ? (
          <View style={styles.trend}>
            {trend !== 'neutral' ? <Ionicons name={trend === 'up' ? 'arrow-up' : 'arrow-down'} size={14} color={trendColor} /> : null}
            <ThemedText style={[styles.trendText, { color: trendColor }]}>{trendValue}</ThemedText>
          </View>
        ) : null}
      </View>
      {subtitle ? <ThemedText themeColor="textMuted" style={styles.subtitle}>{subtitle}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radii.md, padding: 24, gap: 12 },
  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
  label: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: FontWeights.medium, textTransform: 'uppercase', letterSpacing: 0.6 },
  iconTile: { width: 44, height: 44, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  value: { flexShrink: 1, fontSize: 24, lineHeight: 28, fontFamily: Fonts?.mono, fontWeight: '600' },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  trendText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  subtitle: { fontSize: 12, lineHeight: 16 },
});
