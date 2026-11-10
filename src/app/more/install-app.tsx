import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontWeights, Fonts, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { openExternalUrl } from '@/lib/open-url';

// Dashboard Install App page (/install): same title, copy, the two Android APK cards (Fasttracks Dashboard,
// FT Call Recorder), the shared install steps, the Safari-only iPhone steps with "Copy link for Safari".
// Open to every role (ALL_ROLES in the dashboard nav). "detected" is the phone's own platform.
const APK_URL = 'https://dashboard.fasttrackscarcare.in/downloads/fasttracks.apk';
const CALL_RECORDER_APK_URL = 'https://dashboard.fasttrackscarcare.in/downloads/fasttracks-call-recorder.apk';
const SITE = 'https://dashboard.fasttrackscarcare.in';

function Bold({ children }: { children: ReactNode }) {
  return <ThemedText style={styles.bold}>{children}</ThemedText>;
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.step}>
      <View style={[styles.stepNum, { backgroundColor: theme.primary }]}><ThemedText style={styles.stepNumText}>{n}</ThemedText></View>
      <ThemedText style={styles.stepText}>{children}</ThemedText>
    </View>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.cardHead}>
        <Ionicons name={icon} size={20} color={theme.primary} />
        <ThemedText style={styles.cardTitle}>{title}</ThemedText>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function ApkCard({ icon, appName, tagline, filename, url, note, accent }: {
  icon: keyof typeof Ionicons.glyphMap; appName: string; tagline: string; filename: string; url: string; note?: string; accent: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.apk, { backgroundColor: theme.backgroundElement, borderColor: accent }]}>
      <View style={styles.apkTop}>
        <View style={[styles.apkIcon, { backgroundColor: withAlpha(accent, 0.1) }]}><Ionicons name={icon} size={20} color={accent} /></View>
        <View style={styles.flex1}>
          <ThemedText style={styles.apkName}>{appName}</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.small}>{tagline}</ThemedText>
        </View>
      </View>
      <Pressable onPress={() => openExternalUrl(url)} accessibilityRole="button" style={[styles.dl, { backgroundColor: accent }]}>
        <Ionicons name="download-outline" size={16} color="#fff" />
        <ThemedText style={styles.dlText}>Download <ThemedText style={[styles.dlText, { fontFamily: Fonts?.mono, fontSize: 12, opacity: 0.85 }]}>{filename}</ThemedText></ThemedText>
      </Pressable>
      {note ? <ThemedText themeColor="textMuted" style={styles.small}>{note}</ThemedText> : null}
    </View>
  );
}

