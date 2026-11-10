import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, TextInput, View, type LayoutChangeEvent, type TextInputProps } from 'react-native';

import { FontWeights } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = Omit<TextInputProps, 'style' | 'placeholder'> & {
  label: string;
  /** Red border (the dashboard marks an empty username after a failed submit). */
  invalid?: boolean;
  /** Adds the show / hide eye button on the right (password field). */
  revealable?: boolean;
  onFieldLayout?: (e: LayoutChangeEvent) => void;
  inputRef?: React.Ref<TextInput>;
};

// Dashboard login input (.input-base pt-5 pb-2 peer): surface fill, 1px border, 8px radius, label that sits in the
// field and floats to the top (smaller) on focus or when there is text, primary border + 3px 15% ring on focus.
export function FloatingField({ label, invalid, revealable, value, onFocus, onBlur, onFieldLayout, inputRef, ...props }: Props) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [show, setShow] = useState(false);
  const floated = focused || !!value;
  const [anim] = useState(() => new Animated.Value(floated ? 1 : 0));

  useEffect(() => {
    Animated.timing(anim, { toValue: floated ? 1 : 0, duration: 200, useNativeDriver: false }).start();
  }, [floated, anim]);

  const borderColor = invalid ? theme.danger : focused ? theme.primary : theme.border;
  return (
    <View onLayout={onFieldLayout} style={[styles.ring, { borderColor: focused ? `${theme.primary}26` : 'transparent' }]}>
      <View style={[styles.box, { backgroundColor: theme.surface, borderColor }]}>
        <TextInput
          ref={inputRef}
          value={value}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          secureTextEntry={revealable ? !show : props.secureTextEntry}
          placeholder=""
          style={[styles.input, { color: theme.text }, revealable && { paddingRight: 44 }]}
          {...props}
        />
        <Animated.Text
          pointerEvents="none"
          style={[
            styles.label,
            {
              color: theme.textMuted,
              top: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 6] }),
              fontSize: anim.interpolate({ inputRange: [0, 1], outputRange: [14, 12] }),
            },
          ]}>
          {label}
        </Animated.Text>
        {revealable ? (
          <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.eye}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 3, borderRadius: 11, margin: -3 },
  box: { borderWidth: 1, borderRadius: 8, height: 50, justifyContent: 'flex-end' },
  input: { flex: 1, paddingTop: 20, paddingBottom: 6, paddingHorizontal: 13, fontSize: 14, fontFamily: FontWeights.regular },
  label: { position: 'absolute', left: 14, fontFamily: FontWeights.regular },
  eye: { position: 'absolute', right: 11, top: 13, padding: 0 },
});
