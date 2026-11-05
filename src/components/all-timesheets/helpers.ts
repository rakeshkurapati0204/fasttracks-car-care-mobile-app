// Mirrors the date/status helpers of the dashboard's All Timesheets page
// (frontend/src/app/(dashboard)/dashboard/timesheets/page.tsx + lib/utils.ts).

// Same 5-colour language as the dashboard's REGISTER_STATUS map.
export const REGISTER_STATUS: Record<string, { bg: string; fg: string; text: string }> = {
  NOT_SUBMITTED: { bg: 'rgba(239,68,68,0.12)', fg: '#dc2626', text: 'Not Submitted' },
  DRAFT: { bg: 'rgba(245,158,11,0.12)', fg: '#b45309', text: 'Draft' },
  SUBMITTED: { bg: 'rgba(59,130,246,0.12)', fg: '#1d4ed8', text: 'Submitted' },
  APPROVED: { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', text: 'Approved' },
  REJECTED: { bg: 'rgba(249,115,22,0.12)', fg: '#c2410c', text: 'Rejected' },
};

// Roles excluded from work-doc entries sort to the bottom of "Everyone" (backend BLOCKED_ROLES in work-docs.ts).
export const BLOCKED_ROLES = ['TECHNICIAN', 'STAFF'];

// Today's calendar date in IST (YYYY-MM-DD) — the dashboard's getTodayIST().
export function getTodayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const dt = parseDateStr(dateStr);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// Monday of the ISO week containing the given date string.
export function mondayOfWeek(dateStr: string): string {
  const dt = parseDateStr(dateStr);
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return dt.toISOString().slice(0, 10);
}

export function formatDateLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function weekdayLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

export function formatPrice(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '' || v === 0) return '';
  const n = parseFloat(String(v));
  return isNaN(n) ? '' : `₹${n.toLocaleString('en-IN')}`;
}

export function quoteLabel(index: number, total: number): string {
  if (total === 1) return 'Quote';
  if (index === 0) return 'Initial';
  if (index === total - 1) return 'Final';
  return `Quote ${index + 1}`;
}
