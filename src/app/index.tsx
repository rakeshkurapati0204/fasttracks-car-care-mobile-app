import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth-context';

// Same as the dashboard: signed out → login; signed in → Overview (its /dashboard home), or the change-password
// screen first when the account must change its password (login/page.tsx: mustChangePassword ? '/change-password'
// : '/dashboard'). This is also where the stack lands right after a successful sign-in, and on app start with a
// stored token. Deep links and notification taps navigate straight to their own screen and never pass through here.
export default function Index() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Redirect href="/login" />;
  return <Redirect href={user?.mustChangePassword ? '/more/change-password' : '/more/overview'} />;
}
