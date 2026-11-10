import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// The dashboard's ACTION_LABELS (Document Access Log) and ACTION_LOG_LABELS
// (Action Log); the latter's keys are exactly the backend's ACTION_TYPES.
export const ACCESS_ACTION_LABELS: Record<string, string> = {
  VIEW_FILE: 'Viewed File',
  REVEAL_VALUE: 'Revealed Value',
};

export const ACTION_LOG_LABELS: Record<string, string> = {
  DOCUMENT_VERIFIED: 'Document Verified',
  DOCUMENT_REJECTED: 'Document Rejected',
  LETTER_ISSUED: 'Letter Issued',
  DISCIPLINE_ISSUED: 'Discipline Issued',
  TEMPLATE_CREATED: 'Template Created',
  TEMPLATE_UPDATED: 'Template Updated',
  TEMPLATE_APPROVED: 'Template Approved',
  INVITE_SENT: 'Onboarding Invite Sent',
  CANDIDATE_APPROVED: 'Candidate Approved',
  APPLICATION_INVITE_SENT: 'Application Invite Sent',
  APPLICATION_STATUS_CHANGED: 'Application Status Changed',
  INTERVIEW_SCHEDULED: 'Interview Scheduled',
};

// IST, like the dashboard.
export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

// A filter card: fields wrap onto new lines on narrow screens, plus the
// dashboard's "Clear filters" link when any filter is set.
export function FilterCard({ children, showClear, onClear }: { children: ReactNode; showClear: boolean; onClear: () => void }) {
  const theme = useTheme();
  return (
    <Card padding="md">
      <View style={styles.filters}>
        {Children.toArray(children).map((c, i) => <View key={i} style={styles.filter}>{c}</View>)}
        {showClear ? (
          <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" style={styles.clear}>
            <ThemedText style={[styles.clearText, { color: theme.textMuted }]}>Clear filters</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

export type Column = { title: string; flex: number };

// One table cell / card field: a primary line and an optional muted sub line.
export function CellText({ primary, sub, muted }: { primary: string; sub?: string | null; muted?: boolean }) {
  return (
    <View>
      <ThemedText themeColor={muted ? 'textMuted' : 'text'} style={styles.cell}>{primary}</ThemedText>
      {sub ? <ThemedText themeColor="textMuted" style={styles.sub}>{sub}</ThemedText> : null}
    </View>
  );
}

// Table header row (muted 12px semibold), the dashboard's <thead>.
export function TableHeader({ columns }: { columns: Column[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, styles.boxTop, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={[styles.tr, { borderBottomColor: theme.border, borderBottomWidth: 1 }]}>
        {columns.map((c) => (
          <ThemedText key={c.title} themeColor="textMuted" style={[styles.th, { flex: c.flex }]}>{c.title}</ThemedText>
        ))}
      </View>
    </View>
  );
}

// One table row: side borders + a divider, so a FlatList of rows reads as one
// bordered card (rows are virtualised, so no wrapping card is possible).
export function TableRow({ columns, cells, last }: { columns: Column[]; cells: ReactNode[]; last: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, last && styles.boxBottom, { borderColor: theme.border, backgroundColor: theme.surface, borderTopWidth: 0, borderBottomWidth: 1 }]}>
      <View style={styles.tr}>
        {cells.map((cell, i) => <View key={columns[i].title} style={{ flex: columns[i].flex, paddingRight: 8 }}>{cell}</View>)}
      </View>
    </View>
  );
}

// The body states inside the table frame.
export function TableMessage({ children, last = true }: { children: ReactNode; last?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, last && styles.boxBottom, { borderColor: theme.border, backgroundColor: theme.surface, borderTopWidth: 0, borderBottomWidth: 1 }]}>
      <View style={styles.message}>{children}</View>
    </View>
  );
}

// Phone card for one log entry: the same five fields, stacked.
export function LogCard({ fields }: { fields: { label: string; primary: string; sub?: string | null; muted?: boolean }[] }) {
  return (
    <Card padding="md">
      <View style={styles.fields}>
        {fields.map((f) => (
          <View key={f.label}>
            <ThemedText themeColor="textMuted" style={styles.fieldLabel}>{f.label}</ThemedText>
            <CellText primary={f.primary} sub={f.sub} muted={f.muted} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 },
  filter: { flexGrow: 1, flexBasis: 150, minWidth: 140 },
  clear: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  clearText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  cell: { fontSize: 14, lineHeight: 20 },
  sub: { fontSize: 12, lineHeight: 16 },
  box: { borderLeftWidth: 1, borderRightWidth: 1, overflow: 'hidden' },
  boxTop: { borderTopWidth: 1, borderTopLeftRadius: Radii.md, borderTopRightRadius: Radii.md },
  boxBottom: { borderBottomLeftRadius: Radii.md, borderBottomRightRadius: Radii.md },
  tr: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 10 },
  th: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, paddingRight: 8 },
  message: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 16 },
  fields: { gap: 10 },
  fieldLabel: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold, marginBottom: 1 },
});
