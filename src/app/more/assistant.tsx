import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MechMitra } from '@/components/mech-mitra';
import { ThemedText } from '@/components/themed-text';
import { Layout, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { askOwnerAssistant } from '@/lib/api';
import { assistantErrorText, historyForRequest, type ChatMessage } from '@/lib/assistant-chat';
import { useAuth } from '@/lib/auth-context';

// The same Owner Assistant as the dashboard's "Ask AI": read-only, answers in the language the owner writes in. The chat lives only in this screen.
const BRIEF = "Give me today's brief";
const PILLS = ["Today's brief", 'Which jobs are stuck?', 'Who is absent today?'];

export default function AssistantScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);
  const busy = useRef(false); // set at once: a fast double tap on Send cannot ask twice
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const ask = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy.current) return;
    busy.current = true;
    const next: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setError(null);
    setSending(true);
    try {
      const reply = await askOwnerAssistant(historyForRequest(next));
      if (alive.current) setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      if (alive.current) setError(assistantErrorText(err));
    } finally {
      busy.current = false;
      if (alive.current) setSending(false);
    }
  }, [messages]);

  if (user?.role !== 'OWNER') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ThemedText themeColor="textMuted">The assistant is only for the owner.</ThemedText>
      </View>
    );
  }

  const canSend = input.trim().length > 0 && !sending;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top + 44}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        style={styles.flex}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.role === 'user';
          if (mine) {
            return (
              <View style={[styles.row, styles.rowMine]}>
                <View style={[styles.bubble, styles.bubbleMine, { backgroundColor: theme.primary }]}>
                  <ThemedText selectable style={[styles.bubbleText, { color: '#ffffff' }]}>{item.content}</ThemedText>
                </View>
              </View>
            );
          }
          return (
            <View style={[styles.row, styles.rowTheirs, styles.botRow]}>
              <MechMitra />
              <View style={styles.botCol}>
                <ThemedText type="small" themeColor="textMuted">AI Assistant</ThemedText>
                <View style={[styles.bubble, styles.bubbleTheirs, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <ThemedText selectable style={[styles.bubbleText, { color: theme.text }]}>{item.content}</ThemedText>
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.row, styles.rowTheirs, styles.botRow]}>
              <MechMitra />
              <View style={styles.botCol}>
                <ThemedText type="small" themeColor="textMuted">AI Assistant</ThemedText>
                <View style={[styles.bubble, styles.bubbleTheirs, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <ThemedText style={[styles.bubbleText, { color: theme.text }]}>Hi! I&apos;m your AI Assistant. Ask about jobs, staff, stock or missed calls, in English, Hindi or Telugu.</ThemedText>
                </View>
              </View>
            </View>
            <View style={styles.pills}>
              {PILLS.map((q, i) => (
                <Pressable
                  key={q}
                  onPress={() => ask(i === 0 ? BRIEF : q)}
                  accessibilityRole="button"
                  accessibilityLabel={q}
                  style={({ pressed }) => [styles.pill, { borderColor: theme.primary, backgroundColor: pressed ? theme.primary : theme.backgroundElement }, ]}>
                  {({ pressed }) => <ThemedText type="smallBold" style={{ color: pressed ? '#ffffff' : theme.primary }}>{q}</ThemedText>}
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListFooterComponent={
          sending ? (
            <View style={[styles.row, styles.rowTheirs, styles.botRow]}>
              <MechMitra talking />
              <View style={[styles.bubble, styles.bubbleTheirs, styles.typing, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <ActivityIndicator size="small" color={theme.textMuted} />
                <ThemedText themeColor="textMuted" type="small">Looking that up…</ThemedText>
              </View>
            </View>
          ) : null
        }
      />

      {error ? (
        <View style={[styles.error, { backgroundColor: theme.backgroundElement, borderTopColor: theme.border }]}>
          <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText>
        </View>
      ) : null}

      <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.surface, paddingBottom: Math.max(8, insets.bottom) }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Ask anything…"
          placeholderTextColor={theme.textMuted}
          multiline
          editable={!sending}
          accessibilityLabel="Your question"
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }]}
        />
        <Pressable
          onPress={() => ask(input)}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send question"
          style={[styles.send, { backgroundColor: canSend ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
          <Ionicons name="send" size={18} color={canSend ? '#ffffff' : theme.textMuted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  listContent: { flexGrow: 1, padding: Layout.screenPaddingH, gap: Spacing.two, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '88%', paddingHorizontal: Spacing.three, paddingVertical: 10 },
  bubbleMine: { borderRadius: 14, borderBottomRightRadius: 3 },
  bubbleTheirs: { borderRadius: 14, borderTopLeftRadius: 3, borderWidth: StyleSheet.hairlineWidth, alignSelf: 'flex-start' },
  botRow: { gap: Spacing.two, alignItems: 'flex-start' },
  botCol: { flex: 1, gap: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingLeft: 48 },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  empty: { gap: Spacing.three },
  error: { paddingHorizontal: Layout.screenPaddingH, paddingVertical: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.two, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: 10, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
