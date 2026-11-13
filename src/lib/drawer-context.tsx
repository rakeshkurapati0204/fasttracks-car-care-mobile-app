import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { isPinned, parseMenuStyle, type MenuStyle } from '@/lib/layout-mode';
import { fitWidth, parseSavedWidth, SIDEBAR_DEFAULT, SIDEBAR_RAIL, toggledWidth } from '@/lib/sidebar-width';

interface DrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Width of the docked sidebar: dragged by the person, remembered on the device. */
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
  /** Fold the sidebar into the icon-only rail, or open it back to the width it had. */
  toggleSidebar: () => void;
  /** Slide-out menu (the default, any window size) or a pinned sidebar (the person's choice, when the window has room). */
  menuStyle: MenuStyle;
  setMenuStyle: (style: MenuStyle) => void;
}

// Is the sidebar pinned beside the content, or a slide-out menu? The slide-out menu is the default at every size; the person can pin the sidebar when the window has room (layout-mode.ts).

// Development aid on the web: open the app with ?phone=1 and a wide browser window still gets the phone layout (push menu, no pinned sidebar), so the phone's
// menu can be tried without shrinking the window. ?phone=0 turns it off again. It is remembered for the tab, and does nothing in a release build.
const FORCE_PHONE_KEY = 'ft_force_phone';
const forcePhone = (() => {
  if (!__DEV__ || Platform.OS !== 'web') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('phone');
    if (q === '1') window.sessionStorage.setItem(FORCE_PHONE_KEY, '1');
    else if (q === '0') window.sessionStorage.removeItem(FORCE_PHONE_KEY);
    return window.sessionStorage.getItem(FORCE_PHONE_KEY) === '1';
  } catch {
    return false;
  }
})();

const pinnedAt = (width: number, style: MenuStyle) => !forcePhone && isPinned(width, style);

/** True when the sidebar is pinned beside the content instead of sliding out. Recomputed on every window change. */
export function useIsDocked() {
  const style = useContext(DrawerContext)?.menuStyle ?? 'slide';
  return pinnedAt(useWindowDimensions().width, style);
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

/**
 * Width available to a screen: the window minus the docked sidebar. Layout
 * breakpoints (columns, two-pane, stat grids) must use this, not the window
 * width, or a screen would think it has room the sidebar already took.
 */
export function useContentWidth() {
  const { width } = useWindowDimensions();
  const ctx = useContext(DrawerContext);
  return pinnedAt(width, ctx?.menuStyle ?? 'slide') ? width - fitWidth(ctx?.sidebarWidth ?? SIDEBAR_DEFAULT, width) : width;
}

const WIDTH_KEY = 'ft_sidebar_width';
const STYLE_KEY = 'ft_menu_style';

// Small preference, so the device's secure store on the phone and localStorage on the web. Any failure just means the default width next time.
async function loadWidth(): Promise<number> {
  try {
    const raw = Platform.OS === 'web' ? window.localStorage.getItem(WIDTH_KEY) : await SecureStore.getItemAsync(WIDTH_KEY);
    return parseSavedWidth(raw);
  } catch {
    return SIDEBAR_DEFAULT;
  }
}
async function saveWidth(w: number): Promise<void> {
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(WIDTH_KEY, String(w));
    else await SecureStore.setItemAsync(WIDTH_KEY, String(w));
  } catch {
    /* not saved: the next start uses the default width */
  }
}

async function loadStyle(): Promise<MenuStyle> {
  try {
    return parseMenuStyle(Platform.OS === 'web' ? window.localStorage.getItem(STYLE_KEY) : await SecureStore.getItemAsync(STYLE_KEY));
  } catch {
    return 'slide';
  }
}
async function saveStyle(style: MenuStyle): Promise<void> {
  try {
    if (Platform.OS === 'web') window.localStorage.setItem(STYLE_KEY, style);
    else await SecureStore.setItemAsync(STYLE_KEY, style);
  } catch {
    /* not saved: the next start uses the slide-out menu */
  }
}

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setStyle] = useState<MenuStyle>('slide');
  const [sidebarWidth, setWidth] = useState(SIDEBAR_DEFAULT);
  const lastExpanded = useRef(SIDEBAR_DEFAULT);

  useEffect(() => {
    let alive = true;
    loadWidth().then((w) => {
      if (!alive) return;
      if (w !== SIDEBAR_RAIL) lastExpanded.current = w;
      setWidth(w);
    });
    loadStyle().then((st) => { if (alive) setStyle(st); });
    return () => { alive = false; };
  }, []);

  const setMenuStyle = useCallback((st: MenuStyle) => {
    setStyle(st);
    void saveStyle(st);
  }, []);

  const setSidebarWidth = useCallback((w: number) => {
    if (w !== SIDEBAR_RAIL) lastExpanded.current = w;
    setWidth(w);
    void saveWidth(w);
  }, []);

  const toggleSidebar = useCallback(() => {
    setWidth((cur) => {
      const next = toggledWidth(cur, lastExpanded.current);
      if (cur !== SIDEBAR_RAIL) lastExpanded.current = cur;
      void saveWidth(next);
      return next;
    });
  }, []);

  const value = useMemo<DrawerContextValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
      sidebarWidth,
      setSidebarWidth,
      toggleSidebar,
      menuStyle,
      setMenuStyle,
    }),
    [isOpen, sidebarWidth, setSidebarWidth, toggleSidebar, menuStyle, setMenuStyle]
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used within a DrawerProvider');
  return ctx;
}
