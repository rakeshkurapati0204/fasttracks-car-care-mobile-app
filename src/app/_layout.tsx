import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BrandSplash } from '@/components/brand-splash';
import { MenuButton } from '@/components/menu-button';
import { PushShell } from '@/components/push-shell';
import { StallWatcher } from '@/components/stall-watcher';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { DrawerProvider } from '@/lib/drawer-context';
import { PermissionsProvider } from '@/lib/permissions-context';
import { topLevelAnimation } from '@/lib/side-nav';
import { startPostLoginTasks } from '@/lib/post-login-start';
import { launchedFromNotification, subscribeToNotificationTaps } from '@/lib/push-notifications';

SplashScreen.preventAutoHideAsync();

const FasttracksLightTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: Colors.light.primary,
    background: Colors.light.background,
    card: Colors.light.backgroundElement,
    text: Colors.light.text,
    border: Colors.light.border,
  },
};

const FasttracksDarkTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: Colors.dark.primary,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElement,
    text: Colors.dark.text,
    border: Colors.dark.border,
  },
};

function RootNavigator() {
  const { isReady, isAuthenticated, user } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Opened from a notification tap: straight to the screen that was asked for, no opening animation.
  // A font that fails to load must not leave the app on the splash screen for ever: the system font is used instead.
  const fontsReady = fontsLoaded || !!fontError;
  const [splashDone, setSplashDone] = useState(() => launchedFromNotification());
  const finishSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (isReady && fontsReady) SplashScreen.hideAsync();
  }, [isReady, fontsReady]);

  useEffect(() => {
    return subscribeToNotificationTaps();
  }, []);

  // After sign-in: register for notifications, then copy the phone's contacts (asks once, then looks for new contacts once a day). They start only when the screen
  // has been drawn and the opening animation is over, run one at a time so two dialogs are never on screen together, and stop when the person signs out.
  const userId = user?.id;
  const userRole = user?.role;
  useEffect(() => {
    if (!userId || !userRole || !splashDone) return;
    return startPostLoginTasks({ id: userId, role: userRole });
  }, [userId, userRole, splashDone]);

  if (!isReady || !fontsReady) return null;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* overflow hidden: whatever a screen draws while it transitions can never spill over the sidebar. */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
    <Stack screenOptions={{ animation: topLevelAnimation }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      {/* Forgot Password is public and not guarded either way, so it never blocks a signed-in user. */}
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
        {/* Tasks, Customers, and the "More" screens used to live inside the
            NativeTabs group as tabs (tasks/customers) or a "More" tab
            (more/*). Part 2 of the nav redesign drops them to 2 bottom tabs
            (Home, Calls) and moves every other module into the side menu —
            NativeTabs (SDK 57) only supports Triggers it renders as tab
            buttons, so screens that shouldn't show in the tab bar are pushed
            here, as siblings of the tab group in the root stack, same as
            `login`/`index` already are. Route paths (`/tasks`,
            `/customers`, `/more/...`) are unchanged, so every existing
            `Link`/`router.push` call — including push-notification deep
            links — still resolves. */}
        <Stack.Screen name="tasks" options={{ title: 'Tasks', headerLeft: () => <MenuButton /> }} />
        <Stack.Screen name="customers" options={{ headerShown: false }} />
        <Stack.Screen name="more" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
      </View>
      {splashDone ? null : <BrandSplash onDone={finishSplash} />}
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? FasttracksDarkTheme : FasttracksLightTheme}>
        <AuthProvider>
          <PermissionsProvider>
            <DrawerProvider>
              <StallWatcher />
              <PushShell>
                <RootNavigator />
              </PushShell>
            </DrawerProvider>
          </PermissionsProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
