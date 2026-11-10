import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { changeMyPassword, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { tokenStorage } from '@/lib/token-storage';

// Mirrors backend/src/routes/auth.ts POST /auth/change-password exactly —
// same two validation rules and error copy, so a rejection reads the same
// as it does on the dashboard's /change-password page.
export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const { user, markPasswordChanged } = useAuth();
  // Forced change after sign-in (mustChangePassword): finish by going to Overview, like the dashboard.
  const [forced] = useState(() => !!user?.mustChangePassword);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!currentPassword || !newPassword) {
      setError('Current password and new password are required.');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      const token = await changeMyPassword(currentPassword, newPassword);
      await tokenStorage.set(token);
      markPasswordChanged();
      setDone(true);
    } catch (err: any) {
      setError(getErrorMessage(err, 'Could not change your password.'));
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <>
        <Stack.Screen options={{ title: 'Change Password' }} />
        <ScrollView contentContainerStyle={[styles.content, styles.center, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ThemedText type="smallBold">Password changed successfully.</ThemedText>
          <Pressable onPress={() => (forced ? router.replace('/more/overview' as never) : router.back())} style={[styles.button, { backgroundColor: theme.primary }]}>
            <ThemedText style={styles.buttonLabel}>Done</ThemedText>
          </Pressable>
        </ScrollView>
      </>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex1} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top}>
      <Stack.Screen options={{ title: 'Change Password' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.three }]}>
        <TextInput
          value={currentPassword}
          onChangeText={setCurrentPassword}
          placeholder="Current password *"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        />
        <TextInput
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="New password (min. 6 characters) *"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        />
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Confirm new password *"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        />
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        <Pressable onPress={handleSubmit} disabled={saving} style={[styles.button, { backgroundColor: theme.primary, opacity: saving ? 0.7 : 1 }]}>
          {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonLabel}>Change Password</ThemedText>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  input: { height: 46, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 15, borderWidth: 1 },
  button: { height: 46, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { color: '#ffffff', fontWeight: '600' },
  error: { color: '#B83030' },
});
