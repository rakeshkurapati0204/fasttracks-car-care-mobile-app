import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { createPoller } from '@/lib/polling';

/**
 * Runs `task` every `intervalMs` while - and only while - the screen is showing AND the app is in the foreground; never overlapping itself, backing off after
 * failures (lib/polling.ts). Coming back to the screen or to the app refreshes straight away. The first start does not run at once: the screen already loads
 * its data when it opens. `task` can change on every render; the latest one is always used.
 */
export function usePolling(task: () => Promise<unknown> | unknown, intervalMs: number, enabled = true): void {
  const latest = useRef(task);
  useEffect(() => { latest.current = task; });

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      const poller = createPoller(() => latest.current(), intervalMs);
      let firstStart = true;
      const begin = () => { poller.start(!firstStart); firstStart = false; };
      if (AppState.currentState === 'active') begin();
      const sub = AppState.addEventListener('change', (state) => { if (state === 'active') begin(); else poller.stop(); });
      return () => { sub.remove(); poller.stop(); };
    }, [enabled, intervalMs]),
  );
}
