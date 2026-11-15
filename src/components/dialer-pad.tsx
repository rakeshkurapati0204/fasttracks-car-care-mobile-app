import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';

import { stallMonitor } from '@/lib/stall-monitor';
import { EnableFade, MotionPressable, NumberMotion, PresenceScale, usePadIntro } from '@/components/dialer-motion';
import { InCallModal } from '@/components/call/in-call-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { matchDialContacts, type DialContact } from '@/lib/contacts';
import { loadDialContacts } from '@/lib/dial-contacts';
import { dialBlockedReason, newDialKey, toE164India } from '@/lib/dial';
import { askForPhoneAppRole, confirmCall, placeCall, warmAutoAnswerHint } from '@/lib/dial-flow';
import { ensurePhoneApp, PHONE_APP_REQUIRED_TEXT } from '@/lib/auto-answer/arm.ts';
import { getCallCapabilities, peekCallCapabilities } from '@/lib/call-caps';
import { deleteBack, digitsFromClipboard, displayNumber, insertDigit, MAX_DIGITS, spaced, startPlus, type DialInput } from '@/lib/dial-input.ts';
import { getVoipEngine, voipApi, voipCcmApi } from '@/lib/voip';
import { useVoipCall } from '@/lib/voip/use-voip-call.ts';
import type { CallCapabilities } from '@/types/api';
import { FasttracksDialer } from '../../modules/fasttracks-dialer/src';

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
// `*` and `#` make their key sound but add nothing: a mobile number has neither, and the call service cannot dial them.
const CALL_COOLDOWN_MS = 3000; // after a call ends, Call does nothing for this long (a second tap placed a second call)
const CALL_LIVE_MAX_MS = 10 * 60 * 1000; // a missed 'ended' event must not block Calling for ever
const SOUND_ONLY_KEYS = ['*', '#'];

// Valid Indian mobile: 10 digits starting with 6-9.
const isValidMobile = (digits: string) => /^[6-9]\d{9}$/.test(digits);
const formatNumber = (digits: string) => `+91 ${spaced(digits)}`.trimEnd();

