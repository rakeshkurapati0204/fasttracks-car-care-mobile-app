import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Children, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAvatarColor, getInitials } from '@/components/employees/employee-format';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Skeleton } from '@/components/ui';
import { Fonts, FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchIdentityDocumentDataUri, fetchMyIdentityDocuments, fetchMyProfile, revealIdentityDocumentValue } from '@/lib/api';
import type { FullProfile, IdentityDocument } from '@/types/api';

const WIDE_MIN = 560;

const DOC_TYPE_LABEL: Record<string, string> = {
  PAN_CARD: 'PAN Card', AADHAAR_CARD: 'Aadhaar Card', OTHER: 'Other document',
  PASSPORT: 'Passport', DRIVING_LICENCE: 'Driving Licence', VOTER_ID: 'Voter ID',
  LAST_SALARY_SLIP: 'Last Salary Slip', EDUCATION_CERTIFICATE: 'Education Certificate',
  EXPERIENCE_LETTER: 'Experience Letter',
};

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Founder',
  STORE_MANAGER: 'Store Manager',
  SALES: 'Sales',
  TECHNICIAN: 'Technician',
  TECH_TEAM: 'Tech Team',
  SOCIAL_MEDIA: 'Social Media',
  STAFF: 'Staff',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTING: 'Accounting',
  HR: 'HR',
  HOUSEKEEPING: 'Housekeeping',
  CASHIER: 'Cashier',
};

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Whole months and years since a date, for "time at the company". */
function tenure(iso?: string | null) {
  if (!iso) return null;
  const start = new Date(iso);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  if (start > now) return null;

  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months--;
  if (months < 0) return null;

  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rem) parts.push(`${rem} month${rem === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : 'Less than a month';
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <ThemedText themeColor="textMuted" style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText themeColor={value ? 'text' : 'textMuted'} style={styles.rowValue}>{value || 'Not set'}</ThemedText>
    </View>
  );
}

// Section card: 12px bold uppercase muted heading with an icon, rows divided
// by a hairline (the dashboard's `divide-y`).
function Section({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  const theme = useTheme();
  const items = Children.toArray(children);
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardHead}>
        <Ionicons name={icon} size={14} color={theme.textMuted} />
        <ThemedText themeColor="textMuted" style={styles.heading}>{title.toUpperCase()}</ThemedText>
      </View>
      {items.map((c, i) => (
        <View key={i} style={i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }}>{c}</View>
      ))}
    </View>
  );
}

function SmallButton({ label, icon, onPress, loading, disabled }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={[styles.btn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, (disabled || loading) && { opacity: 0.5 }]}>
      {loading ? <ActivityIndicator size="small" color={theme.text} /> : <Ionicons name={icon} size={14} color={theme.text} />}
      <ThemedText style={styles.btnLabel}>{label}</ThemedText>
    </Pressable>
  );
}

// Self-only: /auth/me and the caller's own documents; the server enforces it.
export default function PersonalInfoScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();

  const [width, setWidth] = useState(0);
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [documents, setDocuments] = useState<IdentityDocument[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError('');
    try {
      const me = await fetchMyProfile();
      setProfile(me);
      // A failed document load just leaves the card on its empty state.
      fetchMyIdentityDocuments(me.id)
        .then((d) => setDocuments(d ?? []))
        .catch(() => {})
        .finally(() => setDocumentsLoaded(true));
    } catch {
      setError('Could not load your details. Pull down to retry.');
    } finally {
      setLoading(false);
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

  // The dashboard opens the file in a new tab and silently ignores a failure.
  const viewDocument = async (doc: IdentityDocument) => {
    setViewingId(doc.id);
    try {
      await Linking.openURL(await fetchIdentityDocumentDataUri(doc.id, doc.mimeType ?? 'application/octet-stream'));
    } catch {
      // silent, as on the dashboard
    } finally {
      setViewingId(null);
    }
  };

  // Self-reveal of the encrypted number (logged server-side as REVEAL_VALUE).
  const revealValue = async (doc: IdentityDocument) => {
    setRevealingId(doc.id);
    try {
      const value = await revealIdentityDocumentValue(doc.id);
      setRevealed((prev) => ({ ...prev, [doc.id]: value }));
    } catch {
      // silent, as on the dashboard
    } finally {
      setRevealingId(null);
    }
  };

  const hideValue = (id: string) =>
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const wide = width >= WIDE_MIN;
  const pad = wide ? 24 : 16;
  const shell = (children: ReactNode) => (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Personal Info' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { padding: pad, paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {children}
      </ScrollView>
    </ThemedView>
  );

  if (loading && !profile) {
    return shell(
      <>
        <Skeleton width={180} height={32} />
        <Skeleton height={96} />
        <Skeleton height={160} />
        <Skeleton height={140} />
      </>,
    );
  }

  if (!profile) {
    return shell(
      <View style={[styles.card, styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ThemedText style={styles.body}>{error || 'Your details are unavailable right now.'}</ThemedText>
        <Pressable onPress={() => { setLoading(true); load(); }} accessibilityRole="button" hitSlop={8} style={styles.retry}>
          <ThemedText style={[styles.retryText, { color: theme.primary }]}>Retry</ThemedText>
        </Pressable>
      </View>,
    );
  }

  const roleLabel = ROLE_LABELS[profile.role] ?? profile.role;
  const joined = fmtDate(profile.joiningDate);
  const served = tenure(profile.joiningDate);
  const shift = profile.customClockIn && profile.customClockOut ? `${profile.customClockIn} — ${profile.customClockOut}` : null;

  return shell(
    <>
      <View>
        <ThemedText style={styles.h1}>Personal Info</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.subtitle}>Your details as they are on record.</ThemedText>
      </View>

      {error ? <ErrorBanner message={error} onRetry={load} /> : null}

      {/* Identity */}
      <View style={[styles.card, styles.identity, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.avatar, { backgroundColor: getAvatarColor(profile.name) }]}>
          <ThemedText style={styles.avatarText}>{getInitials(profile.name)}</ThemedText>
        </View>
        <View style={styles.flex1}>
          <ThemedText numberOfLines={1} style={styles.name}>{profile.name}</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.body}>{profile.designation || roleLabel}</ThemedText>
          <View style={styles.badges}>
            {profile.employeeId ? (
              <View style={[styles.badge, { backgroundColor: 'rgba(104,15,26,0.12)' }]}>
                <ThemedText style={[styles.badgeText, { color: theme.primary }]}>{profile.employeeId}</ThemedText>
              </View>
            ) : null}
            <View style={[styles.badge, { backgroundColor: profile.isActive ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.14)' }]}>
              <ThemedText style={[styles.badgeText, { color: profile.isActive ? '#15803d' : '#4b5563' }]}>{profile.isActive ? 'Active' : 'Inactive'}</ThemedText>
            </View>
          </View>
        </View>
      </View>

      <Section title="Employment" icon="ribbon-outline">
        <Row label="Role" value={roleLabel} />
        <Row label="Designation" value={profile.designation} />
        <Row label="Employee ID" value={profile.employeeId} />
        <Row label="Login username" value={profile.username} />
        {profile.branch ? <Row label="Branch" value={profile.branch} /> : null}
      </Section>

      <Section title="Contact" icon="call-outline">
        <Row label="Work phone" value={profile.phone} />
        <Row label="Personal phone" value={profile.personalPhone} />
        <Row label="Work email" value={profile.email} />
        <Row label="Personal email" value={profile.personalEmail} />
      </Section>

      <Section title="Joining" icon="calendar-outline">
        <Row label="Joined on" value={joined} />
        <Row label="With us for" value={served} />
      </Section>

      {/* Always shown once loaded, even when empty. View-only: documents are
          added from Onboarding > Documents (HR/admin). */}
      <Section title="Identity documents" icon="document-text-outline">
        {!documentsLoaded ? (
          <ThemedText themeColor="textMuted" style={styles.small}>Loading…</ThemedText>
        ) : documents.length === 0 ? (
          <ThemedText themeColor="textMuted" style={styles.small}>No identity documents on file.</ThemedText>
        ) : (
          documents.map((doc) => (
            <View key={doc.id} style={[styles.docRow, wide ? styles.docRowWide : null]}>
              <View style={styles.flex1}>
                <ThemedText style={styles.docTitle}>{DOC_TYPE_LABEL[doc.type] ?? doc.type}</ThemedText>
                <ThemedText themeColor="textMuted" style={styles.docSub}>
                  {doc.hasValue ? (revealed[doc.id] ?? doc.maskedValue ?? '••••') : (doc.filename || 'No file attached')}
                </ThemedText>
              </View>
              <View style={styles.docActions}>
                {doc.hasValue ? (
                  revealed[doc.id] ? (
                    <SmallButton label="Hide" icon="eye-off-outline" onPress={() => hideValue(doc.id)} />
                  ) : (
                    <SmallButton label="Reveal" icon="eye-outline" onPress={() => revealValue(doc)} loading={revealingId === doc.id} />
                  )
                ) : null}
                {doc.filename ? <SmallButton label="View" icon="eye-outline" onPress={() => viewDocument(doc)} loading={viewingId === doc.id} /> : null}
              </View>
            </View>
          ))
        )}
      </Section>

      {/* Only when something is actually configured */}
      {shift || profile.workingDaysPerMonth || profile.defaultLeaves != null ? (
        <Section title="Work pattern" icon="time-outline">
          {shift ? <Row label="Shift timing" value={shift} /> : null}
          {profile.workingDaysPerMonth != null ? <Row label="Working days / month" value={String(profile.workingDaysPerMonth)} /> : null}
          {profile.defaultLeaves != null ? <Row label="Leave allowance" value={`${profile.defaultLeaves} day${profile.defaultLeaves === 1 ? '' : 's'}`} /> : null}
        </Section>
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.cardHead, { marginBottom: 12 }]}>
          <Ionicons name="business-outline" size={14} color={theme.textMuted} />
          <ThemedText themeColor="textMuted" style={styles.heading}>ACCOUNT</ThemedText>
        </View>
        <Pressable
          onPress={() => router.push('/more/change-password')}
          accessibilityRole="button"
          style={[styles.accountLink, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="key-outline" size={16} color={theme.text} />
          <ThemedText style={styles.accountLabel}>Change password</ThemedText>
        </Pressable>
        <ThemedText themeColor="textMuted" style={[styles.small, { marginTop: 12 }]}>
          Something here wrong? Ask your manager or HR to update it — these details are managed from the Employees page.
        </ThemedText>
      </View>

      {/* Salary pointer, not the figure itself */}
      <Pressable
        onPress={() => router.push('/more/my-salary')}
        accessibilityRole="link"
        style={[styles.card, styles.salary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="mail-outline" size={16} color={theme.textMuted} />
        <ThemedText style={styles.accountLabel}>Salary and payslips are on My Salary →</ThemedText>
      </Pressable>
    </>,
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { gap: 16, width: '100%', maxWidth: 672, alignSelf: 'center' },
  h1: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold, fontWeight: '900' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 16, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  heading: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold, letterSpacing: 0.6 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  retry: { minHeight: 36, justifyContent: 'center' },
  retryText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 18, lineHeight: 24, fontFamily: FontWeights.bold },
  name: { fontSize: 18, lineHeight: 28, fontFamily: FontWeights.bold },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, paddingVertical: 10 },
  rowLabel: { fontSize: 12, lineHeight: 20, flexShrink: 0 },
  rowValue: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium, textAlign: 'right' },
  docRow: { gap: 8, paddingVertical: 10 },
  docRowWide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  docTitle: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  docSub: { fontSize: 12, lineHeight: 16, fontFamily: Fonts?.mono },
  docActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderWidth: 1, borderRadius: 8 },
  btnLabel: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  accountLink: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderRadius: Radii.md },
  accountLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
  salary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
