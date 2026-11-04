import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCallCapabilities } from '@/lib/api';
import { dialBlockedReason, newDialKey, toE164India } from '@/lib/dial';
import { confirmCall, placeCall } from '@/lib/dial-flow';
import { InCallModal } from '@/components/call/in-call-modal';
import { getVoipEngine, voipApi, voipCcmApi } from '@/lib/voip';
import { useVoipCall } from '@/lib/voip/use-voip-call.ts';
import { enableAutoAnswer } from '@/lib/auto-answer/arm.ts';
import type { CallCapabilities } from '@/types/api';
import { FasttracksDialer } from '../../modules/fasttracks-dialer/src';

const MAX_DIGITS = 10;

const KEYS: { digit: string; letters?: string }[] = [
  { digit: '1' },
  { digit: '2', letters: 'ABC' },
  { digit: '3', letters: 'DEF' },
  { digit: '4', letters: 'GHI' },
  { digit: '5', letters: 'JKL' },
  { digit: '6', letters: 'MNO' },
  { digit: '7', letters: 'PQRS' },
  { digit: '8', letters: 'TUV' },
  { digit: '9', letters: 'WXYZ' },
  { digit: '*' },
  { digit: '0' },
  { digit: '#' },
];
const DISABLED_KEYS = ['*', '#'];

// Valid Indian mobile: 10 digits starting with 6-9.
const isValidMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

function formatNumber(digits: string) {
  const spaced = digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
  return `+91 ${spaced}`.trimEnd();
}

function helperText(digits: string) {
  if (digits.length === 0) return 'Enter a 10-digit mobile number';
  if (digits.length < MAX_DIGITS) {
    const left = MAX_DIGITS - digits.length;
    return `${left} more digit${left === 1 ? '' : 's'}`;
  }
  return isValidMobile(digits) ? 'Ready to call' : 'Not a valid mobile number';
}