// Real calling: POST /calls/dial on the dashboard backend, which asks Exotel to ring the signed-in user's own phone first and then connect
// the typed number, recording the call. Rendered by the Dialer tab of the Calls screen (calls.tsx), which already enforces the role check.
// Looks and behaves like the phone's own dialer: a real cursor in the number (tap to move it, Delete works there), Android's long-press menu for
// Paste / Copy, no on-screen keyboard (the keypad is the keyboard), and "Add to contacts" once a full number is typed.
export function DialerPad({ initialDigits = '', onAddContact, onLeave }: { initialDigits?: string; onAddContact?: (digits: string) => void; onLeave?: (digits: string) => void } = {}) {
  const theme = useTheme();
  const intro = usePadIntro();
  const first = initialDigits.replace(/\D/g, '').slice(0, MAX_DIGITS);
  const [input, setInput] = useState<DialInput>({ digits: first, start: first.length, end: first.length });
  const digits = input.digits;
  const [caps, setCaps] = useState<CallCapabilities | null>(() => peekCallCapabilities());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const voipEngine = getVoipEngine();
  const voip = useVoipCall(voipEngine, voipApi, caps?.voipCcmEnabled ? voipCcmApi : null);
  // Automatic answer of the Exotel call (company phones where Fasttracks is the phone app). Only when the backend says it is on AND this build has the module.
  // It is offered once, when the salesman first presses Call (dial-flow.ts); the dial pad itself shows no auto-answer text.
  const dialerNative = FasttracksDialer ?? null;
  const [isPhoneApp, setIsPhoneApp] = useState(() => { try { return !!dialerNative?.isDefaultDialer(); } catch { return false; } });
  const pendingKey = useRef<string | null>(null); // kept after a network failure so a retry cannot place a second call
  const inFlight = useRef(false); // set synchronously: a fast double tap on Call cannot start two calls
  // The parent is told what was typed only when the pad goes away (another tab), not on every key: a parent that re-renders on each digit re-renders the whole
  // Calls screen (header included) while the person is typing.
  const typedRef = useRef(first);
  useEffect(() => { typedRef.current = input.digits; }, [input.digits]);
  useEffect(() => () => onLeave?.(typedRef.current), [onLeave]);

  useEffect(() => {
    getCallCapabilities()
      .then(setCaps)
      .catch(() => setCaps(null));
  }, []);

  // A new phone: ask for the phone-app role as soon as the dial pad is open (once a day at most), so pressing Call never waits for that question.
  const autoOn = !!caps?.c2cAutoAnswerEnabled && !!dialerNative;
  useEffect(() => { if (autoOn) void warmAutoAnswerHint(); }, [autoOn]); // so the first Call can arm before it sends
  useEffect(() => {
    if (!autoOn) return;
    let alive = true;
    askForPhoneAppRole(dialerNative, autoOn, isPhoneApp).then((became) => { if (alive && became) setIsPhoneApp(true); });
    return () => { alive = false; };
  }, [autoOn, dialerNative, isPhoneApp]);

  useEffect(() => {
    if (!dialerNative) return;
    if (process.env.EXPO_PUBLIC_AUTOANSWER_LEARN === 'true') { try { dialerNative.setLearnMode(true); } catch { /* not a phone-app build */ } } // test aid: report the real caller ID, answer nothing
    const sub = dialerNative.addListener('onCallEvent', (e) => {
      if (e.type === 'ended') callEndedAt.current = Date.now();
      else if (e.type !== 'learn') callLiveSince.current = Date.now();
      if (e.type === 'ended') callLiveSince.current = 0;
      if (e.type === 'learn') setResult({ ok: true, text: `Learn mode: the call that came in showed ${e.number ?? 'no number'}. It was NOT answered.` });
      else if (e.type === 'ended') setResult((r) => (r?.ok ? null : r)); // the call is over: "Calling..." must not stay on screen
    });
    return () => sub.remove();
  }, [dialerNative]);

  // "Calling..." / "Answer your phone" only describe the moment the call is placed. They go away when the salesman comes back to the app after the
  // call (phones where Fasttracks is not the phone app send no "ended" event), and on their own after 30 s. Errors stay until the next key press.
  useEffect(() => {
    if (!result?.ok) return;
    const t = setTimeout(() => setResult(null), 30_000);
    let wasAway = false;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') wasAway = true;
      else if (wasAway) setResult(null);
    });
    return () => { clearTimeout(t); sub.remove(); };
  }, [result]);

  // Names while typing (phone book + app contacts), re-read whenever the app comes back to the front so a contact saved in the phone's own app
  // a moment ago is found at once.
  const [book, setBook] = useState<DialContact[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => { loadDialContacts().then((l) => { if (alive) setBook(l); }); };
    load();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') load(); });
    return () => { alive = false; sub.remove(); };
  }, []);
  const match = useMemo(() => matchDialContacts(book, input.digits), [book, input.digits]);

  const turnOnAutoAnswer = async () => { if (await askForPhoneAppRole(dialerNative, true, false, true)) setIsPhoneApp(true); };
  const valid = isValidMobile(digits);
  const invalid = digits.length === MAX_DIGITS && !valid;
  const tap = () => { if (Platform.OS === 'android') Vibration.vibrate(8); };
  const keyTone = (key: string) => { try { dialerNative?.playKeyTone?.(key); } catch { /* no sound is better than a failed key press */ } };
  const edit = (next: DialInput) => { stallMonitor.note(`dial ${next.digits.length} digits`); setResult(null); setInput(next); };
  // The system keyboard never opens here, so the phone's own Paste/Copy popup is unreliable on a few phones: these two buttons always work.
  const pasteNumber = async () => {
    tap();
    const text = await Clipboard.getStringAsync().catch(() => '');
    const d = digitsFromClipboard(text);
    if (d) edit({ digits: d, start: d.length, end: d.length });
    else setResult({ ok: false, text: 'There is no number to paste.' });
  };
  const copyNumber = async () => {
    tap();
    await Clipboard.setStringAsync(digits).catch(() => {});
    setResult({ ok: true, text: 'Number copied.' });
  };

  // A second Call right after a call ended, or while one is on, placed a SECOND call (a second ring on the phone). Ignored: the first call's own screen is the way to end it.
  const callLiveSince = useRef(0);
  const callEndedAt = useRef(0);
  const call = async () => {
    const e164 = toE164India(digits);
    if (!e164 || inFlight.current) return;
    const now = Date.now();
    if (callLiveSince.current > 0 && now - callLiveSince.current < CALL_LIVE_MAX_MS) { setResult({ ok: false, text: 'A call is already in progress.' }); return; }
    if (now - callEndedAt.current < CALL_COOLDOWN_MS) return;
    inFlight.current = true;
    setResult(null);
    setBusy(true);
    try {
      // The capabilities may still be loading, or have failed while offline: ask again now instead of refusing the call.
      let c = caps;
      if (!c) {
        c = await getCallCapabilities().catch(() => null);
        if (c) setCaps(c);
      }
      // In-app VoIP: the app dials Exotel and Exotel rings the CUSTOMER. Nobody calls the salesman. Only when the server says it is set up AND this build
      // has a VoIP engine; otherwise the click-to-call flow below is used, unchanged.
      if (voipEngine && c?.voipEnabled) {
        if (await confirmCall(`Call ${formatNumber(digits)}?`, 'The call is made from this app (microphone and speaker). Your own phone will not ring. The call is recorded and charged.')) voip.start(digits);
        return;
      }
      const blocked = dialBlockedReason(c);
      if (blocked) {
        setResult({ ok: false, text: blocked });
        return;
      }
      // With instant calling on, a call goes only from a phone where Fasttracks is the phone app (Exotel's callback must be answered by it). The role dialog is shown on
      // every press until it is granted.
      const autoNow = !!c?.c2cAutoAnswerEnabled && !!dialerNative;
      let phoneApp = isPhoneApp;
      if (autoNow && !phoneApp) {
        if ((await ensurePhoneApp(dialerNative, true, false)) === 'declined') { setResult({ ok: false, text: PHONE_APP_REQUIRED_TEXT }); return; }
        try { phoneApp = !!dialerNative?.isDefaultDialer(); } catch { phoneApp = false; }
        setIsPhoneApp(phoneApp);
      }
      pendingKey.current ??= newDialKey();
      const out = await placeCall({
        target: { phone: e164 }, display: formatNumber(digits), key: pendingKey.current,
        native: dialerNative, autoOn: autoNow, isPhoneApp: phoneApp, confirm: false,
      });
      if (out.kind === 'placed') {
        pendingKey.current = null;
        setResult({ ok: true, text: out.autoAnswered ? 'Calling...' : 'Answer your phone to connect.' });
      } else if (out.kind === 'failed') {
        if (!out.keepKey) pendingKey.current = null;
        setResult({ ok: false, text: out.text });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const len = digits.length;
  const statusKind = result ? `r${result.ok}${result.text}` : invalid ? 'invalid' : match.exact ? `e${match.exact.name}` : match.suggestions.length > 0 ? `s${match.suggestions[0].name}` : valid && onAddContact ? 'add' : 'none';
  const statusLine = result ? (
    <ThemedText type="small" style={[styles.status, { color: result.ok ? theme.textSecondary : theme.danger }]} numberOfLines={2}>{result.text}</ThemedText>
  ) : invalid ? (
    <ThemedText type="small" style={[styles.status, { color: theme.danger }]}>Not a valid mobile number</ThemedText>
  ) : match.exact ? (
    <ThemedText style={[styles.status, styles.exactName]} numberOfLines={1}>{match.exact.name}</ThemedText>
  ) : match.suggestions.length > 0 ? (
    <Pressable
      onPress={() => { tap(); const p = match.suggestions[0].phone; edit({ digits: p, start: p.length, end: p.length }); }}
      accessibilityRole="button"
      accessibilityLabel={`Use ${match.suggestions[0].name}`}
      hitSlop={Spacing.two}
      style={styles.suggestion}>
      <ThemedText type="smallBold" numberOfLines={1} style={styles.suggestionName}>{match.suggestions[0].name}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{spaced(match.suggestions[0].phone)}</ThemedText>
      {match.suggestions.length > 1 ? <ThemedText type="small" themeColor="textMuted">{`+${match.suggestions.length - 1}`}</ThemedText> : null}
    </Pressable>
  ) : valid && onAddContact ? (
    <Pressable onPress={() => onAddContact(digits)} accessibilityRole="button" accessibilityLabel="Add to contacts" hitSlop={Spacing.two}>
      <ThemedText type="smallBold" style={[styles.status, { color: theme.primary }]}>Add to contacts</ThemedText>
    </Pressable>
  ) : null;

  return (
    <ThemedView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.display}>
          <NumberMotion shake={invalid} token={digits}>
          {/* The number is drawn, not typed into: the keypad is the only input. A native text field here brought Android's own editing layer with it
              (focus, caret, selection handles and the floating Paste/Select toolbar), which opened over the pad while typing. Paste is the Paste button. */}
          <Text
            accessibilityRole="text"
            accessibilityLabel={digits || input.plus ? `Phone number ${displayNumber(input)}` : 'Phone number, empty'}
            numberOfLines={1}
            style={[styles.number, { color: invalid ? theme.danger : theme.text }]}>
            {displayNumber(input)}
          </Text>
          </NumberMotion>
          <Pressable
            onPress={digits.length > 0 ? copyNumber : pasteNumber}
            accessibilityRole="button"
            accessibilityLabel={digits.length > 0 ? 'Copy number' : 'Paste number'}
            hitSlop={Spacing.two}
            style={styles.clipboard}>
            <Ionicons name={digits.length > 0 ? 'copy-outline' : 'clipboard-outline'} size={16} color={theme.primary} />
            <ThemedText type="small" style={{ color: theme.primary }}>{digits.length > 0 ? 'Copy' : 'Paste'}</ThemedText>
          </Pressable>
          {autoOn && !isPhoneApp ? (
            <Pressable onPress={turnOnAutoAnswer} accessibilityRole="button" accessibilityLabel="Enable instant calling" hitSlop={Spacing.two} style={styles.setupLink}>
              <ThemedText type="small" style={{ color: theme.primary }}>Enable instant calling</ThemedText>
            </Pressable>
          ) : null}
          <View style={styles.statusSlot}>
            {statusLine ? <Animated.View key={statusKind} entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)}>{statusLine}</Animated.View> : null}
          </View>
        </View>

        <View style={styles.pad}>
          {KEYS.map((k, i) => {
            const soundOnly = SOUND_ONLY_KEYS.includes(k.digit);
            return (
              <Animated.View key={k.digit} entering={intro ? FadeInDown.delay(40 + i * 30).duration(280) : undefined} style={styles.cell}>
                <MotionPressable
                  onPress={() => { tap(); keyTone(k.digit); if (!soundOnly) edit(insertDigit(input, k.digit)); }}
                  onLongPress={k.digit === '0' ? () => { tap(); edit(startPlus(input)); } : undefined}
                  accessibilityLabel={k.digit}
                  glowColor={theme.backgroundSelected}
                  style={styles.key}>
                  <ThemedText style={[styles.keyDigit, soundOnly && { color: theme.textMuted }]}>{k.digit}</ThemedText>
                  <ThemedText style={[styles.keyLetters, { color: theme.textSecondary }]}>{k.letters ?? ' '}</ThemedText>
                </MotionPressable>
              </Animated.View>
            );
          })}

          <View style={styles.cell} />
          <Animated.View entering={intro ? FadeInDown.delay(40 + 12 * 30).duration(320) : undefined} style={styles.cell}>
            <EnableFade enabled={valid && !busy}>
              <MotionPressable
                onPress={call}
                disabled={!valid || busy}
                accessibilityLabel="Call"
                glowColor="rgba(255,255,255,0.28)"
                scaleTo={0.9}
                style={[styles.callBtn, { backgroundColor: theme.success }]}>
                {busy ? <Animated.View entering={FadeIn.duration(150)}><ActivityIndicator color="#ffffff" /></Animated.View> : <Ionicons name="call" size={28} color="#ffffff" />}
              </MotionPressable>
            </EnableFade>
          </Animated.View>
          <View style={styles.cell}>
            <PresenceScale show={len > 0}>
              <MotionPressable
                onPress={() => { tap(); edit(deleteBack(input)); }}
                onLongPress={() => { tap(); edit({ digits: '', start: 0, end: 0 }); }}
                accessibilityLabel="Delete. Long press to clear."
                glowColor={theme.backgroundSelected}
                scaleTo={0.85}
                hitSlop={Spacing.two}
                style={styles.backspace}>
                <Ionicons name="backspace-outline" size={28} color={theme.textSecondary} />
              </MotionPressable>
            </PresenceScale>
          </View>
        </View>
      </View>
      <InCallModal state={voip.state} mock={!!voipEngine?.isMock} onHangup={voip.hangup} onMute={voip.mute} onSpeaker={voip.speaker} onClose={voip.dismiss} />
    </ThemedView>
  );
}

