import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { MenuIcon } from '@/components/menu-icon';
import { ThemedText } from '@/components/themed-text';
import type { ScreenMeta } from '@/constants/screen-registry';
import { FontWeights } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { avatarColor } from '@/lib/call-format';
import { initials } from '@/lib/call-tracker-format';
import { useDrawer } from '@/lib/drawer-context';
import { slideDistance } from '@/lib/layout-mode';
import { useMenuModel, type NavNode } from '@/lib/menu-model';
import { ROLE_LABELS } from '@/lib/labels';
import { stallMonitor } from '@/lib/stall-monitor';
import { follow, glide } from '@/lib/motion';

// The phone's menu. The screen you are on is a card that slides to the right and shrinks (rounded corners, a fainter card behind it for depth) and the
// menu sits behind it, full screen. Only the card moves; the menu is not an overlay on top of it. Tap the card, the X, swipe it left, or press Back to close.
// Wide screens keep the docked sidebar and this shell does nothing there.

const SHRINK = 0.22; // how much it shrinks
const OPEN_MS = 430;
const NAV_DELAY_MS = 90; // the menu starts closing, then the new screen is built
const CLOSE_MS = 360;
const RADIUS = 26;

const MAROON_TOP = '#7A1A2B';
const MAROON_MID = '#55101E';
const MAROON_BOTTOM = '#36090F';

export function PushShell({ children }: { children: ReactNode }) {
  const { isOpen, close } = useDrawer();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const slide = slideDistance(width); // from the window as it is now: right on a phone, a tablet or a wide desktop window
  const reduce = useReducedMotion();
  const progress = useSharedValue(0);
  const enabled = !!user;
  const open = enabled && isOpen;
  // The menu is only built the first time it is opened: a phone that never opens it pays nothing.
  const [built, setBuilt] = useState(false);

  useEffect(() => {
    if (open) setBuilt(true); // eslint-disable-line react-hooks/set-state-in-effect -- build the menu once, on the first open
    glide(progress, open ? 1 : 0, reduce ? 1 : open ? OPEN_MS : CLOSE_MS);
  }, [open, reduce, progress]);

  // Android's Back button closes the menu first instead of leaving the screen.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
  }, [open, close]);

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * slide }, { scale: 1 - SHRINK * progress.value }],
    borderRadius: RADIUS * progress.value,
  }));
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: progress.value * slide * 0.88 }, { scale: 1 - (SHRINK + 0.1) * progress.value }],
    borderRadius: RADIUS * progress.value,
  }));

  // While open, the card is covered by a layer that catches the tap (close) and a leftward drag (the card follows the finger, then settles).
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-24, 24])
    .onUpdate((e) => { if (e.translationX < 0) follow(progress, Math.max(0, 1 + e.translationX / slide)); })
    .onEnd((e) => {
      const shouldClose = e.translationX < -slide * 0.18 || e.velocityX < -600;
      glide(progress, shouldClose ? 0 : 1, CLOSE_MS);
      if (shouldClose) runOnJS(close)();
    });
  const tap = Gesture.Tap().onEnd(() => { runOnJS(close)(); });
  const gesture = Gesture.Race(pan, tap);

  return (
    <View style={styles.root}>
      {built && enabled ? (
        <View
          style={StyleSheet.absoluteFill}
          pointerEvents={open ? 'auto' : 'none'}
          accessibilityElementsHidden={!open}
          importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
          <PushMenu progress={progress} onClose={close} />
        </View>
      ) : null}
      {enabled ? <Animated.View pointerEvents="none" style={[styles.ghost, ghostStyle]} /> : null}
      <Animated.View style={[styles.page, pageStyle]}>
        {children}
        {open ? (
          <GestureDetector gesture={gesture}>
            <View style={StyleSheet.absoluteFill} accessible accessibilityRole="button" accessibilityLabel="Close menu" />
          </GestureDetector>
        ) : null}
      </Animated.View>
    </View>
  );
}

