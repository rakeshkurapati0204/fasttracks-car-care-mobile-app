import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InvStatusBadge, VisitStatusBadge } from '@/components/customers/badges';
import { CopyButton } from '@/components/customers/copy-button';
import { ErrorBanner, SectionLabel } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, Button, Skeleton } from '@/components/ui';
import { FontWeights, Radii, Spacing, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addCustomerRemarkFor,
  fetchCallCapabilities,
  fetchCrmCustomerDetail,
  fetchCustomerProfile,
  fetchCustomerRemarksFor,
  getErrorMessage,
  initiateCall,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { fmtDate, fmtINR, fmtMonthYear, quoteLabel } from '@/lib/customers-format';
import type { CrmInteraction, CrmVisitJobCard, CustomerProfile, CustomerProfileInvoice, CustomerRemark } from '@/types/api';

type VisitEntry = { kind: 'jc'; date: string; jc: CrmVisitJobCard } | { kind: 'inv'; date: string; inv: CustomerProfileInvoice };

const VISITS_PREVIEW = 5;

// Dashboard CRMPanel as a screen: profile header, quick stats, vehicle filter,
// interactions, verification remarks, unified visit history, invoice actions.
export default function CustomerPanelScreen() {
  const { id, name: nameParam } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  // Mirrors the backend gate for OWNER/STORE_MANAGER. The dashboard also honours a
  // per-employee grant; the app has no such flag to read, and the server decides anyway.
  const canSeeRemarks = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER';

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [jobCards, setJobCards] = useState<CrmVisitJobCard[]>([]);
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [remarks, setRemarks] = useState<CustomerRemark[]>([]);
  const [remarksLoading, setRemarksLoading] = useState(false);
  const [newRemark, setNewRemark] = useState('');
  const [addingRemark, setAddingRemark] = useState(false);
  const [canCall, setCanCall] = useState(false);
  const [calling, setCalling] = useState(false);

  const load = useCallback(async () => {
    setError('');
    // The two calls are independent (the detail route has an extra sales-mode
    // ownership check), so one failing must not hide what the other returned.
    const [p, detail] = await Promise.allSettled([fetchCustomerProfile(id), fetchCrmCustomerDetail(id)]);
    const failures: string[] = [];
    if (p.status === 'fulfilled') setProfile(p.value);
    else { setProfile(null); failures.push(getErrorMessage(p.reason, 'Could not load the customer profile.')); }
    if (detail.status === 'fulfilled') {
      setJobCards(detail.value.jobCards);
      setInteractions(detail.value.interactions);
    } else {
      setJobCards([]);
      setInteractions([]);
      failures.push(getErrorMessage(detail.reason, 'Could not load visit history.'));
    }
    setError(failures.join(' '));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
    fetchCallCapabilities().then((c) => setCanCall(c.canInitiate)).catch(() => setCanCall(false));
  }, [load]);

  useEffect(() => {
    if (!canSeeRemarks) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    setRemarksLoading(true);
    fetchCustomerRemarksFor(id).then(setRemarks).catch(() => setRemarks([])).finally(() => setRemarksLoading(false));
  }, [id, canSeeRemarks]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const addRemark = async () => {
    if (!newRemark.trim()) return;
    setAddingRemark(true);
    try {
      const created = await addCustomerRemarkFor(id, newRemark.trim());
      setRemarks((prev) => [created, ...prev]);
      setNewRemark('');
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not add the remark.'));
    } finally {
      setAddingRemark(false);
    }
  };

  const onCall = async () => {
    setCalling(true);
    try {
      await initiateCall(id);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Could not start that call.'));
    } finally {
      setCalling(false);
    }
  };

  // Unified visits: job cards plus invoices not linked to one, newest first.
  const filteredVisits = useMemo(() => {
    const linked = new Set(jobCards.map((jc) => jc.invoiceId).filter(Boolean));
    const standalone = (profile?.invoices ?? []).filter((inv) => !linked.has(inv.id));
    const all: VisitEntry[] = [
      ...jobCards.map((jc) => ({ kind: 'jc' as const, date: jc.createdAt, jc })),
      ...standalone.map((inv) => ({ kind: 'inv' as const, date: inv.createdAt, inv })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return vehicleFilter ? all.filter((e) => (e.kind === 'jc' ? e.jc.vehicleNumber : e.inv.vehicleNumber) === vehicleFilter) : all;
  }, [jobCards, profile, vehicleFilter]);
  const displayed = showAll ? filteredVisits : filteredVisits.slice(0, VISITS_PREVIEW);

  const goInvoices = () => router.push('/more/invoices' as never);
  const card = { backgroundColor: theme.backgroundElement, borderColor: theme.border };

  const customer = profile?.customer;

  return (
    <ThemedView style={styles.flex1}>
      <Stack.Screen options={{ title: customer?.name ?? nameParam ?? '' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.four }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {error ? <ErrorBanner message={error} onRetry={onRefresh} /> : null}

        {loading ? (
          <View style={styles.gap}>
            <Skeleton height={24} width={200} />
            <Skeleton height={16} width={140} />
            <Skeleton height={80} style={styles.skel} />
            <Skeleton height={160} style={styles.skel} />
          </View>
        ) : !profile && jobCards.length === 0 && interactions.length === 0 ? (
          <View style={styles.center}>
            <ThemedText themeColor="textMuted">Failed to load profile</ThemedText>
            <Button variant="secondary" onPress={onRefresh}>Retry</Button>
          </View>
        ) : (
          <>
            {profile && customer ? (
              <>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.flex1}>
                <View style={styles.wrapRow}>
                  <ThemedText style={styles.name}>{customer.name}</ThemedText>
                  {customer.isRegular ? <Badge size="sm" variant="success">Regular</Badge> : null}
                </View>
                <View style={styles.inline}>
                  <Pressable onPress={() => Linking.openURL(`tel:${customer.phone}`)} hitSlop={8} accessibilityRole="link" accessibilityLabel={`Call ${customer.phone}`}>
                    <ThemedText themeColor="textMuted" style={styles.sub}>{customer.phone}</ThemedText>
                  </Pressable>
                  <CopyButton value={customer.phone} label="Copy phone" />
                  <ThemedText themeColor="textMuted" style={styles.sub}>· {profile.stats.visitCount} paid visit{profile.stats.visitCount !== 1 ? 's' : ''}</ThemedText>
                </View>
                {customer.email ? (
                  <View style={styles.inline}>
                    <ThemedText themeColor="textMuted" style={styles.sub}>{customer.email}</ThemedText>
                    <CopyButton value={customer.email} label="Copy email" />
                  </View>
                ) : null}
                {customer.createdAt ? <ThemedText themeColor="textMuted" style={styles.tiny}>Customer since: {fmtMonthYear(customer.createdAt)}</ThemedText> : null}
              </View>
              {canCall ? <Button size="sm" icon="call" loading={calling} onPress={onCall}>Call</Button> : null}
            </View>

            {/* Quick Stats */}
            <View style={[styles.box, card]}>
              <SectionLabel>Quick Stats</SectionLabel>
              <View style={styles.stats}>
                <View style={styles.flex1}>
                  <ThemedText themeColor="textMuted" style={styles.tiny}>Total Spent</ThemedText>
                  <ThemedText style={styles.statValue}>{fmtINR(profile.stats.totalSpent)}</ThemedText>
                </View>
                <View style={styles.flex1}>
                  <ThemedText themeColor="textMuted" style={styles.tiny}>Avg / Visit</ThemedText>
                  <ThemedText style={styles.statValue}>{fmtINR(profile.stats.avgPerVisit)}</ThemedText>
                </View>
                <View style={styles.flex1}>
                  <ThemedText themeColor="textMuted" style={styles.tiny}>Since</ThemedText>
                  <ThemedText style={styles.statValue}>{fmtMonthYear(profile.stats.customerSince ?? customer.createdAt)}</ThemedText>
                </View>
              </View>
              {profile.stats.outstandingAmount > 0 ? (
                <ThemedText themeColor="danger" style={styles.outstanding}>Outstanding: {fmtINR(profile.stats.outstandingAmount)}</ThemedText>
              ) : null}
            </View>

            {/* Vehicles */}
            {profile.vehicles.length > 0 && (
              <View style={styles.section}>
                <SectionLabel>Vehicles</SectionLabel>
                <View style={styles.wrapRow}>
                  {profile.vehicles.map((v) => {
                    const active = vehicleFilter === v.registration;
                    return (
                      <Pressable
                        key={v.registration}
                        onPress={() => setVehicleFilter(active ? null : v.registration)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [styles.vehicleChip, { backgroundColor: active ? theme.primary : theme.backgroundElement, borderColor: active ? theme.primary : theme.border }, pressed && { opacity: 0.7 }]}>
                        <ThemedText style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>
                          {v.registration}
                          {v.make || v.model ? ` · ${[v.make, v.model].filter(Boolean).join(' ')}` : ''}
                          {v.year ? ` · ${v.year}` : ''}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

              </>
            ) : (
              <ThemedText style={styles.name}>{nameParam ?? ''}</ThemedText>
            )}

            {/* Interactions */}
            {interactions.length > 0 && (
              <View style={styles.section}>
                <SectionLabel>{`Interactions (${interactions.length})`}</SectionLabel>
                {interactions.map((it) => (
                  <View key={it.id} style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.between}>
                      <ThemedText style={[styles.body, styles.flex1]}>{it.description}</ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.tiny}>{fmtDate(it.createdAt)}</ThemedText>
                    </View>
                    <ThemedText themeColor="textMuted" style={styles.tiny}>
                      Logged by {it.createdBy.name}
                      {it.jobCard ? ` · Job #${it.jobCard.jobNumber} (${it.jobCard.vehicleNumber})` : ''}
                    </ThemedText>
                    {it.quotes.length > 0 && (
                      <View style={styles.wrapRow}>
                        {it.quotes.map((q, i) => (
                          <View key={i} style={[styles.quote, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                            <ThemedText style={styles.tiny}>{quoteLabel(i, it.quotes.length)}: <ThemedText style={[styles.tiny, styles.bold]}>₹{parseFloat(q.amount).toLocaleString('en-IN')}</ThemedText></ThemedText>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Verification Remarks */}
            {canSeeRemarks && (
              <View style={[styles.box, { backgroundColor: withAlpha(theme.danger, 0.04), borderColor: withAlpha(theme.danger, 0.25) }]}>
                <ThemedText themeColor="danger" style={styles.dangerLabel}>{`VERIFICATION REMARKS (${remarks.length})`}</ThemedText>
                <View style={styles.remarkInput}>
                  <TextInput
                    value={newRemark}
                    onChangeText={setNewRemark}
                    onSubmitEditing={addRemark}
                    placeholder="Log a verification note…"
                    placeholderTextColor={theme.textMuted}
                    returnKeyType="done"
                    style={[styles.input, { backgroundColor: theme.backgroundElement, borderColor: theme.border, color: theme.text }]}
                  />
                  <Button variant="danger" size="sm" disabled={addingRemark || !newRemark.trim()} loading={addingRemark} onPress={addRemark}>{addingRemark ? 'Adding…' : 'Add'}</Button>
                </View>
                {remarksLoading ? (
                  <ThemedText themeColor="textMuted" style={styles.tiny}>Loading…</ThemedText>
                ) : remarks.length === 0 ? (
                  <ThemedText themeColor="textMuted" style={styles.tiny}>No verification remarks yet</ThemedText>
                ) : (
                  remarks.map((r) => (
                    <View key={r.id} style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                      <ThemedText style={styles.body}>{r.note}</ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.tiny}>{r.author.name} · {fmtDate(r.createdAt)}</ThemedText>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* Visit History */}
            <View style={styles.section}>
              <SectionLabel>{`Visit History (${filteredVisits.length})`}</SectionLabel>
              {filteredVisits.length === 0 ? (
                <ThemedText themeColor="textMuted" style={styles.body}>No visit records found</ThemedText>
              ) : (
                displayed.map((entry) => {
                  if (entry.kind === 'jc') {
                    const jc = entry.jc;
                    return (
                      <Pressable
                        key={jc.id}
                        onPress={() => router.push(`/customers/job/${jc.id}` as never)}
                        accessibilityRole="button"
                        accessibilityLabel={`Open job ${jc.jobNumber}`}
                        style={({ pressed }) => [styles.visit, card, { opacity: jc.status === 'WALKED_OUT' ? 0.65 : pressed ? 0.8 : 1 }]}>
                        <View style={styles.between}>
                          <View style={styles.inline}>
                            <ThemedText themeColor="primary" style={styles.mono}>{jc.jobNumber}</ThemedText>
                            <ThemedText themeColor="textMuted" style={styles.tiny}>{fmtDate(jc.createdAt)}</ThemedText>
                          </View>
                          <VisitStatusBadge status={jc.status} />
                        </View>
                        <ThemedText style={styles.reason}>{jc.reasonForVisit}</ThemedText>
                        <ThemedText themeColor="textMuted" style={styles.tiny}>
                          <ThemedText style={[styles.tiny, styles.bold]}>{jc.vehicleNumber}</ThemedText>
                          {jc.vehicle && (jc.vehicle.make || jc.vehicle.model) ? ` · ${[jc.vehicle.make, jc.vehicle.model].filter(Boolean).join(' ')}` : ''}
                        </ThemedText>
                        {jc.handledBy ? (
                          <ThemedText themeColor="textMuted" style={styles.tiny}>
                            By <ThemedText style={styles.tiny}>{jc.handledBy.name}</ThemedText>
                            {jc.handledBy.designation ? ` · ${jc.handledBy.designation}` : ''}
                          </ThemedText>
                        ) : null}
                        {jc.status === 'WALKED_OUT' && jc.walkoutReason ? (
                          <ThemedText themeColor="textMuted" style={[styles.tiny, styles.walkout, { backgroundColor: withAlpha(theme.textMuted, 0.1) }]}>
                            {jc.walkoutReason.replace(/_/g, ' ')}
                            {jc.walkoutNote ? ` — ${jc.walkoutNote}` : ''}
                          </ThemedText>
                        ) : null}
                        <View style={[styles.invoiceLine, { borderTopColor: theme.border }]}>
                          {jc.invoice ? (
                            <ThemedText themeColor="textMuted" style={styles.tiny}>
                              <ThemedText themeColor="primary" style={[styles.tiny, styles.mono]}>{jc.invoice.invoiceNumber}</ThemedText>
                              {' · '}
                              <ThemedText style={[styles.tiny, styles.bold]}>{fmtINR(jc.invoice.grandTotal || 0)}</ThemedText>
                              {' · '}
                              <ThemedText style={[styles.tiny, { color: jc.invoice.status === 'PAID' ? theme.success : jc.invoice.status === 'DRAFT' ? theme.textMuted : theme.warning }]}>{jc.invoice.status}</ThemedText>
                              {jc.invoice.status !== 'PAID' && jc.invoice.balanceDue > 0 ? <ThemedText themeColor="danger" style={styles.tiny}>{` · Due ${fmtINR(jc.invoice.balanceDue)}`}</ThemedText> : null}
                            </ThemedText>
                          ) : (
                            <ThemedText themeColor="textMuted" style={styles.tiny}>
                              No invoice yet{jc.estimatedTotal ? ` · Est. ${fmtINR(jc.estimatedTotal)}` : ''}
                            </ThemedText>
                          )}
                        </View>
                      </Pressable>
                    );
                  }

                  const inv = entry.inv;
                  const unpaid = inv.status !== 'PAID' && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT';
                  return (
                    <Pressable
                      key={inv.id}
                      onPress={goInvoices}
                      accessibilityRole="button"
                      accessibilityLabel={`Open invoice ${inv.invoiceNumber}`}
                      style={({ pressed }) => [
                        styles.visit,
                        { backgroundColor: unpaid ? withAlpha(theme.danger, 0.06) : theme.backgroundElement, borderColor: unpaid ? withAlpha(theme.danger, 0.3) : theme.border },
                        pressed && { opacity: 0.8 },
                      ]}>
                      <View style={styles.between}>
                        <ThemedText themeColor="primary" style={styles.mono}>{inv.invoiceNumber}</ThemedText>
                        <InvStatusBadge status={inv.status} />
                      </View>
                      <ThemedText themeColor="textMuted" style={styles.tiny}>{fmtDate(inv.createdAt)}{inv.vehicleNumber ? ` · ${inv.vehicleNumber}` : ''}</ThemedText>
                      <View style={styles.between}>
                        <ThemedText style={styles.tiny}>
                          <ThemedText style={[styles.tiny, styles.bold]}>{fmtINR(inv.grandTotal || 0)}</ThemedText>
                          {inv.balanceDue > 0 ? <ThemedText themeColor="danger" style={styles.tiny}>{`  Due: ${fmtINR(inv.balanceDue)}`}</ThemedText> : null}
                        </ThemedText>
                        {inv.status !== 'PAID' && inv.status !== 'CANCELLED' ? <Button size="sm" variant="danger" onPress={goInvoices}>Collect →</Button> : null}
                      </View>
                    </Pressable>
                  );
                })
              )}
              {!showAll && filteredVisits.length > VISITS_PREVIEW ? (
                <Button variant="ghost" fullWidth onPress={() => setShowAll(true)}>{`View all ${filteredVisits.length} visits →`}</Button>
              ) : null}
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <Button style={styles.flex1} onPress={() => Alert.alert('Not available yet', "Creating invoices isn't available in the app yet. Use the dashboard.")}>+ New Invoice</Button>
              <Button style={styles.flex1} variant="secondary" onPress={goInvoices}>View All Invoices</Button>
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: 720, alignSelf: 'center' },
  gap: { gap: Spacing.two },
  skel: { borderRadius: Radii.md },
  center: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  inline: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 18, lineHeight: 24, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20 },
  tiny: { fontSize: 12, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 20 },
  bold: { fontFamily: FontWeights.semiBold },
  mono: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.bold },
  box: { padding: Spacing.three, borderRadius: Radii.md, borderWidth: 1, gap: 8 },
  stats: { flexDirection: 'row', gap: 12 },
  statValue: { fontSize: 16, lineHeight: 22, fontFamily: FontWeights.bold },
  outstanding: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  section: { gap: 8 },
  vehicleChip: { paddingHorizontal: 10, minHeight: 32, borderRadius: Radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 18 },
  item: { padding: 12, borderRadius: Radii.md, borderWidth: 1, gap: 4 },
  quote: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radii.pill, borderWidth: 1 },
  dangerLabel: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },
  remarkInput: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, fontSize: 14 },
  visit: { padding: 12, borderRadius: Radii.md, borderWidth: 1, gap: 4 },
  reason: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  walkout: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  invoiceLine: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
});
