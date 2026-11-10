import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CATEGORY_LABELS, fmtDateShort, fmtDateTimeFull, weightageTotal } from '@/components/competencies/competency-shared';
import { NewTemplateSheet } from '@/components/competencies/new-template-sheet';
import { TemplateEditor } from '@/components/competencies/template-editor';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { PermissionGate } from '@/components/permission-gate';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, Button, Card, Input, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  archiveCompetencyTemplate, deleteCompetencyTemplate, fetchCompetencyTemplate, fetchCompetencyTemplates, fetchDesignations, fetchRoleCoverage,
  getErrorMessage, unarchiveCompetencyTemplate,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CompetencyCategory, CompetencyTemplate, CompetencyTemplateListItem, RoleCoverage } from '@/types/api';

// /competency-templates is requireHRModuleAccess: OWNER/STORE_MANAGER/HR/
// ACCOUNTING pass on role, anyone else needs the hr_module tab.
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'];
const WIDE_MIN = 560;

// Dashboard list table: fixed px tracks except Role, which gets a floor.
const COLS = { role: 160, comps: 100, weight: 100, usage: 80, status: 110, updated: 180, actions: 220 };
const GAP = 12;
const TABLE_MIN = Object.values(COLS).reduce((a, b) => a + b, 0) + GAP * 6 + 32;

type Editing = { template: (CompetencyTemplate & { usageCount?: number }) | null; roleName: string; category?: CompetencyCategory };
type Notice = { text: string; kind: 'success' | 'error' };

