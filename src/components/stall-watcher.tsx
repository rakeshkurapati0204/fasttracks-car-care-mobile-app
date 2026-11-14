import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { stallMonitor } from '@/lib/stall-monitor';

/** Runs the stall monitor for the life of the app and tells it which screen is open. Draws nothing. */
export function StallWatcher() {
  const pathname = usePathname();
  useEffect(() => { stallMonitor.setWhere(pathname || '/'); }, [pathname]);
  useEffect(() => {
    stallMonitor.start();
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') stallMonitor.resume(); });
    return () => { sub.remove(); stallMonitor.stop(); };
  }, []);
  return null;
}
