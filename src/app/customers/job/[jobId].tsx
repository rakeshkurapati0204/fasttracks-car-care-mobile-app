import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { openExternalUrl } from '@/lib/open-url';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/home/glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createInvoice,
  createJobCardListItem,
  createJobCardRemark,
  deleteInspectionMedia,
  deleteJobCardListItem,
  fetchInspectionMedia,
  fetchJobCard,
  fetchJobCardEdits,
  fetchJobCardListItems,
  fetchJobCardRemarks,
  getErrorMessage,
  printJobCardList,
  updateJobCard,
  updateJobCardListItem,
  uploadInspectionMedia,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { pickFromCamera, pickFromGallery, useFileUpload } from '@/lib/upload';
import { usePermissions } from '@/lib/permissions-context';
import type {
  CustomerRemark, JobCardDetail, JobCardEdit, JobCardInspectionMedia, JobCardListItem,
} from '@/types/api';

// Job-card detail screen — added 2026-09-24 (full-parity pass), closing the
// gap explicitly flagged in the earlier Customers & Jobs commit: edit
// fields, list-items CRUD, create-invoice-from-job, edit history,
// inspection photo upload, verification remarks. Same getCJMode gate
// (view_only/sales_mode/full_access) as job-card status actions on the
// customer page this is reached from. Verification remarks are a
// separate, more restricted feature (requireCustomerRemarksAccess) —
// gated OWNER/STORE_MANAGER here since mobile's permission system has no
// per-employee 'customer_remarks' override key to check; a granted
// override would still work server-side and just isn't offered a UI
// entry point in that edge case.
const REMARKS_ROLES = ['OWNER', 'STORE_MANAGER'];
const DELETE_MEDIA_ROLES = ['OWNER', 'STORE_MANAGER'];

