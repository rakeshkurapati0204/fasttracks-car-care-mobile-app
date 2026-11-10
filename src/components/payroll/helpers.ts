export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ₹45,000: Indian grouping, no decimals (the dashboard's Intl INR format).
export function formatINR(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

// Payment window: last 5 days of the month + first 5 days of the next.
export function getPaymentWindow(month: number, year: number) {
  const lastDay = new Date(year, month, 0).getDate();
  const windowStart = new Date(year, month - 1, lastDay - 4);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const windowEnd = new Date(nextYear, nextMonth - 1, 5, 23, 59, 59);
  return { windowStart, windowEnd };
}

export function isWithinPaymentWindow(date: Date, month: number, year: number) {
  const { windowStart, windowEnd } = getPaymentWindow(month, year);
  return date >= windowStart && date <= windowEnd;
}

export function formatPaymentWindow(month: number, year: number) {
  const { windowStart, windowEnd } = getPaymentWindow(month, year);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  return `${windowStart.toLocaleDateString('en-IN', opts)} – ${windowEnd.toLocaleDateString('en-IN', opts)}`;
}
