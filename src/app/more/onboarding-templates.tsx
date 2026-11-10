import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fmtDateTimeFull } from '@/components/competencies/competency-shared';
import { Sheet } from '@/components/customers/sheet';
import { TaskEditor } from '@/components/onboarding-templates/task-editor';
import { ErrorBanner } from '@/components/overview/parts';
import { PermissionGate } from '@/components/permission-gate';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card, Input, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createOnboardingTemplate, fetchOnboardingTemplates, getErrorMessage, suggestOnboardingTemplate, updateOnboardingTemplate } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { OnboardingTaskInput, OnboardingTemplate } from '@/types/api';

// /onboarding-task-templates is requireHRModuleAccess: OWNER/STORE_MANAGER/HR/
// ACCOUNTING pass on role, anyone else needs the hr_module tab.
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'HR', 'ACCOUNTING'];
const WIDE_MIN = 560;

// An existing template, or a brand-new unsaved one (role + starting tasks, from
// "Start from Scratch" or an unsaved AI suggestion). `id` keeps the editor's
// state stable across the create -> update switch.
type Editing = { id: number; template: OnboardingTemplate | null; roleName: string; initialTasks: OnboardingTaskInput[] };

function TemplatesContent() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const seq = useRef(0);

  const [width, setWidth] = useState(0);
  const [templates, setTemplates] = useState<OnboardingTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTemplates(await fetchOnboardingTemplates());
    } catch (err: unknown) {
      setTemplates((t) => t ?? []);
      setError(getErrorMessage(err, 'Could not load onboarding templates.'));
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

  const openEditor = (template: OnboardingTemplate | null, roleName: string, initialTasks: OnboardingTaskInput[]) => {
    setSaveError(null);
    setSavedAt(null);
    setEditing({ id: seq.current++, template, roleName, initialTasks });
  };

  const save = async (tasks: OnboardingTaskInput[]) => {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    setSavedAt(null);
    try {
      const res = editing.template
        ? await updateOnboardingTemplate(editing.template.id, { tasks })
        : await createOnboardingTemplate({ roleName: editing.roleName, tasks });
      // After a first save the editor continues on the saved template, so the next Save is an update.
      setEditing((e) => (e ? { ...e, template: res.template, roleName: res.template.roleName } : e));
      setSavedAt(new Date());
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, 'Failed to save template.'));
    } finally {
      setSaving(false);
    }
  };

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;

  if (editing) {
    return (
      <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Stack.Screen options={{ title: 'Onboarding Templates' }} />
        <ScrollView contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <TaskEditor
            key={editing.id}
            roleName={editing.roleName}
            initialTasks={editing.template
              ? editing.template.tasks.map((t) => ({ label: t.label, description: t.description ?? undefined, responsible: t.responsible ?? undefined }))
              : editing.initialTasks}
            saving={saving}
            error={saveError}
            savedAt={savedAt}
            onSave={save}
            onBack={() => { setEditing(null); load(); }}
          />
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Onboarding Templates' }} />
      <ScrollView
        contentContainerStyle={{ padding: pad, paddingBottom: insets.bottom + 40, gap: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.titleRow}>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>Onboarding Templates</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.subtitle}>
              Role-specific onboarding checklists, matched against an employee&apos;s designation at creation time. Roles without a template here get the default checklist.
            </ThemedText>
          </View>
          <Button size="sm" onPress={() => setCreating(true)}>New Template</Button>
        </View>

        {error ? <ErrorBanner message={error} onRetry={load} /> : null}

        {templates === null ? (
          <Card padding="md"><Skeleton height={20} width="40%" /><Skeleton height={44} /><Skeleton height={44} /></Card>
        ) : templates.length === 0 ? (
          error ? null : (
            <Card padding="md">
              <ThemedText themeColor="textMuted" style={styles.body}>No role-specific templates yet — every new employee gets the default checklist.</ThemedText>
            </Card>
          )
        ) : (
          <Card padding="none" style={styles.clip}>
            {wide ? (
              <View style={[styles.tr, styles.th, { borderBottomColor: theme.border }]}>
                <ThemedText themeColor="textMuted" style={[styles.thText, { flex: 1.4 }]}>ROLE / DESIGNATION</ThemedText>
                <ThemedText themeColor="textMuted" style={[styles.thText, { flex: 1 }]}>TASKS</ThemedText>
                <ThemedText themeColor="textMuted" style={[styles.thText, { flex: 1 }]}>LAST UPDATED</ThemedText>
                <View style={styles.editCol} />
              </View>
            ) : null}
            {templates.map((t, i) => {
              const border = i < templates.length - 1 ? { borderBottomWidth: 1, borderBottomColor: theme.border } : null;
              return wide ? (
                <View key={t.id} style={[styles.tr, border]}>
                  <ThemedText style={[styles.role, { flex: 1.4 }]} numberOfLines={2}>{t.roleName}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={[styles.body, { flex: 1 }]}>{t.tasks.length}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={[styles.body, { flex: 1 }]}>{fmtDateTimeFull(t.updatedAt)}</ThemedText>
                  <View style={styles.editCol}><Button size="sm" variant="secondary" onPress={() => openEditor(t, t.roleName, [])}>Edit</Button></View>
                </View>
              ) : (
                <View key={t.id} style={[styles.phoneRow, border]}>
                  <View style={styles.flex1}>
                    <ThemedText style={styles.role} numberOfLines={2}>{t.roleName}</ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.small}>{`${t.tasks.length} task${t.tasks.length === 1 ? '' : 's'}`}</ThemedText>
                    <ThemedText themeColor="textMuted" style={styles.small}>{`Last updated ${fmtDateTimeFull(t.updatedAt)}`}</ThemedText>
                  </View>
                  <Button size="sm" variant="secondary" onPress={() => openEditor(t, t.roleName, [])}>Edit</Button>
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      {creating ? <NewTemplateSheet onClose={() => setCreating(false)} onStart={(roleName, tasks) => { setCreating(false); openEditor(null, roleName, tasks); }} /> : null}
    </ThemedView>
  );
}

// Dashboard NewTemplateModal: a role name (+ optional department for AI
// context) and how to start. Neither path writes to the DB; both hand a task
// list to the editor.
function NewTemplateSheet({ onClose, onStart }: { onClose: () => void; onStart: (roleName: string, tasks: OnboardingTaskInput[]) => void }) {
  const [roleName, setRoleName] = useState('');
  const [department, setDepartment] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState('');

  const suggest = async () => {
    if (!roleName.trim()) { setError('Role name is required.'); return; }
    setSuggesting(true);
    setError('');
    try {
      const tasks = await suggestOnboardingTemplate({ roleName: roleName.trim(), department: department.trim() || undefined });
      onStart(roleName.trim(), tasks);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to generate suggestions.'));
    } finally {
      setSuggesting(false);
    }
  };

  const startManual = () => {
    if (!roleName.trim()) { setError('Role name is required.'); return; }
    onStart(roleName.trim(), [{ label: '', description: '', responsible: '' }]);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={suggesting}
      title="New Onboarding Template"
      footer={
        <>
          <Button style={styles.flex1} variant="secondary" disabled={suggesting} onPress={startManual}>Start from Scratch</Button>
          <Button style={styles.flex1} loading={suggesting} onPress={suggest}>{suggesting ? 'Suggesting…' : 'Suggest via AI'}</Button>
        </>
      }>
      {error ? <ErrorBanner message={error} /> : null}
      <Input label="Role / Designation" required value={roleName} onChangeText={setRoleName} placeholder="e.g. Technician" />
      <Input label="Department (optional, for AI context)" value={department} onChangeText={setDepartment} />
    </Sheet>
  );
}

export default function OnboardingTemplatesScreen() {
  const { user } = useAuth();
  if (ADMIN_ROLES.includes(user?.role ?? '')) return <TemplatesContent />;
  return (
    <PermissionGate tabKey="hr_module" deniedMessage="Onboarding Templates is available to Owner, Store Manager, HR and Accounting roles, or users granted HR module access.">
      <TemplatesContent />
    </PermissionGate>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  clip: { overflow: 'hidden', borderRadius: Radii.md },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  th: { borderBottomWidth: 1, paddingVertical: 8 },
  thText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  role: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  editCol: { width: 64, alignItems: 'flex-end' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
});
