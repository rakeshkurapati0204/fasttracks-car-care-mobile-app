import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fmtDate, fmtDateTime } from '@/components/applications/application-format';
import { Sheet } from '@/components/customers/sheet';
import { SuccessBanner } from '@/components/onboarding/form-parts';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge, Button, Card, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createContact, deleteContact, fetchContact, fetchContacts, getErrorMessage, updateContact } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Contact, ContactDetail, ContactType } from '@/types/api';

const PAGE_SIZE = 50;
const WIDE_MIN = 560;

// Mirrors the backend's CONTACTS_DIRECTORY_ROLES / CONTACTS_DELETE_ROLES
// (middleware/auth.ts) and the dashboard's own copies. TECH_TEAM can view,
// add and edit but not delete.
const CONTACTS_DIRECTORY_ROLES = ['OWNER', 'STORE_MANAGER', 'TECH_TEAM'];
const CONTACTS_DELETE_ROLES = ['OWNER', 'STORE_MANAGER'];

const CONTACT_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'VENDOR_SERVICE_PROVIDER', label: 'Vendor / Service Provider' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'OTHER', label: 'Other' },
];
const CONTACT_TYPE_FORM_OPTIONS = CONTACT_TYPE_OPTIONS.filter((o) => o.value);

const CONTACT_TYPE_LABELS: Record<string, string> = {
  CUSTOMER: 'Customer', VENDOR_SERVICE_PROVIDER: 'Vendor / Service Provider', STAFF: 'Staff', OTHER: 'Other',
};
const CONTACT_TYPE_BADGE: Record<ContactType, 'primary' | 'blue' | 'purple' | 'muted'> = {
  CUSTOMER: 'primary', VENDOR_SERVICE_PROVIDER: 'blue', STAFF: 'purple', OTHER: 'muted',
};

function contactTypeDisplay(type: string, other?: string | null) {
  if (type === 'OTHER') return other?.trim() || 'Other';
  return CONTACT_TYPE_LABELS[type] ?? type;
}

// Cosmetic only: the phone is sent to the API exactly as the backend returned it.
function displayPhone(phone: string) {
  return phone.startsWith('+91') && phone.length === 13 ? `+91 ${phone.slice(3)}` : phone;
}

type FormState = { phone: string; contactType: string; contactTypeOther: string; name: string; reason: string };
const EMPTY_FORM: FormState = { phone: '', contactType: '', contactTypeOther: '', name: '', reason: '' };

type DetailWithEdit = ContactDetail & { lastEditedAt?: string | null; updatedAt?: string };

