import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CardVisual, PasswordCard, PWD_CATEGORIES } from '@/components/password-manager/entry-cards';
import { CardFormView, PasswordForm } from '@/components/password-manager/entry-forms';
import { ErrorBanner } from '@/components/overview/parts';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button, Select, Skeleton } from '@/components/ui';
import { FontWeights, Radii } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createCardEntry,
  createPasswordEntry,
  deleteCardEntry,
  deletePasswordEntry,
  fetchCardEntries,
  fetchPasswordEntries,
  revealCardCvv,
  revealCardNumber,
  revealPasswordEntry,
  updateCardEntry,
  updatePasswordEntry,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CardEntry, CardEntryInput, PasswordEntry, PasswordEntryInput } from '@/types/api';

// Both /passwords and /cards are requireRoles(OWNER, STORE_MANAGER, INVENTORY_MANAGER)
// (backend/src/routes/passwords.ts, cards.ts) — a static role check, same list as the dashboard's Sidebar entry.
const PM_ROLES = ['OWNER', 'STORE_MANAGER', 'INVENTORY_MANAGER'];

// A revealed secret is dropped from memory after this long, like the dashboard.
const REVEAL_MS = 30000;
const WIDE_MIN = 560;
const LARGE_MIN = 900;
const GAP = 16;

type Tab = 'passwords' | 'cards';
type Kind = 'pwd' | 'num' | 'cvv';

function Grid({ width, gap = GAP, children }: { width: number; gap?: number; children: ReactNode[] }) {
  const cols = width >= LARGE_MIN ? 3 : width >= WIDE_MIN ? 2 : 1;
  const item = Math.floor((width - 32 - gap * (cols - 1)) / cols);
  return (
    <View style={[styles.grid, { gap }]}>
      {children.map((c, i) => <View key={i} style={{ width: item > 0 ? item : undefined }}>{c}</View>)}
    </View>
  );
}

