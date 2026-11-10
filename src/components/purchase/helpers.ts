import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

// Mirrors backend ACC_ROLES (accounting.ts) and the dashboard page's gate.
export const ACC_ROLES = ['OWNER', 'STORE_MANAGER', 'ACCOUNTING', 'CASHIER', 'INVENTORY_MANAGER'];

// ₹1,23,456.00: Indian grouping, always two decimals (the dashboard's toFixed(2)).
export function money(n: number | string | null | undefined) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// A client-side preview of the same -R{n} suffix the backend computes when
// voucherNumber is omitted: strips any existing -R<n>, then finds the first
// suffix not already used among this ledger's own voucher numbers. Only a
// pre-filled default; the backend stays the authority on collisions.
export function suggestRevisionNumber(current: string, existingNumbers: string[]): string {
  const base = current.replace(/-R\d+$/, '');
  const taken = new Set(existingNumbers);
  for (let n = 1; n <= 1000; n++) {
    const candidate = `${base}-R${n}`;
    if (candidate !== current && !taken.has(candidate)) return candidate;
  }
  return `${base}-R${Date.now()}`;
}

// Same convention as the dashboard's downloadCsv/csvCell: BOM prefix so Excel
// reads UTF-8, cells with commas/quotes/newlines quoted.
function csvCell(value: string | number): string {
  const s = String(value);
  // Text beginning with = + - @ (or a leading tab/CR) runs as a formula in
  // Excel/Sheets; prefix strings with ' to keep them plain text.
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Saves to the cache, then opens the share sheet. Returns false when sharing
// isn't available on this device.
export async function shareCsv(filename: string, rows: (string | number)[][]): Promise<boolean> {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, '﻿' + csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'text/csv' });
  return true;
}
