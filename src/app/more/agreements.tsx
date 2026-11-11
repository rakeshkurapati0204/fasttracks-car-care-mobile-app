import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Layout } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createAgreement,
  fetchAgreement,
  fetchAgreementPdfDataUri,
  fetchAgreements,
  fetchEmployees,
  getErrorMessage,
  voidAgreement,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { AgreementDetail, AgreementListItem, EmployeeListItem } from '@/types/api';

import { humanize } from '@/lib/labels';
// ADMIN_ROLES=[OWNER,STORE_MANAGER,HR] — re-verified 2026-09-21 against
// backend/src/routes/agreements.ts: every route (list, detail, preview,
// create, sign-owner, sign-employee, void, pdf) gates on the identical
// isAdmin(role) check with this exact role set, and there is NO self-view
// path for an employee to see their own agreement via this router — static
// requireRoles-equivalent, not override-aware, so this is the correct
// pattern per MOBILE_PERMISSIONS_PATTERN.md (leave as a role array, don't
// switch to usePermissions()).
const ADMIN_ROLES = ['OWNER', 'STORE_MANAGER', 'HR'];

function statusColor(status: AgreementListItem['status']) {
  if (status === 'SIGNED') return '#167A48';
  if (status === 'VOID') return '#B83030';
  return '#A86018';
}

