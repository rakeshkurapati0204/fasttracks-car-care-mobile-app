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
import { AppState, View } from 'react-native';

import { useColorScheme } from '@/hooks/use-color-scheme';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BrandSplash } from '@/components/brand-splash';
import { MenuButton } from '@/components/menu-button';
import { SideMenu } from '@/components/side-menu';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { DrawerProvider, useIsDocked } from '@/lib/drawer-context';
import { PermissionsProvider } from '@/lib/permissions-context';
import { runContactSync } from '@/lib/contact-sync-runner';
import { stackAnimation } from '@/lib/side-nav';
import { subscribeToNotificationTaps } from '@/lib/push-notifications';

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
  const docked = useIsDocked();
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (isReady && fontsLoaded) SplashScreen.hideAsync();
  }, [isReady, fontsLoaded]);

  useEffect(() => {
    return subscribeToNotificationTaps();
  }, []);

  // Copies the phone's contacts into the app after login (asks once), then again whenever the app is opened (at most every 10 minutes), so a
  // contact saved in the phone's own app reaches Fasttracks soon. See contact-sync-runner.ts.
  useEffect(() => {
    if (!user) return;
    void runContactSync(user);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') void runContactSync(user); });
    return () => sub.remove();
  }, [user]);

  if (!isReady || !fontsLoaded) return null;

  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {/* Wide screens: the sidebar is docked on the left and the screens sit to its right. */}
      {isAuthenticated && docked ? <SideMenu variant="docked" /> : null}
      {/* overflow hidden: whatever a screen draws while it transitions can never spill over the sidebar. */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
    <Stack screenOptions={{ animation: stackAnimation(docked) }}>
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
              <RootNavigator />
              <SideMenu variant="overlay" />
            </DrawerProvider>
          </PermissionsProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