export default function ContactsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const canAccess = !!user && CONTACTS_DIRECTORY_ROLES.includes(user.role);
  const canDelete = !!user && CONTACTS_DELETE_ROLES.includes(user.role);

  const [width, setWidth] = useState(0);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [listError, setListError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState('');

  const [filterType, setFilterType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // 300 ms debounce, like the dashboard's useDebounce.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(t);
  }, [notice]);

  const load = useCallback(async () => {
    if (!canAccess) return;
    setListError('');
    try {
      const res = await fetchContacts({ page, limit: PAGE_SIZE, contactType: (filterType || undefined) as ContactType | undefined, q: search || undefined });
      setContacts(res.contacts ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(res.totalPages ?? 1);
    } catch {
      setContacts((c) => c ?? []);
      setListError('Failed to load contacts.');
    }
  }, [canAccess, page, filterType, search]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter / page change
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // ── Row expand / detail ───────────────────────────────────────────────────
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailWithEdit | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const toggleRow = useCallback(async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      setDetail(await fetchContact(id));
    } catch {
      setDetailError('Failed to load contact details.');
    } finally {
      setDetailLoading(false);
    }
  }, [expandedId]);

  // ── Add ───────────────────────────────────────────────────────────────────
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const submitAdd = async () => {
    setAddError('');
    if (!addForm.phone.trim()) { setAddError('Phone number is required.'); return; }
    if (!addForm.contactType) { setAddError('Contact type is required.'); return; }
    if (addForm.contactType === 'OTHER' && !addForm.contactTypeOther.trim()) { setAddError('A label is required when contact type is Other.'); return; }
    setAddSaving(true);
    try {
      await createContact({
        phone: addForm.phone.trim(),
        contactType: addForm.contactType as ContactType,
        contactTypeOther: addForm.contactType === 'OTHER' ? addForm.contactTypeOther.trim() : undefined,
        name: addForm.name.trim() || undefined,
        reason: addForm.reason.trim() || undefined,
      });
      setAddOpen(false);
      setNotice('Contact added.');
      if (page === 1) load(); else setPage(1);
    } catch (e: unknown) {
      // 409 (duplicate) and every 400 carry the backend's own message.
      setAddError(getErrorMessage(e, 'Failed to add contact.'));
    } finally {
      setAddSaving(false);
    }
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const [editTarget, setEditTarget] = useState<Contact | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const openEdit = useCallback((c: Contact) => {
    setEditTarget(c);
    setEditForm({ phone: c.phone, contactType: c.contactType, contactTypeOther: c.contactTypeOther ?? '', name: c.name ?? '', reason: c.reason ?? '' });
    setEditError('');
  }, []);

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditError('');
    if (editForm.contactType === 'OTHER' && !editForm.contactTypeOther.trim()) { setEditError('A label is required when contact type is Other.'); return; }
    setEditSaving(true);
    try {
      const updated = await updateContact(editTarget.id, {
        contactType: editForm.contactType as ContactType,
        contactTypeOther: editForm.contactType === 'OTHER' ? editForm.contactTypeOther.trim() : undefined,
        name: editForm.name.trim() || undefined,
        reason: editForm.reason.trim() || undefined,
      });
      setEditTarget(null);
      setNotice('Contact updated.');
      setContacts((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev);
      // Patch the open detail in place so the panel doesn't flash closed-then-open.
      setDetail((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
    } catch (e: unknown) {
      setEditError(getErrorMessage(e, 'Failed to update contact.'));
    } finally {
      setEditSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const submitDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    setDeleteError('');
    try {
      await deleteContact(deleteTarget.id);
      const id = deleteTarget.id;
      setDeleteTarget(null);
      setNotice('Contact deleted.');
      if (expandedId === id) setExpandedId(null);
      load();
    } catch (e: unknown) {
      setDeleteError(getErrorMessage(e, 'Failed to delete contact.'));
    } finally {
      setDeleteSaving(false);
    }
  };

  const askDelete = useCallback((c: Contact) => { setDeleteError(''); setDeleteTarget(c); }, []);

  if (!canAccess) {
    return (
      <ThemedView style={styles.center}>
        <Stack.Screen options={{ title: 'Contacts' }} />
        <ThemedText themeColor="textMuted" style={styles.body}>Access restricted.</ThemedText>
      </ThemedView>
    );
  }

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;
  const hasActiveFilter = !!filterType || !!search;

  const header = (
    <View style={styles.stack}>
      <View style={styles.titleRow}>
        <View style={styles.flex1}>
          <ThemedText style={styles.title}>Contacts</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.subtitle}>Phone directory linkable to timesheet entries</ThemedText>
        </View>
        <Button size="sm" onPress={() => { setAddForm(EMPTY_FORM); setAddError(''); setAddOpen(true); }}>+ Add Contact</Button>
      </View>

      <View style={[styles.filters, wide && styles.filtersWide]}>
        <View style={wide ? styles.flex1 : undefined}>
          <Input
            value={searchInput}
            onChangeText={(v) => { setSearchInput(v); setPage(1); }}
            placeholder="Search name or phone…"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <View style={wide ? styles.typeWide : undefined}>
          <Select options={CONTACT_TYPE_OPTIONS} value={filterType} onChange={(v) => { setFilterType(v); setPage(1); }} />
        </View>
        {hasActiveFilter ? (
          <Button variant="outline" onPress={() => { setFilterType(''); setSearchInput(''); setSearch(''); setPage(1); }}>Clear</Button>
        ) : null}
      </View>

      {notice ? <SuccessBanner message={notice} /> : null}
      {listError ? <ErrorBanner message={listError} onRetry={load} /> : null}
    </View>
  );

  const empty = contacts === null ? (
    <View style={styles.stack}>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={60} />)}</View>
  ) : listError ? null : (
    <View style={styles.empty}>
      <ThemedText style={styles.emptyTitle}>{hasActiveFilter ? 'No contacts match your search or filter.' : 'No contacts in the directory yet.'}</ThemedText>
      <ThemedText themeColor="textMuted" style={styles.small}>{hasActiveFilter ? 'Try a different name, phone, or type.' : 'Add the first one to get started.'}</ThemedText>
    </View>
  );

  const footer = totalPages > 1 ? (
    <View style={styles.pager}>
      <ThemedText themeColor="textMuted" style={[styles.small, styles.flex1]}>{`${total} contact${total === 1 ? '' : 's'} · page ${page} of ${totalPages}`}</ThemedText>
      <Button size="sm" variant="outline" disabled={page <= 1} onPress={() => setPage((p) => p - 1)}>Previous</Button>
      <Button size="sm" variant="outline" disabled={page >= totalPages} onPress={() => setPage((p) => p + 1)}>Next</Button>
    </View>
  ) : null;

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Contacts' }} />
      <FlatList
        data={contacts ?? []}
        extraData={`${expandedId}|${detail?.id}|${detailLoading}|${detailError}|${canDelete}`}
        keyExtractor={(c) => c.id}
        renderItem={({ item: c }) => {
          const expanded = expandedId === c.id;
          return (
            <Card padding="none" style={styles.card}>
              <Pressable onPress={() => toggleRow(c.id)} accessibilityRole="button" accessibilityState={{ expanded }} style={styles.cardHead}>
                <View style={styles.flex1}>
                  <ThemedText style={styles.name} numberOfLines={1}>{c.name || displayPhone(c.phone)}</ThemedText>
                  <ThemedText themeColor="textMuted" style={styles.small} numberOfLines={1}>{c.name ? displayPhone(c.phone) : ' '}</ThemedText>
                </View>
                <Badge variant={CONTACT_TYPE_BADGE[c.contactType]} size="sm">{contactTypeDisplay(c.contactType, c.contactTypeOther)}</Badge>
                <Ionicons name="chevron-down" size={16} color={theme.textMuted} style={expanded ? styles.flip : undefined} />
              </Pressable>
              {expanded ? (
                <View style={[styles.detail, { borderTopColor: theme.border }]}>
                  {detailLoading ? (
                    <ThemedText themeColor="textMuted" style={styles.small}>Loading…</ThemedText>
                  ) : detailError ? (
                    <ThemedText style={[styles.small, { color: theme.danger }]}>{detailError}</ThemedText>
                  ) : detail ? (
                    <View style={styles.stack}>
                      <View style={styles.meta}>
                        <ThemedText themeColor="textSecondary" style={styles.small}>
                          {'Added by '}<ThemedText style={styles.bold}>{detail.addedBy?.name ?? '—'}</ThemedText>{` on ${fmtDate(detail.createdAt)}`}
                        </ThemedText>
                        {detail.lastEditedBy ? (
                          <ThemedText themeColor="textSecondary" style={styles.small}>
                            {'Edited by '}<ThemedText style={styles.bold}>{detail.lastEditedBy.name}</ThemedText>{` on ${fmtDateTime(detail.lastEditedAt ?? detail.updatedAt ?? detail.createdAt)}`}
                          </ThemedText>
                        ) : null}
                      </View>
                      {detail.reason ? <ThemedText themeColor="textSecondary" style={styles.small}>{`Reason: ${detail.reason}`}</ThemedText> : null}
                      <View style={styles.actions}>
                        <Button size="sm" variant="outline" onPress={() => openEdit(c)}>Edit</Button>
                        {canDelete ? <Button size="sm" variant="outline" onPress={() => askDelete(c)}>Delete</Button> : null}
                      </View>
                      <View style={styles.links}>
                        <ThemedText style={[styles.small, styles.bold]}>Link history</ThemedText>
                        {detail.links.length === 0 ? (
                          <ThemedText themeColor="textMuted" style={styles.small}>Never linked to a timesheet entry.</ThemedText>
                        ) : detail.links.map((l) => (
                          <View key={l.id} style={[styles.link, { backgroundColor: theme.backgroundElement }]}>
                            <ThemedText themeColor="textSecondary" style={styles.small}>
                              <ThemedText style={styles.bold}>{l.employee.name}</ThemedText>{` · ${fmtDate(l.timesheetDate)}`}{l.entryTask ? ` · “${l.entryTask}”` : ''}
                            </ThemedText>
                            {l.reason ? <ThemedText themeColor="textMuted" style={styles.small}>{`Reason: ${l.reason}`}</ThemedText> : null}
                            <ThemedText themeColor="textMuted" style={styles.small}>{`Linked by ${l.linkedBy.name} on ${fmtDateTime(l.createdAt)}`}</ThemedText>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        }}
        refreshing={refreshing}
        onRefresh={onRefresh}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={[styles.content, { padding: pad, paddingBottom: insets.bottom + 32 }]}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        ItemSeparatorComponent={Separator}
      />

      <ContactSheet
        visible={addOpen}
        title="Add Contact"
        confirmLabel="Add"
        form={addForm}
        setForm={setAddForm}
        error={addError}
        saving={addSaving}
        phoneEditable
        onClose={() => setAddOpen(false)}
        onConfirm={submitAdd}
      />
      <ContactSheet
        visible={!!editTarget}
        title="Edit Contact"
        confirmLabel="Save"
        form={editForm}
        setForm={setEditForm}
        error={editError}
        saving={editSaving}
        onClose={() => setEditTarget(null)}
        onConfirm={submitEdit}
      />
      <Sheet
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        locked={deleteSaving}
        title="Delete Contact"
        footer={
          <>
            <Button style={styles.flex1} variant="outline" disabled={deleteSaving} onPress={() => setDeleteTarget(null)}>Cancel</Button>
            <Button style={styles.flex1} variant="danger" loading={deleteSaving} onPress={submitDelete}>Delete</Button>
          </>
        }>
        {deleteTarget ? (
          <View style={styles.stack}>
            <ThemedText style={styles.body}>
              {'Delete '}<ThemedText style={[styles.body, styles.bold]}>{deleteTarget.name || displayPhone(deleteTarget.phone)}</ThemedText>{' from the directory?'}
            </ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>
              This removes it from the directory and from search, but it stays visible on any past timesheet entry it was already linked to. This can&apos;t be undone from here.
            </ThemedText>
            {deleteError ? <ThemedText style={[styles.body, { color: theme.danger }]}>{deleteError}</ThemedText> : null}
          </View>
        ) : null}
      </Sheet>
    </ThemedView>
  );
}

function Separator() {
  return <View style={styles.sep} />;
}

// Add / Edit modal as a bottom sheet. Edit shows the phone disabled — it is the
// directory's de-duplication key.
function ContactSheet({ visible, title, confirmLabel, form, setForm, error, saving, phoneEditable, onClose, onConfirm }: {
  visible: boolean; title: string; confirmLabel: string; form: FormState; setForm: (f: (prev: FormState) => FormState) => void;
  error: string; saving: boolean; phoneEditable?: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const theme = useTheme();
  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      locked={saving}
      title={title}
      footer={
        <>
          <Button style={styles.flex1} variant="outline" disabled={saving} onPress={onClose}>Cancel</Button>
          <Button style={styles.flex1} loading={saving} onPress={onConfirm}>{confirmLabel}</Button>
        </>
      }>
      {phoneEditable ? (
        <Input label="Phone" required value={form.phone} onChangeText={set('phone')} hint="Enter a 10-digit Indian number." keyboardType="phone-pad" autoComplete="off" />
      ) : (
        <Input label="Phone" value={displayPhone(form.phone)} editable={false} hint="Phone can't be changed here — it's the directory's de-duplication key." />
      )}
      <Select label="Contact Type" required options={CONTACT_TYPE_FORM_OPTIONS} value={form.contactType} onChange={set('contactType')} />
      {form.contactType === 'OTHER' ? <Input label="Label" required value={form.contactTypeOther} onChangeText={set('contactTypeOther')} hint="What kind of contact is this?" /> : null}
      <Input label="Name" value={form.name} onChangeText={set('name')} autoComplete="off" />
      <Input label="Reason" value={form.reason} onChangeText={set('reason')} autoComplete="off" />
      {error ? <ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { width: '100%', maxWidth: 896, alignSelf: 'center' },
  stack: { gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 20, lineHeight: 28, fontFamily: FontWeights.bold },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  filters: { gap: 8, marginBottom: 12 },
  filtersWide: { flexDirection: 'row', alignItems: 'flex-start' },
  typeWide: { width: 224 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  bold: { fontFamily: FontWeights.semiBold },
  name: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 80 },
  emptyTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, textAlign: 'center' },
  card: { overflow: 'hidden', borderRadius: Radii.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56 },
  flip: { transform: [{ rotate: '180deg' }] },
  detail: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12, borderTopWidth: 1 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  links: { gap: 6 },
  link: { borderRadius: Radii.sm, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  sep: { height: 8 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 16 },
});
