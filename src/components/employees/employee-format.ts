import type { BadgeVariant } from '@/components/ui';

// Role labels, badge colours, role options, phone / FT ID rules: copied from
// the dashboard's Team page (employees/page.tsx) so both show the same thing.

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
  CASHIER: 'Cashier',
  HR: 'HR',
  HOUSEKEEPING: 'Housekeeping',
};

export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

export function roleVariant(role: string): BadgeVariant {
  if (role === 'OWNER' || role === 'STORE_MANAGER') return 'primary';
  if (role === 'INVENTORY_MANAGER' || role === 'ACCOUNTING' || role === 'CASHIER') return 'warning';
  return 'secondary';
}

// Roles an owner/manager can assign (ASSIGNABLE_ROLES in backend employees.ts).
export const ROLE_OPTIONS = [
  { value: 'STORE_MANAGER', label: 'Store Manager — Full access except billing' },
  { value: 'SALES', label: 'Sales — Manage jobs & customers' },
  { value: 'TECHNICIAN', label: 'Technician — Jobs + attendance (1h grace)' },
  { value: 'TECH_TEAM', label: 'Tech Team — Timesheets only' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media — Conversations & timesheets' },
  { value: 'STAFF', label: 'Staff — Basic access (maid / watchman)' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping — Basic access' },
  { value: 'INVENTORY_MANAGER', label: 'Inventory Manager — Inventory access' },
  { value: 'ACCOUNTING', label: 'Accounting — Financial & payroll access' },
  { value: 'CASHIER', label: 'Cashier — Financial & payroll access' },
  { value: 'HR', label: 'HR — Hiring, attendance, documents & agreements' },
];

export const BRANCH_OPTIONS = [
  { value: '', label: '— Select Branch —' },
  { value: 'Jubilee Hills', label: 'Jubilee Hills' },
  { value: 'Minister Road', label: 'Minister Road' },
];

export const REMARK_CATEGORIES = [
  { value: 'ATTENDANCE', label: 'Attendance' },
  { value: 'PUNCTUALITY', label: 'Punctuality' },
  { value: 'SALES', label: 'Sales' },
  { value: 'CUSTOMER_HANDLING', label: 'Customer Handling' },
  { value: 'BEHAVIOUR', label: 'Behaviour' },
  { value: 'TEAMWORK', label: 'Teamwork' },
  { value: 'INITIATIVE', label: 'Initiative' },
  { value: 'OTHER', label: 'Other' },
];

// Dashboard getInitials: first + last word's first letters (one word: first two).
export function getInitials(name: string): string {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Dashboard getAvatarColor: the same name hash over the same eight Tailwind
// 500 colours (blue, purple, green, orange, pink, indigo, teal, red).
const AVATAR_COLORS = ['#3b82f6', '#a855f7', '#22c55e', '#f97316', '#ec4899', '#6366f1', '#14b8a6', '#ef4444'];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function normalizePhone(raw: string): { value: string; error: string | null } {
  let v = raw.replace(/[\s\-()]/g, '');
  if (v.startsWith('+91')) v = v.slice(3);
  if (v.startsWith('91') && v.length === 12) v = v.slice(2);
  if (v.length === 0) return { value: v, error: null };
  if (!/^\d{10}$/.test(v)) return { value: v, error: 'Enter 10-digit number without +91 (e.g. 9876543210)' };
  return { value: v, error: null };
}

const ftPrefix = (branch: string) => (branch === 'Jubilee Hills' ? 'FTJH' : branch === 'Minister Road' ? 'FTMR' : 'FT');

// EnNo + branch -> FT ID: FTJH052 / FTMR052 / FT052 (stored lowercase).
export function ftIdFor(branch: string, enNo: string): string | null {
  const num = parseInt(enNo.trim(), 10);
  if (isNaN(num) || !enNo.trim() || /^\d{10}$/.test(enNo.trim())) return null;
  return (ftPrefix(branch) + String(num).padStart(3, '0')).toLowerCase();
}

export function inr(n: number) {
  return '₹' + n.toLocaleString('en-IN');
}
