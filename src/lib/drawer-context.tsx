import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

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
}

// The sidebar is fixed on the left from 600px up (phones narrower than that
// can't spare the width, so they get a slide-in version of the same sidebar).
export const DOCKED_MIN_WIDTH = 600;

/** True when the sidebar is docked beside the content instead of sliding in. */
export function useIsDocked() {
  return useWindowDimensions().width >= DOCKED_MIN_WIDTH;
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
  return width >= DOCKED_MIN_WIDTH ? width - fitWidth(ctx?.sidebarWidth ?? SIDEBAR_DEFAULT, width) : width;
}

const WIDTH_KEY = 'ft_sidebar_width';

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

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sidebarWidth, setWidth] = useState(SIDEBAR_DEFAULT);
  const lastExpanded = useRef(SIDEBAR_DEFAULT);

  useEffect(() => {
    let alive = true;
    loadWidth().then((w) => {
      if (!alive) return;
      if (w !== SIDEBAR_RAIL) lastExpanded.current = w;
      setWidth(w);
    });
    return () => { alive = false; };
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
    }),
    [isOpen, sidebarWidth, setSidebarWidth, toggleSidebar]
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used within a DrawerProvider');
  return ctx;
}