const KEY_SIZE = 72;
const CALL_SIZE = 64;

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center' },
  inner: { flex: 1, width: '100%', maxWidth: Math.min(MaxContentWidth, 420), paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, justifyContent: 'flex-end' },
  display: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-end', paddingBottom: Spacing.three },
  // Fixed size: 10 digits + one space always fit a phone's width.
  number: { fontSize: 36, lineHeight: 46, fontWeight: '400', letterSpacing: 1, textAlign: 'center', paddingVertical: Spacing.two, borderWidth: 0, outlineWidth: 0 },
  clipboard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, minHeight: 44, paddingHorizontal: Spacing.three },
  setupLink: { alignItems: 'center', paddingBottom: Spacing.one },
  statusSlot: { minHeight: 24, alignItems: 'center', justifyContent: 'center' },
  status: { textAlign: 'center', paddingHorizontal: Spacing.three },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, maxWidth: '100%', paddingHorizontal: Spacing.three },
  suggestionName: { flexShrink: 1 },
  exactName: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  pad: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.333%', height: KEY_SIZE + Spacing.two, alignItems: 'center', justifyContent: 'center' },
  key: { width: KEY_SIZE, height: KEY_SIZE, borderRadius: KEY_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  keyDigit: { fontSize: 32, lineHeight: 38, fontWeight: '400' },
  keyLetters: { fontSize: 10, lineHeight: 12, letterSpacing: 1.5, fontWeight: '500' },
  callBtn: { width: CALL_SIZE, height: CALL_SIZE, borderRadius: CALL_SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  backspace: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
});
