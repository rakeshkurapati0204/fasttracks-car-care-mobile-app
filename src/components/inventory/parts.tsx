import { Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { FontWeights, Fonts, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const WIDE_MIN = 560;

// Dashboard FieldRow: small uppercase label above the control, hint below.
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText themeColor="textSecondary" style={styles.fieldLabel}>{label.toUpperCase()}</ThemedText>
      {children}
      {hint ? <ThemedText themeColor="textMuted" style={styles.hint}>{hint}</ThemedText> : null}
    </View>
  );
}

// Dashboard SectionDivider: a hairline with its small caps title.
export function SectionDivider({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.divider}>
      <ThemedText themeColor="textMuted" style={styles.dividerText}>{title.toUpperCase()}</ThemedText>
      <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
    </View>
  );
}

export function StepIndicator({ step, steps }: { step: number; steps: string[] }) {
  const theme = useTheme();
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => {
        const done = i + 1 <= step;
        return (
          <Fragment key={s}>
            <View style={styles.stepCol}>
              <View style={[styles.stepDot, { backgroundColor: done ? theme.primary : theme.surface, borderColor: done ? theme.primary : theme.border }]}>
                <ThemedText style={[styles.stepNum, { color: done ? '#ffffff' : theme.textMuted }]}>{i + 1}</ThemedText>
              </View>
              <ThemedText numberOfLines={1} style={[styles.stepLabel, { color: i + 1 === step ? theme.primary : theme.textMuted }]}>{s}</ThemedText>
            </View>
            {i < steps.length - 1 ? <View style={[styles.stepLine, { backgroundColor: i + 1 < step ? theme.primary : theme.border }]} /> : null}
          </Fragment>
        );
      })}
    </View>
  );
}

// Dashboard SummaryField (review step).
export function SummaryField({ label, value, mono, highlight, span }: { label: string; value: string; mono?: boolean; highlight?: boolean; span?: boolean }) {
  const theme = useTheme();
  return (
    <View style={span ? styles.summarySpan : styles.summaryHalf}>
      <ThemedText themeColor="textMuted" style={styles.summaryLabel}>{label.toUpperCase()}</ThemedText>
      <ThemedText style={[styles.summaryValue, highlight && { color: theme.primary, fontFamily: FontWeights.bold }, mono && styles.mono]}>{value}</ThemedText>
    </View>
  );
}

// Coloured pill (status / verified / draft badges).
export function Pill({ label, bg, color, strong }: { label: string; bg: string; color: string; strong?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <ThemedText style={[styles.pillText, { color }, strong && { fontFamily: FontWeights.bold }]}>{label}</ThemedText>
    </View>
  );
}

// Two-way segmented toggle (stock mode, Universal / Specific cars).
export function Toggle<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.toggle, { borderColor: theme.border }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[styles.toggleBtn, { backgroundColor: on ? theme.primary : theme.surface }]}>
            <ThemedText style={[styles.toggleText, { color: on ? '#ffffff' : theme.textSecondary }]}>{o.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function InlineError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.err, { backgroundColor: withAlpha(theme.danger, 0.08), borderColor: withAlpha(theme.danger, 0.3) }]}>
      <ThemedText style={[styles.errText, { color: theme.danger }]}>{message}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.5 },
  hint: { fontSize: 11, lineHeight: 15 },
  divider: { gap: 6, marginTop: 4 },
  dividerText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold, letterSpacing: 0.7 },
  dividerLine: { height: 1 },
  steps: { flexDirection: 'row', alignItems: 'flex-start' },
  stepCol: { alignItems: 'center', gap: 4, maxWidth: 110 },
  stepDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.bold },
  stepLabel: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold },
  stepLine: { flex: 1, height: 2, marginTop: 13, marginHorizontal: 6 },
  summarySpan: { width: '100%' },
  summaryHalf: { width: '47%', flexGrow: 1 },
  summaryLabel: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.semiBold, letterSpacing: 0.4, marginBottom: 2 },
  summaryValue: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  mono: { fontFamily: Fonts?.mono },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillText: { fontSize: 11, lineHeight: 14, fontFamily: FontWeights.bold },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  toggleBtn: { flex: 1, minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold, textAlign: 'center' },
  err: { borderWidth: 1, borderRadius: Radii.md, padding: 10 },
  errText: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.semiBold },
});
