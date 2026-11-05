import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateField } from '@/components/call-tracker/date-field';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Input, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchNewEntryHandledBy,
  getErrorMessage,
  lookupNewEntryCustomer,
  submitNewEntryJobCard,
  uploadNewEntryInspectionFiles,
  type NewEntryLookupCustomer,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { toYmd } from '@/lib/overview-format';
import type { PickedFile } from '@/lib/upload';

// Mirrors the dashboard's New Entry page (dashboard/entry/page.tsx). Page access there is OWNER / STORE_MANAGER /
// SALES / CASHIER / TECHNICIAN or a 'new_entry' permission; the backend (POST /job-cards, GET /job-cards/lookup,
// POST /:id/inspection-media) additionally needs hasCJAccess and refuses a customers_jobs 'view_only' mode, which is
// enforced up-front here through the resolved customers_jobs tab mode.
const ENTRY_ROLES = ['OWNER', 'STORE_MANAGER', 'SALES', 'CASHIER', 'TECHNICIAN'];
const WIDE_MIN = 560;
const MAX_FILES = 20;

const SOURCE_OPTIONS = [
  { value: '', label: '— Select source —' },
  { value: 'INSTAGRAM_FACEBOOK', label: 'Instagram / Facebook' },
  { value: 'FAMILY_FRIENDS', label: 'Family & Friends' },
  { value: 'GOOGLE_SEARCH', label: 'Google Search' },
  { value: 'WALK_IN', label: 'Walk In' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'INTERNAL_EMPLOYEE', label: 'Internal Employee' },
  { value: 'KNOWN_TO_OWNER', label: 'Known to Owner' },
];
const FUEL_OPTIONS = ['', 'Petrol', 'Diesel', 'Electric', 'CNG', 'Hybrid'].map((v) => ({ value: v, label: v || '— Select —' }));

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif', 'video/mp4', 'video/quicktime', 'video/mov', 'video/x-msvideo'];
const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heic', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
};

interface MediaItem { file: PickedFile; isVideo: boolean }

function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncateName(name: string, max: number): string {
  if (name.length <= max) return name;
  const ext = name.lastIndexOf('.');
  if (ext > 0 && name.length - ext <= 5) return `${name.slice(0, max - (name.length - ext) - 1)}…${name.slice(ext)}`;
  return `${name.slice(0, max)}…`;
}

function assetToItem(a: ImagePicker.ImagePickerAsset): MediaItem | null {
  const ext = (a.fileName ?? a.uri).split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  const isVideo = a.type === 'video';
  const mimeType = a.mimeType ?? EXT_MIME[ext] ?? (isVideo ? 'video/mp4' : 'image/jpeg');
  if (!ALLOWED_MIME.includes(mimeType)) return null;
  const name = a.fileName ?? `${isVideo ? 'video' : 'photo'}-${new Date().getTime()}.${ext || (isVideo ? 'mp4' : 'jpg')}`;
  return { file: { uri: a.uri, name, mimeType, size: a.fileSize, width: a.width || undefined, height: a.height || undefined }, isVideo: mimeType.startsWith('video/') };
}

