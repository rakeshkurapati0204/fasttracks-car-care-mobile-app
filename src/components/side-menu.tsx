import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hasMenuIcon, MenuIcon } from '@/components/menu-icon';
import { ThemedText } from '@/components/themed-text';
import { SCREEN_REGISTRY, type ScreenMeta } from '@/constants/screen-registry';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { avatarColor } from '@/lib/call-format';
import { initials } from '@/lib/call-tracker-format';
import { DOCKED_WIDTH, useDrawer, useIsDocked } from '@/lib/drawer-context';
import { usePermissions } from '@/lib/permissions-context';

// Docked width lives in drawer-context (screens subtract it from their own width).
const OVERLAY_WIDTH = 256;

// Dashboard ROLE_LABELS.
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

// Dashboard navItems: the collapsible "Templates" group and the NEW badge.
const NAV_GROUP_OF: Record<string, string> = { competencies: 'templates', 'onboarding-templates': 'templates' };
const NAV_GROUP_LABELS: Record<string, string> = { templates: 'Templates' };
const NAV_BADGES: Record<string, string> = { 'new-entry': 'NEW' };

type NavNode = { type: 'item'; item: ScreenMeta } | { type: 'group'; key: string; label: string; items: ScreenMeta[] };

// Folds items sharing a group into one block at the position of the group's
// first member; everything else stays a top-level item (dashboard groupNavItems).
function groupNavItems(items: ScreenMeta[]): NavNode[] {
  const nodes: NavNode[] = [];
  const groups: Record<string, Extract<NavNode, { type: 'group' }>> = {};
  for (const item of items) {
    const key = NAV_GROUP_OF[item.id];
    if (!key) {
      nodes.push({ type: 'item', item });
      continue;
    }
    let node = groups[key];
    if (!node) {
      node = { type: 'group', key, label: NAV_GROUP_LABELS[key] ?? key, items: [] };
      groups[key] = node;
      nodes.push(node);
    }
    node.items.push(item);
  }
  return nodes;
}

const routeOf = (item: ScreenMeta) => item.route ?? `/more/${item.id}`;
const within = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');

// Dev-only guard: a registry entry with no icon in menu-icon.tsx would silently
// render a plain circle in the side menu. Surface it immediately.
if (__DEV__) {
  const missing = SCREEN_REGISTRY.filter((s) => !hasMenuIcon(s.id)).map((s) => s.id);
  if (missing.length > 0) {
    console.warn(
      `[side-menu] menu-icon.tsx has no icon for: ${missing.join(', ')} — these render as a plain circle. Add them to MENU_ICON_PATHS in src/components/menu-icon.tsx.`
    );
  }
}

// Module-level worklet helpers: they keep the shared-value writes out of the
// component body, where the React compiler lint rule rejects them.
function setProgress(p: SharedValue<number>, value: number) {
  'worklet';
  p.value = value;
}

function animateTo(p: SharedValue<number>, to: number, onDone?: () => void) {
  'worklet';
  p.value = withTiming(to, { duration: 240 }, (finished) => {
    'worklet';
    if (finished && onDone) runOnJS(onDone)();
  });
}

