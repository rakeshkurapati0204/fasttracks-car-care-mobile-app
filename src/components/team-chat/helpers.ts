import type { TeamChat, TeamChatEmployee, TeamChatMessage } from '@/types/api';

// Ports of the dashboard Team Chat helpers (tasks/page.tsx), same rules and wording.

export function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const DELETED_TEXT = 'This message was deleted';
/** Mirrors the server's edit window; the server enforces it, this only decides whether "Edit" is offered. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** 'image' | 'audio' | 'file' — the website stores bare words, the staff app stores MIME types. */
export function mediaKind(mediaType?: string | null): 'image' | 'audio' | 'file' | null {
  const t = (mediaType ?? '').split(';')[0].trim().toLowerCase();
  if (!t) return null;
  if (t === 'image' || t.startsWith('image/')) return 'image';
  if (t === 'audio' || t.startsWith('audio/')) return 'audio';
  return 'file';
}

/** Original file name of a shared document: mediaName, else the URL's #name= fragment. */
export function docName(url?: string | null, name?: string | null) {
  if (name?.trim()) return name.trim();
  if (!url) return 'Document';
  const m = url.match(/#name=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return url.split('#')[0].split('/').pop() || 'Document';
}
export function docExt(url?: string | null, name?: string | null) {
  const n = docName(url, name);
  return n.includes('.') ? n.split('.').pop()!.toUpperCase().slice(0, 4) : 'FILE';
}

/** One-line summary of a message for the chat list. */
export function previewText(msg: TeamChatMessage) {
  if (msg.deleted) return `🚫 ${DELETED_TEXT}`;
  const kind = mediaKind(msg.mediaType);
  if (kind === 'image') return '📷 Image';
  if (kind === 'audio') return '🎤 Voice';
  if (kind === 'file') return `📄 ${docName(msg.mediaUrl, msg.mediaName)}`;
  return msg.content;
}

/** One-line text of a quoted (replied-to) message. */
export function quoteText(q: { deleted?: boolean; content: string | null; mediaType?: string | null }) {
  if (q.deleted) return DELETED_TEXT;
  const kind = mediaKind(q.mediaType);
  if (kind === 'image') return '📷 Image';
  if (kind === 'audio') return '🎤 Voice';
  if (kind === 'file') return '📄 Document';
  return q.content ?? '';
}

export const URL_RE = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

/** Friendly label for well-known share links (Google Drive / Docs / Sheets …). */
export function linkKind(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const h = u.hostname.replace(/^www\./, '');
    if (h === 'drive.google.com') return 'Google Drive';
    if (h === 'docs.google.com') {
      if (u.pathname.startsWith('/spreadsheets')) return 'Google Sheets';
      if (u.pathname.startsWith('/presentation')) return 'Google Slides';
      if (u.pathname.startsWith('/forms')) return 'Google Forms';
      return 'Google Docs';
    }
    if (h.endsWith('sharepoint.com') || h === 'onedrive.live.com' || h === '1drv.ms') return 'OneDrive';
    if (h === 'dropbox.com' || h.endsWith('.dropbox.com')) return 'Dropbox';
    return null;
  } catch { return null; }
}

export type TextPart = { text: string } | { href: string; url: string; tail: string; kind: string | null };

/** Message text split into plain runs and links (trailing punctuation kept out of the link). */
export function splitLinks(text: string): TextPart[] {
  return text.split(URL_RE).map((part, i): TextPart => {
    if (i % 2 === 0) return { text: part };
    const m = part.match(/^(.*?)([.,!?;:)\]]*)$/);
    const url = m ? m[1] : part;
    const tail = m ? m[2] : '';
    const href = url.startsWith('http') ? url : `https://${url}`;
    return { href, url, tail, kind: linkKind(href) };
  });
}

