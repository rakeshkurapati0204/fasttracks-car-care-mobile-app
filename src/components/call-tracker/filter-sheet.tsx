import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { ALL, type Filters } from '@/components/call-tracker/filters';
import { PRESSED_OPACITY, SectionTitle, Segmented } from '@/components/call-tracker/primitives';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  visible: boolean;
  filters: Filters;
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onReset: () => void;
  onClose: () => void;
  salespeople: string[];
  sources: string[];
  resultCount: number;
};

const DIRECTION = [
  { value: ALL, label: 'All' },
  { value: 'INBOUND', label: 'Incoming' },
  { value: 'OUTBOUND', label: 'Outgoing' },
];

const yesNo = (yes: string) => [
  { value: ALL, label: 'Any' },
  { value: yes, label: 'Yes' },
  { value: 'not', label: 'No' },
];

function OptionList({ options, value, onSelect }: { options: string[]; value: string; onSelect: (v: string) => void }) {
  const theme = useTheme();
  const all = [{ value: ALL, label: 'All' }, ...options.map((o) => ({ value: o, label: o }))];
  return (
    <View>
      {all.map((o, i) => {
        const active = o.value === value;
        return (
          <View key={o.value}>
            <Pressable
              onPress={() => onSelect(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [styles.option, pressed && { opacity: PRESSED_OPACITY }]}>
              <ThemedText style={[styles.optionText, active && { color: theme.primary, fontFamily: FontWeights.semiBold }]}>{o.label}</ThemedText>
              {active ? <Ionicons name="checkmark" size={20} color={theme.primary} /> : null}
            </Pressable>
            {i < all.length - 1 ? <View style={[styles.hairline, { backgroundColor: theme.border }]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

// Bottom sheet with the grouped filters. Edits apply live; the footer button
// just closes and shows how many calls match.
export function FilterSheet({ visible, filters, onChange, onReset, onClose, salespeople, sources, resultCount }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close filters" />
        <View style={[styles.sheet, { backgroundColor: theme.backgroundElement, paddingBottom: insets.bottom }]}>
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: withAlpha(theme.textMuted, 0.4) }]} />
          </View>
          <View style={styles.header}>
            <ThemedText style={styles.title}>Filters</ThemedText>
            <Pressable onPress={onClose} hitSlop={Spacing.two} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && { opacity: PRESSED_OPACITY }]}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.section}>
              <SectionTitle>Direction</SectionTitle>
              <Segmented options={DIRECTION} value={filters.direction} onChange={(v) => onChange('direction', v)} />
            </View>
            <View style={styles.section}>
              <SectionTitle>Salesperson</SectionTitle>
              <OptionList options={salespeople} value={filters.salesperson} onSelect={(v) => onChange('salesperson', v)} />
            </View>
            <View style={styles.section}>
              <SectionTitle>Source</SectionTitle>
              <OptionList options={sources} value={filters.source} onSelect={(v) => onChange('source', v)} />
            </View>
            <View style={styles.section}>
              <SectionTitle>Recording</SectionTitle>
              <Segmented options={yesNo('available')} value={filters.recording} onChange={(v) => onChange('recording', v)} />
            </View>
            <View style={styles.section}>
              <SectionTitle>Transcript</SectionTitle>
              <Segmented options={yesNo('completed')} value={filters.transcript} onChange={(v) => onChange('transcript', v)} />
            </View>
            <View style={styles.section}>
              <SectionTitle>Summary</SectionTitle>
              <Segmented options={yesNo('completed')} value={filters.summary} onChange={(v) => onChange('summary', v)} />
            </View>
            <View style={styles.section}>
              <SectionTitle>Date range</SectionTitle>
              <View style={styles.dates}>
                <View style={styles.flex1}><DateField label="From" value={filters.from} onChange={(v) => onChange('from', v)} /></View>
                <View style={styles.flex1}><DateField label="To" value={filters.to} onChange={(v) => onChange('to', v)} /></View>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Button variant="ghost" onPress={onReset}>Reset</Button>
            <Button style={styles.flex1} onPress={onClose}>{`Show ${resultCount} call${resultCount === 1 ? '' : 's'}`}</Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { width: '100%', maxWidth: 600, maxHeight: '90%', borderTopLeftRadius: Radii.lg, borderTopRightRadius: Radii.lg },
  grabber: { alignItems: 'center', paddingTop: Spacing.two },
  grabberBar: { width: 36, height: 4, borderRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: 12 },
  title: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -12 },
  body: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.four },
  section: { gap: 12 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionText: { fontSize: 16, lineHeight: 22 },
  hairline: { height: StyleSheet.hairlineWidth },
  dates: { flexDirection: 'row', gap: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.three, paddingTop: 12, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
