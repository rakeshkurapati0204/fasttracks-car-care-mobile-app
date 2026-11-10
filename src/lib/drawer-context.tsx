import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';

interface DrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

// The sidebar is fixed on the left from 600px up (phones narrower than that
// can't spare the width, so they get a slide-in version of the same sidebar).
export const DOCKED_MIN_WIDTH = 600;
export const DOCKED_WIDTH = 224;

/** True when the sidebar is docked beside the content instead of sliding in. */
export function useIsDocked() {
  return useWindowDimensions().width >= DOCKED_MIN_WIDTH;
}

/**
 * Width available to a screen: the window minus the docked sidebar. Layout
 * breakpoints (columns, two-pane, stat grids) must use this, not the window
 * width, or a screen would think it has room the sidebar already took.
 */
export function useContentWidth() {
  const { width } = useWindowDimensions();
  return width >= DOCKED_MIN_WIDTH ? width - DOCKED_WIDTH : width;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo<DrawerContextValue>(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
      toggle: () => setIsOpen((v) => !v),
    }),
    [isOpen]
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer must be used within a DrawerProvider');
  return ctx;
}