function Section({ title, hint, optional, right, children }: { title: string; hint?: string; optional?: boolean; right?: React.ReactNode; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.between}>
        <View style={styles.flex1}>
          <ThemedText themeColor="textMuted" style={styles.sectionTitle}>
            {title}
            {optional ? <ThemedText themeColor="textMuted" style={styles.optional}>{' (optional)'}</ThemedText> : null}
          </ThemedText>
          {hint ? <ThemedText themeColor="textMuted" style={styles.small}>{hint}</ThemedText> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export default function NewEntryScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const { status: permStatus, tabMode, hasTab } = usePermissions();
  const cjMode = tabMode('customers_jobs');

  const [width, setWidth] = useState(0);
  const wide = width >= WIDE_MIN;

  const [form, setForm] = useState({
    customerPhone: '',
    customerName: '',
    customerEmail: '',
    customerAddress: '',
    customerGSTIN: '',
    customerSource: '',
    vehicleNumber: '',
    vehicleMake: '',
    vehicleModel: '',
    vehicleYear: '',
    vehicleFuel: '',
    vehicleColour: '',
    reasonForVisit: '',
    estimatedTotal: '',
    handledById: '',
    visitDate: toYmd(new Date()),
  });
  const [noVehicle, setNoVehicle] = useState(false);
  const [customerRole, setCustomerRole] = useState<'OWNER' | 'DRIVER'>('OWNER');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [existingCustomer, setExistingCustomer] = useState<NewEntryLookupCustomer | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string; role: string; designation?: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [photoWarning, setPhotoWarning] = useState('');
  const [failedJobCardId, setFailedJobCardId] = useState<string | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Handled By list: GET /employees/handled-by (any logged-in user), as on the dashboard.
  useEffect(() => {
    fetchNewEntryHandledBy().then(setEmployees).catch(() => {});
  }, []);

  // Default "Handled By" to the logged-in user.
  const userId = user?.id;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default once the user is known
    if (userId) setForm((f) => (f.handledById ? f : { ...f, handledById: userId }));
  }, [userId]);

  const lookupPhone = useCallback(async (phone: string) => {
    if (phone.length < 10) { setExistingCustomer(null); return; }
    setLookingUp(true);
    try {
      const cust = await lookupNewEntryCustomer(phone);
      setExistingCustomer(cust);
      if (cust) {
        setForm((f) => ({
          ...f,
          customerName: cust.name || f.customerName,
          customerEmail: cust.email || f.customerEmail,
          customerGSTIN: cust.gstin || f.customerGSTIN,
          customerAddress: cust.address || f.customerAddress,
        }));
      }
    } catch { setExistingCustomer(null); }
    finally { setLookingUp(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => lookupPhone(form.customerPhone), 500);
    return () => clearTimeout(t);
  }, [form.customerPhone, lookupPhone]);

  const showSource = !existingCustomer && form.customerPhone.length >= 10;

  const addItems = (items: (MediaItem | null)[]) => {
    const ok = items.filter((i): i is MediaItem => i !== null);
    setMedia((prev) => [...prev, ...ok.slice(0, Math.max(0, MAX_FILES - prev.length))]);
  };

  const takeCapture = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setError('Camera permission is needed to take photos.'); return; }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images', 'videos'], quality: 0.8 });
    if (!res.canceled && res.assets?.length) addItems(res.assets.map(assetToItem));
  };

  const pickGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Photo library permission is needed to choose files.'); return; }
    const remaining = MAX_FILES - media.length;
    if (remaining <= 0) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.8 });
    if (!res.canceled && res.assets?.length) addItems(res.assets.map(assetToItem));
  };

  const removeMedia = (idx: number) => setMedia((prev) => prev.filter((_, i) => i !== idx));

  const retryUpload = async () => {
    if (!failedJobCardId) return;
    setSubmitting(true);
    setPhotoWarning('');
    try {
      await uploadNewEntryInspectionFiles(failedJobCardId, media.map((m) => m.file));
      router.replace(`/customers/job/${failedJobCardId}` as never);
    } catch {
      setPhotoWarning('Upload failed again. You can add photos later from the job card.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    setPhotoWarning('');
    if (!form.customerName.trim()) { setError('Customer name is required'); return; }
    if (!noVehicle && !form.vehicleNumber.trim()) { setError('Vehicle number is required'); return; }
    if (!form.reasonForVisit.trim()) { setError('Reason for visit is required'); return; }

    setSubmitting(true);
    try {
      const r = await submitNewEntryJobCard({ ...form, noVehicle, customerRole, ownerName: ownerName.trim() || undefined, ownerPhone: ownerPhone.trim() || undefined });
      const { jobCard } = r;
      if (media.length > 0) {
        try {
          await uploadNewEntryInspectionFiles(jobCard.id, media.map((m) => m.file));
        } catch {
          setFailedJobCardId(jobCard.id);
          setPhotoWarning('Job card created but photo upload failed.');
          setSubmitting(false);
          return;
        }
      }
      router.replace(`/customers/job/${jobCard.id}` as never);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Failed to create job card'));
    } finally {
      setSubmitting(false);
    }
  };

  const pair = [styles.pair, wide && styles.pairWide];
  const loadingPerms = permStatus === 'idle' || permStatus === 'loading';
  const canAccessEntry = !!user && (ENTRY_ROLES.includes(user.role) || hasTab('new_entry'));
  const canWrite = cjMode !== null && cjMode !== 'view_only';

  if (loadingPerms) {
    return (
      <ThemedView style={styles.flex1}>
        <Stack.Screen options={{ title: 'New Entry' }} />
        <View style={styles.content}>
          <Skeleton height={32} width="50%" />
          <Skeleton height={220} />
          <Skeleton height={260} />
          <Skeleton height={200} />
        </View>
      </ThemedView>
    );
  }

  if (!canAccessEntry || !canWrite) {
    return (
      <ThemedView style={styles.center}>
        <Stack.Screen options={{ title: 'New Entry' }} />
        <ThemedText themeColor="textMuted" style={styles.p}>
          {canAccessEntry && cjMode === 'view_only' ? 'View-only access — cannot create job cards' : 'Access denied.'}
        </ThemedText>
      </ThemedView>
    );
  }

  const lightboxItem = lightbox;

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'New Entry' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View>
          <ThemedText style={styles.title}>New Entry</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.sub}>Create a job card and draft invoice for a new vehicle visit</ThemedText>
        </View>

        {/* Customer */}
        <Section title="Customer">
          <View>
            <View>
              <Input label="Phone Number" value={form.customerPhone} onChangeText={(v) => set('customerPhone', v)} placeholder="10-digit phone number" keyboardType="phone-pad" />
              {lookingUp ? <ActivityIndicator size="small" color={theme.primary} style={styles.spinner} /> : null}
            </View>
            {form.customerPhone.length >= 10 && !lookingUp ? (
              <View style={styles.pillRow}>
                {existingCustomer ? (
                  <View style={[styles.pill, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                    <ThemedText style={[styles.pillText, { color: '#10b981' }]}>
                      {`✓ Existing customer · ${existingCustomer.visitCount} visit${existingCustomer.visitCount !== 1 ? 's' : ''}`}
                    </ThemedText>
                  </View>
                ) : (
                  <View style={[styles.pill, { backgroundColor: withAlpha(theme.primary, 0.12) }]}>
                    <ThemedText style={[styles.pillText, { color: theme.primary }]}>✦ New customer</ThemedText>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          <Input label="Full Name" required value={form.customerName} onChangeText={(v) => set('customerName', v)} placeholder="Customer full name" />

          <View>
            <ThemedText themeColor="textMuted" style={[styles.small, styles.roleLabel]}>This person is the</ThemedText>
            <View style={styles.row}>
              {(['OWNER', 'DRIVER'] as const).map((role) => {
                const active = customerRole === role;
                return (
                  <Pressable
                    key={role}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => { setCustomerRole(role); if (role === 'OWNER') { setOwnerName(''); setOwnerPhone(''); } }}
                    style={[styles.roleBtn, { backgroundColor: active ? theme.primary : theme.surface, borderColor: active ? theme.primary : theme.border }]}>
                    <ThemedText style={[styles.roleText, { color: active ? '#fff' : theme.textSecondary }]}>
                      {role === 'OWNER' ? '🧑 Owner' : '🚗 Driver / Representative'}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {customerRole === 'DRIVER' ? (
            <View style={[styles.driverBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={[styles.small, styles.semi]}>Actual Car Owner (optional)</ThemedText>
              <Input label="Owner Name" value={ownerName} onChangeText={setOwnerName} placeholder="Owner's full name" />
              <Input label="Owner Phone" value={ownerPhone} onChangeText={(v) => setOwnerPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit number without +91" keyboardType="phone-pad" />
            </View>
          ) : null}

          <View style={pair}>
            <View style={styles.flex1}><Input label="Email" value={form.customerEmail} onChangeText={(v) => set('customerEmail', v)} placeholder="optional" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} /></View>
            <View style={styles.flex1}><Input label="GSTIN" value={form.customerGSTIN} onChangeText={(v) => set('customerGSTIN', v)} placeholder="optional" autoCapitalize="characters" autoCorrect={false} /></View>
          </View>

          {showSource ? (
            <Select label="How did they find us?" value={form.customerSource} onChange={(v) => set('customerSource', v)} options={SOURCE_OPTIONS} placeholder="— Select source —" />
          ) : null}
        </Section>

        {/* Vehicle */}
        <Section
          title="Vehicle"
          right={
            <View style={styles.toggle}>
              <Switch
                value={noVehicle}
                onValueChange={setNoVehicle}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#ffffff"
                accessibilityLabel="No vehicle"
              />
              <ThemedText themeColor="textMuted" style={[styles.small, styles.toggleText]}>No vehicle — enquiry/consultation only</ThemedText>
            </View>
          }>
          {noVehicle ? (
            <View style={[styles.noVehicle, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ThemedText themeColor="textMuted" style={[styles.p, styles.center2]}>Walk-in / No Vehicle — job card will be created without vehicle details</ThemedText>
            </View>
          ) : (
            <>
              <Input label="Vehicle Number" required value={form.vehicleNumber} onChangeText={(v) => set('vehicleNumber', v.toUpperCase())} placeholder="e.g. TS07JK2255" autoCapitalize="characters" autoCorrect={false} />
              <View style={pair}>
                <View style={styles.flex1}><Input label="Make" value={form.vehicleMake} onChangeText={(v) => set('vehicleMake', v)} placeholder="e.g. Toyota" /></View>
                <View style={styles.flex1}><Input label="Model" value={form.vehicleModel} onChangeText={(v) => set('vehicleModel', v)} placeholder="e.g. Fortuner" /></View>
              </View>
              <View style={pair}>
                <View style={styles.flex1}><Input label="Year" value={form.vehicleYear} onChangeText={(v) => set('vehicleYear', v)} placeholder="e.g. 2022" keyboardType="number-pad" /></View>
                <View style={styles.flex1}><Select label="Fuel Type" value={form.vehicleFuel} onChange={(v) => set('vehicleFuel', v)} options={FUEL_OPTIONS} placeholder="— Select —" /></View>
              </View>
              <Input label="Colour" value={form.vehicleColour} onChangeText={(v) => set('vehicleColour', v)} placeholder="e.g. White" />
            </>
          )}
        </Section>

        {/* Job details */}
        <Section title="Job Details">
          <Input label="Estimated Total (₹)" value={form.estimatedTotal} onChangeText={(v) => set('estimatedTotal', v.replace(/[^0-9]/g, ''))} placeholder="Optional rough quote, e.g. 3500" keyboardType="number-pad" />
          <Input label="Reason for Visit" required value={form.reasonForVisit} onChangeText={(v) => set('reasonForVisit', v)} placeholder="Describe the work to be done…" multiline numberOfLines={3} />
          <Select
            label="Handled By"
            required
            value={form.handledById}
            onChange={(v) => set('handledById', v)}
            placeholder="— Select employee —"
            options={[{ value: '', label: '— Select employee —' }, ...employees.map((e) => ({ value: e.id, label: e.designation ? `${e.name} (${e.designation})` : e.name }))]}
          />
          <DateField
            label="Visit Date"
            value={form.visitDate}
            onChange={(v) => set('visitDate', v && v > toYmd(new Date()) ? toYmd(new Date()) : v)}
          />
        </Section>

        {/* Inspection photos */}
        <Section title="Inspection Photos" optional hint="Document vehicle condition on arrival">
          <View style={[styles.drop, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Ionicons name="camera-outline" size={40} color={theme.textMuted} />
            <ThemedText style={[styles.p, styles.semi]}>Tap to take photo or upload</ThemedText>
            <ThemedText themeColor="textMuted" style={[styles.small, styles.center2]}>JPG, PNG, HEIC, MP4, MOV · 100 MB each · max 20</ThemedText>
            <View style={styles.row}>
              <Button variant="secondary" size="sm" icon="camera-outline" onPress={takeCapture} disabled={media.length >= MAX_FILES}>Take photo</Button>
              <Button variant="secondary" size="sm" icon="images-outline" onPress={pickGallery} disabled={media.length >= MAX_FILES}>Gallery</Button>
            </View>
          </View>

          {media.length > 0 ? (
            <View style={styles.grid}>
              {media.map((item, idx) => (
                <View key={`${item.file.uri}-${idx}`} style={[styles.thumbWrap, wide && styles.thumbWrapWide]}>
                  <View style={[styles.thumb, { backgroundColor: theme.surface }]}>
                    {item.isVideo ? (
                      <View style={styles.videoTile}>
                        <View style={styles.play}><Ionicons name="play" size={26} color="#fff" /></View>
                        <View style={styles.videoMeta}>
                          <ThemedText style={styles.videoName} numberOfLines={1}>{truncateName(item.file.name, 15)}</ThemedText>
                          <ThemedText style={styles.videoSize}>{formatSize(item.file.size)}</ThemedText>
                        </View>
                      </View>
                    ) : (
                      <Pressable onPress={() => setLightbox(item.file.uri)} style={styles.fill} accessibilityRole="imagebutton" accessibilityLabel="View photo">
                        <Image source={{ uri: item.file.uri }} style={styles.fill} resizeMode="cover" />
                      </Pressable>
                    )}
                    <Pressable onPress={() => removeMedia(idx)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Remove" style={styles.remove}>
                      <Ionicons name="close" size={16} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </Section>

        {error ? <ErrorBanner message={error} /> : null}

        {photoWarning ? (
          <View style={styles.warn}>
            <ThemedText style={[styles.p, { color: '#f97316' }]}>{photoWarning}</ThemedText>
            {failedJobCardId ? (
              <View style={styles.row}>
                <Button variant="outline" size="sm" onPress={retryUpload} disabled={submitting}>{submitting ? 'Retrying…' : 'Retry upload'}</Button>
                <Button variant="outline" size="sm" onPress={() => router.replace(`/customers/job/${failedJobCardId}` as never)}>Proceed without photos</Button>
              </View>
            ) : null}
          </View>
        ) : null}

        <Button size="lg" fullWidth onPress={handleSubmit} disabled={submitting} loading={submitting}>
          {submitting ? (media.length > 0 ? 'Uploading Photos…' : 'Creating Job Card…') : 'Create Job Card & Draft Invoice'}
        </Button>
      </ScrollView>

      <Modal visible={!!lightboxItem} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={styles.lightbox} onPress={() => setLightbox(null)} accessibilityLabel="Close">
          {lightboxItem ? <Image source={{ uri: lightboxItem }} style={styles.lightboxImg} resizeMode="contain" /> : null}
          <Pressable onPress={() => setLightbox(null)} style={[styles.lightboxClose, { top: insets.top + 16 }]} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  center2: { textAlign: 'center' },
  content: { padding: 16, gap: 20, width: '100%', maxWidth: 672, alignSelf: 'center' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 20, gap: 16 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  optional: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.regular, textTransform: 'none' },
  small: { fontSize: 12, lineHeight: 16 },
  p: { fontSize: 14, lineHeight: 20 },
  semi: { fontFamily: FontWeights.semiBold },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  pair: { gap: 16 },
  pairWide: { flexDirection: 'row' },
  spinner: { position: 'absolute', right: 14, bottom: 12 },
  pillRow: { marginTop: 6, flexDirection: 'row' },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  roleLabel: { fontFamily: FontWeights.medium, marginBottom: 8 },
  roleBtn: { flexGrow: 1, flexBasis: '45%', minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  roleText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold, textAlign: 'center' },
  driverBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Radii.md, padding: 16, gap: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  toggleText: { flexShrink: 1 },
  noVehicle: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Radii.md, paddingVertical: 12, paddingHorizontal: 16 },
  drop: { borderWidth: 2, borderStyle: 'dashed', borderRadius: Radii.md, minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  thumbWrap: { width: '47%', flexGrow: 1 },
  thumbWrapWide: { width: '22%' },
  thumb: { aspectRatio: 1, borderRadius: Radii.md, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  videoTile: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  play: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  videoMeta: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  videoName: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.medium },
  videoSize: { color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 16 },
  remove: { position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' },
  warn: { padding: 12, borderRadius: Radii.md, gap: 8, backgroundColor: 'rgba(251,146,60,0.1)' },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  lightboxImg: { width: '95%', height: '90%' },
  lightboxClose: { position: 'absolute', right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
});
