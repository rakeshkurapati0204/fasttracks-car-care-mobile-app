import { Stack } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CaseDetailSheet, fmtDate, NewCaseSheet, type Section } from '@/components/legal/case-sheets';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, Button, Card, Skeleton } from '@/components/ui';
import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchLegalCases } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import type { LegalCase } from '@/types/api';

const WIDE_MIN = 560;

// Access is the per-person `hasLegalAccess` check (a LegalAccessConfig row on
// the server), not a role. Every /legal route enforces it, so a 403 also lands
// on the same "Access restricted." message.
export default function LegalDocumentsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { status: permStatus, hasLegalAccess } = usePermissions();

  const [width, setWidth] = useState(0);
  const [section, setSection] = useState<Section>('PERSONAL');
  const [cases, setCases] = useState<LegalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [detailCase, setDetailCase] = useState<LegalCase | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const wide = width >= WIDE_MIN;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = useCallback((type: 'success' | 'error', msg: string) => setToast({ type, msg }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const r = await fetchLegalCases(section);
      setCases(Array.isArray(r) ? r : []);
    } catch (err: unknown) {
      if ((err as { response?: { status?: number } })?.response?.status === 403) setForbidden(true);
      else setLoadError('Failed to load cases');
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / section change
    if (hasLegalAccess) load();
  }, [hasLegalAccess, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Legal Documents' }} />
      {children}
    </ThemedView>
  );

  if (permStatus !== 'ready') {
    return shell(<View style={[styles.page, { padding: 16 }]}><Skeleton height={64} /></View>);
  }
  if (!hasLegalAccess || forbidden) {
    return shell(
      <View style={[styles.page, { padding: wide ? 24 : 16 }]}>
        <ThemedText themeColor="textMuted" style={styles.body}>Access restricted.</ThemedText>
      </View>,
    );
  }

  const header = (
    <View style={styles.headerWrap}>
      <View style={[styles.headRow, wide && styles.headRowWide]}>
        <View style={styles.flex1}>
          <ThemedText style={styles.h1}>Legal Documents</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Private case tracker &amp; document vault</ThemedText>
        </View>
        <Button onPress={() => setShowNew(true)}>+ New Case</Button>
      </View>

      {toast ? (toast.type === 'success' ? <SuccessBanner message={toast.msg} /> : <ErrorBanner message={toast.msg} />) : null}
      {loadError ? <ErrorBanner message={loadError} onRetry={load} /> : null}

      <View style={styles.tabs}>
        {(['PERSONAL', 'PROFESSIONAL'] as Section[]).map((s) => (
          <Pressable
            key={s}
            onPress={() => setSection(s)}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === s }}
            style={[styles.tab, { backgroundColor: section === s ? theme.primary : theme.backgroundElement }]}>
            <ThemedText style={[styles.tabText, { color: section === s ? '#ffffff' : theme.text }]}>{s === 'PERSONAL' ? 'Personal' : 'Professional'}</ThemedText>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const empty = loading ? (
    <View style={styles.gap}>{[0, 1, 2].map((i) => <Skeleton key={i} height={64} />)}</View>
  ) : loadError ? null : (
    <ThemedText themeColor="textMuted" style={styles.emptyText}>No cases yet</ThemedText>
  );

  return shell(
    <>
      <FlatList
        data={loading ? [] : cases}
        keyExtractor={(c) => c.id}
        renderItem={({ item: c }) => (
          <Card onPress={() => setDetailCase(c)}>
            <View style={styles.caseRow}>
              <View style={styles.flex1}>
                <ThemedText numberOfLines={1} style={styles.caseTitle}>{c.title}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.caseSub}>
                  {c.nextHearingDate ? `Next hearing: ${fmtDate(c.nextHearingDate)}` : `Updated ${fmtDate(c.updatedAt)}`}
                </ThemedText>
              </View>
              <Badge variant="secondary">{c.status}</Badge>
            </View>
          </Card>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ItemSeparatorComponent={Sep}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={[styles.page, { padding: wide ? 24 : 16, paddingBottom: insets.bottom + 40 }]}
      />
      {showNew ? (
        <NewCaseSheet
          section={section}
          onClose={() => setShowNew(false)}
          onError={(m) => notify('error', m)}
          onCreated={() => { setShowNew(false); notify('success', 'Case created'); load(); }}
        />
      ) : null}
      {detailCase ? (
        <CaseDetailSheet
          legalCase={detailCase}
          wide={wide}
          notify={notify}
          onClose={() => setDetailCase(null)}
          onUpdated={() => { setDetailCase(null); load(); }}
        />
      ) : null}
    </>,
  );
}

function Sep() {
  return <View style={{ height: 12 }} />;
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  page: { width: '100%', maxWidth: 900, alignSelf: 'center' },
  body: { fontSize: 14, lineHeight: 20 },
  headerWrap: { gap: 20, marginBottom: 20 },
  headRow: { gap: 12 },
  headRowWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h1: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { minHeight: 40, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  gap: { gap: 12 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 40 },
  caseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  caseTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  caseSub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
});
