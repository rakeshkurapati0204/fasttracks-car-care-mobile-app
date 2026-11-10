import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  mtCreateCustomer,
  mtCreateWorkDoc,
  mtCustomerJobCards,
  mtRemoveWorkDoc,
  mtSave,
  mtSearchCustomers,
  mtUpdateWorkDoc,
  type MtCustomer,
  type MtDay,
  type MtJobCardOption,
} from '@/lib/my-timesheet-api';
import { openExternalUrl } from '@/lib/open-url';
import { pickFromCamera, pickFromGallery, type PickedFile } from '@/lib/upload';
import { deleteWorkDocFile, fetchWorkDocsForTimesheet, uploadWorkDocFile } from '@/lib/api';
import type { WorkDocumentation } from '@/types/api';
import { apiErrorMessage, formatPrice, quoteLabel } from './parts';

type DocType = 'VENDOR' | 'CUSTOMER_INTERACTION';

interface DocForm { description: string; vendorName: string; contactPhone: string; quotedPrice: string; finalPrice: string }
const emptyDocForm = (): DocForm => ({ description: '', vendorName: '', contactPhone: '', quotedPrice: '', finalPrice: '' });

// Backend returns Decimal columns as strings; the shared type says number.
const str = (v: unknown): string => (v == null ? '' : String(v));