/** Time of day for a message bubble — the day itself is on the divider above. */
export function fmtBubbleTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** Local calendar day, e.g. "2026-9-24" — messages are split into days by this. */
export function localDayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** "Today" / "Yesterday" by calendar day (not 24h), else the full date. */
export function fmtDayDivider(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (localDayKey(d) === localDayKey(today)) return 'Today';
  if (localDayKey(d) === localDayKey(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Consecutive messages grouped by calendar day, keeping each one's index in the full list. */
export function groupByDay(messages: TeamChatMessage[]) {
  const days: { key: string; label: string; items: { msg: TeamChatMessage; idx: number }[] }[] = [];
  messages.forEach((msg, idx) => {
    const key = localDayKey(new Date(msg.sentAt));
    const last = days[days.length - 1];
    if (last?.key === key) last.items.push({ msg, idx });
    else days.push({ key, label: fmtDayDivider(msg.sentAt), items: [{ msg, idx }] });
  });
  return days;
}

export type ChatRow =
  | { type: 'day'; key: string; label: string }
  | { type: 'msg'; key: string; msg: TeamChatMessage; showSender: boolean };

/** Rows for an inverted list: newest first, each day's divider sitting above that day's first message. */
export function buildRows(messages: TeamChatMessage[], isGroup: boolean, myId: string): ChatRow[] {
  const out: ChatRow[] = [];
  for (const day of groupByDay(messages)) {
    out.push({ type: 'day', key: `day-${day.key}`, label: day.label });
    day.items.forEach(({ msg, idx }, i) => {
      // Re-show the sender after a date divider, not just on a change of sender.
      const showSender = isGroup && msg.senderId !== myId && (i === 0 || messages[idx - 1].senderId !== msg.senderId);
      out.push({ type: 'msg', key: msg.id, msg, showSender });
    });
  }
  return out.reverse();
}

export function displayName(emp: Pick<TeamChatEmployee, 'name' | 'nickname'>): string {
  return emp.nickname ?? emp.name;
}

export function chatDisplayName(chat: TeamChat, myId: string, employees: TeamChatEmployee[]): string {
  if (chat.isGroup) return chat.name || 'Group Chat';
  const other = chat.members.find((m) => m.userId !== myId);
  if (!other) return 'Chat';
  const emp = employees.find((e) => e.id === other.userId);
  return emp?.nickname ?? other.user.name;
}

/** Most recently active chat first — same order the server returns (lastMsgAt desc). */
export function byRecency(a: TeamChat, b: TeamChat): number {
  return new Date(b.lastMsgAt ?? 0).getTime() - new Date(a.lastMsgAt ?? 0).getTime();
}

/** The other side of a 1:1 as an employee row; falls back to the chat's own member record (deactivated users). */
export function personForChat(chat: TeamChat, myId: string, employees: TeamChatEmployee[]): TeamChatEmployee {
  const other = chat.members.find((m) => m.userId !== myId);
  const emp = other ? employees.find((e) => e.id === other.userId) : undefined;
  if (emp) return emp;
  return {
    id: other?.userId ?? chat.id,
    name: other?.user.name ?? 'Chat',
    phone: other?.user.phone ?? null,
    designation: other?.user.designation ?? null,
    role: other?.user.role ?? '',
    nickname: null,
  };
}

// ── Sending media (dashboard: DOC_ACCEPT / DOC_MAX_BYTES / MAX_FILES_PER_PICK) ──
export const DOC_EXTS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'zip'];
export const DOC_MAX_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_PICK = 10;

export const DOC_PICKER_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/comma-separated-values',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'application/zip', 'application/x-zip-compressed',
];

const DOC_MIME: Record<string, string> = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', zip: 'application/zip',
};

export const docExtOf = (name: string) => (/\.([a-zA-Z0-9]+)$/.exec(name)?.[1] ?? '').toLowerCase();
export const docMime = (name: string, mime?: string | null) =>
  (mime && mime !== 'application/octet-stream' ? mime : DOC_MIME[docExtOf(name)] ?? 'application/octet-stream');
