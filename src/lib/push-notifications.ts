import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { api } from '@/lib/api';

// Foreground notifications still show a banner/sound while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests permission (if needed) and registers this device's Expo push
 * token with the backend, scoped to the currently-authenticated user via
 * the JWT the `api` client already attaches. Safe to call on every
 * login/launch — the backend upserts on token, so re-registering just
 * bumps lastUsedAt.
 *
 * iOS note: this path builds correctly but token retrieval will fail/no-op
 * until Apple Developer enrollment unblocks APNs credentials — that's a
 * known, pre-existing project blocker, not a bug here.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    if (!Device.isDevice) {
      console.log('[Push] Skipping registration — not a physical/emulated device with push support.');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[Push] Permission not granted — skipping token registration.');
      return;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync();
    const token = tokenResponse.data;
    if (!token) return;

    await api.post('/push/register', { token, platform: Platform.OS });
    console.log('[Push] Registered device token with backend.');
  } catch (err) {
    // Push registration must never block login/launch.
    console.warn('[Push] registerForPushNotifications failed:', err);
  }
}

interface NotificationDeepLinkData {
  type?: 'task' | 'lead' | 'reminder';
  id?: string;
}

/** Deep-links a notification tap to the relevant screen. */
export function handleNotificationTap(data: NotificationDeepLinkData): void {
  if (!data?.type) return;
  switch (data.type) {
    case 'task':
      // Tasks moved off the bottom tab bar into the side menu (nav
      // redesign) and its route now lives outside the "(app)" tab group —
      // see src/app/_layout.tsx — so the path drops the group segment.
      router.push('/tasks' as never);
      break;
    case 'reminder':
      router.push('/more/reminders' as never);
      break;
    case 'lead':
      if (data.id) {
        router.push(`/(app)/conversations/${data.id}` as never);
      } else {
        router.push('/(app)/conversations');
      }
      break;
  }
}

/** Call once near the app root. Returns a cleanup function. */
export function subscribeToNotificationTaps(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as NotificationDeepLinkData;
    handleNotificationTap(data);
  });
  return () => sub.remove();
}

/** True when this launch came from tapping a notification: the person asked for a specific screen, so nothing (the opening animation) should stand in front of it. */
export function launchedFromNotification(): boolean {
  try {
    return Notifications.getLastNotificationResponse() != null;
  } catch {
    return false; // an older native build without the call: show the animation as usual
  }
}
