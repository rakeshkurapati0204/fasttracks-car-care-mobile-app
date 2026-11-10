import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  CATEGORIES, CATEGORY_HINTS, CATEGORY_LABELS, MAX_DESCRIPTION_LENGTH, descriptionPlaceholder, detectCategory, findSimilarRole, normalizeRoleName,
} from '@/components/competencies/competency-shared';
import { Sheet } from '@/components/customers/sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCompetencyTemplate, getErrorMessage, suggestCompetencyTemplate, unarchiveCompetencyTemplate } from '@/lib/api';
import type { CompetencyCategory, CompetencyTemplate, CompetencyTemplateListItem, RoleCoverage } from '@/types/api';

// A role-name suggestion, grouped as the dashboard does: (a) applied roles with
// no template yet, (b) designations, (c) roles that already have a template
// (muted; picking one opens it).
type Suggestion = { key: string; displayName: string; sublabel: string; template?: CompetencyTemplateListItem; muted?: boolean };

function filterGroup(items: Suggestion[], query: string, limit = 5): Suggestion[] {
  if (!query) return [];
  return items
    .filter((i) => i.key.includes(query))
    .sort((a, b) => {
      const aStarts = a.key.startsWith(query) ? 0 : 1;
      const bStarts = b.key.startsWith(query) ? 0 : 1;
      return aStarts !== bStarts ? aStarts - bStarts : a.displayName.localeCompare(b.displayName);
    })
    .slice(0, limit);
}

type Props = {
  existingTemplates: CompetencyTemplateListItem[];
  designations: string[];
  roleCoverage: RoleCoverage[];
  onClose: () => void;
  onOpenTemplate: (t: CompetencyTemplate) => void;
  onManual: (roleName: string, category: CompetencyCategory) => void;
  /** Set when opened from Applications' "Create template": the name must match the application's role exactly. */
  lockRoleName?: string;
};