export default function AgreementsScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const isAuthorized = ADMIN_ROLES.includes(user?.role ?? '');

  const [agreements, setAgreements] = useState<AgreementListItem[] | null>(null);
  const [selected, setSelected] = useState<AgreementDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState<EmployeeListItem[] | null>(null);
  const [pickedEmployee, setPickedEmployee] = useState<EmployeeListItem | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [placeOfSigning, setPlaceOfSigning] = useState('');
  const [witnessName, setWitnessName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    setError(null);
    try {
      setAgreements(await fetchAgreements());
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load agreements.'));
    }
  }, [isAuthorized]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    load();
  }, [load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const onSelect = async (id: string) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      setSelected(await fetchAgreement(id));
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load the agreement.'));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const onOpenCreate = async () => {
    setShowCreate(true);
    setNotice(null);
    setError(null);
    if (employees !== null) return;
    try {
      setEmployees(await fetchEmployees());
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not load employees.'));
    }
  };

  const onCreate = async () => {
    if (!pickedEmployee) {
      setError('Select an employee.');
      return;
    }
    setIsCreating(true);
    setError(null);
    setNotice(null);
    try {
      const created = await createAgreement({
        userId: pickedEmployee.id,
        effectiveDate: effectiveDate.trim() || undefined,
        placeOfSigning: placeOfSigning.trim() || undefined,
        witnessName: witnessName.trim() || undefined,
      });
      setNotice('Agreement drafted.');
      setShowCreate(false);
      setPickedEmployee(null);
      setEffectiveDate('');
      setPlaceOfSigning('');
      setWitnessName('');
      await load();
      setSelected(created);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not create the agreement.'));
    } finally {
      setIsCreating(false);
    }
  };

  const onVoid = (a: AgreementDetail) => {
    Alert.alert(
      'Void this agreement?',
      `This permanently voids ${a.employeeName}'s ${a.agreementType} agreement. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Void',
          style: 'destructive',
          onPress: async () => {
            setIsVoiding(true);
            setError(null);
            setNotice(null);
            try {
              const updated = await voidAgreement(a.id);
              setSelected(updated);
              setNotice('Agreement voided.');
              await load();
            } catch (err: any) {
              setError(getErrorMessage(err, 'Could not void the agreement.'));
            } finally {
              setIsVoiding(false);
            }
          },
        },
      ],
    );
  };

  const onViewPdf = async (id: string) => {
    setIsOpeningPdf(true);
    setError(null);
    try {
      const dataUri = await fetchAgreementPdfDataUri(id);
      await Linking.openURL(dataUri);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not open the PDF.'));
    } finally {
      setIsOpeningPdf(false);
    }
  };

  if (!isAuthorized) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText themeColor="textSecondary">
          Agreements is only available to Owner, Store Manager, or HR accounts.
        </ThemedText>
      </ThemedView>
    );
  }

  if (selected) {
    return (
      <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
        <Stack.Screen options={{ title: selected.employeeName }} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}>
          <Pressable onPress={() => setSelected(null)} style={styles.backButton} accessibilityLabel="Back to agreements list">
            <ThemedText type="link">‹ Back to list</ThemedText>
          </Pressable>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{selected.employeeName}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{selected.designation ?? selected.role}</ThemedText>
            <Row label="Type" value={selected.agreementType} />
            <Row label="Status" value={selected.status} valueColor={statusColor(selected.status)} />
            <Row label="Owner" value={selected.ownerName ?? '—'} />
            <Row label="Owner signed" value={selected.ownerSignedAt ? new Date(selected.ownerSignedAt).toLocaleDateString('en-IN') : '—'} />
            <Row label="Employee signed by" value={selected.employeeSignedName ?? '—'} />
            <Row label="Employee signed" value={selected.employeeSignedAt ? new Date(selected.employeeSignedAt).toLocaleDateString('en-IN') : '—'} />
            <Row label="Effective date" value={selected.effectiveDate ? new Date(selected.effectiveDate).toLocaleDateString('en-IN') : '—'} />
            <Row label="Place of signing" value={selected.placeOfSigning ?? '—'} />
            <Row label="Witness" value={selected.witnessName ?? '—'} />
          </ThemedView>

          {error && <ThemedText style={styles.error}>{error}</ThemedText>}
          {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}

          <View style={styles.actionsRow}>
            <Pressable onPress={() => onViewPdf(selected.id)} disabled={isOpeningPdf} style={styles.actionButton}>
              {isOpeningPdf ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.buttonLabel}>View PDF</ThemedText>}
            </Pressable>
            {selected.status !== 'VOID' && (
              <Pressable onPress={() => onVoid(selected)} disabled={isVoiding} style={[styles.actionButton, styles.voidButton]}>
                {isVoiding ? <ActivityIndicator color="#ffffff" size="small" /> : <ThemedText style={styles.buttonLabel}>Void</ThemedText>}
              </Pressable>
            )}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.deferredNote}>
            Collecting a drawn owner/employee signature isn&apos;t supported on mobile yet — sign agreements from the
            dashboard. Voiding and PDF viewing work here.
          </ThemedText>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
      <Stack.Screen options={{ title: 'Agreements' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {error && <ThemedText style={styles.error}>{error}</ThemedText>}
        {notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}

        <Pressable onPress={() => (showCreate ? setShowCreate(false) : onOpenCreate())} style={styles.newButton}>
          <ThemedText style={styles.buttonLabel}>{showCreate ? 'Cancel' : 'New agreement'}</ThemedText>
        </Pressable>

        {showCreate && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Draft a new agreement</ThemedText>
            <Pressable onPress={() => setShowPicker((v) => !v)} style={[styles.picker, { backgroundColor: theme.background }]}>
              <ThemedText>{pickedEmployee ? pickedEmployee.name : 'Select an employee'}</ThemedText>
            </Pressable>
            {showPicker && (
              <ThemedView style={styles.pickerList}>
                {employees === null ? (
                  <ActivityIndicator />
                ) : employees.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">No employees found.</ThemedText>
                ) : (
                  employees.map((e) => (
                    <Pressable key={e.id} onPress={() => { setPickedEmployee(e); setShowPicker(false); }} style={styles.pickerRow}>
                      <ThemedText numberOfLines={1} ellipsizeMode="tail">{e.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{e.designation ?? e.role}</ThemedText>
                    </Pressable>
                  ))
                )}
              </ThemedView>
            )}
            <TextInput
              value={effectiveDate}
              onChangeText={setEffectiveDate}
              placeholder="Effective date (YYYY-MM-DD, optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              returnKeyType="next"
            />
            <TextInput
              value={placeOfSigning}
              onChangeText={setPlaceOfSigning}
              placeholder="Place of signing (optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              returnKeyType="next"
            />
            <TextInput
              value={witnessName}
              onChangeText={setWitnessName}
              placeholder="Witness name (optional)"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              returnKeyType="done"
            />
            <Pressable onPress={onCreate} disabled={isCreating} style={styles.button}>
              {isCreating ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Create draft</ThemedText>}
            </Pressable>
          </ThemedView>
        )}

        {isLoadingDetail && <ActivityIndicator style={styles.spinner} />}
        {agreements === null ? (
          <ActivityIndicator style={styles.spinner} />
        ) : agreements.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">No agreements found.</ThemedText>
        ) : (
          agreements.map((a) => (
            <Pressable key={a.id} onPress={() => onSelect(a.id)}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <View style={styles.flex1}>
                  <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail">{a.employeeName}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} ellipsizeMode="tail">
                    {a.agreementType} · {a.designation ?? a.role}
                  </ThemedText>
                </View>
                <ThemedText type="small" style={{ color: statusColor(a.status) }}>{humanize(a.status)}</ThemedText>
              </ThemedView>
            </Pressable>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.detailRow}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText type="smallBold" numberOfLines={1} ellipsizeMode="tail" style={valueColor ? { color: valueColor } : undefined}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  content: { padding: Spacing.three, gap: Layout.cardGap, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: Spacing.three, padding: Spacing.three, minHeight: Layout.minTouchTarget, gap: Spacing.two },
  error: { color: '#B83030' },
  notice: { color: '#167A48' },
  spinner: { marginTop: Spacing.three },
  backButton: { paddingVertical: Spacing.one, minHeight: 44, justifyContent: 'center' },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  actionsRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  actionButton: { height: 44, paddingHorizontal: Spacing.three, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center', backgroundColor: '#7A1C2E' },
  voidButton: { backgroundColor: '#B83030' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  deferredNote: { marginTop: Spacing.two },
  newButton: { height: 44, borderRadius: Spacing.two, backgroundColor: '#7A1C2E', alignItems: 'center', justifyContent: 'center' },
  input: { height: 46, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15 },
  button: { height: 48, borderRadius: Spacing.two, backgroundColor: '#7A1C2E', alignItems: 'center', justifyContent: 'center' },
  picker: { borderRadius: Spacing.two, padding: Spacing.three, minHeight: 44, justifyContent: 'center' },
  pickerList: { borderRadius: Spacing.two, maxHeight: 220 },
  pickerRow: { padding: Spacing.three, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(127,127,127,0.2)' },
});