// The sidebar itself: solid panel, logo, search, nav, fixed user / theme / logout block.
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { hasAdsAccess, hasTab } = usePermissions();
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Role-gated entries by role; per-user-grant entries (requiresAccess) by the
  // backend's own access check, fail-closed until permissions have loaded.
  const items = useMemo(
    () => SCREEN_REGISTRY.filter((s) => {
      if (s.requiresAccess === 'ads') return hasAdsAccess;
      if (s.requiresAccess === 'settings_company') return ['OWNER', 'STORE_MANAGER'].includes(user?.role ?? '') || hasTab('settings_company');
      return !s.visibleToRoles || s.visibleToRoles.includes(user?.role ?? '');
    }),
    [hasAdsAccess, hasTab, user?.role],
  );

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((s) => s.title.toLowerCase().includes(q)) : items;
  // While searching, groups are skipped so a match is never hidden in a collapsed section.
  const nodes: NavNode[] = q ? filtered.map((item) => ({ type: 'item', item })) : groupNavItems(filtered);

  // The ONE item whose route is the longest match for the current path.
  const activeId = useMemo(() => {
    let best: { id: string; len: number } | null = null;
    for (const s of items) {
      const href = routeOf(s);
      if (within(pathname, href) && (!best || href.length > best.len)) best = { id: s.id, len: href.length };
    }
    return best?.id ?? null;
  }, [items, pathname]);

  const go = (item: ScreenMeta) => {
    onNavigate?.();
    router.push(routeOf(item) as never);
  };

  const renderItem = (item: ScreenMeta, indent = false) => {
    const active = item.id === activeId;
    const color = active ? theme.primary : theme.textSecondary;
    const badge = NAV_BADGES[item.id];
    return (
      <Pressable
        key={item.id}
        onPress={() => go(item)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [styles.row, indent && styles.indent, active && { backgroundColor: withAlpha(theme.primary, 0.12) }, pressed && !active && { backgroundColor: theme.background }]}>
        <MenuIcon id={item.id} color={color} size={20} />
        <ThemedText style={[styles.rowLabel, { color }]} numberOfLines={2}>{item.title}</ThemedText>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: 'rgba(104,15,26,0.15)' }]}>
            <ThemedText style={[styles.badgeText, { color: theme.primary }]}>{badge}</ThemedText>
          </View>
        ) : null}
      </Pressable>
    );
  };

  const name = user?.name || 'User';

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderRightColor: theme.border, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Logo */}
      <View style={[styles.logoRow, { borderBottomColor: theme.border }]}>
        <Image source={require('@/../assets/images/brand-logo-icon.png')} style={styles.logoIcon} contentFit="contain" />
        <Image source={require('@/../assets/images/brand-logo-wordmark.png')} style={styles.wordmark} contentFit="contain" contentPosition="left" />
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { borderBottomColor: theme.border }]}>
        <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="search" size={14} color={theme.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search tabs..."
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.searchInput, { color: theme.text }]}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close" size={14} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Navigation */}
      <ScrollView style={styles.nav} contentContainerStyle={styles.navContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {filtered.length === 0 ? (
          <ThemedText themeColor="textMuted" style={styles.noMatch}>No matches</ThemedText>
        ) : nodes.map((node) => {
          if (node.type === 'item') return renderItem(node.item);
          // Never hide where you currently are, even if the group was collapsed.
          const expanded = node.items.some((i) => i.id === activeId) || !collapsed[node.key];
          return (
            <View key={node.key} style={styles.group}>
              <Pressable
                onPress={() => setCollapsed((p) => ({ ...p, [node.key]: !p[node.key] }))}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.background }]}>
                <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} style={expanded ? styles.chevronOpen : undefined} />
                <ThemedText style={[styles.rowLabel, { color: theme.textSecondary }]}>{node.label}</ThemedText>
              </Pressable>
              {expanded ? node.items.map((item) => renderItem(item, true)) : null}
            </View>
          );
        })}
      </ScrollView>

      {/* Bottom section: fixed, never scrolls */}
      <View style={[styles.bottom, { borderTopColor: theme.border }]}>
        <View style={[styles.userCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.avatar, { backgroundColor: avatarColor(name) }]}>
            <ThemedText style={styles.avatarText}>{user ? initials(name) : 'U'}</ThemedText>
          </View>
          <View style={styles.userText}>
            <ThemedText style={styles.userName} numberOfLines={1}>{name}</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.userRole}>{user?.role ? (ROLE_LABELS[user.role] ?? user.role) : '—'}</ThemedText>
          </View>
        </View>

        {/* The app is light-only today (use-color-scheme.ts returns 'light' on purpose), so
            there is no theme to switch yet. The row is here to match the dashboard. */}
        <Pressable
          onPress={() => Alert.alert('Dark mode', "Dark mode isn't available in the app yet.")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.background }]}>
          <Ionicons name="moon-outline" size={20} color={theme.textSecondary} />
          <ThemedText style={[styles.rowLabel, { color: theme.textSecondary }]}>Dark Mode</ThemedText>
        </Pressable>

        <Pressable
          onPress={() => {
            onNavigate?.();
            signOut();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && { backgroundColor: withAlpha(theme.danger, 0.1) }]}>
          <MenuIcon id="sign-out" color={theme.danger} size={20} />
          <ThemedText style={[styles.rowLabel, { color: theme.danger }]}>Logout</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

// variant="docked": always-on sidebar for wide screens, laid out beside the
// content by the root layout. variant="overlay": the slide-in panel for
// everything narrower, mounted only while open or animating, so a closed
// menu can never sit over (or catch taps meant for) the screen.
export function SideMenu({ variant }: { variant: 'docked' | 'overlay' }) {
  const docked = useIsDocked();
  const { user } = useAuth();

  if (!user) return null;
  if (variant === 'docked') return docked ? <DockedSidebar /> : null;
  return docked ? null : <OverlaySidebar />;
}

function DockedSidebar() {
  return (
    <View style={{ width: DOCKED_WIDTH }}>
      <SidebarContent />
    </View>
  );
}

function OverlaySidebar() {
  const { isOpen, close } = useDrawer();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(OVERLAY_WIDTH, width * 0.85);
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(false);

  const onClosed = useCallback(() => setMounted(false), []);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount before animating in
      setMounted(true);
      animateTo(progress, 1);
    } else {
      Keyboard.dismiss();
      animateTo(progress, 0, onClosed);
    }
  }, [isOpen, progress, onClosed]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (progress.value - 1) * panelWidth }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const pan = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .onUpdate((e) => {
      if (e.translationX < 0) setProgress(progress, Math.max(0, 1 + e.translationX / panelWidth));
    })
    .onEnd((e) => {
      const shouldClose = e.translationX < -panelWidth / 3 || e.velocityX < -800;
      animateTo(progress, shouldClose ? 0 : 1);
      if (shouldClose) runOnJS(close)();
    });

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close menu" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.overlayPanel, { width: panelWidth }, panelStyle]}>
          <SidebarContent onNavigate={close} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayPanel: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  panel: { flex: 1, borderRightWidth: 1 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  logoIcon: { width: 32, height: 32 },
  wordmark: { flex: 1, height: 18, maxWidth: 140 },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  search: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderWidth: 1, borderRadius: Radii.sm },
  searchInput: { flex: 1, fontSize: 12, paddingVertical: 0 },
  nav: { flex: 1 },
  navContent: { paddingHorizontal: 12, paddingVertical: 16, gap: 4 },
  noMatch: { fontSize: 12, textAlign: 'center', paddingVertical: 16 },
  group: { gap: 4 },
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: Radii.sm },
  indent: { paddingLeft: 30 },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: FontWeights.medium },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold },
  bottom: { paddingHorizontal: 12, paddingVertical: 16, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: Radii.md },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, lineHeight: 16, fontFamily: FontWeights.bold },
  userText: { flex: 1, minWidth: 0 },
  userName: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  userRole: { fontSize: 12, lineHeight: 16 },
});
