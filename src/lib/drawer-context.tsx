import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { stallMonitor } from '@/lib/stall-monitor';

// Whether the slide-out menu is open. The menu is the only menu, at every window size (see push-shell.tsx).
interface DrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

/** Width available to a screen. There is no pinned sidebar, so this is the window width; layout breakpoints (columns, two-pane, stat grids) use it. */
export function useContentWidth() {
  return useWindowDimensions().width;
}

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo<DrawerContextValue>(
    () => ({
      isOpen,
      open: () => { stallMonitor.note('menu open'); setIsOpen(true); },
      close: () => { stallMonitor.note('menu close'); setIsOpen(false); },
      toggle: () => setIsOpen((v) => { stallMonitor.note(v ? 'menu close' : 'menu open'); return !v; }),
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
