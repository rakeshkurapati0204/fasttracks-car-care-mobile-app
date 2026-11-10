import type { BoardStage, JobCardStatus } from '@/types/api';

// Labels and formatters from the dashboard's Customers & Jobs page
// (customers/page.tsx), kept identical so both show the same words.

export const SOURCE_LABELS: Record<string, string> = {
  INSTAGRAM_FACEBOOK: 'Instagram / Facebook',
  FAMILY_FRIENDS: 'Family & Friends',
  GOOGLE_SEARCH: 'Google Search',
  WALK_IN: 'Walk In',
  WEBSITE: 'Website',
  INTERNAL_EMPLOYEE: 'Internal Employee',
  KNOWN_TO_OWNER: 'Known to Owner',
};

// The source filter dropdown's own options (note "Walk-in" with a hyphen and
// the extra "Regular Customer", exactly as the dashboard's <select>).
export const SOURCE_FILTER_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'INSTAGRAM_FACEBOOK', label: 'Instagram / Facebook' },
  { value: 'FAMILY_FRIENDS', label: 'Family & Friends' },
  { value: 'GOOGLE_SEARCH', label: 'Google Search' },
  { value: 'WALK_IN', label: 'Walk-in' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'INTERNAL_EMPLOYEE', label: 'Internal Employee' },
  { value: 'KNOWN_TO_OWNER', label: 'Known to Owner' },
  { value: 'REGULAR_CUSTOMER', label: 'Regular Customer' },
];

export const BOARD_STAGES: BoardStage[] = ['CREATED', 'QUOTED', 'HANDED_OVER', 'COLLECTED', 'WALKED_OUT'];

export const BOARD_STAGE_LABELS: Record<BoardStage, string> = {
  CREATED: 'Job card created',
  QUOTED: 'Quotation given',
  HANDED_OVER: 'Handed over',
  COLLECTED: 'Collected',
  WALKED_OUT: 'Walked out',
};

export const BOARD_WALKOUT_REASONS: { key: string; label: string }[] = [
  { key: 'PRICE_TOO_HIGH', label: 'Price too high' },
  { key: 'NOT_INTERESTED', label: 'Not interested' },
  { key: 'JUST_ENQUIRING', label: 'Just enquiring' },
  { key: 'WENT_ELSEWHERE', label: 'Went elsewhere' },
  { key: 'OTHER', label: 'Other' },
];

export const BOARD_WALKOUT_REASON_LABELS: Record<string, string> = Object.fromEntries(BOARD_WALKOUT_REASONS.map((r) => [r.key, r.label]));

export const JOB_STATUS_LABELS: Record<JobCardStatus, string> = {
  IN_PROGRESS: 'In Progress',
  READY: 'Ready',
  RELEASED: 'Released',
  WALKED_OUT: 'Walked Out',
};

export const CRM_SEARCH_LABELS = { name: 'Name', phone: 'Phone', vehicleNumber: 'Plate', vehicleModel: 'Model' } as const;

export const CRM_SEARCH_PLACEHOLDERS = {
  name: 'Search by customer name…',
  phone: 'Search by phone number…',
  vehicleNumber: 'Search by plate number (e.g. TG07AQ…)',
  vehicleModel: 'Search by vehicle model (e.g. Brezza, Creta…)',
} as const;

export function fmtINR(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

const IST = { timeZone: 'Asia/Kolkata' } as const;

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...IST });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, ...IST });
}

export function fmtMonthYear(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

// First quote is "Initial", the last "Final", by position (dashboard quoteLabel).
export function quoteLabel(index: number, total: number): string {
  if (total === 1) return 'Quote';
  if (index === 0) return 'Initial';
  if (index === total - 1) return 'Final';
  return `Quote ${index + 1}`;
}

export const UNPAID_STATUSES = ['ACTIVE', 'ISSUED', 'PARTIAL', 'OVERDUE'];
