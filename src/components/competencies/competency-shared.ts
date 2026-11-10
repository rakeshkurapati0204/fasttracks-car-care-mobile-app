import type { CompetencyCategory, CompetencyTemplate } from '@/types/api';

// Ported from the dashboard's components/competencies/shared.tsx and
// lib/roleNameMatch.ts so both sides behave the same.

// Order doubles as the picker's order.
export const CATEGORIES: { value: CompetencyCategory; label: string }[] = [
  { value: 'WORKSHOP', label: 'Workshop / Automotive' },
  { value: 'CUSTOMER_SALES', label: 'Customer & Sales' },
  { value: 'OFFICE_ADMIN', label: 'Office / Admin' },
  { value: 'TECH_IT', label: 'Tech / IT' },
];

export const CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  WORKSHOP: 'Workshop / Automotive',
  CUSTOMER_SALES: 'Customer & Sales',
  OFFICE_ADMIN: 'Office / Admin',
  TECH_IT: 'Tech / IT',
};

// One-line hint under the selected category in the New Template sheet.
export const CATEGORY_HINTS: Record<CompetencyCategory, string> = {
  WORKSHOP: 'technicians, detailers, PPF/ceramic',
  CUSTOMER_SALES: 'service advisors, front desk, upselling',
  OFFICE_ADMIN: 'accounts, HR, billing, cash reconciliation',
  TECH_IT: 'developers, data, IT support',
};

const DESCRIPTION_PLACEHOLDERS: Record<CompetencyCategory, string> = {
  WORKSHOP: 'e.g. Ceramic coating and paint correction technician',
  CUSTOMER_SALES: 'e.g. Handles walk-in customers and service upselling',
  OFFICE_ADMIN: 'e.g. Manages billing, GST and daily cash reconciliation',
  TECH_IT: 'e.g. Python backend developer, APIs and databases',
};
export function descriptionPlaceholder(category: CompetencyCategory | ''): string {
  return category ? DESCRIPTION_PLACEHOLDERS[category] : 'Briefly describe what this role does';
}

// Keyword auto-pick for the category, applied only until HR picks one themselves.
const WORKSHOP_RE = /\b(technician|detailer|mechanic|ppf|ceramic)/i;
const TECH_IT_RE = /\b(developer|engineer|data|software)|\bit\b/i;
export function detectCategory(roleName: string): CompetencyCategory | '' {
  if (WORKSHOP_RE.test(roleName)) return 'WORKSHOP';
  if (TECH_IT_RE.test(roleName)) return 'TECH_IT';
  return '';
}

// Mirrors the backend's MAX_DESCRIPTION_LENGTH.
export const MAX_DESCRIPTION_LENGTH = 4000;

export function normalizeRoleName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function isNearDuplicate(a: string, b: string): boolean {
  if (a.length < 3 || b.length < 3) return false;
  if (a === b) return false;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  const threshold = Math.max(1, Math.round(Math.min(a.length, b.length) * 0.25));
  return levenshteinDistance(a, b) <= threshold;
}

// Closest near-duplicate among existing role names (never an exact match).
export function findSimilarRole(input: string, candidates: string[]): { name: string; distance: number } | null {
  const norm = normalizeRoleName(input);
  if (norm.length < 3) return null;
  let best: { name: string; distance: number } | null = null;
  for (const c of candidates) {
    const nc = normalizeRoleName(c);
    if (nc === norm || !isNearDuplicate(norm, nc)) continue;
    const distance = levenshteinDistance(norm, nc);
    if (!best || distance < best.distance) best = { name: c, distance };
  }
  return best;
}

export function weightageTotal(t: Pick<CompetencyTemplate, 'competencies'>) {
  return t.competencies.reduce((sum, c) => sum + (Number.isFinite(c.weightage) ? c.weightage : 0), 0);
}

// "28 Sep 2026, 2:48 PM" — one line, am/pm upper-cased (en-IN renders it lowercase).
export function fmtDateShort(d?: string | null): string {
  if (!d) return '—';
  const parts = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  }).formatToParts(new Date(d));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} ${get('dayPeriod').toUpperCase()}`;
}

export function fmtDateTimeFull(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
