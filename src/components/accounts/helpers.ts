import type { BankAccountType, PaymentReminderCategory, PaymentRecurrence } from '@/types/api';

// The dashboard Accounts page's own formatters, labels and maths.

export function fmt(n: number) {
  const s = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return `${n < 0 ? '-' : ''}₹${s}`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CATEGORY_LABELS: Record<PaymentReminderCategory, string> = {
  ELECTRICITY: 'Electricity', RENT: 'Rent', INTERNET: 'Internet', INSURANCE: 'Insurance', LICENSE: 'License',
  SUBSCRIPTION: 'Subscription', VENDOR_DUE: 'Vendor Due', TAX: 'Tax', SALARY: 'Salary', OTHER: 'Other',
};

export const RECURRENCE_LABELS: Record<PaymentRecurrence, string> = {
  MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUAL: 'Annual', ONE_OFF: 'One-off',
};

export const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  SAVINGS: 'Savings', CURRENT: 'Current', OD: 'Overdraft',
};

export const DOC_RULES = {
  allowedMimeTypes: [
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  maxSizeBytes: 15 * 1024 * 1024,
};

/**
 * Scheduled last instalment = start + tenure months, clamped so 31 Jan + 1 month
 * lands on 28/29 Feb. Pure date maths on the YYYY-MM-DD string (a calendar date,
 * not an instant). Returns '' when either input is missing or invalid.
 */
export function computeEndDate(startDate: string, tenureMonths: string): string {
  const months = parseInt(tenureMonths, 10);
  if (!startDate || !months || months <= 0) return '';
  const [y, m, d] = startDate.split('-').map(Number);
  if (!y || !m || !d) return '';
  const targetMonthIndex = m - 1 + months;
  const endYear = y + Math.floor(targetMonthIndex / 12);
  const endMonth = targetMonthIndex % 12;
  const lastDay = new Date(endYear, endMonth + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${endYear}-${String(endMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