const UPLOAD_RULES = {
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif'],
  maxSizeBytes: 100 * 1024 * 1024,
};

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function formatCurrency(n: number | null) {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function JobCardDetailScreen() {
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const { tabMode } = usePermissions();
  const cjMode = tabMode('customers_jobs');
  const canWrite = cjMode !== null && cjMode !== 'view_only';
  const canManageRemarks = REMARKS_ROLES.includes(user?.role ?? '');
  const canDeleteMedia = DELETE_MEDIA_ROLES.includes(user?.role ?? '');

  const [job, setJob] = useState<JobCardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Edit form
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    customerName: '', customerPhone: '', customerEmail: '',
    vehicleNumber: '', vehicleMake: '', vehicleModel: '', vehicleYear: '', vehicleFuel: '', vehicleColour: '',
    reasonForVisit: '', estimatedTotal: '', ownerName: '', ownerPhone: '',
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // List items
  const [items, setItems] = useState<JobCardListItem[] | null>(null);
  const [newItemText, setNewItemText] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemText, setEditItemText] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Invoice
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);

  // Edit history
  const [showHistory, setShowHistory] = useState(false);
  const [edits, setEdits] = useState<JobCardEdit[] | null>(null);

  // Inspection media
  const [media, setMedia] = useState<JobCardInspectionMedia[] | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const upload = useFileUpload<{ uploaded: JobCardInspectionMedia[]; count: number }>(UPLOAD_RULES);

  // Verification remarks
  const [remarks, setRemarks] = useState<CustomerRemark[] | null>(null);
  const [remarkNote, setRemarkNote] = useState('');
  const [isSavingRemark, setIsSavingRemark] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [j, itemList, mediaList] = await Promise.all([
        fetchJobCard(jobId),
        fetchJobCardListItems(jobId),
        fetchInspectionMedia(jobId),
      ]);
      setJob(j);
      setItems(itemList);
      setMedia(mediaList);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load this job card.'));
    }
    if (canManageRemarks) {
      fetchJobCardRemarks(jobId).then(setRemarks).catch(() => setRemarks([]));
    }
  }, [jobId, canManageRemarks]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  const openEdit = () => {
    if (!job) return;
    setEditForm({
      reasonForVisit: job.reasonForVisit,
      ownerName: job.ownerName ?? '',
      ownerPhone: job.ownerPhone ?? '',
      estimatedTotal: job.estimatedTotal != null ? String(job.estimatedTotal) : '',
      customerName: job.customer.name,
      customerPhone: job.customer.phone,
      customerEmail: job.customer.email ?? '',
      vehicleNumber: job.vehicle?.vehicleNumber ?? '',
      vehicleMake: job.vehicle?.make ?? '',
      vehicleModel: job.vehicle?.model ?? '',
      vehicleYear: job.vehicle?.year ?? '',
      vehicleFuel: job.vehicle?.fuel ?? '',
      vehicleColour: job.vehicle?.colour ?? '',
    });
    setShowEdit(true);
  };

  const onSaveEdit = async () => {
    setIsSavingEdit(true);
    setError(null);
    setNotice(null);
    try {
      await updateJobCard(jobId, {
        reasonForVisit: editForm.reasonForVisit.trim(),
        ownerName: editForm.ownerName.trim() || undefined,
        ownerPhone: editForm.ownerPhone.trim() || undefined,
        estimatedTotal: editForm.estimatedTotal.trim() ? Number(editForm.estimatedTotal) : null,
        customerName: editForm.customerName.trim(),
        customerPhone: editForm.customerPhone.trim() || undefined,
        customerEmail: editForm.customerEmail.trim() || undefined,
        vehicleNumber: editForm.vehicleNumber.trim() || undefined,
        vehicleMake: editForm.vehicleMake.trim() || undefined,
        vehicleModel: editForm.vehicleModel.trim() || undefined,
        vehicleYear: editForm.vehicleYear.trim() || undefined,
        vehicleFuel: editForm.vehicleFuel.trim() || undefined,
        vehicleColour: editForm.vehicleColour.trim() || undefined,
      });
      setNotice('Job card updated.');
      setShowEdit(false);
      await load();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not update this job card.'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const onAddItem = async () => {
    if (!newItemText.trim()) return;
    setIsAddingItem(true);
    setError(null);
    try {
      await createJobCardListItem(jobId, { text: newItemText.trim(), price: newItemPrice.trim() ? Number(newItemPrice) : null });
      setNewItemText('');
      setNewItemPrice('');
      setItems(await fetchJobCardListItems(jobId));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not add this item.'));
    } finally {
      setIsAddingItem(false);
    }
  };

  const startEditItem = (item: JobCardListItem) => {
    setEditingItemId(item.id);
    setEditItemText(item.text);
    setEditItemPrice(item.price != null ? String(item.price) : '');
  };

  const onSaveItem = async (item: JobCardListItem) => {
    setIsSavingItem(true);
    setError(null);
    try {
      await updateJobCardListItem(jobId, item.id, {
        text: editItemText.trim() !== item.text ? editItemText.trim() : undefined,
        price: editItemPrice.trim() ? Number(editItemPrice) : null,
      });
      setEditingItemId(null);
      setItems(await fetchJobCardListItems(jobId));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not update this item.'));
    } finally {
      setIsSavingItem(false);
    }
  };

  const onDeleteItem = (item: JobCardListItem) => {
    Alert.alert('Delete this line?', item.text, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setError(null);
          try {
            await deleteJobCardListItem(jobId, item.id);
            setItems(await fetchJobCardListItems(jobId));
          } catch (err: any) {
            setError(getErrorMessage(err, 'Could not delete this item.'));
          }
        },
      },
    ]);
  };

  const onPrintList = async () => {
    setIsPrinting(true);
    setError(null);
    try {
      await printJobCardList(jobId);
      setNotice('List printed — original lines are now locked.');
      await load();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not print this list.'));
    } finally {
      setIsPrinting(false);
    }
  };

  const onCreateInvoice = () => {
    if (!job) return;
    Alert.alert('Create invoice', `Create a full invoice from this job's ${items?.length ?? 0} list item(s)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create', onPress: async () => {
          setIsCreatingInvoice(true);
          setError(null);
          try {
            await createInvoice({
              customerName: job.customer.name,
              customerPhone: job.customer.phone,
              customerEmail: job.customer.email ?? undefined,
              vehicleNumber: job.vehicle?.vehicleNumber ?? undefined,
              vehicleBrand: job.vehicle?.make ?? undefined,
              vehicleModel: job.vehicle?.model ?? undefined,
              lineItems: (items ?? []).filter((i) => i.price != null).map((i) => ({ description: i.text, quantity: 1, unitPrice: i.price! })),
              jobId,
              type: 'FULL',
            });
            setNotice('Invoice created from this job card.');
            await load();
          } catch (err: any) {
            setError(getErrorMessage(err, 'Could not create an invoice from this job.'));
          } finally {
            setIsCreatingInvoice(false);
          }
        },
      },
    ]);
  };

  const onToggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && !edits) {
      try { setEdits(await fetchJobCardEdits(jobId)); } catch (err: any) { setError(getErrorMessage(err, 'Could not load edit history.')); }
    }
  };

  const onPickCamera = async () => {
    const file = await pickFromCamera();
    if (file) upload.pick(file);
  };
  const onPickGallery = async () => {
    const file = await pickFromGallery();
    if (file) upload.pick(file);
  };
  const doUploadMedia = () => {
    return upload.upload((file, ctrl) => uploadInspectionMedia(jobId, file, ctrl)).then((result) => {
      if (result) {
        upload.reset();
        fetchInspectionMedia(jobId).then(setMedia);
      }
    });
  };

  const onDeleteMedia = (m: JobCardInspectionMedia) => {
    Alert.alert('Delete this photo?', m.filename, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeletingMediaId(m.id);
          setError(null);
          try {
            await deleteInspectionMedia(jobId, m.id);
            setMedia(await fetchInspectionMedia(jobId));
          } catch (err: any) {
            setError(getErrorMessage(err, 'Could not delete this photo.'));
          } finally {
            setDeletingMediaId(null);
          }
        },
      },
    ]);
  };

  const onAddRemark = async () => {
    if (!remarkNote.trim()) return;
    setIsSavingRemark(true);
    setError(null);
    try {
      const remark = await createJobCardRemark(jobId, remarkNote.trim());
      setRemarkNote('');
      setRemarks((prev) => (prev ? [remark, ...prev] : [remark]));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not add this remark.'));
    } finally {
      setIsSavingRemark(false);
    }
  };

  if (!job) {
    return (
      <ThemedView style={styles.center}>
        {error ? <ThemedText>{error}</ThemedText> : <ActivityIndicator />}
      </ThemedView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: job.jobNumber }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}>
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}

        {showEdit ? (
          <GlassCard style={styles.card}>
            <ThemedText type="smallBold">Edit Job Card</ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Customer</ThemedText>
            {([
              ['customerName', 'Name'], ['customerPhone', 'Phone'], ['customerEmail', 'Email'],
            ] as [keyof typeof editForm, string][]).map(([key, label]) => (
              <View key={key}>
                <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
                <TextInput
                  value={editForm[key]}
                  onChangeText={(v) => setEditForm((p) => ({ ...p, [key]: v }))}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType={key.includes('Phone') ? 'phone-pad' : 'default'}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                />
              </View>
            ))}

            {job.vehicle && (
              <>
                <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Vehicle</ThemedText>
                {([
                  ['vehicleNumber', 'Number'], ['vehicleMake', 'Make'], ['vehicleModel', 'Model'],
                  ['vehicleYear', 'Year'], ['vehicleFuel', 'Fuel'], ['vehicleColour', 'Colour'],
                ] as [keyof typeof editForm, string][]).map(([key, label]) => (
                  <View key={key}>
                    <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
                    <TextInput
                      value={editForm[key]}
                      onChangeText={(v) => setEditForm((p) => ({ ...p, [key]: v }))}
                      placeholderTextColor={theme.textSecondary}
                      style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                    />
                  </View>
                ))}
              </>
            )}

            <ThemedText type="small" themeColor="textSecondary" style={styles.fieldLabel}>Job Details</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Reason for Visit</ThemedText>
            <TextInput
              value={editForm.reasonForVisit}
              onChangeText={(v) => setEditForm((p) => ({ ...p, reasonForVisit: v }))}
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, styles.noteInput, { color: theme.text, backgroundColor: theme.background }]}
            />
            <ThemedText type="small" themeColor="textSecondary">Estimated Total (₹)</ThemedText>
            <TextInput
              value={editForm.estimatedTotal}
              onChangeText={(v) => setEditForm((p) => ({ ...p, estimatedTotal: v }))}
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
            />
            {job.customerRole === 'DRIVER' && (
              <>
                <ThemedText type="small" themeColor="textSecondary">Owner Name</ThemedText>
                <TextInput
                  value={editForm.ownerName}
                  onChangeText={(v) => setEditForm((p) => ({ ...p, ownerName: v }))}
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                />
                <ThemedText type="small" themeColor="textSecondary">Owner Phone</ThemedText>
                <TextInput
                  value={editForm.ownerPhone}
                  onChangeText={(v) => setEditForm((p) => ({ ...p, ownerPhone: v }))}
                  placeholderTextColor={theme.textSecondary}
                  keyboardType="phone-pad"
                  style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                />
              </>
            )}

            <View style={styles.actionsRow}>
              <Pressable onPress={() => setShowEdit(false)}><ThemedText type="small" themeColor="textSecondary">Cancel</ThemedText></Pressable>
              <Pressable onPress={onSaveEdit} disabled={isSavingEdit} style={styles.button}>
                {isSavingEdit ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Save Changes</ThemedText>}
              </Pressable>
            </View>
          </GlassCard>
        ) : (
          <>
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.rowBetween}>
                <ThemedText type="smallBold">Customer</ThemedText>
                {canWrite && <Pressable onPress={openEdit}><ThemedText type="link">Edit</ThemedText></Pressable>}
              </View>
              {job.customerRole === 'DRIVER' && <ThemedText type="small" themeColor="textSecondary">🚗 Driver / Rep</ThemedText>}
              <View style={styles.rowBetween}>
                <ThemedText type="small" themeColor="textSecondary">{job.customerRole === 'DRIVER' ? 'Driver' : 'Name'}</ThemedText>
                <ThemedText type="small">{job.customer.name}</ThemedText>
              </View>
              <View style={styles.rowBetween}>
                <ThemedText type="small" themeColor="textSecondary">Phone</ThemedText>
                <ThemedText type="small">{job.customer.phone}</ThemedText>
              </View>
              {job.customerRole === 'DRIVER' && job.ownerName && (
                <View style={styles.rowBetween}>
                  <ThemedText type="small" themeColor="textSecondary">Owner</ThemedText>
                  <ThemedText type="small">{job.ownerName}</ThemedText>
                </View>
              )}
              {job.customerRole === 'DRIVER' && job.ownerPhone && (
                <View style={styles.rowBetween}>
                  <ThemedText type="small" themeColor="textSecondary">Owner Ph.</ThemedText>
                  <ThemedText type="small">{job.ownerPhone}</ThemedText>
                </View>
              )}
              {job.customer.email && (
                <View style={styles.rowBetween}>
                  <ThemedText type="small" themeColor="textSecondary">Email</ThemedText>
                  <ThemedText type="small">{job.customer.email}</ThemedText>
                </View>
              )}
            </ThemedView>

            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Vehicle</ThemedText>
              {job.vehicle ? (
                <>
                  {job.vehicle.vehicleNumber && <View style={styles.rowBetween}><ThemedText type="small" themeColor="textSecondary">Number</ThemedText><ThemedText type="small">{job.vehicle.vehicleNumber}</ThemedText></View>}
                  {job.vehicle.make && <View style={styles.rowBetween}><ThemedText type="small" themeColor="textSecondary">Make</ThemedText><ThemedText type="small">{job.vehicle.make}</ThemedText></View>}
                  {job.vehicle.model && <View style={styles.rowBetween}><ThemedText type="small" themeColor="textSecondary">Model</ThemedText><ThemedText type="small">{job.vehicle.model}</ThemedText></View>}
                  {job.vehicle.year && <View style={styles.rowBetween}><ThemedText type="small" themeColor="textSecondary">Year</ThemedText><ThemedText type="small">{job.vehicle.year}</ThemedText></View>}
                  {job.vehicle.fuel && <View style={styles.rowBetween}><ThemedText type="small" themeColor="textSecondary">Fuel</ThemedText><ThemedText type="small">{job.vehicle.fuel}</ThemedText></View>}
                  {job.vehicle.colour && <View style={styles.rowBetween}><ThemedText type="small" themeColor="textSecondary">Colour</ThemedText><ThemedText type="small">{job.vehicle.colour}</ThemedText></View>}
                </>
              ) : (
                <ThemedText type="small" themeColor="textSecondary" style={styles.italic}>Walk-in / No Vehicle</ThemedText>
              )}
            </ThemedView>

            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">Reason for Visit</ThemedText>
              <ThemedText type="small">{job.reasonForVisit}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Estimated total {formatCurrency(job.estimatedTotal)} · {formatDate(job.createdAt)}</ThemedText>
            </ThemedView>
          </>
        )}

        <View style={styles.section}>
          <ThemedText type="smallBold">Invoice</ThemedText>
          {job.invoice ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small">{job.invoice.invoiceNumber}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatCurrency(job.invoice.paidAmount)} paid of {formatCurrency(job.invoice.grandTotal)} · {formatCurrency(job.invoice.balanceDue)} due
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {job.invoice.status === 'PAID' ? 'PAID ✓' : job.invoice.status === 'DRAFT' ? 'DRAFT' : 'UNPAID'}
              </ThemedText>
            </ThemedView>
          ) : (items?.length ?? 0) === 0 ? (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="small" themeColor="textSecondary">Invoice Not Created</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Add at least one line to the Job Card List before creating an invoice.</ThemedText>
            </ThemedView>
          ) : canWrite && (
            <Pressable onPress={onCreateInvoice} disabled={isCreatingInvoice} style={styles.button}>
              {isCreatingInvoice ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Create Invoice →</ThemedText>}
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <ThemedText type="smallBold">Job Card List</ThemedText>
            {canWrite && items && items.length > 0 && (
              <Pressable onPress={onPrintList} disabled={isPrinting}>
                {isPrinting ? <ActivityIndicator size="small" /> : <ThemedText type="link">{job.listPrintCount > 0 ? 'Reprint →' : 'Print →'}</ThemedText>}
              </Pressable>
            )}
          </View>
          {job.listPrintCount > 0 && (
            <ThemedText type="small" themeColor="textSecondary">Printed {job.listPrintCount}× · last {formatDateTime(job.listLastPrintedAt!)}</ThemedText>
          )}
          {items === null ? (
            <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText>
          ) : items.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">No lines yet.</ThemedText>
          ) : (
            items.map((item) => (
              <ThemedView key={item.id} type="backgroundElement" style={styles.row}>
                {editingItemId === item.id ? (
                  <>
                    <TextInput value={editItemText} onChangeText={setEditItemText} placeholder="Add a line, e.g. Full body wash + wax" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.background }]} />
                    <TextInput value={editItemPrice} onChangeText={setEditItemPrice} placeholder="Price" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" style={[styles.input, { color: theme.text, backgroundColor: theme.background }]} />
                    <View style={styles.actionsRow}>
                      <Pressable onPress={() => onSaveItem(item)} disabled={isSavingItem}><ThemedText type="link">Save</ThemedText></Pressable>
                      <Pressable onPress={() => setEditingItemId(null)}><ThemedText type="small" themeColor="textSecondary">Cancel</ThemedText></Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.rowBetween}>
                      <ThemedText style={styles.flex1}>{item.text}{!item.isOriginal ? '  ·  Added later' : ''}</ThemedText>
                      <ThemedText type="smallBold">{formatCurrency(item.price)}</ThemedText>
                    </View>
                    {canWrite && (
                      <View style={styles.actionsRow}>
                        <Pressable onPress={() => startEditItem(item)}><ThemedText type="small" themeColor="textSecondary">Edit</ThemedText></Pressable>
                        <Pressable onPress={() => onDeleteItem(item)}><ThemedText type="small" style={styles.error}>✕</ThemedText></Pressable>
                      </View>
                    )}
                  </>
                )}
              </ThemedView>
            ))
          )}
          {canWrite && (
            <View style={styles.row}>
              <TextInput value={newItemText} onChangeText={setNewItemText} placeholder="Add a line, e.g. Full body wash + wax" placeholderTextColor={theme.textSecondary} style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
              <TextInput value={newItemPrice} onChangeText={setNewItemPrice} placeholder="Price" placeholderTextColor={theme.textSecondary} keyboardType="decimal-pad" style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]} />
              <Pressable onPress={onAddItem} disabled={isAddingItem || !newItemText.trim()} style={styles.button}>
                {isAddingItem ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Add</ThemedText>}
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <ThemedText type="smallBold">Edit History</ThemedText>
            <Pressable onPress={onToggleHistory}><ThemedText type="link">{showHistory ? 'Hide' : 'Show'}</ThemedText></Pressable>
          </View>
          {showHistory && (
            edits === null ? <ActivityIndicator /> : edits.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">No edits recorded.</ThemedText>
            ) : (
              edits.map((e) => (
                <View key={e.id} style={styles.historyRow}>
                  <ThemedText type="small">{e.editedBy.name} changed {e.fieldName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {e.oldValue ?? 'empty'} → {e.newValue ?? 'cleared'} · {formatDateTime(e.editedAt)}
                  </ThemedText>
                </View>
              ))
            )
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold">Inspection Photos{media ? ` (${media.length})` : ''}</ThemedText>
          {media === null ? (
            <ActivityIndicator />
          ) : media.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.italic}>No inspection photos uploaded yet.</ThemedText>
          ) : (
            <View style={styles.mediaGrid}>
              {media.map((m) => (
                <View key={m.id} style={styles.mediaItem}>
                  <Pressable onPress={() => openExternalUrl(m.url)}>
                    {m.type === 'image' ? <Image source={{ uri: m.url }} style={styles.mediaThumb} /> : <View style={[styles.mediaThumb, styles.mediaPlaceholder]}><ThemedText type="small">Video</ThemedText></View>}
                  </Pressable>
                  {canDeleteMedia && (
                    <Pressable onPress={() => onDeleteMedia(m)} disabled={deletingMediaId === m.id} style={styles.mediaDelete}>
                      {deletingMediaId === m.id ? <ActivityIndicator size="small" /> : <ThemedText style={{ color: '#ffffff' }}>✕</ThemedText>}
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
          {canWrite && (
            upload.file ? (
              <View style={styles.actionsRow}>
                <ThemedText type="small" numberOfLines={1} style={styles.flex1}>{upload.file.name}</ThemedText>
                {upload.status === 'uploading' ? <ActivityIndicator size="small" /> : upload.status === 'error' ? (
                  <Pressable onPress={upload.retry}><ThemedText type="link">Retry</ThemedText></Pressable>
                ) : (
                  <Pressable onPress={doUploadMedia}><ThemedText type="link">Upload</ThemedText></Pressable>
                )}
                <Pressable onPress={upload.reset}><ThemedText type="small" themeColor="textSecondary">Cancel</ThemedText></Pressable>
              </View>
            ) : (
              <View style={styles.actionsRow}>
                <Pressable onPress={onPickCamera}><ThemedText type="link">+ Camera</ThemedText></Pressable>
                <Pressable onPress={onPickGallery}><ThemedText type="link">+ Gallery</ThemedText></Pressable>
              </View>
            )
          )}
          {upload.error && <ThemedText style={styles.error}>{upload.error}</ThemedText>}
        </View>

        {canManageRemarks && (
          <View style={styles.section}>
            <ThemedText type="smallBold">Verification Remarks{remarks ? ` (${remarks.length})` : ''}</ThemedText>
            <TextInput
              value={remarkNote}
              onChangeText={setRemarkNote}
              placeholder="Log a verification note…"
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, styles.noteInput, { color: theme.text, backgroundColor: theme.backgroundElement }]}
            />
            <Pressable onPress={onAddRemark} disabled={isSavingRemark || !remarkNote.trim()} style={styles.button}>
              <ThemedText style={styles.buttonLabel}>{isSavingRemark ? 'Adding…' : 'Add'}</ThemedText>
            </Pressable>
            {remarks === null ? <ThemedText type="small" themeColor="textSecondary">Loading…</ThemedText> : remarks.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">No verification remarks yet</ThemedText>
            ) : (
              remarks.map((r) => (
                <ThemedView key={r.id} type="backgroundElement" style={styles.row}>
                  <ThemedText type="small">{r.note}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{r.author.name} · {formatDateTime(r.createdAt)}</ThemedText>
                </ThemedView>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.three, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  card: { gap: Spacing.one },
  section: { gap: Spacing.one },
  row: { borderRadius: Spacing.three, padding: Spacing.three, minHeight: Layout.minTouchTarget, gap: Spacing.half },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  flex1: { flex: 1 },
  input: { height: 46, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15 },
  noteInput: { minHeight: 60, paddingVertical: Spacing.two, textAlignVertical: 'top' },
  actionsRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center', marginTop: Spacing.one },
  button: { height: 46, borderRadius: Spacing.two, backgroundColor: '#7A1C2E', alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  error: { color: '#B83030' },
  notice: { color: '#167A48' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  mediaItem: { position: 'relative' },
  mediaThumb: { width: 100, height: 100, borderRadius: Spacing.two },
  mediaPlaceholder: { backgroundColor: 'rgba(127,127,127,0.2)', alignItems: 'center', justifyContent: 'center' },
  mediaDelete: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { marginTop: Spacing.two },
  historyRow: { gap: 2, paddingVertical: Spacing.half },
  italic: { fontStyle: 'italic' },
});
