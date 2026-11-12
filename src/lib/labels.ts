// How stored values are written for people. The server sends codes like TECH_TEAM or PAID; the screen shows "Tech Team" and "Paid".
// No imports, so node --test can run it.

/** The names a role goes by in the app (the founder is "Founder", not "OWNER"). */
export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Founder',
  STORE_MANAGER: 'Store Manager',
  SALES: 'Sales',
  TECHNICIAN: 'Technician',
  TECH_TEAM: 'Tech Team',
  SOCIAL_MEDIA: 'Social Media',
  STAFF: 'Staff',
  INVENTORY_MANAGER: 'Inventory Manager',
  ACCOUNTING: 'Accounting',
  HR: 'HR',
  HOUSEKEEPING: 'Housekeeping',
  CASHIER: 'Cashier',
};

const SMALL = new Set(['of', 'and', 'or', 'to', 'in', 'for', 'a', 'the']);

/** TECH_TEAM -> "Tech Team", PAID -> "Paid", in_progress -> "In progress", partially-paid -> "Partially paid". Empty / missing -> "". */
export function humanize(code: string | null | undefined): string {
  if (!code) return '';
  const words = String(code).trim().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase().split(' ');
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

/** Same as humanize but every word capitalised (names of roles): TECH_TEAM -> "Tech Team". */
export function titleCase(code: string | null | undefined): string {
  if (!code) return '';
  return String(code).trim().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase().split(' ')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

export function roleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return ROLE_LABELS[role] ?? titleCase(role);
}
