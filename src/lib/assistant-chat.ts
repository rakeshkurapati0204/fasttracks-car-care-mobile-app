// Owner Assistant chat (More > Ask AI). The pure parts, kept apart from the screen so they can be tested without the app.

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

// The server takes at most 40 messages of 4000 characters, and the first must be the owner's. A long chat keeps only its last stretch.
export const MAX_SENT_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

/** What goes to the server: the last messages, starting with one from the owner, each cut to the server's limit. */
export function historyForRequest(messages: ChatMessage[]): ChatMessage[] {
  const tail = messages.slice(-MAX_SENT_MESSAGES);
  const firstUser = tail.findIndex((m) => m.role === 'user');
  if (firstUser === -1) return [];
  return tail.slice(firstUser).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
}

type ErrorLike = { response?: { status?: number; data?: { error?: unknown; message?: unknown } }; code?: string };

/** Plain words for a failed question. The server's own message is used only for a 502 (the model or its network failed). */
export function assistantErrorText(err: unknown): string {
  const e = (err ?? {}) as ErrorLike;
  const status = e.response?.status;
  if (status === 404) return 'The assistant is not on the server yet.';
  if (status === 403) return 'The assistant is only for the owner.';
  if (status === 429) return 'Too many questions. Wait a moment and try again.';
  if (status === 502) {
    const msg = e.response?.data?.error ?? e.response?.data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (!status) return 'No connection, or the assistant took too long. Try again.';
  return 'The assistant could not answer that. Try again.';
}
