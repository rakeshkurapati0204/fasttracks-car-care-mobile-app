import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Sheet } from '@/components/customers/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Input } from '@/components/ui';
import { FontWeights, Radii, withAlpha } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { generateJobDescription, getErrorMessage, hrAssistantChat } from '@/lib/api';
import type { HrChatMessage } from '@/types/api';

// Dashboard JobDescriptionModal: a standalone drafting utility. Nothing is
// saved anywhere; HR edits the draft and copies it out.
export function JobDescriptionSheet({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const [roleName, setRoleName] = useState('');
  const [department, setDepartment] = useState('');
  const [context, setContext] = useState('');
  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!roleName.trim()) { setError('Role name is required.'); return; }
    setGenerating(true);
    setError('');
    try {
      setDescription(await generateJobDescription({ roleName: roleName.trim(), department: department.trim() || undefined, context: context.trim() || undefined }));
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to generate job description.'));
    } finally {
      setGenerating(false);
    }
  };

  const copy = async () => {
    await Clipboard.setStringAsync(description);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      locked={generating}
      title="AI Job Description Assistant"
      footer={
        <>
          {description ? <Button variant="secondary" icon={copied ? 'checkmark' : 'copy-outline'} onPress={copy}>{copied ? 'Copied' : 'Copy to Clipboard'}</Button> : null}
          <Button style={styles.flex1} variant="secondary" onPress={onClose}>Close</Button>
        </>
      }>
      <Input label="Role Name" required value={roleName} onChangeText={setRoleName} placeholder="e.g. Senior Technician" />
      <Input label="Department (optional)" value={department} onChangeText={setDepartment} />
      <Input label="Context / requirements (optional)" value={context} onChangeText={setContext} multiline numberOfLines={3} placeholder="A few bullet points on what this role specifically needs…" />
      {error ? <View style={[styles.errorBox, { backgroundColor: 'rgba(224,104,104,0.1)' }]}><ThemedText style={[styles.body, { color: theme.danger }]}>{error}</ThemedText></View> : null}
      <View style={styles.end}>
        <Button size="sm" loading={generating} onPress={generate}>{generating ? 'Generating…' : description ? 'Regenerate' : 'Generate'}</Button>
      </View>
      {description ? <Input label="Generated description — review and edit before use" value={description} onChangeText={setDescription} multiline numberOfLines={14} /> : null}
    </Sheet>
  );
}

// Dashboard HrAssistantPanel: a read-only chat. It can look things up, but
// every action stays HR's to take from the real page. The conversation lives
// only in this component's state: closing it starts a fresh one.
export function HrAssistantPanel({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<HrChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scroll = useRef<ScrollView>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next: HrChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError('');
    try {
      const reply = await hrAssistantChat(next);
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'The AI HR Assistant could not answer that. Try again.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.backgroundElement, paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.head, { borderBottomColor: theme.border }]}>
          <View style={styles.flex1}>
            <ThemedText style={styles.title}>AI HR Assistant</ThemedText>
            <ThemedText themeColor="textMuted" style={styles.small}>
              Advisory only — it can look things up, but every action (verifying documents, advancing status, sending invites) is still yours to take from the real page.
            </ThemedText>
          </View>
          <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
            <Ionicons name="close" size={22} color={theme.textMuted} />
          </Pressable>
        </View>

        <ScrollView ref={scroll} style={styles.flex1} contentContainerStyle={styles.chat} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
          {messages.length === 0 ? (
            <ThemedText themeColor="textMuted" style={[styles.small, styles.italic]}>
              Try asking things like &quot;who&apos;s overdue&quot;, &quot;what&apos;s the status for [name]&quot;, &quot;who&apos;s waiting on document review&quot;, or &quot;compare candidates for [role]&quot;.
            </ThemedText>
          ) : null}
          {messages.map((m, i) => (
            <View key={i} style={[styles.bubbleRow, m.role === 'user' && styles.bubbleRowUser]}>
              <View style={[styles.bubble, { backgroundColor: m.role === 'user' ? theme.primary : theme.surface }]}>
                <ThemedText style={[styles.body, { color: m.role === 'user' ? '#fff' : theme.text }]}>{m.content}</ThemedText>
              </View>
            </View>
          ))}
          {sending ? (
            <View style={styles.bubbleRow}>
              <View style={[styles.bubble, { backgroundColor: theme.surface }]}><ThemedText themeColor="textMuted" style={[styles.body, styles.italic]}>Looking that up…</ThemedText></View>
            </View>
          ) : null}
        </ScrollView>

        {error ? <View style={[styles.errorStrip, { backgroundColor: withAlpha(theme.danger, 0.1) }]}><ThemedText style={[styles.small, { color: theme.danger }]}>{error}</ThemedText></View> : null}

        <View style={[styles.composer, { borderTopColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            editable={!sending}
            placeholder="Ask about a candidate, a role, or the pipeline…"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
          />
          <Button size="sm" disabled={sending || !input.trim()} onPress={send}>Send</Button>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// The dashboard's floating "AI HR Assistant" button.
export function HrAssistantButton({ onPress, bottom }: { onPress: () => void; bottom: number }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open the AI HR Assistant"
      style={({ pressed }) => [styles.fab, { backgroundColor: theme.primary, bottom }, pressed && { opacity: 0.8 }]}>
      <ThemedText style={styles.fabText}>AI HR Assistant</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex1: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 12, lineHeight: 18 },
  italic: { fontStyle: 'italic' },
  end: { alignItems: 'flex-end' },
  errorBox: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radii.sm },
  screen: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  title: { fontSize: 14, lineHeight: 20, fontFamily: FontWeights.bold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
  chat: { padding: 16, gap: 12 },
  bubbleRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '85%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  errorStrip: { paddingHorizontal: 16, paddingVertical: 8 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderWidth: 1, borderRadius: Radii.sm, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  fab: { position: 'absolute', right: 16, minHeight: 48, paddingHorizontal: 16, borderRadius: Radii.pill, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  fabText: { color: '#fff', fontSize: 14, lineHeight: 20, fontFamily: FontWeights.semiBold },
});
