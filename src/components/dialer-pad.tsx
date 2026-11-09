import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Vibration, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCallCapabilities } from '@/lib/api';
import { pastedMobile } from '@/lib/contacts';
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
  { digit: '0', letters: '+' },
  { digit: '#' },
];
const DISABLED_KEYS = ['*', '#'];

// Valid Indian mobile: 10 digits starting with 6-9.
const isValidMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);

function formatNumber(digits: string) {
  const spaced = digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
  return `+91 ${spaced}`.trimEnd();
}

// What the big number shows: grouped like the phone's own dialer (98480 12345). +91 is implied; it is added when the call is placed.
function spaced(digits: string) {
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
}

// Real calling: POST /calls/dial on the dashboard backend, which asks Exotel to ring the signed-in user's own phone first and then connect
// the typed number, recording the call. Rendered by the Dialer tab of the Calls screen (calls.tsx), which already enforces the role check.
export function DialerPad({ initialDigits = '' }: { initialDigits?: string } = {}) {
  const theme = useTheme();
  const [digits, setDigits] = useState(initialDigits.slice(0, MAX_DIGITS));
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

  const press = (d: string) => { setResult(null); setDigits((cur) => (cur.length < MAX_DIGITS ? cur + d : cur)); };
  const backspace = () => setDigits((cur) => cur.slice(0, -1));
  const clear = () => setDigits('');
  const paste = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      const d = pastedMobile(text);
      if (d) { setDigits(d); setResult(null); } else setResult({ ok: false, text: 'No mobile number in what you copied' });
    } catch { setResult({ ok: false, text: 'Could not read the clipboard.' }); }
  };
  const copy = async () => {
    try { await Clipboard.setStringAsync(`+91${digits}`); setResult({ ok: true, text: 'Copied' }); } catch { setResult({ ok: false, text: 'Could not copy.' }); }
  };

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
        native: dialerNative, autoOn, isPhoneApp, onBecamePhoneApp: () => setIsPhoneApp(true), confirm: false,
      });
      if (out.kind === 'placed') {
        pendingKey.current = null;
        setResult({ ok: true, text: out.autoAnswered ? 'Calling...' : 'Answer your phone to connect.' });
      } else if (out.kind === 'failed') {
        if (!out.keepKey) pendingKey.current = null;
        setResult({ ok: false, text: out.text });
      }
    } finally {
      setBusy(false);
    }
  };

  // One quiet line under the number, only when there is something to know: the call result, why the phone-app request failed, or a prompt to turn
  // on auto-answer. Nothing at all while the salesman is just typing - like the phone's own dialer.
  const invalid = complete && !valid;
  const statusLine = result ? (
    <ThemedText type="small" style={[styles.status, { color: result.ok ? theme.textSecondary : theme.danger }]} numberOfLines={2}>{result.text}</ThemedText>
  ) : invalid ? (
    <ThemedText type="small" style={[styles.status, { color: theme.danger }]}>Not a valid mobile number</ThemedText>
  ) : autoNote ? (
    <ThemedText type="small" style={[styles.status, { color: theme.danger }]} numberOfLines={2}>{autoNote}</ThemedText>
  ) : capsChecked && caps?.c2cAutoAnswerEnabled && dialerNative && !isPhoneApp && digits.length === 0 ? (
    <Pressable onPress={enableAuto} accessibilityRole="button" accessibilityLabel="Turn on auto-answer" hitSlop={Spacing.two}>
      <ThemedText type="small" style={[styles.status, { color: theme.primary }]}>Turn on auto-answer</ThemedText>
    </Pressable>
  ) : null;

  const [menuOpen, setMenuOpen] = useState(false);
  const tap = () => { if (Platform.OS === 'android') Vibration.vibrate(8); };

  return (
    <ThemedView style={styles.container}>
      <Pressable style={styles.inner} onPress={() => setMenuOpen(false)} accessible={false}>
        {/* Number. Long-press for Paste / Copy, like Android's own dialer. */}
        <View style={styles.display}>
          {menuOpen ? (
            <View style={[styles.menu, { backgroundColor: theme.text }]}>
              <Pressable onPress={() => { setMenuOpen(false); paste(); }} accessibilityRole="button" accessibilityLabel="Paste number" style={styles.menuItem}>
                <ThemedText type="smallBold" style={{ color: theme.background }}>Paste</ThemedText>
              </Pressable>
              {digits.length > 0 ? (
                <>
                  <View style={[styles.menuSep, { backgroundColor: theme.background }]} />
                  <Pressable onPress={() => { setMenuOpen(false); copy(); }} accessibilityRole="button" accessibilityLabel="Copy number" style={styles.menuItem}>
                    <ThemedText type="smallBold" style={{ color: theme.background }}>Copy</ThemedText>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
          <Pressable
            onLongPress={() => { tap(); setMenuOpen(true); }}
            onPress={() => setMenuOpen(false)}
            delayLongPress={350}
            accessibilityRole="text"
            accessibilityLabel={digits ? `Number ${formatNumber(digits)}. Long press to paste or copy.` : 'Long press to paste a number.'}
            accessibilityActions={[{ name: 'longpress', label: 'Paste or copy' }]}
            onAccessibilityAction={() => setMenuOpen(true)}
            style={styles.numberHit}>
            {digits.length > 0 ? (
              <ThemedText style={[styles.number, invalid && { color: theme.danger }]} numberOfLines={1} adjustsFontSizeToFit>
                {spaced(digits)}
              </ThemedText>
            ) : (
              <ThemedText style={[styles.number, { color: theme.textMuted }]}> </ThemedText>
            )}
          </Pressable>
          <View style={styles.statusSlot}>{statusLine}</View>
        </View>

        <View style={styles.pad}>
          {KEYS.map((k) => {
            const disabled = DISABLED_KEYS.includes(k.digit);
            return (
              <View key={k.digit} style={styles.cell}>
                <Pressable
                  disabled={disabled}
                  onPress={() => { tap(); setMenuOpen(false); press(k.digit); }}
                  accessibilityRole="button"
                  accessibilityLabel={k.digit}
                  android_ripple={{ color: theme.backgroundSelected, borderless: true, radius: KEY_SIZE / 2 }}
                  style={({ pressed }) => [styles.key, Platform.OS !== 'android' && pressed && { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText style={[styles.keyDigit, disabled && { color: theme.textMuted }]}>{k.digit}</ThemedText>
                  <ThemedText style={[styles.keyLetters, { color: theme.textSecondary }]}>{k.letters ?? ' '}</ThemedText>
                </Pressable>
              </View>
            );
          })}

          <View style={styles.cell} />
          <View style={styles.cell}>
            <Pressable
              onPress={call}
              disabled={!valid || busy}
              accessibilityRole="button"
              accessibilityLabel="Call"
              android_ripple={{ color: 'rgba(255,255,255,0.25)', borderless: true, radius: CALL_SIZE / 2 }}
              style={[styles.callBtn, { backgroundColor: theme.success }, (!valid || busy) && styles.callDisabled]}>
              {busy ? <ActivityIndicator color="#ffffff" /> : <Ionicons name="call" size={28} color="#ffffff" />}
            </Pressable>
          </View>
          <View style={styles.cell}>
            {digits.length > 0 ? (
              <Pressable
                onPress={() => { tap(); backspace(); }}
                onLongPress={() => { tap(); clear(); setResult(null); }}
                accessibilityRole="button"
                accessibilityLabel="Delete. Long press to clear."
                android_ripple={{ color: theme.backgroundSelected, borderless: true, radius: 28 }}
                hitSlop={Spacing.two}
                style={styles.backspace}>
                <Ionicons name="backspace-outline" size={28} color={theme.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
      <InCallModal state={voip.state} mock={!!voipEngine?.isMock} onHangup={voip.hangup} onMute={voip.mute} onSpeaker={voip.speaker} onClose={voip.dismiss} />
    </ThemedView>
  );
}

const KEY_SIZE = 72;
const CALL_SIZE = 64;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  inner: { flex: 1, width: '100%', maxWidth: Math.min(MaxContentWidth, 420), paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, justifyContent: 'flex-end' },
  display: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: Spacing.three },
  numberHit: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: Spacing.two },
  number: { fontSize: 38, lineHeight: 48, fontWeight: '400', letterSpacing: 1.5 },
  statusSlot: { minHeight: 20, alignItems: 'center', justifyContent: 'center' },
  status: { textAlign: 'center', paddingHorizontal: Spacing.three },
  menu: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, marginBottom: Spacing.one, overflow: 'hidden' },
  menuItem: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.two + Spacing.half },
  menuSep: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', opacity: 0.3 },
  pad: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.333%', height: KEY_SIZE + Spacing.two, alignItems: 'center', justifyContent: 'center' },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  keyDigit: { fontSize: 32, lineHeight: 38, fontWeight: '400' },
  keyLetters: { fontSize: 10, lineHeight: 12, letterSpacing: 1.5, fontWeight: '500' },
  callBtn: { width: CALL_SIZE, height: CALL_SIZE, borderRadius: CALL_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  callDisabled: { opacity: 0.4 },
  backspace: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
