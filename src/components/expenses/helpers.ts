import { formatINR } from '@/lib/overview-format';

export const BILL_REQUIRED_ABOVE = 200;
export const MAX_BILLS = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export const fmt = formatINR;

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Dashboard todayStr / monthStartStr: IST calendar date.
export function todayStr() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function monthStartStr() {
  return todayStr().slice(0, 8) + '01';
}

export const CATEGORY_STYLE: Record<string, { bg: string; color: string; dark: string }> = {
  RAPIDO:   { bg: 'rgba(251,191,36,0.15)', color: '#b45309', dark: '#fbbf24' },
  ZEPTO:    { bg: 'rgba(139,92,246,0.15)', color: '#7c3aed', dark: '#a78bfa' },
  FUEL:     { bg: 'rgba(59,130,246,0.15)', color: '#1d4ed8', dark: '#60a5fa' },
  FOOD:     { bg: 'rgba(16,185,129,0.15)', color: '#047857', dark: '#34d399' },
  SUPPLIES: { bg: 'rgba(236,72,153,0.15)', color: '#be185d', dark: '#f472b6' },
  REPAIRS:  { bg: 'rgba(249,115,22,0.15)', color: '#c2410c', dark: '#fb923c' },
  TRAVEL:   { bg: 'rgba(6,182,212,0.15)', color: '#0e7490', dark: '#22d3ee' },
  MISC:     { bg: 'rgba(100,116,139,0.15)', color: '#475569', dark: '#94a3b8' },
};

export const STATUS_STYLE: Record<string, { bg: string; color: string; dark: string; label: string }> = {
  PENDING:  { bg: 'rgba(245,158,11,0.12)', color: '#b45309', dark: '#fbbf24', label: 'Pending' },
  APPROVED: { bg: 'rgba(34,197,94,0.12)', color: '#15803d', dark: '#4ade80', label: 'Approved' },
  REJECTED: { bg: 'rgba(239,68,68,0.12)', color: '#b91c1c', dark: '#f87171', label: 'Rejected' },
};

// What the dashboard picker offers: photos, PDF, Word and Excel (server allow-list).
export const BILL_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];
export const STATEMENT_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf', 'xlsx', 'xls', 'csv'];

export const BILL_PICKER_TYPES = [
  'image/*', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
export const STATEMENT_PICKER_TYPES = [
  'image/*', 'application/pdf', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/comma-separated-values',
];

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};

export const extOf = (name: string) => (/\.([a-zA-Z0-9]+)$/.exec(name)?.[1] ?? '').toLowerCase();

export function inferMime(name: string, mime?: string | null) {
  if (mime && mime !== 'application/octet-stream') return mime;
  return MIME_BY_EXT[extOf(name)] ?? mime ?? 'application/octet-stream';
}

// Server-side messages, checked on the phone before anything is uploaded.
export function checkFile(name: string, size: number | undefined, allowed: string[], message: string): string | null {
  if (!allowed.includes(extOf(name))) return message;
  if (size != null && size > MAX_FILE_BYTES) return 'File is too large. Maximum size is 15MB.';
  return null;
}

// The amount/date reader understands photos and PDFs only.
export const canExtract = (name: string, mime: string) => mime.startsWith('image/') || mime === 'application/pdf' || /\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(name);