function CustomerPicker({ selected, onSelect }: { selected: MtCustomer | null; onSelect: (c: MtCustomer | null) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MtCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // 300 ms debounce, same as the dashboard.
  useEffect(() => {
    if (selected || !query.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setSearching(true);
      mtSearchCustomers(query.trim())
        .then((r) => { if (!cancelled) setResults(r); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, selected]);

  const reset = () => { setShowNewForm(false); setNewName(''); setNewPhone(''); setQuery(''); setResults([]); };

  const handleCreate = async () => {
    if (!newName.trim() || !newPhone.trim()) return;
    setCreating(true);
    setError('');
    try {
      onSelect(await mtCreateCustomer({ name: newName.trim(), phone: newPhone.trim() }));
      reset();
    } catch (err) {
      // A 409 means this phone already belongs to someone — use that existing customer.
      const e = err as { response?: { status?: number; data?: { customer?: MtCustomer } } };
      if (e?.response?.status === 409 && e.response.data?.customer) {
        onSelect(e.response.data.customer);
        reset();
      } else {
        setError(apiErrorMessage(err, 'Failed to add customer.'));
      }
    } finally { setCreating(false); }
  };

  if (selected) {
    return (
      <View style={[styles.pickedRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={[styles.flex1, styles.p]} numberOfLines={2}>
          <ThemedText style={styles.bold}>{selected.name}</ThemedText>
          <ThemedText themeColor="textMuted"> · {selected.phone}</ThemedText>
        </ThemedText>
        <Pressable onPress={() => onSelect(null)} hitSlop={8}><ThemedText themeColor="textMuted" style={styles.small}>✕ change</ThemedText></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.gap6}>
      <Input
        placeholder="Search customer by name…"
        value={query}
        onChangeText={(v) => { setQuery(v); if (!v.trim()) setResults([]); }}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {searching ? <ThemedText themeColor="textMuted" style={styles.small}>Searching…</ThemedText> : null}
      {results.length > 0 ? (
        <View style={[styles.resultBox, { borderColor: theme.border }]}>
          {results.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => { onSelect(c); setQuery(''); setResults([]); }}
              style={[styles.resultRow, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border, borderTopWidth: i === 0 ? 0 : 1 }]}>
              <ThemedText style={styles.p}>{c.name} <ThemedText themeColor="textMuted">· {c.phone}</ThemedText></ThemedText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {query.trim() && !searching && results.length === 0 && !showNewForm ? (
        <Pressable onPress={() => { setShowNewForm(true); setNewName(query.trim()); }}>
          <ThemedText style={[styles.small, styles.link, { color: theme.primary }]}>+ Add “{query.trim()}” as a new customer</ThemedText>
        </Pressable>
      ) : null}
      {showNewForm ? (
        <View style={[styles.box, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Input placeholder="Full name" value={newName} onChangeText={setNewName} />
          <Input placeholder="Phone" value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" />
          {error ? <ThemedText themeColor="danger" style={styles.small}>{error}</ThemedText> : null}
          <View style={styles.rowEnd}>
            <Button variant="ghost" size="sm" onPress={() => setShowNewForm(false)}>Cancel</Button>
            <Button size="sm" disabled={!newName.trim() || !newPhone.trim()} loading={creating} onPress={handleCreate}>{creating ? 'Adding…' : 'Add customer'}</Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function QuotesEditor({ quotes, onChange }: { quotes: string[]; onChange: (q: string[]) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.gap6}>
      <ThemedText themeColor="textMuted" style={styles.label}>Quotes given (optional)</ThemedText>
      {quotes.map((q, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.flex1}>
            <Input
              placeholder={`${quoteLabel(i, quotes.length)} (₹)`}
              value={q}
              onChangeText={(v) => onChange(quotes.map((x, idx) => (idx === i ? v : x)))}
              keyboardType="decimal-pad"
            />
          </View>
          {quotes.length > 1 ? (
            <Pressable onPress={() => onChange(quotes.filter((_, idx) => idx !== i))} hitSlop={8} style={styles.xBtn}>
              <ThemedText themeColor="textMuted">✕</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ))}
      <Pressable onPress={() => onChange([...quotes, ''])}>
        <ThemedText style={[styles.small, styles.link, { color: theme.primary }]}>+ Add another quote</ThemedText>
      </Pressable>
    </View>
  );
}

export function WorkDocSection({ date, initialTimesheetId, onTimesheetCreated }: {
  date: string;
  initialTimesheetId: string | null;
  onTimesheetCreated: (entry: MtDay) => void;
}) {
  const theme = useTheme();
  // The Tasks section above can create the timesheet mid-session (attaching a file to a task auto-saves it) — an id
  // from there wins, otherwise the one created here by the first note.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const timesheetId = initialTimesheetId ?? createdId;
  const [docs, setDocs] = useState<WorkDocumentation[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState<DocType>('VENDOR');
  const [form, setForm] = useState<DocForm>(emptyDocForm());
  const [selectedCustomer, setSelectedCustomer] = useState<MtCustomer | null>(null);
  const [jobCardOptions, setJobCardOptions] = useState<MtJobCardOption[]>([]);
  const [selectedJobCardId, setSelectedJobCardId] = useState('');
  const [quotes, setQuotes] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<DocForm>(emptyDocForm());
  const [editQuotes, setEditQuotes] = useState<string[]>(['']);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [fileMenuDocId, setFileMenuDocId] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const jobCardReq = useRef(0);

  const reload = useCallback(async () => {
    if (!timesheetId) { setDocs([]); return; }
    try { setDocs(await fetchWorkDocsForTimesheet(timesheetId)); } catch { setDocs([]); }
  }, [timesheetId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount / when the timesheet id changes
    reload();
  }, [reload]);

  // Job-card options refresh whenever the selected customer changes.
  const chooseCustomer = (c: MtCustomer | null) => {
    setSelectedCustomer(c);
    setSelectedJobCardId('');
    setJobCardOptions([]);
    if (!c) return;
    const req = ++jobCardReq.current;
    mtCustomerJobCards(c.id).then((r) => { if (req === jobCardReq.current) setJobCardOptions(r); }).catch(() => {});
  };

  const resetAddForm = () => {
    setAdding(false);
    setNewType('VENDOR');
    setForm(emptyDocForm());
    chooseCustomer(null);
    setQuotes(['']);
    setSaveError(null);
  };

  const handleCreate = async () => {
    if (!form.description.trim()) return;
    if (newType === 'CUSTOMER_INTERACTION' && !selectedCustomer) { setSaveError('Select a customer first.'); return; }
    setSaving(true);
    setSaveError(null);
    try {
      let activeId = timesheetId;
      if (!activeId) {
        const ts = await mtSave(date, []);
        activeId = ts.id;
        setCreatedId(ts.id);
        onTimesheetCreated(ts);
      }
      if (newType === 'VENDOR') {
        await mtCreateWorkDoc(activeId, {
          type: 'VENDOR',
          description: form.description.trim(),
          vendorName: form.vendorName.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
          quotedPrice: form.quotedPrice ? parseFloat(form.quotedPrice) : undefined,
          finalPrice: form.finalPrice ? parseFloat(form.finalPrice) : undefined,
        });
      } else {
        const quoteAmounts = quotes.map((q) => parseFloat(q)).filter((n) => !isNaN(n) && n >= 0);
        await mtCreateWorkDoc(activeId, {
          type: 'CUSTOMER_INTERACTION',
          description: form.description.trim(),
          customerId: selectedCustomer!.id,
          jobCardId: selectedJobCardId || undefined,
          quotes: quoteAmounts,
        });
      }
      resetAddForm();
      reload();
    } catch (err) {
      setSaveError(apiErrorMessage(err, (err as Error)?.message || 'Failed to save. Please try again.'));
    } finally { setSaving(false); }
  };

  const handleUpdate = async (doc: WorkDocumentation) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (doc.type === 'CUSTOMER_INTERACTION') {
        const quoteAmounts = editQuotes.map((q) => parseFloat(q)).filter((n) => !isNaN(n) && n >= 0);
        await mtUpdateWorkDoc(doc.id, { description: editForm.description.trim() || undefined, quotes: quoteAmounts });
      } else {
        await mtUpdateWorkDoc(doc.id, {
          description: editForm.description.trim() || undefined,
          vendorName: editForm.vendorName.trim() || null,
          contactPhone: editForm.contactPhone.trim() || null,
          quotedPrice: editForm.quotedPrice ? parseFloat(editForm.quotedPrice) : null,
          finalPrice: editForm.finalPrice ? parseFloat(editForm.finalPrice) : null,
        });
      }
      setEditingId(null);
      reload();
    } catch (err) {
      setSaveError(apiErrorMessage(err, (err as Error)?.message || 'Failed to update. Please try again.'));
    } finally { setSaving(false); }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete this documentation entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try { await mtRemoveWorkDoc(id); } catch (err) { setSaveError(apiErrorMessage(err, 'Failed to delete.')); }
          reload();
        },
      },
    ]);
  };

  const handleDeleteFile = (docId: string, fileId: string, filename: string) => {
    Alert.alert('Remove this file?', `"${filename}" will be removed from this entry.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { try { await deleteWorkDocFile(docId, fileId); } catch { /* reload shows the truth */ } reload(); } },
    ]);
  };

  const uploadFor = async (docId: string, file: PickedFile | null) => {
    setFileMenuDocId(null);
    if (!file) return;
    setUploadingDocId(docId);
    setFileError('');
    try {
      await uploadWorkDocFile(docId, file, { onProgress: () => {}, signal: new AbortController().signal });
      await reload();
    } catch (err) {
      setFileError(apiErrorMessage(err, 'Upload failed.'));
    } finally { setUploadingDocId(null); }
  };
  const pickDocument = async (docId: string) => {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      copyToCacheDirectory: true,
    });
    if (r.canceled || !r.assets?.[0]) { setFileMenuDocId(null); return; }
    const a = r.assets[0];
    await uploadFor(docId, { uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size });
  };

  const startEdit = (doc: WorkDocumentation) => {
    setEditingId(doc.id);
    setEditForm({ description: doc.description, vendorName: doc.vendorName ?? '', contactPhone: doc.contactPhone ?? '', quotedPrice: str(doc.quotedPrice), finalPrice: str(doc.finalPrice) });
    setEditQuotes(doc.quotes.length > 0 ? doc.quotes.map((q) => str(q.amount)) : ['']);
  };

  const setF = (k: keyof DocForm) => (v: string) => setForm((p) => ({ ...p, [k]: v }));
  const setE = (k: keyof DocForm) => (v: string) => setEditForm((p) => ({ ...p, [k]: v }));

  if (docs === null) return <View style={styles.topGap}><Skeleton height={24} /></View>;

  const textLinkBtn = (label: string, onPress: () => void, color?: string, disabled?: boolean) => (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={styles.linkBtn}>
      <ThemedText style={[styles.small, { color: color ?? theme.textMuted }]}>{label}</ThemedText>
    </Pressable>
  );

  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      <View style={styles.between}>
        <ThemedText themeColor="textMuted" style={styles.caption}>WORK DOCUMENTATION</ThemedText>
        {!adding ? (
          <Pressable onPress={() => setAdding(true)} style={[styles.addNote, { backgroundColor: withAlpha(theme.primary, 0.1) }]} accessibilityRole="button">
            <ThemedText style={[styles.small, styles.semi, { color: theme.primary }]}>+ Add Note</ThemedText>
          </Pressable>
        ) : null}
      </View>

      {fileError ? <ThemedText themeColor="danger" style={styles.small}>{fileError}</ThemedText> : null}

      {adding ? (
        <View style={[styles.box, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={[styles.toggle, { backgroundColor: theme.backgroundElement }]}>
            {(['VENDOR', 'CUSTOMER_INTERACTION'] as const).map((t) => (
              <Pressable key={t} onPress={() => setNewType(t)} style={[styles.toggleBtn, t === newType && { backgroundColor: theme.primary }]}>
                <ThemedText style={[styles.small, styles.semi, { color: t === newType ? '#ffffff' : theme.textMuted }]}>{t === 'VENDOR' ? 'Vendor work' : 'Customer interaction'}</ThemedText>
              </Pressable>
            ))}
          </View>
          <Input
            placeholder={newType === 'VENDOR' ? 'Description (required)…' : 'Notes on the conversation (required)…'}
            value={form.description}
            onChangeText={setF('description')}
            multiline
            numberOfLines={2}
          />
          {newType === 'VENDOR' ? (
            <View style={styles.gap8}>
              <Input placeholder="Vendor / Contact" value={form.vendorName} onChangeText={setF('vendorName')} />
              <Input placeholder="Phone" value={form.contactPhone} onChangeText={setF('contactPhone')} keyboardType="phone-pad" />
              <Input placeholder="Quoted (₹)" value={form.quotedPrice} onChangeText={setF('quotedPrice')} keyboardType="decimal-pad" />
              <Input placeholder="Final (₹)" value={form.finalPrice} onChangeText={setF('finalPrice')} keyboardType="decimal-pad" />
            </View>
          ) : (
            <View style={styles.gap8}>
              <CustomerPicker selected={selectedCustomer} onSelect={chooseCustomer} />
              {selectedCustomer ? (
                <Select
                  value={selectedJobCardId}
                  onChange={setSelectedJobCardId}
                  options={[{ value: '', label: 'No specific job card' }, ...jobCardOptions.map((jc) => ({ value: jc.id, label: `#${jc.jobNumber} — ${jc.vehicleNumber} — ${jc.reasonForVisit}` }))]}
                />
              ) : null}
              <QuotesEditor quotes={quotes} onChange={setQuotes} />
            </View>
          )}
          {saveError ? <ThemedText themeColor="danger" style={styles.small}>{saveError}</ThemedText> : null}
          <View style={styles.rowEnd}>
            <Button variant="ghost" size="sm" onPress={resetAddForm}>Cancel</Button>
            <Button size="sm" disabled={!form.description.trim() || (newType === 'CUSTOMER_INTERACTION' && !selectedCustomer)} loading={saving} onPress={handleCreate}>{saving ? 'Saving…' : 'Save'}</Button>
          </View>
        </View>
      ) : null}

      {docs.length === 0 && !adding ? (
        <ThemedText themeColor="textMuted" style={styles.small}>No documentation entries yet.</ThemedText>
      ) : (
        <View style={styles.gap8}>
          {docs.map((doc) => (
            <View key={doc.id} style={[styles.box, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {editingId === doc.id ? (
                <View style={styles.gap8}>
                  <Input value={editForm.description} onChangeText={setE('description')} multiline numberOfLines={2} />
                  {doc.type === 'CUSTOMER_INTERACTION' ? (
                    <>
                      <ThemedText themeColor="textMuted" style={styles.small}>
                        Customer: <ThemedText style={styles.bold}>{doc.customer?.name}</ThemedText>{doc.jobCard ? ` · Job #${doc.jobCard.jobNumber}` : ''} (not editable here — delete and re-add to change)
                      </ThemedText>
                      <QuotesEditor quotes={editQuotes} onChange={setEditQuotes} />
                    </>
                  ) : (
                    <>
                      <Input placeholder="Vendor" value={editForm.vendorName} onChangeText={setE('vendorName')} />
                      <Input placeholder="Phone" value={editForm.contactPhone} onChangeText={setE('contactPhone')} keyboardType="phone-pad" />
                      <Input placeholder="Quoted" value={editForm.quotedPrice} onChangeText={setE('quotedPrice')} keyboardType="decimal-pad" />
                      <Input placeholder="Final" value={editForm.finalPrice} onChangeText={setE('finalPrice')} keyboardType="decimal-pad" />
                    </>
                  )}
                  {saveError ? <ThemedText themeColor="danger" style={styles.small}>{saveError}</ThemedText> : null}
                  <View style={styles.rowEnd}>
                    <Button variant="ghost" size="sm" onPress={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" loading={saving} onPress={() => handleUpdate(doc)}>{saving ? 'Saving…' : 'Save'}</Button>
                  </View>
                </View>
              ) : (
                <View style={styles.gap4}>
                  {doc.type === 'CUSTOMER_INTERACTION' ? (
                    <>
                      <View style={styles.wrapRow}>
                        <View style={[styles.tag, { backgroundColor: 'rgba(59,130,246,0.12)' }]}><ThemedText style={[styles.tagText, { color: '#1d4ed8' }]}>Customer</ThemedText></View>
                        {doc.customer ? <ThemedText style={[styles.p, styles.semi]}>{doc.customer.name}</ThemedText> : null}
                        {doc.customer?.phone ? <ThemedText themeColor="textMuted" style={styles.small}>· {doc.customer.phone}</ThemedText> : null}
                      </View>
                      {doc.jobCard ? <ThemedText themeColor="textMuted" style={styles.small}>Job #{doc.jobCard.jobNumber} — {doc.jobCard.vehicleNumber} — {doc.jobCard.reasonForVisit}</ThemedText> : null}
                      <ThemedText style={styles.p}>{doc.description}</ThemedText>
                      {doc.quotes.length > 0 ? (
                        <View style={styles.wrapRow}>
                          {doc.quotes.map((q, i) => (
                            <View key={q.id} style={[styles.pill, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                              <ThemedText style={styles.small}>{quoteLabel(i, doc.quotes.length)}: <ThemedText style={[styles.small, styles.bold]}>{formatPrice(q.amount)}</ThemedText></ThemedText>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <ThemedText style={styles.p}>{doc.description}</ThemedText>
                      {doc.vendorName || doc.contactPhone ? (
                        <ThemedText themeColor="textMuted" style={styles.small}>{doc.vendorName}{doc.vendorName && doc.contactPhone ? ' · ' : ''}{doc.contactPhone}</ThemedText>
                      ) : null}
                      {doc.quotedPrice || doc.finalPrice ? (
                        <ThemedText themeColor="textMuted" style={styles.small}>
                          {doc.quotedPrice ? <>Quoted: <ThemedText style={[styles.small, styles.bold]}>{formatPrice(doc.quotedPrice)}</ThemedText></> : null}
                          {doc.quotedPrice && doc.finalPrice ? '  →  ' : ''}
                          {doc.finalPrice ? <>Final: <ThemedText style={[styles.small, styles.bold]}>{formatPrice(doc.finalPrice)}</ThemedText></> : null}
                        </ThemedText>
                      ) : null}
                    </>
                  )}
                  {doc.files.length > 0 ? (
                    <View style={styles.wrapRow}>
                      {doc.files.map((f) => (
                        <View key={f.id} style={[styles.pill, styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                          <Pressable onPress={() => openExternalUrl(f.url)}><ThemedText themeColor="textSecondary" numberOfLines={1} style={[styles.small, styles.fileName]}>{f.filename}</ThemedText></Pressable>
                          <Pressable onPress={() => handleDeleteFile(doc.id, f.id, f.filename)} hitSlop={8}><ThemedText themeColor="textMuted" style={styles.small}>✕</ThemedText></Pressable>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {fileMenuDocId === doc.id ? (
                    <View style={styles.wrapRow}>
                      <Button variant="outline" size="sm" onPress={async () => uploadFor(doc.id, await pickFromCamera())}>Camera</Button>
                      <Button variant="outline" size="sm" onPress={async () => uploadFor(doc.id, await pickFromGallery())}>Photos</Button>
                      <Button variant="outline" size="sm" onPress={() => pickDocument(doc.id)}>Document</Button>
                      <Button variant="ghost" size="sm" onPress={() => setFileMenuDocId(null)}>Cancel</Button>
                    </View>
                  ) : null}
                  <View style={styles.between}>
                    <ThemedText themeColor="textMuted" style={styles.small}>{new Date(doc.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</ThemedText>
                    <View style={styles.row}>
                      {textLinkBtn(uploadingDocId === doc.id ? 'Uploading…' : '⊕ File', () => setFileMenuDocId(doc.id), undefined, uploadingDocId === doc.id)}
                      {textLinkBtn('Edit', () => startEdit(doc))}
                      {textLinkBtn('Delete', () => handleDelete(doc.id), theme.danger)}
                    </View>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  topGap: { marginTop: 12 },
  section: { marginTop: 8, paddingTop: 16, borderTopWidth: 1, gap: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowEnd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  gap4: { gap: 4 },
  gap6: { gap: 6 },
  gap8: { gap: 8 },
  caption: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.semiBold, letterSpacing: 0.6 },
  addNote: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.sm },
  box: { borderWidth: 1, borderRadius: Radii.md, padding: 12, gap: 10 },
  toggle: { flexDirection: 'row', padding: 2, borderRadius: Radii.sm, alignSelf: 'flex-start' },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: Radii.sm - 2 },
  p: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 12, lineHeight: 17, fontFamily: FontWeights.medium },
  semi: { fontFamily: FontWeights.semiBold },
  bold: { fontFamily: FontWeights.bold },
  link: { fontFamily: FontWeights.medium },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagText: { fontSize: 10, lineHeight: 14, fontFamily: FontWeights.semiBold },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  fileName: { maxWidth: 140 },
  linkBtn: { minHeight: 32, justifyContent: 'center' },
  xBtn: { minWidth: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pickedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 10 },
  resultBox: { borderWidth: 1, borderRadius: Radii.sm, overflow: 'hidden' },
  resultRow: { paddingHorizontal: 12, paddingVertical: 12 },
});
