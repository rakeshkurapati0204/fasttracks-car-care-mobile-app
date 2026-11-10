import { Children, createContext, useContext, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Badge, Card, Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useContentWidth } from '@/lib/drawer-context';
import { statusLook } from '@/lib/overview-format';

// Tailwind "sm" breakpoint, used wherever the dashboard has an sm: class.
export const SM_BREAKPOINT = 640;

// The Overview decides its columns from the width of its own container (the
// area beside the fixed sidebar), not from the window.
export const OVERVIEW_WIDE_MIN = 560;

const WideContext = createContext<boolean | null>(null);

export function OverviewFrame({ children }: { children: ReactNode }) {
  const contentWidth = useContentWidth();
  const [width, setWidth] = useState(contentWidth);
  return (
    <View
      style={styles.frame}
      onLayout={(e) => {
        console.log('[overview] container width', Math.round(e.nativeEvent.layout.width), 'window-based', Math.round(contentWidth)); // TEMP
        setWidth(e.nativeEvent.layout.width);
      }}>
      <WideContext.Provider value={width >= OVERVIEW_WIDE_MIN}>{children}</WideContext.Provider>
    </View>
  );
}

// True when the Overview container is wide (2 columns, 4 stat cards per row).
export function useIsTablet() {
  const measured = useContext(WideContext);
  const contentWidth = useContentWidth();
  return measured ?? contentWidth >= OVERVIEW_WIDE_MIN;
}

// Stat cards: 2 per row on a phone, 4 per row at sm+ (override with
// phoneCols / tabletCols for other card grids).
export function StatGrid({ children, phoneCols = 2, tabletCols = 4 }: { children: ReactNode; phoneCols?: number; tabletCols?: number }) {
  const cols = useIsTablet() ? tabletCols : phoneCols;
  const items = Children.toArray(children);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));

  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((item, c) => (
            <View key={c} style={styles.gridCell}>{item}</View>
          ))}
          {Array.from({ length: cols - row.length }).map((_, k) => (
            <View key={`pad-${k}`} style={styles.gridCell} />
          ))}
        </View>
      ))}
    </View>
  );
}

// Dashboard error banner: danger text on a 10% danger tint with a 30% border.
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: withAlpha(theme.danger, 0.1), borderColor: withAlpha(theme.danger, 0.3) }]}>
      <ThemedText type="small" style={{ color: theme.danger, flexShrink: 1 }}>{message}</ThemedText>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={Spacing.two}>
          <ThemedText type="small" style={{ color: theme.danger, textDecorationLine: 'underline', fontFamily: FontWeights.semiBold }}>Retry</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

// Dashboard StatusBadge.
export function StatusBadge({ status }: { status: string }) {
  const look = statusLook(status);
  return <Badge variant={look.variant} size="sm">{look.label}</Badge>;
}

// Small uppercase muted heading, like the dashboard's section <h2>s.
export function SectionLabel({ children }: { children: string }) {
  return (
    <ThemedText themeColor="textMuted" style={styles.sectionLabel}>{children.toUpperCase()}</ThemedText>
  );
}

// Primary-coloured text link ("View all →", "+ New →").
export function LinkText({ children, onPress }: { children: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={Spacing.two}>
      <ThemedText style={[styles.link, { color: theme.primary }]}>{children}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  gridCell: { flex: 1 },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: Radii.md },
  sectionLabel: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold, letterSpacing: 0.8 },
  link: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.medium },
});

// The dashboard Overview page's own local StatCard (not KPICard): a padded
// Card with a 12px muted label, 24px bold mono value, and a 12px muted sub line.
export function OverviewStat({ label, value, sub, color, compact }: { label: string; value: string | number; sub?: string; color?: string; compact?: boolean }) {
  const theme = useTheme();
  return (
    <Card padding={compact ? 'sm' : 'md'} style={statStyles.card}>
      <ThemedText themeColor="textMuted" style={compact ? statStyles.labelCompact : statStyles.label} numberOfLines={1}>{label}</ThemedText>
      <ThemedText
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[compact ? statStyles.valueCompact : statStyles.value, { color: color ?? theme.text }]}>
        {value}
      </ThemedText>
      {sub ? <ThemedText themeColor="textMuted" style={compact ? statStyles.subCompact : statStyles.sub} numberOfLines={2}>{sub}</ThemedText> : null}
    </Card>
  );
}

// Dashboard SkeletonCard: p-4 card with two bars.
export function OverviewStatSkeleton() {
  return (
    <Card padding="sm" style={[statStyles.card, statStyles.skeleton]}>
      <Skeleton width={80} height={12} />
      <Skeleton width={112} height={28} />
    </Card>
  );
}

const statStyles = StyleSheet.create({
  card: { flexGrow: 1 },
  labelCompact: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.medium },
  valueCompact: { fontSize: 15, lineHeight: 20, marginTop: 2, fontFamily: Fonts?.mono, fontWeight: '700' },
  subCompact: { fontSize: 10, lineHeight: 13, marginTop: 2 },
  label: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  value: { fontSize: 24, lineHeight: 30, marginTop: 4, fontFamily: Fonts?.mono, fontWeight: '700' },
  sub: { fontSize: 12, lineHeight: 16, marginTop: 4 },
  skeleton: { padding: 16, gap: 8 },
});

// Dashboard "Open Jobs by Employee" / "Walkouts by Staff" card: a compact
// header (11px bold uppercase, 0.05em tracking, muted) over a divider, then rows.
export function CompactListCard({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Card padding="none" style={compactStyles.clip}>
      <View style={[compactStyles.header, { borderBottomColor: theme.border }]}>
        <ThemedText themeColor="textMuted" style={compactStyles.title}>{title.toUpperCase()}</ThemedText>
      </View>
      <View style={compactStyles.body}>{children}</View>
    </Card>
  );
}

const compactStyles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  title: { fontSize: 11, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.55 },
  body: { paddingHorizontal: 16 },
});