export default function PasswordManagerScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { user } = useAuth();
  const allowed = PM_ROLES.includes(user?.role ?? '');

  const [width, setWidth] = useState(0);
  const [tab, setTab] = useState<Tab>('passwords');
  const [passwords, setPasswords] = useState<PasswordEntry[] | null>(null);
  const [cards, setCards] = useState<CardEntry[] | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');

  // Revealed secrets, by entry id. Kept in memory only — never logged, stored or written anywhere —
  // and cleared on timeout, app background, screen blur and unmount.
  const [revealedPwds, setRevealedPwds] = useState<Record<string, string>>({});
  const [revealedNums, setRevealedNums] = useState<Record<string, string>>({});
  const [revealedCvvs, setRevealedCvvs] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [form, setForm] = useState<{ kind: 'pwd'; editing: PasswordEntry | null } | { kind: 'card'; editing: CardEntry | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const setterFor = (k: Kind) => (k === 'pwd' ? setRevealedPwds : k === 'num' ? setRevealedNums : setRevealedCvvs);

  const hide = useCallback((k: Kind, id: string) => {
    const key = `${k}:${id}`;
    clearTimeout(timers.current[key]);
    delete timers.current[key];
    (k === 'pwd' ? setRevealedPwds : k === 'num' ? setRevealedNums : setRevealedCvvs)((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    });
  }, []);

  const clearAllSecrets = useCallback(() => {
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setRevealedPwds({});
    setRevealedNums({});
    setRevealedCvvs({});
  }, []);

  // Drop every revealed secret when the app goes to the background, when the screen loses focus, and on unmount.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') clearAllSecrets(); });
    return () => {
      sub.remove();
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [clearAllSecrets]);
  useFocusEffect(useCallback(() => clearAllSecrets, [clearAllSecrets]));

  // Failure messages are fixed strings (the dashboard's), never the server's text.
  const loadPasswords = useCallback(async () => {
    setPwdError(null);
    try {
      setPasswords(await fetchPasswordEntries());
    } catch {
      setPwdError("Couldn't load passwords. Check your connection and try again.");
    }
  }, []);

  const loadCards = useCallback(async () => {
    setCardError(null);
    try {
      setCards(await fetchCardEntries());
    } catch {
      setCardError("Couldn't load cards. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadPasswords();
    loadCards();
  }, [allowed, loadPasswords, loadCards]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    clearAllSecrets();
    await Promise.all([loadPasswords(), loadCards()]);
    setIsRefreshing(false);
  };

  // Reveal fetches the real secret only on this tap; tapping again hides it.
  const reveal = async (k: Kind, id: string, current: string | undefined) => {
    if (current) { hide(k, id); return; }
    try {
      const value = k === 'pwd' ? await revealPasswordEntry(id) : k === 'num' ? await revealCardNumber(id) : await revealCardCvv(id);
      setterFor(k)((p) => ({ ...p, [id]: value }));
      clearTimeout(timers.current[`${k}:${id}`]);
      timers.current[`${k}:${id}`] = setTimeout(() => hide(k, id), REVEAL_MS);
    } catch {
      showToast(k === 'pwd' ? 'Failed to reveal password' : k === 'num' ? 'Failed to reveal card number' : 'Failed to reveal CVV', false);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await Clipboard.setStringAsync(value);
      showToast(`${label} copied`);
    } catch {
      showToast('Could not copy', false);
    }
  };

  // Same rule as the dashboard's canManageEntry: OWNER any; STORE_MANAGER unless the entry was added by an
  // OWNER; everyone else only their own.
  const canManage = (e: { addedById: string; addedBy: { role: string } }) => {
    if (!user) return false;
    if (user.role === 'OWNER') return true;
    if (user.role === 'STORE_MANAGER' && e.addedBy?.role !== 'OWNER') return true;
    return e.addedById === user.id;
  };

  const closeForm = () => { setForm(null); setSaveError(null); };

  const savePwd = async (editing: PasswordEntry | null, body: PasswordEntryInput) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await updatePasswordEntry(editing.id, body);
        hide('pwd', editing.id); // the stored value may have changed
        showToast('Password updated');
      } else {
        await createPasswordEntry(body);
        showToast('Password added');
      }
      setForm(null);
      await loadPasswords();
    } catch {
      setSaveError('Failed to save');
      showToast('Failed to save', false);
    } finally {
      setSaving(false);
    }
  };

  const saveCard = async (editing: CardEntry | null, body: CardEntryInput) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing) {
        await updateCardEntry(editing.id, body);
        hide('num', editing.id);
        hide('cvv', editing.id);
        showToast('Card updated');
      } else {
        await createCardEntry(body);
        showToast('Card added');
      }
      setForm(null);
      await loadCards();
    } catch {
      setSaveError('Failed to save');
      showToast('Failed to save', false);
    } finally {
      setSaving(false);
    }
  };

  const deletePwd = (p: PasswordEntry) => {
    Alert.alert('Delete this password entry?', p.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePasswordEntry(p.id);
            hide('pwd', p.id);
            showToast('Deleted');
            await loadPasswords();
          } catch {
            showToast('Failed to delete', false);
          }
        },
      },
    ]);
  };

  const deleteCard = (c: CardEntry) => {
    Alert.alert('Delete this card?', c.label, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCardEntry(c.id);
            hide('num', c.id);
            hide('cvv', c.id);
            showToast('Deleted');
            await loadCards();
          } catch {
            showToast('Failed to delete', false);
          }
        },
      },
    ]);
  };

  if (!allowed) {
    return (
      <ThemedView style={[styles.flex1, styles.pad]}>
        <Stack.Screen options={{ title: 'Password Manager' }} />
        <ThemedText themeColor="textMuted" style={styles.sub}>
          Password Manager is available to Owner, Store Manager and Inventory Manager roles only.
        </ThemedText>
      </ThemedView>
    );
  }

  const q = search.toLowerCase();
  const filteredPwds = (passwords ?? []).filter((p) => {
    const matchSearch = !q || p.title.toLowerCase().includes(q) || p.username.toLowerCase().includes(q);
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });
  const creditCards = (cards ?? []).filter((c) => c.cardType === 'CREDIT');
  const debitCards = (cards ?? []).filter((c) => c.cardType === 'DEBIT');

  const renderCards = (list: CardEntry[]) => list.map((c) => (
    <CardVisual
      key={c.id}
      card={c}
      revealedNum={revealedNums[c.id]}
      revealedCvv={revealedCvvs[c.id]}
      canManage={canManage(c)}
      onRevealNum={() => reveal('num', c.id, revealedNums[c.id])}
      onRevealCvv={() => reveal('cvv', c.id, revealedCvvs[c.id])}
      onCopy={copy}
      onEdit={() => { setSaveError(null); setForm({ kind: 'card', editing: c }); }}
      onDelete={() => deleteCard(c)}
    />
  ));

  const cardSection = (title: string, dot: string, list: CardEntry[], empty: string) => (
    <View>
      <View style={styles.sectionHead}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
        <ThemedText themeColor="textMuted" style={styles.sectionCount}>({list.length})</ThemedText>
      </View>
      {list.length === 0
        ? <ThemedText themeColor="textMuted" style={styles.italic}>{empty}</ThemedText>
        : <Grid width={width} gap={24}>{renderCards(list)}</Grid>}
    </View>
  );

  const loading = tab === 'passwords' ? passwords === null && !pwdError : cards === null && !cardError;

  return (
    <ThemedView style={styles.flex1} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Stack.Screen options={{ title: 'Password Manager' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>Password Manager</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.sub}>Securely store passwords and payment cards</ThemedText>
          </View>
          <Button
            icon="add"
            onPress={() => { setSaveError(null); setForm(tab === 'passwords' ? { kind: 'pwd', editing: null } : { kind: 'card', editing: null }); }}>
            {tab === 'passwords' ? 'Add Password' : 'Add Card'}
          </Button>
        </View>

        {/* Tabs: grey pill track, white active pill */}
        <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
          {(['passwords', 'cards'] as const).map((t) => {
            const on = tab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.tabBtn, on && { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
                <ThemedText style={[styles.tabText, { color: on ? theme.text : theme.textMuted }]}>{t === 'passwords' ? 'Passwords' : 'Cards'}</ThemedText>
              </Pressable>
            );
          })}
        </View>

        {tab === 'passwords' ? (
          <>
            <View style={[styles.filters, width >= WIDE_MIN && styles.filtersWide]}>
              <View style={[styles.search, { backgroundColor: theme.surface, borderColor: theme.border }, width >= WIDE_MIN && styles.searchWide]}>
                <Ionicons name="search" size={16} color={theme.textMuted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search passwords..."
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.searchInput, { color: theme.text }]}
                />
              </View>
              <View style={width >= WIDE_MIN ? styles.catWide : undefined}>
                <Select
                  value={catFilter}
                  onChange={setCatFilter}
                  options={[{ value: '', label: 'All Categories' }, ...PWD_CATEGORIES.map((c) => ({ value: c, label: c }))]}
                />
              </View>
            </View>

            {pwdError ? (
              <ErrorBanner message={pwdError} onRetry={loadPasswords} />
            ) : loading ? (
              <View style={styles.skel}><Skeleton height={190} /><Skeleton height={190} /></View>
            ) : filteredPwds.length === 0 ? (
              <ThemedText themeColor="textMuted" style={styles.empty}>No password entries found.</ThemedText>
            ) : (
              <Grid width={width}>
                {filteredPwds.map((p) => (
                  <PasswordCard
                    key={p.id}
                    entry={p}
                    revealed={revealedPwds[p.id]}
                    canManage={canManage(p)}
                    onReveal={() => reveal('pwd', p.id, revealedPwds[p.id])}
                    onCopy={copy}
                    onEdit={() => { setSaveError(null); setForm({ kind: 'pwd', editing: p }); }}
                    onDelete={() => deletePwd(p)}
                  />
                ))}
              </Grid>
            )}
          </>
        ) : cardError ? (
          <ErrorBanner message={cardError} onRetry={loadCards} />
        ) : loading ? (
          <View style={styles.skel}><Skeleton height={200} /><Skeleton height={200} /></View>
        ) : (
          <View style={styles.sections}>
            {cardSection('Credit Cards', '#334155', creditCards, 'No credit cards added.')}
            {cardSection('Debit Cards', '#0d9488', debitCards, 'No debit cards added.')}
          </View>
        )}
      </ScrollView>

      {toast ? (
        <View style={[styles.toast, { bottom: insets.bottom + 16, backgroundColor: toast.ok ? '#323232' : '#B83030' }]} pointerEvents="none">
          <ThemedText style={styles.toastText}>{toast.text}</ThemedText>
        </View>
      ) : null}

      {form?.kind === 'pwd' ? (
        <PasswordForm
          key={form.editing?.id ?? 'new-pwd'}
          editing={form.editing}
          saving={saving}
          error={saveError}
          onCancel={closeForm}
          onSubmit={(b) => savePwd(form.editing, b)}
        />
      ) : null}
      {form?.kind === 'card' ? (
        <CardFormView
          key={form.editing?.id ?? 'new-card'}
          editing={form.editing}
          saving={saving}
          error={saveError}
          onCancel={closeForm}
          onSubmit={(b) => saveCard(form.editing, b)}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  pad: { padding: 16 },
  content: { padding: 16, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 2 },
  track: { flexDirection: 'row', alignSelf: 'flex-start', padding: 4, gap: 4, borderRadius: Radii.sm },
  tabBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: Radii.sm - 2, borderWidth: 1, borderColor: 'transparent' },
  tabText: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  filters: { gap: 12 },
  filtersWide: { flexDirection: 'row', alignItems: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12 },
  searchWide: { flex: 1, maxWidth: 448 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  catWide: { minWidth: 200 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  skel: { gap: 16 },
  empty: { textAlign: 'center', paddingVertical: 64, fontSize: 14 },
  sections: { gap: 40 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 18, lineHeight: 28, fontFamily: FontWeights.semiBold },
  sectionCount: { fontSize: 14, lineHeight: 20 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  italic: { fontStyle: 'italic', fontSize: 14 },
  toast: { position: 'absolute', left: 16, right: 16, zIndex: 50, borderRadius: Radii.sm, padding: 12, alignItems: 'center' },
  toastText: { color: '#ffffff', fontSize: 14, lineHeight: 20 },
});