// Real calling: POST /calls/dial on the dashboard backend, which asks Exotel to ring the signed-in user's own phone first and then connect
// the typed number, recording the call. Rendered by the Dialer tab of the Calls screen (calls.tsx), which already enforces the role check.
export function DialerPad() {
  const theme = useTheme();
  const [digits, setDigits] = useState('');
  const [caps, setCaps] = useState<CallCapabilities | null>(null);
  const [capsChecked, setCapsChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const voipEngine = getVoipEngine();
  const voip = useVoipCall(voipEngine, voipApi, caps?.voipCcmEnabled ? voipCcmApi : null);
  // Automatic answer of the Exotel call (company phones where Fasttracks is the phone app). Only when the backend says it is on AND this build has the module.
  const dialerNative = FasttracksDialer ?? null;
  const autoOn = !!caps?.c2cAutoAnswerEnabled && !!dialerNative;
  const [isPhoneApp, setIsPhoneApp] = useState(() => { try { return !!dialerNative?.isDefaultDialer(); } catch { return false; } });
  const [autoNote, setAutoNote] = useState<string | null>(null); // why the phone-app request failed; kept apart from `result` because placing a call clears that
  const pendingKey = useRef<string | null>(null); // kept after a network failure so a retry cannot place a second call

  useEffect(() => {
    fetchCallCapabilities()
      .then(setCaps)
      .catch(() => setCaps(null))
      .finally(() => setCapsChecked(true));
  }, []);

  useEffect(() => {
    if (!dialerNative) return;
    if (process.env.EXPO_PUBLIC_AUTOANSWER_LEARN === 'true') { try { dialerNative.setLearnMode(true); } catch { /* not a phone-app build */ } } // test aid: report the real caller ID, answer nothing
    // The call screen (customer, timer, Mute / Speaker / Hold / End) is the status once a call is running, so no event text is shown here. Only a screen the
    // salesman did not ask for is worth a line: learn mode reports the caller ID of the call it did not answer.
    const sub = dialerNative.addListener('onCallEvent', (e) => { if (e.type === 'learn') setResult({ ok: true, text: `Learn mode: the call that came in showed ${e.number ?? 'no number'}. It was NOT answered.` }); });
    return () => sub.remove();
  }, [dialerNative]);

  const enableAuto = async () => {
    let why = '';
    const r = await enableAutoAnswer(dialerNative, (m) => { why = m; });
    if (r === 'enabled') { setIsPhoneApp(true); setAutoNote(null); }
    else setAutoNote(r === 'declined' ? 'Auto-answer stays off: Fasttracks was not made the phone app.' : `Auto-answer is not available on this phone${why ? ` (${why})` : ''}.`);
  };

  const valid = isValidMobile(digits);
  const complete = digits.length === MAX_DIGITS;

  const press = (d: string) => setDigits((cur) => (cur.length < MAX_DIGITS ? cur + d : cur));
  const backspace = () => setDigits((cur) => cur.slice(0, -1));
  const clear = () => setDigits('');

  const call = async () => {
    const e164 = toE164India(digits);
    if (!e164 || busy) return;
    setResult(null);
    // In-app VoIP: the app dials Exotel and Exotel rings the CUSTOMER. Nobody calls the salesman. Only when the server says it is set up AND this build
    // has a VoIP engine; otherwise the click-to-call flow below is used, unchanged.
    if (voipEngine && caps?.voipEnabled) {
      if (await confirmCall(`Call ${formatNumber(digits)}?`, 'The call is made from this app (microphone and speaker). Your own phone will not ring. The call is recorded and charged.')) voip.start(digits);
      return;
    }
    const blocked = capsChecked ? dialBlockedReason(caps) : 'Still checking whether calling is available.';
    if (blocked) {
      setResult({ ok: false, text: blocked });
      return;
    }
    pendingKey.current ??= newDialKey();
    setBusy(true);
    try {
      const out = await placeCall({
        target: { phone: e164 }, display: formatNumber(digits), key: pendingKey.current,
        native: dialerNative, autoOn, isPhoneApp, onBecamePhoneApp: () => setIsPhoneApp(true),
      });
      if (out.kind === 'placed') {
        pendingKey.current = null;
        setResult({ ok: true, text: out.autoAnswered ? 'Connecting...' : 'Your phone will ring. Answer it to connect.' });
      } else if (out.kind === 'failed') {
        if (!out.keepKey) pendingKey.current = null;
        setResult({ ok: false, text: out.text });
      }
    } finally {
      setBusy(false);
    }
  };

  // One quiet line about automatic answer, and only when there is something to know or do: a tappable prompt until Fasttracks is the phone app, and a hint
  // when this build cannot do it at all. Nothing is shown once it is on.
  const autoStatus = !capsChecked || !caps?.c2cAutoAnswerEnabled ? null : !dialerNative ? (
    <ThemedText type="small" themeColor="textMuted">Auto-answer needs the dialer build of the app.</ThemedText>
  ) : !isPhoneApp ? (
    <Pressable onPress={enableAuto} accessibilityRole="button" accessibilityLabel="Turn on auto-answer" hitSlop={Spacing.two}>
      <ThemedText type="smallBold" style={{ color: theme.primary }}>Turn on auto-answer</ThemedText>
    </Pressable>
  ) : null;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.display}>
          <ThemedText
            style={[styles.number, digits.length === 0 && { color: theme.textMuted }]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {digits.length === 0 ? '+91' : formatNumber(digits)}
          </ThemedText>
          <ThemedText
            type="small"
            themeColor={complete && !valid ? undefined : 'textSecondary'}
            style={complete && !valid ? { color: theme.danger } : valid ? { color: theme.success } : undefined}>
            {helperText(digits)}
          </ThemedText>
          {autoStatus}
          {autoNote ? <ThemedText type="small" style={{ color: theme.danger }}>{autoNote}</ThemedText> : null}
          {result ? (
            <ThemedText type="small" style={[styles.result, { color: result.ok ? theme.success : theme.danger }]}>{result.text}</ThemedText>
          ) : null}
        </View>

        <View style={styles.pad}>
          {KEYS.map((k) => {
            const disabled = DISABLED_KEYS.includes(k.digit);
            return (
              <View key={k.digit} style={styles.cell}>
                <Pressable
                  disabled={disabled}
                  onPress={() => press(k.digit)}
                  accessibilityRole="button"
                  accessibilityLabel={k.digit}
                  style={({ pressed }) => [
                    styles.key,
                    { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
                    disabled && styles.disabled,
                  ]}>
                  <ThemedText style={styles.keyDigit}>{k.digit}</ThemedText>
                  {k.letters ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.keyLetters}>
                      {k.letters}
                    </ThemedText>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.pad}>
          <View style={styles.cell}>
            <Pressable
              onPress={clear}
              disabled={digits.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Clear"
              style={[styles.action, { backgroundColor: theme.backgroundElement }, digits.length === 0 && styles.disabled]}>
              <ThemedText type="smallBold">Clear</ThemedText>
            </Pressable>
          </View>
          <View style={styles.cell}>
            <Pressable
              onPress={call}
              disabled={!valid || busy}
              accessibilityRole="button"
              accessibilityLabel="Call"
              style={[styles.action, { backgroundColor: theme.success }, (!valid || busy) && styles.disabled]}>
              {busy ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.callLabel}>Call</ThemedText>}
            </Pressable>
          </View>
          <View style={styles.cell}>
            <Pressable
              onPress={backspace}
              onLongPress={clear}
              disabled={digits.length === 0}
              accessibilityRole="button"
              accessibilityLabel="Backspace"
              style={[styles.action, { backgroundColor: theme.backgroundElement }, digits.length === 0 && styles.disabled]}>
              <ThemedText style={styles.backspace}>⌫</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
      <InCallModal state={voip.state} mock={!!voipEngine?.isMock} onHangup={voip.hangup} onMute={voip.mute} onSpeaker={voip.speaker} onClose={voip.dismiss} />
    </ThemedView>
  );
}

const KEY_SIZE = 76;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  inner: { flex: 1, width: '100%', maxWidth: Math.min(MaxContentWidth, 420), padding: Spacing.three, justifyContent: 'center', gap: Spacing.three },
  display: { alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.three },
  number: { fontSize: 34, lineHeight: 44, fontWeight: '600', letterSpacing: 1 },
  pad: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.333%', alignItems: 'center', paddingVertical: Spacing.one + Spacing.half },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  keyDigit: { fontSize: 28, lineHeight: 32, fontWeight: '500' },
  keyLetters: { fontSize: 10, lineHeight: 12, letterSpacing: 1.5 },
  action: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  callLabel: { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  backspace: { fontSize: 26, lineHeight: 30 },
  disabled: { opacity: 0.35 },
  result: { textAlign: 'center', paddingHorizontal: Spacing.three },
});
