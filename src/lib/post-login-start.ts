// Starts the after-sign-in chores (post-login.ts) at a good moment and returns a function that cancels them.
import { AppState, InteractionManager } from 'react-native';

import { runContactSync } from '@/lib/contact-sync-runner';
import { runInOrder } from '@/lib/post-login';
import { registerForPushNotifications } from '@/lib/push-notifications';

// After the screen is drawn and touches are idle, wait a moment more: the person's first look at their screen is never shared with a dialog.
const SETTLE_MS = 1500;

export function startPostLoginTasks(user: { id: string; role: string }): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const interaction = InteractionManager.runAfterInteractions(() => {
    timer = setTimeout(() => {
      void runInOrder([() => registerForPushNotifications(), () => runContactSync(user)], () => cancelled);
    }, SETTLE_MS);
  });

  // Coming back to the app later: look for new contacts (at most every few minutes, see contact-sync-runner.ts).
  const sub = AppState.addEventListener('change', (state) => { if (state === 'active' && !cancelled) void runContactSync(user); });

  return () => {
    cancelled = true;
    interaction.cancel();
    if (timer) clearTimeout(timer);
    sub.remove();
  };
}
