import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { avatarColor, formatCallDuration, formatCallTime, isMissedCall } from '@/lib/call-format';
import { fetchCallCapabilities } from '@/lib/api';
import { formatPhone } from '@/lib/call-intelligence';
import { dialBlockedReason, newDialKey } from '@/lib/dial';
import { placeCall } from '@/lib/dial-flow';
import type { CallLogEntry } from '@/types/api';
import { FasttracksDialer } from '../../modules/fasttracks-dialer/src';

const GREEN = '#1E8E3E';
const RED = '#B83030';

export function CallRow({ call }: { call: CallLogEntry }) {
  const theme = useTheme();
  const missed = isMissedCall(call.status);
  const inbound = call.direction === 'INBOUND';
  const iconColor = missed ? RED : inbound ? GREEN : theme.textSecondary;
  const fullNumber = call.counterpartyRaw ? formatPhone(call.counterpartyRaw) : null; // the real number, when the server sends it (a salesman's own calls)
  const name = call.customerName ?? fullNumber ?? call.counterpartyDisplay ?? 'Unknown';
  const letter = call.customerName?.trim().charAt(0).toUpperCase();
  const label = missed ? 'Missed' : inbound ? 'Incoming' : 'Outgoing';
  const duration = missed ? null : formatCallDuration(call.durationSeconds);

  // "Call back": the same Exotel click-to-call as the dial pad. The list only has a masked number, so the call's id goes to the server, which looks the real
  // number up for a call this user may see. The key is kept until a call is placed, so a retry after a network failure cannot ring the customer twice.
  const [busy, setBusy] = useState(false);
  const key = useRef<string | null>(null);
  const callBack = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const caps = await fetchCallCapabilities().catch(() => null);
      const blocked = dialBlockedReason(caps);
      if (blocked) { Alert.alert('Cannot call', blocked); return; }
      let isPhoneApp = false;
      try { isPhoneApp = !!FasttracksDialer?.isDefaultDialer(); } catch { /* not a phone-app build */ }
      key.current ??= newDialKey();
      const out = await placeCall({
        target: { fromCallId: call.id }, display: name, key: key.current,
        native: FasttracksDialer ?? null, autoOn: !!caps?.c2cAutoAnswerEnabled && !!FasttracksDialer, isPhoneApp,
      });
      if (out.kind === 'placed') {
        key.current = null;
        if (!out.autoAnswered) Alert.alert('Calling', 'Your phone will ring first. Answer it to be connected.');
      } else if (out.kind === 'failed') {
        if (!out.keepKey) key.current = null;
        Alert.alert('Could not place the call', out.text);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={[styles.avatar, { backgroundColor: avatarColor(name) }]}>
        {letter ? (
          <ThemedText style={styles.avatarLetter}>{letter}</ThemedText>
        ) : (
          <Ionicons name="person" size={22} color="#ffffff" />
        )}
      </View>
      <View style={styles.middle}>
        <ThemedText
          numberOfLines={1}
          adjustsFontSizeToFit={!call.customerName}
          minimumFontScale={0.8}
          style={missed ? { color: RED } : undefined}>
          {name}
        </ThemedText>
        <View style={styles.subRow}>
          <Ionicons
            name={inbound ? 'arrow-down' : 'arrow-up'}
            size={14}
            color={iconColor}
            style={styles.rotated}
          />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.subText}>
            <ThemedText type="small" style={{ color: missed ? RED : theme.textSecondary }}>{label}</ThemedText>
            {call.customerName && fullNumber ? ` · ${fullNumber}` : ''}
            {call.agentName ? ` · ${call.agentName}` : ''}
          </ThemedText>
        </View>
      </View>
      <View style={styles.right}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{formatCallTime(call.startedAt)}</ThemedText>
        {duration ? <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{duration}</ThemedText> : null}
      </View>
      <Pressable
        onPress={callBack}
        disabled={busy}
        accessibilityLabel="Call back"
        accessibilityRole="button"
        hitSlop={Spacing.half * 2}
        style={styles.callButton}>
        {busy ? <ActivityIndicator color="#ffffff" /> : <Ionicons name="call" size={20} color="#ffffff" />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: Spacing.two, gap: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarLetter: { color: '#ffffff', fontSize: 18, lineHeight: 22, fontWeight: '700' },
  middle: { flex: 1, minWidth: 0, gap: Spacing.half },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  rotated: { transform: [{ rotate: '45deg' }] },
  subText: { flexShrink: 1 },
  right: { alignItems: 'flex-end', gap: Spacing.half, flexShrink: 0 },
  callButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: GREEN, flexShrink: 0 },
});