// Dashboard NewTemplateModal as a bottom sheet. Neither path writes to the DB
// except Suggest; Start from Scratch just hands the role + category to the
// editor, whose first Save calls create. Both buttons stay clickable so a click
// is what reveals what's missing.
export function NewTemplateSheet({ existingTemplates, designations, roleCoverage, onClose, onOpenTemplate, onManual, lockRoleName }: Props) {
  const theme = useTheme();
  const [roleName, setRoleName] = useState(lockRoleName ?? '');
  const [category, setCategory] = useState<CompetencyCategory | ''>('');
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const [roleNameError, setRoleNameError] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [confirmedSimilar, setConfirmedSimilar] = useState(false);
  // From the server's 409 for an archived duplicate the active-only client check can't see.
  const [serverConflict, setServerConflict] = useState<{ id: string; archived: boolean } | null>(null);

  useEffect(() => {
    if (categoryTouched || !roleName.trim()) return;
    const detected = detectCategory(roleName);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keyword auto-pick until HR chooses
    if (detected) setCategory(detected);
  }, [roleName, categoryTouched]);

  const existingByName = useMemo(() => {
    const m = new Map<string, CompetencyTemplateListItem>();
    for (const t of existingTemplates) m.set(normalizeRoleName(t.roleName), t);
    return m;
  }, [existingTemplates]);
  const matchedActive = roleName.trim() !== '' ? existingByName.get(normalizeRoleName(roleName)) : undefined;
  const conflict = matchedActive ? { id: matchedActive.id, archived: false } : serverConflict;
  const isDuplicate = roleName.trim() !== '' && !!conflict;

  const similarMatch = useMemo(
    () => (isDuplicate ? null : findSimilarRole(roleName, existingTemplates.map((t) => t.roleName))),
    [roleName, existingTemplates, isDuplicate],
  );
  const needsSimilarConfirm = !!similarMatch && !confirmedSimilar;

  const validate = (): boolean => {
    if (!roleName.trim()) { setRoleNameError('Please enter a role name.'); return false; }
    setRoleNameError('');
    if (!category) { setCategoryError('Please select a category.'); return false; }
    setCategoryError('');
    return !(isDuplicate || needsSimilarConfirm);
  };

  const groupA = useMemo<Suggestion[]>(() => roleCoverage
    .filter((r) => !r.hasLiveTemplate && !existingByName.has(normalizeRoleName(r.roleApplied)))
    .map((r) => ({
      key: normalizeRoleName(r.roleApplied),
      displayName: r.roleApplied,
      sublabel: `${r.applicantCount} applicant${r.applicantCount === 1 ? '' : 's'} · no template yet`,
    })), [roleCoverage, existingByName]);

  const groupB = useMemo<Suggestion[]>(() => {
    const seen = new Set(groupA.map((g) => g.key));
    const items: Suggestion[] = [];
    for (const d of designations) {
      const key = normalizeRoleName(d);
      if (seen.has(key) || existingByName.has(key)) continue;
      seen.add(key);
      items.push({ key, displayName: d, sublabel: 'designation' });
    }
    return items;
  }, [designations, groupA, existingByName]);

  const groupC = useMemo<Suggestion[]>(() => existingTemplates.map((t) => ({
    key: normalizeRoleName(t.roleName),
    displayName: t.roleName,
    sublabel: `${t.category ? CATEGORY_LABELS[t.category] : 'Category not set'} (template exists)`,
    template: t,
    muted: true,
  })), [existingTemplates]);

  const query = normalizeRoleName(roleName);
  const fA = useMemo(() => filterGroup(groupA, query), [groupA, query]);
  const fB = useMemo(() => filterGroup(groupB, query), [groupB, query]);
  const fC = useMemo(() => filterGroup(groupC, query), [groupC, query]);
  const showCreateNew = query !== '' && ![...groupA, ...groupB, ...groupC].some((s) => s.key === query);
  const showDropdown = !lockRoleName && dropdownOpen && query !== '' && (fA.length > 0 || fB.length > 0 || fC.length > 0 || showCreateNew);

  const onRoleNameChange = (v: string) => {
    setRoleName(v);
    setServerConflict(null);
    setConfirmedSimilar(false);
    setError('');
    setRoleNameError('');
  };

  const select = (s: Suggestion) => {
    setDropdownOpen(false);
    if (s.template) { onOpenTemplate(s.template); return; }
    onRoleNameChange(s.displayName);
  };

  const openConflict = async () => {
    if (!conflict) return;
    setOpening(true);
    setError('');
    try {
      const t = conflict.archived ? (await unarchiveCompetencyTemplate(conflict.id)).template : await fetchCompetencyTemplate(conflict.id);
      if (t) onOpenTemplate(t);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to open existing template.'));
    } finally {
      setOpening(false);
    }
  };

  const openSimilar = () => {
    if (!similarMatch) return;
    const t = existingByName.get(normalizeRoleName(similarMatch.name));
    if (t) onOpenTemplate(t);
  };

  const suggest = async () => {
    if (!validate() || !category) return;
    setSuggesting(true);
    setError('');
    try {
      const res = await suggestCompetencyTemplate({ roleName: roleName.trim(), category, description: description.trim() || undefined });
      onOpenTemplate(res.template);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { existingTemplateId?: string; archived?: boolean } } };
      if (e?.response?.status === 409 && e.response.data?.existingTemplateId) {
        setServerConflict({ id: e.response.data.existingTemplateId, archived: !!e.response.data.archived });
      }
      setError(getErrorMessage(err, 'Failed to generate suggestions.'));
    } finally {
      setSuggesting(false);
    }
  };

  const startManual = () => {
    if (!validate() || !category) return;
    onManual(roleName.trim(), category);
  };

  const descriptionExpanded = descriptionFocused || description.length > 0;

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={suggesting}
      title="New Competency Template"
      footer={
        <>
          <Button style={styles.flex1} variant="secondary" disabled={suggesting} onPress={startManual}>Start from Scratch</Button>
          <Button style={styles.flex1} loading={suggesting} onPress={suggest}>{suggesting ? 'Suggesting…' : 'Suggest via AI'}</Button>
        </>
      }>
      {error ? <ErrorBanner message={error} /> : null}

      {isDuplicate && conflict ? (
        <View style={[styles.box, { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
          <ThemedText style={[styles.body, { color: theme.danger }]}>{`A template for “${roleName.trim()}” already exists${conflict.archived ? ' (archived)' : ''}.`}</ThemedText>
          <Pressable onPress={openConflict} disabled={opening} hitSlop={8}>
            <ThemedText style={[styles.small, styles.link, { color: theme.danger }]}>{opening ? 'Opening…' : conflict.archived ? 'Unarchive & open existing template' : 'Open existing template'}</ThemedText>
          </Pressable>
        </View>
      ) : null}

      <View>
        {lockRoleName ? (
          <View>
            <ThemedText themeColor="textSecondary" style={styles.label}>Role Name *</ThemedText>
            <View style={[styles.locked, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <ThemedText style={styles.body}>{roleName}</ThemedText>
            </View>
            <ThemedText themeColor="textMuted" style={styles.small}>
              Locked to exactly match this application&apos;s role applied for — the AI interview looks up a template by this exact name.
            </ThemedText>
          </View>
        ) : (
          <Input
            label="Role Name"
            required
            value={roleName}
            onChangeText={(v) => { onRoleNameChange(v); setDropdownOpen(true); }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
            placeholder="e.g. Service Advisor"
            autoComplete="off"
            error={roleNameError || undefined}
          />
        )}
        {showDropdown ? (
          <View style={[styles.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {fA.length > 0 ? <GroupHeader>Applied roles without a template</GroupHeader> : null}
            {fA.map((s) => <SuggestionRow key={`a-${s.key}`} s={s} onSelect={select} />)}
            {fB.length > 0 ? <GroupHeader>Designations</GroupHeader> : null}
            {fB.map((s) => <SuggestionRow key={`b-${s.key}`} s={s} onSelect={select} />)}
            {fC.length > 0 ? <GroupHeader>Already has a template</GroupHeader> : null}
            {fC.map((s) => <SuggestionRow key={`c-${s.key}`} s={s} onSelect={select} />)}
            {showCreateNew ? (
              <Pressable onPress={() => setDropdownOpen(false)} style={[styles.createNew, { borderTopColor: theme.border }]}>
                <ThemedText style={[styles.small, styles.bold, { color: theme.primary }]}>{`Create new role: “${roleName.trim()}”`}</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {similarMatch && !isDuplicate ? (
        <View style={[styles.box, { backgroundColor: withAlpha(theme.warning, 0.12) }]}>
          <ThemedText style={[styles.body, { color: theme.warning }]}>
            {'Similar role exists: '}<ThemedText style={[styles.body, styles.bold, { color: theme.warning }]}>{similarMatch.name}</ThemedText>
          </ThemedText>
          <View style={styles.similarRow}>
            <Pressable onPress={openSimilar} hitSlop={8}><ThemedText style={[styles.small, styles.link, styles.bold, { color: theme.warning }]}>Open</ThemedText></Pressable>
            <Pressable onPress={() => setConfirmedSimilar((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: confirmedSimilar }} style={styles.checkRow} hitSlop={8}>
              <View style={[styles.checkbox, { borderColor: theme.warning, backgroundColor: confirmedSimilar ? theme.warning : 'transparent' }]}>
                {confirmedSimilar ? <ThemedText style={styles.check}>✓</ThemedText> : null}
              </View>
              <ThemedText style={[styles.small, { color: theme.warning }]}>This is a different role — create it anyway</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View>
        <ThemedText themeColor={categoryError ? 'danger' : 'textSecondary'} style={styles.label}>Role Category *</ThemedText>
        <View style={styles.catGrid}>
          {CATEGORIES.map((c) => {
            const active = category === c.value;
            return (
              <Pressable
                key={c.value}
                onPress={() => { setCategory(c.value); setCategoryTouched(true); setCategoryError(''); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.cat, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.surface }]}>
                <ThemedText style={[styles.catText, { color: active ? '#fff' : theme.text }]}>{c.label}</ThemedText>
              </Pressable>
            );
          })}
        </View>
        {category ? <ThemedText themeColor="textMuted" style={styles.small}>{CATEGORY_HINTS[category]}</ThemedText> : null}
        {categoryError ? <ThemedText style={[styles.small, { color: theme.danger }]}>{categoryError}</ThemedText> : null}
      </View>

      <View>
        <Input
          label="Job Description (optional, for AI context)"
          value={description}
          onChangeText={setDescription}
          onFocus={() => setDescriptionFocused(true)}
          onBlur={() => setDescriptionFocused(false)}
          multiline
          numberOfLines={descriptionExpanded ? 8 : 3}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder={`${descriptionPlaceholder(category)} — or paste the full job description.`}
        />
        {descriptionExpanded ? <ThemedText themeColor="textMuted" style={[styles.small, styles.right]}>{`${description.length}/${MAX_DESCRIPTION_LENGTH}`}</ThemedText> : null}
      </View>
    </Sheet>
  );
}

function GroupHeader({ children }: { children: string }) {
  return <ThemedText themeColor="textMuted" style={styles.groupHeader}>{children.toUpperCase()}</ThemedText>;
}

function SuggestionRow({ s, onSelect }: { s: Suggestion; onSelect: (s: Suggestion) => void }) {
  return (
    <Pressable onPress={() => onSelect(s)} style={styles.suggestion} accessibilityRole="button">
      <ThemedText themeColor={s.muted ? 'textMuted' : 'text'} style={[styles.small, !s.muted && styles.bold]}>
        {s.displayName}<ThemedText themeColor="textMuted" style={[styles.small, { fontFamily: FontWeights.regular }]}>{` · ${s.sublabel}`}</ThemedText>
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  bold: { fontFamily: FontWeights.semiBold },
  link: { textDecorationLine: 'underline' },
  right: { textAlign: 'right' },
  label: { fontSize: 13, lineHeight: 18, fontFamily: FontWeights.medium, marginBottom: 4 },
  box: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm, gap: 6 },
  locked: { minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 14, justifyContent: 'center', marginBottom: 4 },
  dropdown: { borderWidth: 1, borderRadius: Radii.sm, marginTop: 4, overflow: 'hidden' },
  groupHeader: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.bold, letterSpacing: 0.5, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 },
  suggestion: { paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, justifyContent: 'center' },
  createNew: { paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1 },
  similarRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  check: { color: '#fff', fontSize: 12, lineHeight: 14, fontFamily: FontWeights.bold },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cat: { width: '48.5%', paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderRadius: Radii.sm, alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  catText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, textAlign: 'center' },
});