function PushMenu({ progress, onClose }: { progress: SharedValue<number>; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { nodes, activeId, go } = useMenuModel('', onClose, NAV_DELAY_MS);
  const showSpeedLog = () => {
    const text = stallMonitor.format();
    Alert.alert('Speed log', text, [
      { text: 'Copy', onPress: () => { void Clipboard.setStringAsync(text); } },
      { text: 'Clear', onPress: () => stallMonitor.clear() },
      { text: 'Close', style: 'cancel' },
    ]);
  };
  const name = user?.name || 'User';
  const role = user?.role ? (ROLE_LABELS[user.role] ?? user.role) : '';
  const row = (item: ScreenMeta, indent = false) => (
    <View key={item.id}>
      <Pressable
        onPress={() => go(item)}
        accessibilityRole="button"
        accessibilityState={{ selected: item.id === activeId }}
        style={({ pressed }) => [styles.row, indent && styles.indent, item.id === activeId && styles.rowActive, pressed && styles.rowPressed]}>
        <MenuIcon id={item.id} color="#ffffff" size={20} />
        <ThemedText style={styles.rowLabel} numberOfLines={2}>{item.title}</ThemedText>
      </Pressable>
    </View>
  );

  const renderNode = (node: NavNode) => {
    if (node.type === 'item') return row(node.item);
    return (
      <View key={node.key}>
        <ThemedText style={styles.groupLabel}>{node.label}</ThemedText>
        {node.items.map((i) => row(i, true))}
      </View>
    );
  };

  return (
    <View style={styles.menu}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="pushBg" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={MAROON_TOP} />
            <Stop offset="0.55" stopColor={MAROON_MID} />
            <Stop offset="1" stopColor={MAROON_BOTTOM} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#pushBg)" />
      </Svg>

      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        {/* Long press on the name: the speed log, a list of the moments the app was blocked and on which screen (for support). */}
        <Pressable style={styles.who} accessibilityLabel={`${name}, ${role}`} onLongPress={showSpeedLog}>
          <View style={[styles.avatar, { backgroundColor: avatarColor(name) }]}>
            <ThemedText style={styles.avatarText}>{user ? initials(name) : 'U'}</ThemedText>
          </View>
          <View style={styles.whoText}>
            <ThemedText style={styles.name} numberOfLines={1}>{name}</ThemedText>
            <ThemedText style={styles.roleText}>{role}</ThemedText>
          </View>
        </Pressable>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" hitSlop={8} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color="#ffffff" />
        </Pressable>
      </View>

      <PushList progress={progress}>
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {nodes.map(renderNode)}
        </ScrollView>
      </PushList>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable onPress={() => { onClose(); signOut(); }} accessibilityRole="button" accessibilityLabel="Logout" style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
          <MenuIcon id="sign-out" color="#ffffff" size={20} />
          <ThemedText style={styles.rowLabel}>Logout</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

// The whole list slides in from the left and fades up a little after the card starts moving. ONE animated view for the list, not one per row: with a style per row
// (and an SVG icon in each) every menu open left dozens of animated views whose native views were gone, and Reanimated threw for each of them on every draw (thousands of
// exceptions in a few seconds on a phone: the app froze). The list is a plain, static tree of rows.
function PushList({ progress, children }: { progress: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [0.18, 0.63], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ translateX: (1 - t) * -14 }] };
  });
  return <Animated.View style={[styles.listWrap, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MAROON_BOTTOM },
  menu: { flex: 1 },
  ghost: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', transformOrigin: 'left center' },
  page: { flex: 1, overflow: 'hidden', backgroundColor: '#f4f3f3', transformOrigin: 'left center' },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingBottom: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1 },
  whoText: { flexShrink: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#ffffff', fontSize: 14, lineHeight: 18, fontFamily: FontWeights.bold },
  name: { color: '#ffffff', fontSize: 15, lineHeight: 20, fontFamily: FontWeights.bold },
  roleText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 16 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  listWrap: { flex: 1 },
  list: { flex: 1, marginTop: 12 },
  listContent: { paddingHorizontal: 14, paddingBottom: 12, gap: 2 },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 10, borderRadius: 12 },
  rowActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  indent: { paddingLeft: 32 },
  rowLabel: { flex: 1, color: '#ffffff', fontSize: 15, lineHeight: 20, fontFamily: FontWeights.medium },
  groupLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 12, paddingBottom: 4, fontFamily: FontWeights.semiBold },
  bottom: { paddingHorizontal: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.18)' },
});