function CompetenciesContent() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ newRole?: string; role?: string; category?: string; openTemplateId?: string }>();

  const [width, setWidth] = useState(0);
  const [templates, setTemplates] = useState<CompetencyTemplateListItem[] | null>(null);
  const [designations, setDesignations] = useState<string[]>([]);
  const [roleCoverage, setRoleCoverage] = useState<RoleCoverage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [creating, setCreating] = useState<{ lockRoleName?: string } | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'DRAFT'>('ALL');
  const [showArchived, setShowArchived] = useState(false);
  const [archiving, setArchiving] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const notify = useCallback((text: string, kind: Notice['kind']) => setNotice({ text, kind }), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const load = useCallback(async (archived: boolean) => {
    setError(null);
    try {
      // includeArchived=true returns ONLY the archived roles.
      setTemplates(await fetchCompetencyTemplates(archived));
    } catch (err: unknown) {
      setTemplates((t) => t ?? []);
      setError(getErrorMessage(err, 'Could not load competency templates.'));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / archived toggle
    load(showArchived);
  }, [load, showArchived]);

  useEffect(() => {
    fetchDesignations().then(setDesignations).catch(() => setDesignations([]));
    fetchRoleCoverage().then(setRoleCoverage).catch(() => setRoleCoverage([]));
  }, []);

  // Deep links (consumed once). ?openTemplateId= opens that template in the
  // editor; ?newRole= (alias ?role=) starts a new template for that role — with
  // ?category= straight into the editor, otherwise the New Template sheet with
  // the role locked, exactly as Applications' "Create template" shortcut does.
  const consumed = useRef(false);
  useEffect(() => {
    if (consumed.current) return;
    const role = (params.newRole || params.role || '').trim();
    if (params.openTemplateId) {
      consumed.current = true;
      fetchCompetencyTemplate(params.openTemplateId)
        .then((t) => setEditing({ template: t, roleName: t.roleName }))
        .catch(() => {});
    } else if (role) {
      consumed.current = true;
      const category = params.category as CompetencyCategory | undefined;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot deep link
      if (category) setEditing({ template: null, roleName: role, category });
      else setCreating({ lockRoleName: role });
    }
  }, [params.newRole, params.role, params.category, params.openTemplateId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(showArchived);
    setRefreshing(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (templates ?? []).filter((t) => {
      if (q && !t.roleName.toLowerCase().includes(q)) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      return true;
    });
  }, [templates, search, statusFilter]);

  const runAction = async (id: string, setBusy: (v: string | null) => void, fn: () => Promise<unknown>, ok: string, fail: string) => {
    setBusy(id);
    try {
      await fn();
      notify(ok, 'success');
      load(showArchived);
    } catch (err: unknown) {
      notify(getErrorMessage(err, fail), 'error');
    } finally {
      setBusy(null);
    }
  };

  const doArchive = (t: CompetencyTemplateListItem) => Alert.alert(
    `Archive "${t.roleName}"?`,
    'This hides it from the list and stops it being offered to new applications. It can be restored anytime — nothing is deleted, and candidates already interviewed are unaffected.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', onPress: () => runAction(t.id, setArchiving, () => archiveCompetencyTemplate(t.id), `"${t.roleName}" archived.`, 'Failed to archive template.') },
    ],
  );

  const doUnarchive = (t: CompetencyTemplateListItem) =>
    runAction(t.id, setArchiving, () => unarchiveCompetencyTemplate(t.id), `"${t.roleName}" restored.`, 'Failed to restore template.');

  const doDelete = (t: CompetencyTemplateListItem) => {
    if ((t.usageCount ?? 0) > 0) return;
    Alert.alert('Delete template', 'This permanently deletes the template and all its versions.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => runAction(t.id, setDeleting, () => deleteCompetencyTemplate(t.id), `"${t.roleName}" deleted.`, 'Failed to delete template.') },
    ]);
  };

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;

  if (editing) {
    return (
      <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Stack.Screen options={{ title: 'Competencies' }} />
        <ScrollView contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          {notice ? <View style={styles.noticeGap}>{notice.kind === 'success' ? <SuccessBanner message={notice.text} /> : <ErrorBanner message={notice.text} />}</View> : null}
          <TemplateEditor
            template={editing.template}
            roleName={editing.roleName}
            category={editing.category}
            notify={notify}
            onBack={() => { setEditing(null); load(showArchived); }}
            onSaved={(t) => setEditing((prev) => ({ template: { ...t, usageCount: prev?.template?.usageCount }, roleName: t.roleName }))}
          />
        </ScrollView>
      </ThemedView>
    );
  }

  const renderActions = (t: CompetencyTemplateListItem) => {
    const canDelete = (t.usageCount ?? 0) === 0;
    const del = <Button size="sm" variant="outline" disabled={!canDelete || deleting === t.id} onPress={() => doDelete(t)}>{deleting === t.id ? '…' : 'Delete'}</Button>;
    return showArchived ? (
      <>
        <Button size="sm" variant="secondary" disabled={archiving === t.id} onPress={() => doUnarchive(t)}>{archiving === t.id ? '…' : 'Unarchive'}</Button>
        {del}
      </>
    ) : (
      <>
        <Button size="sm" variant="secondary" onPress={() => setEditing({ template: t, roleName: t.roleName })}>Edit</Button>
        <Button size="sm" variant="outline" disabled={archiving === t.id} onPress={() => doArchive(t)}>{archiving === t.id ? '…' : 'Archive'}</Button>
        {del}
      </>
    );
  };

  const statusBadges = (t: CompetencyTemplateListItem) => (
    <>
      <Badge variant={(t.liveStatus ?? t.status) === 'APPROVED' ? 'success' : 'warning'} size="sm">{t.liveStatus ?? t.status}</Badge>
      {showArchived ? <Badge variant="muted" size="sm">Archived</Badge> : null}
    </>
  );
  // liveStatus differs from status only for a pending DRAFT still served by an older APPROVED version.
  const draftPending = (t: CompetencyTemplateListItem) => (t.liveStatus && t.liveStatus !== t.status
    ? <ThemedText style={[styles.tiny, { color: theme.warning }]}>Draft pending</ThemedText> : null);

  const cell = (w: number, align?: 'center' | 'flex-end') => ({ width: w, alignItems: align ?? 'flex-start' } as const);

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Competencies' }} />
      <ScrollView
        contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + 40, gap: 24 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.titleRow}>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>Competencies</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.subtitle}>
              The shared, approved competency set per role — used to generate AI Interview questions and score candidates.
            </ThemedText>
          </View>
          {!showArchived ? <Button size="sm" onPress={() => setCreating({})}>New Template</Button> : null}
        </View>

        <View style={styles.filters}>
          <View style={[styles.search, wide && { maxWidth: 260 }]}>
            <Input value={search} onChangeText={setSearch} placeholder="Search by role name…" autoCapitalize="none" autoCorrect={false} />
          </View>
          {!showArchived ? (
            <View style={styles.chips}>
              {(['ALL', 'APPROVED', 'DRAFT'] as const).map((s) => {
                const active = statusFilter === s;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setStatusFilter(s)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.surface }]}>
                    <ThemedText style={[styles.chipText, { color: active ? '#fff' : theme.text }]}>{s === 'ALL' ? 'All statuses' : s}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={styles.flex1} />
          <Pressable onPress={() => { setShowArchived((v) => !v); setTemplates(null); setSearch(''); setStatusFilter('ALL'); }} hitSlop={8} accessibilityRole="button">
            <ThemedText themeColor="textMuted" style={[styles.body, styles.underline]}>{showArchived ? '← Back to active templates' : 'Show archived'}</ThemedText>
          </Pressable>
        </View>

        {notice ? (notice.kind === 'success' ? <SuccessBanner message={notice.text} /> : <ErrorBanner message={notice.text} />) : null}
        {error ? <ErrorBanner message={error} onRetry={() => load(showArchived)} /> : null}

        {templates === null ? (
          <Card padding="md"><Skeleton height={20} width="40%" /><Skeleton height={44} /><Skeleton height={44} /></Card>
        ) : filtered.length === 0 ? (
          error ? null : (
            <Card padding="md">
              <ThemedText themeColor="textMuted" style={styles.body}>
                {showArchived ? 'No archived templates.' : templates.length === 0 ? 'No competency templates yet.' : 'No templates match your search.'}
              </ThemedText>
            </Card>
          )
        ) : wide ? (
          <Card padding="none" style={styles.clip}>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ minWidth: Math.max(TABLE_MIN, width - pad * 2) }}>
                <View style={[styles.tr, styles.th, { borderBottomColor: theme.border }]}>
                  <ThemedText themeColor="textMuted" style={[styles.thText, { flex: 1, minWidth: COLS.role }]}>ROLE</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.thText, cell(COLS.comps, 'center'), styles.center]}>COMPETENCIES</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.thText, cell(COLS.weight, 'center'), styles.center]}>WEIGHTAGE</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.thText, cell(COLS.usage, 'center'), styles.center]}>USAGE</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.thText, cell(COLS.status, 'center'), styles.center]}>STATUS</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.thText, cell(COLS.updated)]}>LAST UPDATED</ThemedText>
                  <ThemedText themeColor="textMuted" style={[styles.thText, cell(COLS.actions, 'flex-end'), styles.right]}>ACTIONS</ThemedText>
                </View>
                {filtered.map((t, i) => {
                  const total = weightageTotal(t);
                  return (
                    <View
                      key={t.id}
                      style={[styles.tr, i < filtered.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }, showArchived && { opacity: 0.7 }]}>
                      <ThemedText style={[styles.roleCell, { flex: 1, minWidth: COLS.role }]} numberOfLines={1}>{t.roleName}</ThemedText>
                      <View style={cell(COLS.comps, 'center')}><ThemedText themeColor="textSecondary" style={styles.body}>{t.competencies.length}</ThemedText></View>
                      <View style={cell(COLS.weight, 'center')}><ThemedText style={[styles.body, styles.bold, { color: total === 100 ? theme.success : theme.danger }]}>{`${total}%`}</ThemedText></View>
                      <View style={cell(COLS.usage, 'center')}><ThemedText themeColor="textSecondary" style={styles.body}>{t.usageCount ?? 0}</ThemedText></View>
                      <View style={[cell(COLS.status, 'center'), { gap: 2 }]}>
                        <View style={styles.badgeRow}>{statusBadges(t)}</View>
                        {draftPending(t)}
                      </View>
                      <View style={cell(COLS.updated)}><ThemedText themeColor="textSecondary" style={styles.body} accessibilityLabel={fmtDateTimeFull(t.updatedAt)}>{fmtDateShort(t.updatedAt)}</ThemedText></View>
                      <View style={[cell(COLS.actions, 'flex-end'), styles.actionsRow]}>{renderActions(t)}</View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </Card>
        ) : (
          <View style={styles.stack}>
            {filtered.map((t) => {
              const total = weightageTotal(t);
              const canDelete = (t.usageCount ?? 0) === 0;
              return (
                <Card key={t.id} padding="md" style={showArchived ? { opacity: 0.7 } : undefined}>
                  <View style={styles.stack}>
                    <View style={styles.cardHead}>
                      <ThemedText style={[styles.roleCell, styles.flex1]} numberOfLines={2}>{t.roleName}</ThemedText>
                      <View style={styles.badgeRow}>{statusBadges(t)}</View>
                    </View>
                    {draftPending(t)}
                    <View style={styles.facts}>
                      <Fact label="Competencies" value={String(t.competencies.length)} />
                      <Fact label="Weightage" value={`${total}%`} color={total === 100 ? theme.success : theme.danger} />
                      <Fact label="Usage" value={String(t.usageCount ?? 0)} />
                    </View>
                    <ThemedText themeColor="textMuted" style={styles.small}>
                      {`${t.category ? `${CATEGORY_LABELS[t.category]} · ` : ''}Updated ${fmtDateShort(t.updatedAt)}`}
                    </ThemedText>
                    <View style={styles.actionsWrap}>{renderActions(t)}</View>
                    {!canDelete ? <ThemedText themeColor="textMuted" style={styles.small}>Used in interviews. Archive instead.</ThemedText> : null}
                  </View>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      {creating ? (
        <NewTemplateSheet
          existingTemplates={templates ?? []}
          designations={designations}
          roleCoverage={roleCoverage}
          lockRoleName={creating.lockRoleName}
          onClose={() => setCreating(null)}
          onOpenTemplate={(t) => { setCreating(null); setEditing({ template: t, roleName: t.roleName }); }}
          onManual={(roleName, category) => { setCreating(null); setEditing({ template: null, roleName, category }); }}
        />
      ) : null}
    </ThemedView>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.fact}>
      <ThemedText themeColor="textMuted" style={styles.tiny}>{label.toUpperCase()}</ThemedText>
      <ThemedText style={[styles.body, styles.bold, color ? { color } : null]}>{value}</ThemedText>
    </View>
  );
}

export default function CompetenciesScreen() {
  const { user } = useAuth();
  if (ADMIN_ROLES.includes(user?.role ?? '')) return <CompetenciesContent />;
  return (
    <PermissionGate tabKey="hr_module" deniedMessage="Competencies is available to Owner, Store Manager, HR and Accounting roles, or users granted HR module access.">
      <CompetenciesContent />
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  stack: { gap: 12 },
  noticeGap: { marginBottom: 12 },
  clip: { overflow: 'hidden', borderRadius: Radii.md },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  tiny: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  bold: { fontFamily: FontWeights.semiBold },
  underline: { textDecorationLine: 'underline' },
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  filters: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  search: { flexGrow: 1, flexBasis: 200 },
  chips: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: Radii.sm, minHeight: 36, justifyContent: 'center' },
  chipText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  tr: { flexDirection: 'row', alignItems: 'center', gap: GAP, paddingHorizontal: 16, paddingVertical: 12 },
  th: { borderBottomWidth: 1, paddingVertical: 8 },
  thText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  roleCell: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  badgeRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center' },
  actionsRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  facts: { flexDirection: 'row', gap: 24 },
  fact: { gap: 2 },
  actionsWrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
