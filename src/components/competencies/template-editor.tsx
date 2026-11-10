import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  CATEGORIES, CATEGORY_LABELS, descriptionPlaceholder, fmtDateTimeFull,
} from '@/components/competencies/competency-shared';
import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Input } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  approveCompetencyTemplate, createCompetencyTemplate, fetchCompetencyTemplateVersions, getErrorMessage, regenerateCompetencyTemplate, updateCompetencyTemplate,
} from '@/lib/api';
import type { CompetencyCategory, CompetencyInput, CompetencyTemplate } from '@/types/api';

const WIDE_MIN = 560;

// Stable React keys (module-level so render stays pure).
let keySeq = 0;
const nextKey = () => keySeq++;

type EditableRow = { key: number; name: string; description: string; weightage: number; whatToAssess: string; ratingGuide: string };
const rowsFrom = (t: CompetencyTemplate | null, nextKey: () => number): EditableRow[] =>
  t
    ? t.competencies.map((c) => ({ key: nextKey(), name: c.name, description: c.description ?? '', weightage: c.weightage, whatToAssess: c.whatToAssess ?? '', ratingGuide: c.ratingGuide ?? '' }))
    : [{ key: nextKey(), name: '', description: '', weightage: 0, whatToAssess: '', ratingGuide: '' }];

type Props = {
  /** null only for a brand-new manual template, whose first Save calls create. */
  template: (CompetencyTemplate & { usageCount?: number }) | null;
  roleName: string;
  category?: CompetencyCategory;
  onBack: () => void;
  onSaved: (t: CompetencyTemplate) => void;
  notify: (message: string, kind: 'success' | 'error') => void;
};