export default function InstallAppScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const device = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'iphone' : 'desktop';

  const copyLink = async () => {
    try { await Clipboard.setStringAsync(SITE); } catch { return; }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ThemedView style={styles.flex1}>
      <Stack.Screen options={{ title: 'Install App' }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View>
          <ThemedText style={styles.title}>Install the App</ThemedText>
          <ThemedText themeColor="textMuted" style={styles.sub}>Get Fasttracks on your phone for quick access from your home screen.</ThemedText>
        </View>

        {device !== 'desktop' ? (
          <View style={[styles.detected, { backgroundColor: 'rgba(104,15,26,0.08)', borderColor: 'rgba(104,15,26,0.15)' }]}>
            <Ionicons name="checkmark-circle-outline" size={16} color={theme.primary} />
            <ThemedText style={[styles.detectedText, { color: theme.primary }]}>
              {device === 'android' ? 'Android detected — see your install instructions below.' : 'iPhone detected — see your install instructions below.'}
            </ThemedText>
          </View>
        ) : null}

        <SectionCard title="Android" icon="logo-android">
          <View style={styles.gap}>
            <ThemedText themeColor="textMuted" style={styles.eyebrow}>Choose what to install</ThemedText>
            <ApkCard
              icon="grid-outline" appName="Fasttracks Dashboard" accent={theme.primary}
              tagline="The main app for managing jobs, invoices, attendance, and customers."
              filename="fasttracks.apk" url={APK_URL}
            />
            <ApkCard
              icon="call-outline" appName="FT Call Recorder" accent="#0f766e"
              tagline="Captures and transcribes phone calls automatically. Install this on any phone used for customer calls."
              filename="fasttracks-call-recorder.apk" url={CALL_RECORDER_APK_URL}
              note="Separate app — install alongside the main dashboard app, not instead of it."
            />
          </View>
          <View style={styles.gap}>
            <ThemedText themeColor="textMuted" style={styles.eyebrow}>How to install (same for both)</ThemedText>
            <Step n={1}>Tap a <Bold>Download</Bold> button above. Your browser will download the <ThemedText style={[styles.code, { backgroundColor: theme.backgroundElement }]}>.apk</ThemedText> file.</Step>
            <Step n={2}>When the download finishes, tap the notification or open the file. If Android asks “Allow installs from this source” — tap <Bold>Settings</Bold>, enable the toggle, then go back and tap <Bold>Install</Bold>.</Step>
            <Step n={3}>Once installed, open the app from your home screen or app drawer and log in.</Step>
          </View>
        </SectionCard>

        <SectionCard title="iPhone" icon="phone-portrait-outline">
          <View style={[styles.warn, { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.2)' }]}>
            <ThemedText style={[styles.warnText, { color: '#b45309' }]}>⚠️ This only works in <Bold>Safari</Bold>. If you&apos;re reading this in Chrome or another browser, copy the link below and paste it into Safari first.</ThemedText>
          </View>
          <Step n={1}>Open <Bold>Safari</Bold> on your iPhone and go to <Bold>dashboard.fasttrackscarcare.in</Bold>.</Step>
          <Step n={2}>Tap the <Bold>Share</Bold> icon at the bottom of the screen (the box with an arrow pointing up — <ThemedText style={{ fontFamily: Fonts?.mono }}>⬆</ThemedText>).</Step>
          <Step n={3}>Scroll down in the share sheet and tap <Bold>“Add to Home Screen”</Bold>. Edit the name if you want, then tap <Bold>Add</Bold> in the top right.</Step>
          <Step n={4}>The Fasttracks icon will appear on your home screen. Tap it to open full-screen, without any browser address bar.</Step>
          <Pressable onPress={copyLink} accessibilityRole="button" style={[styles.copy, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="copy-outline" size={16} color={theme.text} />
            <ThemedText style={styles.copyText}>{copied ? '✓ Copied!' : 'Copy link for Safari'}</ThemedText>
          </Pressable>
        </SectionCard>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  content: { padding: 16, gap: 24, width: '100%', maxWidth: 512, alignSelf: 'center' },
  title: { fontSize: 24, lineHeight: 32, fontFamily: FontWeights.bold },
  sub: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  detected: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radii.md, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  detectedText: { fontSize: 14, fontFamily: FontWeights.medium, flexShrink: 1 },
  card: { borderWidth: 1, borderRadius: Radii.lg, padding: 20, gap: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontFamily: FontWeights.bold },
  cardBody: { gap: 12 },
  gap: { gap: 12 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontFamily: FontWeights.semiBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  apk: { borderWidth: 1.5, borderRadius: Radii.md, padding: 16, gap: 12 },
  apkTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  apkIcon: { width: 40, height: 40, borderRadius: Radii.md, alignItems: 'center', justifyContent: 'center' },
  apkName: { fontSize: 14, lineHeight: 18, fontFamily: FontWeights.semiBold },
  small: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  dl: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radii.sm },
  dlText: { color: '#fff', fontSize: 14, fontFamily: FontWeights.semiBold },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontSize: 14, fontFamily: FontWeights.bold },
  stepText: { flex: 1, fontSize: 14, lineHeight: 22, paddingTop: 2 },
  bold: { fontFamily: FontWeights.bold },
  code: { fontSize: 12, fontFamily: Fonts?.mono },
  warn: { borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 8 },
  warnText: { fontSize: 12, lineHeight: 18, fontFamily: FontWeights.medium },
  copy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: Radii.md, borderWidth: 1 },
  copyText: { fontSize: 14, fontFamily: FontWeights.medium },
});
