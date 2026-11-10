import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UploadDocumentSheet } from '@/components/employees/upload-document-sheet';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Card } from '@/components/ui';
import { FontWeights, Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deleteIdentityDocument, fetchIdentityDocumentDataUri, fetchIdentityDocumentsDirectory, fetchMyIdentityDocuments, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useContentWidth } from '@/lib/drawer-context';
import { usePermissions } from '@/lib/permissions-context';
import type { IdentityDocument } from '@/types/api';

type Person = { id: string; name: string };

// null for value-only documents (a number, no file): nothing to size.
function fmtFileSize(bytes: number | null | undefined) {
  if (bytes == null) return null;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const docTitle = (doc: IdentityDocument) => (doc.type === 'PAN_CARD' ? 'PAN Card' : doc.type === 'AADHAAR_CARD' ? 'Aadhaar Card' : doc.label || 'Other document');

// Dashboard Employee Documents page: a name-only employee picker beside the
// selected person's identity documents. Phone: the picker first, then the documents.
export default function EmployeeDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const { status: permStatus, hasTab, refresh: refreshPermissions } = usePermissions();
  // Dashboard canAccess: the Owner, a store manager, or the per-employee
  // employee_documents override (a role is never changed by it).
  const isAuthorized = user?.role === 'OWNER' || user?.role === 'STORE_MANAGER' || (permStatus === 'ready' && hasTab('employee_documents'));

  const contentWidth = useContentWidth();
  const [width, setWidth] = useState(contentWidth);
  const { height: windowHeight } = useWindowDimensions();
  const wide = width >= 560;

  const [employees, setEmployees] = useState<Person[] | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Person | null>(null);
  const [documents, setDocuments] = useState<IdentityDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const showMsg = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3000);
  };

  const loadEmployees = useCallback(async () => {
    if (!isAuthorized) return;
    setError('');
    try {
      setEmployees(await fetchIdentityDocumentsDirectory());
    } catch (err: unknown) {
      setEmployees([]);
      setError(getErrorMessage(err, 'Could not load the employee directory.'));
    }
  }, [isAuthorized]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadEmployees();
  }, [loadEmployees]);

  const loadDocuments = useCallback(async (employeeId: string) => {
    setDocsLoading(true);
    try {
      setDocuments(await fetchMyIdentityDocuments(employeeId));
    } catch {
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on selection
    if (selected) loadDocuments(selected.id);
  }, [selected, loadDocuments]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await (selected ? loadDocuments(selected.id) : loadEmployees());
    setIsRefreshing(false);
  };

  const onView = async (doc: IdentityDocument) => {
    setOpeningId(doc.id);
    try {
      const dataUri = await fetchIdentityDocumentDataUri(doc.id, doc.mimeType ?? 'application/octet-stream');
      await Linking.openURL(dataUri);
    } catch {
      showMsg('Failed to load document.');
    } finally {
      setOpeningId(null);
    }
  };

  const onDelete = (doc: IdentityDocument) => {
    Alert.alert('Delete this document?', `This permanently removes ${docTitle(doc)}${doc.filename ? ` (${doc.filename})` : ''}. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteIdentityDocument(doc.id);
            if (selected) await loadDocuments(selected.id);
            showMsg('✓ Document deleted');
          } catch {
            showMsg('Failed to delete document.');
          }
        },
      },
    ]);
  };

  if (permStatus === 'error') {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="danger">Couldn&apos;t load your permissions.</ThemedText>
        <Button variant="secondary" onPress={() => refreshPermissions()}>Retry</Button>
      </ThemedView>
    );
  }

  if (permStatus === 'idle' || permStatus === 'loading') {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (!isAuthorized) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          Employee Documents is only available to Owner and Store Manager accounts, or anyone granted the Employee Documents tab.
        </ThemedText>
      </ThemedView>
    );
  }

  const q = search.toLowerCase();
  const filtered = (employees ?? []).filter((e) => e.name.toLowerCase().includes(q));

  const picker = (
    <Card padding="sm" style={[styles.pickerCard, wide && styles.pickerWide]}>
      <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="search" size={16} color={theme.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search employees…"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Search employees"
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>
      <ScrollView style={{ maxHeight: windowHeight * 0.6 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        {employees === null ? (
          <ThemedText themeColor="textMuted" style={styles.smallCenter}>Loading…</ThemedText>
        ) : filtered.length === 0 ? (
          <ThemedText themeColor="textMuted" style={styles.smallCenter}>No employees found.</ThemedText>
        ) : (
          filtered.map((e) => {
            const active = selected?.id === e.id;
            return (
              <Pressable
                key={e.id}
                onPress={() => { setSelected(e); setUploadOpen(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [styles.person, active && { backgroundColor: theme.primary }, pressed && !active && { backgroundColor: theme.surface }]}>
                <ThemedText style={[styles.personText, { color: active ? '#fff' : theme.text }]} numberOfLines={1}>{e.name}</ThemedText>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </Card>
  );

  const docs = (
    <Card padding="md" style={[styles.docsCard, wide && styles.flex1]}>
      {!selected ? (
        <ThemedText themeColor="textMuted" style={styles.empty}>Select an employee to view or manage their documents.</ThemedText>
      ) : (
        <>
          <View style={styles.docsHeader}>
            <ThemedText style={styles.selectedName} numberOfLines={1}>{selected.name}</ThemedText>
            <Button size="sm" variant="secondary" icon="cloud-upload-outline" onPress={() => setUploadOpen(true)}>Upload</Button>
          </View>

          {msg ? (
            <View style={[styles.msg, { backgroundColor: msg.startsWith('✓') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)' }]}>
              <ThemedText style={[styles.msgText, { color: msg.startsWith('✓') ? '#16a34a' : '#dc2626' }]}>{msg}</ThemedText>
            </View>
          ) : null}

          {docsLoading ? (
            <ThemedText themeColor="textMuted" style={styles.smallCenter}>Loading…</ThemedText>
          ) : documents.length === 0 ? (
            <ThemedText themeColor="textMuted" style={styles.smallCenter}>No identity documents on file for {selected.name}.</ThemedText>
          ) : (
            <View style={styles.docList}>
              {documents.map((doc) => (
                <View key={doc.id} style={[styles.doc, { borderColor: theme.border }]}>
                  <View style={styles.docInfo}>
                    <Ionicons name="document-text-outline" size={16} color={theme.textMuted} />
                    <View style={styles.flex1}>
                      <ThemedText style={styles.docTitle} numberOfLines={1}>{docTitle(doc)}</ThemedText>
                      <ThemedText themeColor="textMuted" style={styles.docMeta} numberOfLines={2}>
                        {[doc.filename, fmtFileSize(doc.fileSize), fmtDate(doc.createdAt)].filter(Boolean).join(' · ')}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.docActions}>
                    <Button size="sm" variant="secondary" loading={openingId === doc.id} onPress={() => onView(doc)}>View</Button>
                    <Pressable onPress={() => onDelete(doc)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Delete ${docTitle(doc)}`} style={({ pressed }) => [styles.trash, pressed && { opacity: 0.6 }]}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Card>
  );

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Employee Documents' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, { padding: wide ? Spacing.four : Spacing.three, paddingBottom: insets.bottom + Spacing.four }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}>
        <View>
          <ThemedText style={styles.title}>Employee Documents</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>
            Identity documents only — no salary or personal contact details are shown on this page.
          </ThemedText>
        </View>

        {error ? <ErrorBanner message={error} onRetry={loadEmployees} /> : null}

        {wide ? (
          <View style={styles.panes}>
            {picker}
            {docs}
          </View>
        ) : selected ? (
          <>
            <Pressable onPress={() => { setSelected(null); setUploadOpen(false); }} accessibilityRole="button" accessibilityLabel="Back to employees" style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}>
              <Ionicons name="chevron-back" size={18} color={theme.primary} />
              <ThemedText themeColor="primary" style={styles.backText}>Employees</ThemedText>
            </Pressable>
            {docs}
          </>
        ) : (
          picker
        )}
      </ScrollView>

      {uploadOpen && selected ? (
        <UploadDocumentSheet
          employee={selected}
          onClose={() => setUploadOpen(false)}
          onUploaded={() => { loadDocuments(selected.id); showMsg('✓ Document uploaded'); }}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.three },
  centerText: { textAlign: 'center' },
  content: { gap: Spacing.three, width: '100%' },
  title: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  panes: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  pickerCard: { gap: Spacing.two },
  pickerWide: { width: 280 },
  search: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderWidth: 1, borderRadius: Radii.sm },
  searchInput: { flex: 1, minHeight: 40, fontSize: 14, paddingVertical: 0 },
  list: { gap: 4 },
  person: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: Radii.sm },
  personText: { fontSize: 14, lineHeight: 20 },
  smallCenter: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingVertical: 24 },
  docsCard: { gap: Spacing.three },
  docsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  selectedName: { flex: 1, fontSize: 16, lineHeight: 22, fontFamily: FontWeights.semiBold },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 64 },
  msg: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  msgText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold },
  docList: { gap: Spacing.two },
  doc: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, padding: 12, borderWidth: 1, borderRadius: Radii.md },
  docInfo: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  docTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  docMeta: { fontSize: 12, lineHeight: 16 },
  docActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trash: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44 },
  backText: { fontSize: 14, fontFamily: FontWeights.medium },
});
