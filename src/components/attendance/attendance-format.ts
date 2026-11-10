// Status config, labels and IST formatting, copied from the dashboard's
// attendance/page.tsx (S, statusLabel, fmtIST, fmt, todayStr, totalHours).

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// status → display config (P / LT / HD / A / LV)
export const S: Record<string, { bg: string; text: string; label: string }> = {
  PRESENT: { bg: '#22c55e', text: '#fff', label: 'P' },
  LATE: { bg: '#f59e0b', text: '#fff', label: 'LT' },
  HALF_DAY: { bg: '#f97316', text: '#fff', label: 'HD' },
  ABSENT: { bg: '#ef4444', text: '#fff', label: 'A' },
  LEAVE: { bg: '#3b82f6', text: '#fff', label: 'LV' },
};

export function statusLabel(label: string): string {
  switch (label) {
    case 'P': return 'Present';
    case 'LT': return 'Late';
    case 'HD': return 'Half Day';
    case 'LV': return 'Leave';
    default: return 'Absent';
  }
}

// 24-hour HH:MM in IST.
export function fmtIST(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
}

export const fmt = fmtIST;

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function totalHours(clockIn: string | null | undefined, clockOut: string | null | undefined): string {
  if (!clockIn) return '—';
  const inMs = new Date(clockIn).getTime();
  const outMs = clockOut ? new Date(clockOut).getTime() : Date.now();
  const mins = Math.floor((outMs - inMs) / 60000);
  if (mins < 0) return '—';
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// The dashboard's formatTime (12-hour, IST) used on the My Attendance punch list.
export function formatTime12(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

// The dashboard's formatDate (dd Mon yyyy, IST).
export function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