// Dashboard TemplateEditor: used for a brand-new (unsaved) manual template and
// for an existing DRAFT / APPROVED one.
export function TemplateEditor({ template, roleName, category, onBack, onSaved, notify }: Props) {
  const theme = useTheme();
  const [rows, setRows] = useState<EditableRow[]>(() => rowsFrom(template, nextKey));
  const [width, setWidth] = useState(0);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  // Shown beside Save until the next edit, so it's obvious the change stuck.
  const [savedNotice, setSavedNotice] = useState('');
  const [history, setHistory] = useState<CompetencyTemplate[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [confirmingUsedEdit, setConfirmingUsedEdit] = useState(false);

  // Category is settable while unset or DRAFT (matches the server guard in PATCH
  // /:id); once an APPROVED template has one it is locked. The description is
  // never persisted — it only feeds Regenerate.
  const [editCategory, setEditCategory] = useState<CompetencyCategory | ''>(template?.category ?? category ?? '');
  const [editDescription, setEditDescription] = useState('');
  const [regenerating, setRegenerating] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const canEditCategory = !template || !template.category || template.status === 'DRAFT';
  // Collapsed to a chip once set; auto-expanded when there is no category yet.
  const [categoryExpanded, setCategoryExpanded] = useState(!editCategory);
  const showChip = !!editCategory && !categoryExpanded;
  const showExpandedSection = !editCategory || categoryExpanded;

  const total = rows.reduce((sum, r) => sum + (Number.isFinite(r.weightage) ? r.weightage : 0), 0);
  const totalOk = total === 100;
  const usageCount = template?.usageCount ?? 0;

  const comparable = (r: { name: string; description: string; weightage: number; whatToAssess: string; ratingGuide: string }) =>
    ({ name: r.name, description: r.description, weightage: r.weightage, whatToAssess: r.whatToAssess, ratingGuide: r.ratingGuide });
  // Regenerate overwrites `rows`: worth calling out when that discards unsaved edits.
  const hasUnsavedEdits = !!template && JSON.stringify(rows.map(comparable)) !== JSON.stringify(
    template.competencies.map((c) => comparable({ name: c.name, description: c.description ?? '', weightage: c.weightage, whatToAssess: c.whatToAssess ?? '', ratingGuide: c.ratingGuide ?? '' })),
  );

  const updateRow = (key: number, patch: Partial<EditableRow>) => {
    setSavedNotice('');
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const addRow = () => { setSavedNotice(''); setRows((prev) => [...prev, { key: nextKey(), name: '', description: '', weightage: 0, whatToAssess: '', ratingGuide: '' }]); };
  const removeRow = (key: number) => { setSavedNotice(''); setRows((prev) => prev.filter((r) => r.key !== key)); };
  const moveRow = (i: number, dir: -1 | 1) => {
    setSavedNotice('');
    setRows((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const doSave = async () => {
    setSaving(true);
    setError('');
    setSavedNotice('');
    const competencies: CompetencyInput[] = rows.map((r) => ({
      name: r.name.trim(),
      description: r.description.trim() || undefined,
      weightage: r.weightage,
      whatToAssess: r.whatToAssess.trim() || undefined,
      ratingGuide: r.ratingGuide.trim() || undefined,
    }));
    try {
      const saved = template
        ? (await updateCompetencyTemplate(template.id, { competencies, category: canEditCategory && editCategory ? editCategory : undefined })).template
        : (await createCompetencyTemplate({ roleName, category: (editCategory || category) as CompetencyCategory, competencies })).template;
      onSaved(saved);
      setSavedNotice('Saved successfully');
      notify(`Competencies for ${roleName} saved successfully.`, 'success');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to save template.'));
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (rows.some((r) => !r.name.trim())) { setError('Every competency needs a name.'); return; }
    if (!totalOk) { setError(`Weightages must add up to 100 (currently ${total}).`); return; }
    if (!template && !(editCategory || category)) { setError('Role category is required.'); setCategoryExpanded(true); return; }
    setError('');
    setSavedNotice('');
    // Editing an APPROVED template already used by a candidate creates a new
    // version rather than mutating it; HR should know before it happens.
    if (template && template.status === 'APPROVED' && usageCount > 0) { setConfirmingUsedEdit(true); return; }
    await doSave();
  };

  const approve = async () => {
    if (!template) return;
    setApproving(true);
    setError('');
    setSavedNotice('');
    try {
      onSaved((await approveCompetencyTemplate(template.id)).template);
      setSavedNotice('Approved');
      notify(`Competencies for ${roleName} approved.`, 'success');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to approve template.'));
    } finally {
      setApproving(false);
    }
  };

  // Regenerating an APPROVED template creates a new draft version; the current
  // approved version keeps serving new invites until the draft is approved.
  const regenerate = () => {
    if (!editCategory) { setError('Role category is required to regenerate.'); return; }
    setError('');
    setConfirmingRegenerate(true);
  };

  const doRegenerate = async () => {
    if (!template || !editCategory) return;
    const wasApproved = template.status === 'APPROVED';
    setConfirmingRegenerate(false);
    setRegenerating(true);
    setError('');
    setSavedNotice('');
    try {
      const fresh = (await regenerateCompetencyTemplate(template.id, { category: editCategory, description: editDescription.trim() || undefined })).template;
      setRows(rowsFrom(fresh, nextKey));
      onSaved(fresh);
      setSavedNotice('Suggestions refreshed — review, then Save/Approve.');
      notify(
        wasApproved
          ? `New draft generated for ${roleName} — the approved version keeps serving new interviews until you approve this draft.`
          : `New AI suggestions generated for ${roleName}.`,
        'success',
      );
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to regenerate.'));
      notify('Failed to regenerate competencies.', 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const loadHistory = async () => {
    if (!template) return;
    setHistoryLoading(true);
    try {
      setHistory(await fetchCompetencyTemplateVersions(template.id));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Could not load version history.'));
    } finally {
      setHistoryLoading(false);
    }
  };

  const wide = width >= WIDE_MIN;

  return (
    <View style={styles.stack} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <View style={styles.flex1}>
          <Pressable onPress={onBack} accessibilityRole="button" hitSlop={8} style={styles.back}>
            <ThemedText themeColor="textMuted" style={[styles.body, styles.underline]}>← Back to list</ThemedText>
          </Pressable>
          <ThemedText style={styles.h2}>{roleName}</ThemedText>
        </View>
        <View style={styles.badges}>
          {showChip ? (
            <Badge variant="purple" size="sm">
              {CATEGORY_LABELS[editCategory as CompetencyCategory]}
            </Badge>
          ) : null}
          {showChip && canEditCategory ? (
            <Pressable onPress={() => setCategoryExpanded(true)} hitSlop={8}><ThemedText themeColor="textMuted" style={[styles.small, styles.underline]}>Change</ThemedText></Pressable>
          ) : null}
          {showChip && template ? (
            <Pressable onPress={() => setCategoryExpanded(true)} hitSlop={8}><ThemedText themeColor="textMuted" style={[styles.small, styles.underline]}>Regenerate via AI</ThemedText></Pressable>
          ) : null}
          {template ? <Badge variant={template.status === 'APPROVED' ? 'success' : 'warning'} size="sm">{template.status}</Badge> : null}
          {template ? <Badge variant="secondary" size="sm">{`v${template.version}`}</Badge> : null}
          {template ? <Badge variant={template.source === 'AI_SUGGESTED' ? 'blue' : 'secondary'} size="sm">{template.source === 'AI_SUGGESTED' ? 'AI Suggested' : 'Manual'}</Badge> : null}
          {template ? <Button size="sm" variant="secondary" loading={regenerating} onPress={regenerate}>{regenerating ? 'Regenerating…' : 'Regenerate via AI'}</Button> : null}
          {template && template.version > 1 ? <Button size="sm" variant="secondary" loading={historyLoading} onPress={loadHistory}>View History</Button> : null}
        </View>
      </View>

      {error ? <ErrorBanner message={error} /> : null}

      {showExpandedSection ? (
        <Card padding="md">
          <View style={styles.stack}>
            <View style={styles.catHead}>
              <View style={styles.flex1}>
                {canEditCategory ? (
                  <View>
                    <ThemedText themeColor="textMuted" style={styles.fieldLabel}>{'ROLE CATEGORY '}<ThemedText style={[styles.fieldLabel, { color: theme.danger }]}>*</ThemedText></ThemedText>
                    <View style={styles.catRow}>
                      {CATEGORIES.map((c) => {
                        const active = editCategory === c.value;
                        return (
                          <Pressable
                            key={c.value}
                            onPress={() => setEditCategory(c.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            style={[styles.cat, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.surface }]}>
                            <ThemedText style={[styles.catText, { color: active ? '#fff' : theme.text }]}>{c.label}</ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                    <ThemedText themeColor="textMuted" style={styles.small}>
                      {template?.category ? 'Editable while DRAFT — locks once approved.' : 'Controls which context AI suggestions/regeneration use.'}
                    </ThemedText>
                  </View>
                ) : editCategory ? (
                  <View style={styles.stack}>
                    <ThemedText themeColor="textMuted" style={styles.fieldLabel}>ROLE CATEGORY</ThemedText>
                    <View style={styles.start}><Badge variant="purple" size="sm">{CATEGORY_LABELS[editCategory]}</Badge></View>
                    <ThemedText themeColor="textMuted" style={styles.small}>Locked — this template is approved.</ThemedText>
                  </View>
                ) : null}
              </View>
              {editCategory ? (
                <Pressable onPress={() => setCategoryExpanded(false)} hitSlop={8}><ThemedText themeColor="textMuted" style={[styles.small, styles.underline]}>Collapse</ThemedText></Pressable>
              ) : null}
            </View>
            {template ? (
              <Input
                label="Role Description (optional, for Regenerate)"
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder={descriptionPlaceholder(editCategory)}
              />
            ) : null}
            {template ? (
              <View style={styles.end}>
                <Button size="sm" variant="secondary" disabled={regenerating || !editCategory} onPress={regenerate}>{regenerating ? 'Regenerating…' : 'Regenerate via AI'}</Button>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}

      <View style={styles.stack}>
        {rows.map((row, i) => (
          <Card key={row.key} padding="md">
            <View style={styles.stack}>
              <View style={wide ? styles.topWide : styles.stack}>
                <View style={wide ? styles.nameWide : undefined}><Input label="Name" required={i === 0} value={row.name} onChangeText={(v) => updateRow(row.key, { name: v })} /></View>
                <View style={wide ? styles.descWide : undefined}><Input label="Description" value={row.description} onChangeText={(v) => updateRow(row.key, { description: v })} /></View>
                <View style={wide ? styles.weightWrapWide : styles.weightRow}>
                  <View style={styles.weight}>
                    <Input
                      label="Weight %"
                      keyboardType="number-pad"
                      value={String(row.weightage)}
                      onChangeText={(v) => updateRow(row.key, { weightage: parseInt(v, 10) || 0 })}
                    />
                  </View>
                  <View style={styles.rowBtns}>
                    <MiniButton label="↑" disabled={i === 0} onPress={() => moveRow(i, -1)} a11y="Move up" />
                    <MiniButton label="↓" disabled={i === rows.length - 1} onPress={() => moveRow(i, 1)} a11y="Move down" />
                    <MiniButton label="✕" disabled={rows.length === 1} danger onPress={() => removeRow(row.key)} a11y="Remove competency" />
                  </View>
                </View>
              </View>
              <View style={wide ? styles.pair : styles.stack}>
                <View style={wide ? styles.flex1 : undefined}>
                  <Input
                    label="What to assess"
                    value={row.whatToAssess}
                    onChangeText={(v) => updateRow(row.key, { whatToAssess: v })}
                    placeholder="What should a good answer cover for this competency?"
                    multiline
                    numberOfLines={3}
                  />
                </View>
                <View style={wide ? styles.flex1 : undefined}>
                  <Input
                    label="Rating guide"
                    value={row.ratingGuide}
                    onChangeText={(v) => updateRow(row.key, { ratingGuide: v })}
                    placeholder="What does a weak vs strong answer look like?"
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </View>
            </View>
          </Card>
        ))}

        <Card padding="md">
          <View style={styles.totalRow}>
            <Button size="sm" variant="secondary" onPress={addRow}>+ Add Competency</Button>
            <ThemedText style={[styles.total, { color: totalOk ? theme.success : theme.danger }]}>{`Total: ${total}% ${totalOk ? '' : '(must equal 100%)'}`}</ThemedText>
          </View>
        </Card>

        <View style={styles.actions}>
          {savedNotice ? <ThemedText style={[styles.body, styles.bold, { color: theme.success }]} accessibilityRole="alert">{`✓ ${savedNotice}`}</ThemedText> : null}
          <Button size="sm" variant="secondary" loading={saving} disabled={!totalOk} onPress={save}>{saving ? 'Saving…' : 'Save'}</Button>
          {template && template.status === 'DRAFT' ? (
            <Button size="sm" loading={approving} disabled={!totalOk} onPress={approve}>{approving ? 'Approving…' : 'Approve'}</Button>
          ) : null}
        </View>
      </View>

      <Sheet
        visible={!!history}
        onClose={() => setHistory(null)}
        title={`Version History — ${roleName}`}
        footer={<Button style={styles.flex1} variant="secondary" onPress={() => setHistory(null)}>Close</Button>}>
        {(history ?? []).map((v) => (
          <View key={v.id} style={[styles.version, { borderColor: theme.border }]}>
            <View style={styles.versionHead}>
              <ThemedText style={[styles.body, styles.bold]}>{`Version ${v.version}${v.isCurrent ? ' (current)' : ''}`}</ThemedText>
              <Badge variant={v.status === 'APPROVED' ? 'success' : 'warning'} size="sm">{v.status}</Badge>
            </View>
            <ThemedText themeColor="textMuted" style={styles.small}>{`Updated ${fmtDateTimeFull(v.updatedAt)} by ${v.updatedBy?.name ?? v.createdBy?.name ?? '—'}`}</ThemedText>
            {v.competencies.map((c) => (
              <ThemedText key={c.id} themeColor="textSecondary" style={styles.body}>{`${c.name} — ${c.weightage}%`}</ThemedText>
            ))}
          </View>
        ))}
      </Sheet>

      <Sheet
        visible={confirmingUsedEdit && !!template}
        onClose={() => setConfirmingUsedEdit(false)}
        title="This template is already in use"
        footer={
          <>
            <Button style={styles.flex1} variant="secondary" onPress={() => setConfirmingUsedEdit(false)}>Cancel</Button>
            <Button style={styles.flex1} disabled={saving} onPress={() => { setConfirmingUsedEdit(false); doSave(); }}>{saving ? 'Saving…' : `Save as version ${(template?.version ?? 0) + 1}`}</Button>
          </>
        }>
        <ThemedText themeColor="textSecondary" style={styles.body}>
          {`${usageCount} candidate${usageCount === 1 ? '' : 's'} already went through version ${template?.version} of this template. Saving will create version ${(template?.version ?? 0) + 1} — those candidates keep reading version ${template?.version} exactly as it was, unaffected. Only new interviews will use your changes.`}
        </ThemedText>
      </Sheet>

      <Sheet
        visible={confirmingRegenerate && !!template}
        onClose={() => setConfirmingRegenerate(false)}
        title="Regenerate via AI"
        footer={
          <>
            <Button style={styles.flex1} variant="secondary" onPress={() => setConfirmingRegenerate(false)}>Cancel</Button>
            <Button style={styles.flex1} disabled={regenerating} onPress={doRegenerate}>{regenerating ? 'Regenerating…' : 'Regenerate'}</Button>
          </>
        }>
        {hasUnsavedEdits ? <ThemedText themeColor="textSecondary" style={styles.body}>This will discard your unsaved edits below.</ThemedText> : null}
        {template?.status === 'APPROVED' ? (
          <ThemedText themeColor="textSecondary" style={styles.body}>
            {usageCount > 0 ? `${usageCount} candidate${usageCount === 1 ? '' : 's'} already went through the current approved version. ` : ''}
            This creates a new draft version — the current approved version keeps serving new interview/assignment invites for this role until you review and approve the draft. The role is never taken offline.
          </ThemedText>
        ) : (
          <ThemedText themeColor="textSecondary" style={styles.body}>This replaces the current competencies.</ThemedText>
        )}
      </Sheet>
    </View>
  );
}

function MiniButton({ label, onPress, disabled, danger, a11y }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean; a11y: string }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.mini, { borderColor: theme.border, backgroundColor: theme.surface }, disabled && { opacity: 0.3 }]}>
      <ThemedText style={[styles.miniText, danger && { color: theme.danger }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  flex1: { flex: 1, minWidth: 0 },
  start: { alignSelf: 'flex-start' },
  end: { alignItems: 'flex-end' },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  bold: { fontFamily: FontWeights.semiBold },
  underline: { textDecorationLine: 'underline' },
  h2: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold, marginTop: 4 },
  back: { minHeight: 32, justifyContent: 'center' },
  head: { gap: 8 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  fieldLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, letterSpacing: 0.5, marginBottom: 6 },
  catHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cat: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: Radii.sm },
  catText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  topWide: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  nameWide: { flex: 1.2, minWidth: 0 },
  descWide: { flex: 2, minWidth: 0 },
  weightWrapWide: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  weightRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  weight: { width: 90 },
  rowBtns: { flexDirection: 'row', gap: 6, paddingBottom: 2 },
  mini: { width: 40, height: 44, borderWidth: 1, borderRadius: Radii.sm, alignItems: 'center', justifyContent: 'center' },
  miniText: { fontSize: 14, lineHeight: 20 },
  pair: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  total: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
  version: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 4 },
  versionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
});
