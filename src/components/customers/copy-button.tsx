import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

// Dashboard CopyBtn: copies a value, shows a tick for a moment.
export function CopyButton({ value, label }: { value: string; label: string }) {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async () => {
    await Clipboard.setStringAsync(value);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Pressable onPress={copy} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}>
      <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={14} color={copied ? theme.success : theme.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { padding: 4 },
});
