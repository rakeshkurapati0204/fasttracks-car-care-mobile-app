import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, RefreshControl, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { ErrorBanner } from '@/components/overview/parts';
import { ActualHoursSheet, DashedButton, fmt, fmtDate, localToday, STATUS_STYLE, Toast } from '@/components/overtime/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Skeleton } from '@/components/ui';
import { Fonts, FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchMyOvertime, getErrorMessage, setOvertimeActualHours, submitOvertime } from '@/lib/api';
import type { OvertimeRequest } from '@/types/api';

const WIDE_MIN = 560;

function fmtTs(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type Row = { kind: 'header'; key: string; title: string; count: number } | { kind: 'req'; key: string; req: OvertimeRequest };

// Self-view only: GET /overtime/my is scoped to the caller server-side. The
// screen is hidden for OWNER in the registry, so there's no role gate here.
export default function OvertimeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [width, setWidth] = useState(0);
  const [requests, setRequests] = useState<OvertimeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ date: localToday(), requestedHours: '', reason: '', isUrgent: false });
  const [formError, setFormError] = useState('');

  const [actualModal, setActualModal] = useState<{ id: string; date: string } | null>(null);
  const [actualLoading, setActualLoading] = useState(false);

  const wide = width >= WIDE_MIN;

  const showToast = (type: 'success' | 'error', msg: string) => setToast({ type, msg });
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setRequests(await fetchMyOvertime());
    } catch {
      setLoadError('Failed to load overtime requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const submit = async () => {
    setFormError('');
    if (!form.date || !form.requestedHours || !form.reason.trim()) {
      setFormError('All fields are required.');
      return;
    }
    const hrs = parseFloat(form.requestedHours);
    if (isNaN(hrs) || hrs <= 0 || hrs > 12) {
      setFormError('Hours must be between 0.5 and 12.');
      return;
    }
    setSubmitting(true);
    try {
      await submitOvertime({ date: form.date, requestedHours: hrs, reason: form.reason.trim(), isUrgent: form.isUrgent });
      showToast('success', 'Overtime request submitted successfully.');
      setShowForm(false);
      setForm({ date: localToday(), requestedHours: '', reason: '', isUrgent: false });
      load();
    } catch (err: unknown) {
      setFormError(getErrorMessage(err, 'Failed to submit request.'));
    } finally {
      setSubmitting(false);
    }
  };

  const saveActual = async (hours: number) => {
    if (!actualModal) return;
    setActualLoading(true);
    try {
      await setOvertimeActualHours(actualModal.id, hours);
      showToast('success', 'Actual hours updated. Overtime pay calculated.');
      setActualModal(null);
      load();
    } catch (err: unknown) {
      showToast('error', getErrorMessage(err, 'Failed to update.'));
    } finally {
      setActualLoading(false);
    }
  };

  const groups = [
    { title: 'Pending', list: requests.filter((r) => r.status === 'PENDING') },
    { title: 'Approved', list: requests.filter((r) => r.status === 'APPROVED') },
    { title: 'Rejected', list: requests.filter((r) => r.status === 'REJECTED') },
  ];
  const rows: Row[] = loading
    ? []
    : groups.flatMap((g) =>
        g.list.length === 0
          ? []
          : [{ kind: 'header' as const, key: `h-${g.title}`, title: g.title, count: g.list.length }, ...g.list.map((req) => ({ kind: 'req' as const, key: req.id, req }))],
      );

  const card = { backgroundColor: theme.surface, borderColor: theme.border };

  const header = (
    <View style={styles.headerWrap}>
      <Toast toast={toast} />

      <View style={styles.headRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Overtime</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Request overtime hours — approved requests add to your monthly salary.</ThemedText>
        </View>
        {!showForm ? <Button size="sm" onPress={() => setShowForm(true)}>+ Request</Button> : null}
      </View>

      {loadError ? <ErrorBanner message={loadError} onRetry={() => { setLoading(true); load(); }} /> : null}

      {showForm ? (
        <View style={[styles.form, card]}>
          <ThemedText style={styles.formTitle}>New Overtime Request</ThemedText>
          <View style={[styles.grid, wide && styles.gridWide]}>
            <View style={styles.flex1}>
              <DateField label="Date" value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} />
            </View>
            <View style={styles.flex1}>
              <Input
                label="Estimated Hours"
                value={form.requestedHours}
                onChangeText={(t) => setForm((p) => ({ ...p, requestedHours: t }))}
                placeholder="e.g. 2"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <Input
            label="Reason"
            value={form.reason}
            onChangeText={(t) => setForm((p) => ({ ...p, reason: t }))}
            placeholder="Describe what you'll be working on..."
            multiline
          />

          {/* Urgent toggle */}
          <View
            style={[
              styles.urgent,
              { backgroundColor: form.isUrgent ? 'rgba(239,68,68,0.06)' : theme.backgroundElement, borderColor: form.isUrgent ? '#ef4444' : theme.border },
            ]}>
            <View style={styles.flex1}>
              <View style={styles.urgentTitle}>
                <Ionicons name="warning-outline" size={14} color={form.isUrgent ? '#ef4444' : theme.text} />
                <ThemedText style={[styles.urgentLabel, { color: form.isUrgent ? '#ef4444' : theme.text }]}>Urgent</ThemedText>
              </View>
              <ThemedText themeColor="textMuted" style={styles.small}>Mark urgent if you need to stay now — manager will be notified immediately.</ThemedText>
            </View>
            <Switch
              value={form.isUrgent}
              onValueChange={(v) => setForm((p) => ({ ...p, isUrgent: v }))}
              trackColor={{ true: '#ef4444', false: theme.border }}
              thumbColor="#ffffff"
              accessibilityLabel="Mark this request urgent"
            />
          </View>

          {formError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{formError}</ThemedText> : null}

          <View style={styles.formBtns}>
            <Button variant="outline" onPress={() => { setShowForm(false); setFormError(''); }} style={styles.flex1}>Cancel</Button>
            <Button onPress={submit} loading={submitting} style={styles.flex1}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
          </View>
        </View>
      ) : null}
    </View>
  );

  const empty = loading ? (
    <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={80} />)}</View>
  ) : requests.length === 0 && !loadError ? (
    <View style={styles.emptyState}>
      <Ionicons name="time-outline" size={40} color={theme.textMuted} />
      <ThemedText themeColor="textMuted" style={styles.emptyTitle}>No overtime requests yet.</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.small}>Tap &quot;Request&quot; to submit one.</ThemedText>
    </View>
  ) : null;

  const renderItem = ({ item }: { item: Row }) => {
    if (item.kind === 'header') {
      return <ThemedText themeColor="textMuted" style={styles.sectionTitle}>{`${item.title.toUpperCase()} (${item.count})`}</ThemedText>;
    }
    const req = item.req;
    const s = STATUS_STYLE[req.status];
    return (
      <View style={[styles.req, card]}>
        <View style={styles.reqHead}>
          <View style={styles.flex1}>
            <View style={styles.dateRow}>
              <ThemedText style={styles.reqDate}>{fmtDate(req.date)}</ThemedText>
              {req.isUrgent ? (
                <View style={styles.urgentBadge}><ThemedText style={styles.urgentBadgeText}>URGENT</ThemedText></View>
              ) : null}
            </View>
            <ThemedText themeColor="textMuted" style={styles.small}>{req.reason}</ThemedText>
          </View>
          <View style={[styles.pill, { backgroundColor: s.bg }]}><ThemedText style={[styles.pillText, { color: s.color }]}>{s.label}</ThemedText></View>
        </View>

        <View style={styles.hours}>
          <ThemedText themeColor="textMuted" style={styles.small}><ThemedText style={styles.hoursNum}>{`${req.requestedHours}h`}</ThemedText>{' requested'}</ThemedText>
          {req.actualHours != null ? (
            <ThemedText themeColor="textMuted" style={styles.small}><ThemedText style={[styles.hoursNum, { color: '#22c55e' }]}>{`${req.actualHours}h`}</ThemedText>{' actual'}</ThemedText>
          ) : null}
          {req.overtimePay != null ? (
            <ThemedText themeColor="textMuted" style={styles.small}><ThemedText style={[styles.pay]}>{fmt(req.overtimePay)}</ThemedText>{' earned'}</ThemedText>
          ) : null}
        </View>

        {req.status === 'REJECTED' && req.rejectionReason ? (
          <View style={styles.rejection}><ThemedText style={[styles.small, { color: '#b91c1c' }]}>{`Reason: ${req.rejectionReason}`}</ThemedText></View>
        ) : null}

        {/* After the day: enter actual hours once approved */}
        {req.status === 'APPROVED' && req.actualHours == null ? (
          <DashedButton full label="+ Enter actual hours worked" onPress={() => setActualModal({ id: req.id, date: req.date })} />
        ) : null}

        <ThemedText themeColor="textMuted" style={styles.stamp}>{`Submitted ${fmtTs(req.createdAt)}`}</ThemedText>
      </View>
    );
  };

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Overtime' }} />
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.key}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ItemSeparatorComponent={Sep}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
        />
      </KeyboardAvoidingView>
      {actualModal ? (
        <ActualHoursSheet
          title="Update Actual Hours"
          message={`Enter the actual overtime hours worked on ${fmtDate(actualModal.date)}.`}
          saving={actualLoading}
          onCancel={() => setActualModal(null)}
          onSave={saveActual}
        />
      ) : null}
    </ThemedView>
  );
}

function Sep() {
  return <View style={{ height: 12 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { width: '100%', maxWidth: 672, alignSelf: 'center' },
  headerWrap: { gap: 24, marginBottom: 20 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  small: { fontSize: 12, lineHeight: 18 },
  form: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 16 },
  formTitle: { fontSize: 15, lineHeight: 22, fontFamily: FontWeights.semiBold },
  grid: { gap: 12 },
  gridWide: { flexDirection: 'row' },
  urgent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderRadius: 12 },
  urgentTitle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  urgentLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  formBtns: { flexDirection: 'row', gap: 12 },
  gap: { gap: 12 },
  emptyState: { alignItems: 'center', gap: 6, paddingVertical: 64 },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, marginTop: 6 },
  sectionTitle: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.8, marginTop: 8 },
  req: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
  reqHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  reqDate: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  urgentBadge: { backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  urgentBadgeText: { color: '#ef4444', fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, flexShrink: 0 },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  hours: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  hoursNum: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.medium },
  pay: { fontSize: 12, lineHeight: 18, fontFamily: Fonts?.mono, fontWeight: '700', color: '#22c55e' },
  rejection: { backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: 8, padding: 8 },
  stamp: { fontSize: 10, lineHeight: 14 },
});
