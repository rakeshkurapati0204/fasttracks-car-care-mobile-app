// Pure helpers for the "numbers count up" effect on stat cards. A value like "₹1,23,456" or "87%" is split into prefix, number and suffix so
// only the number animates; anything we cannot read safely (dates, "3 / 5", times) is left alone.

export type CountParts = { prefix: string; n: number; decimals: number; grouped: boolean; suffix: string };

export function parseCount(text: string): CountParts | null {
  const m = /^(\D*?)(-?\d[\d,]*)(\.\d+)?(.*)$/s.exec(text);
  if (!m) return null;
  const [, prefix, int, dec, suffix] = m;
  if (/\d/.test(suffix)) return null; // more than one number: not a simple figure
  const n = Number(int.replace(/,/g, '') + (dec ?? ''));
  if (!Number.isFinite(n)) return null;
  return { prefix, n, decimals: dec ? dec.length - 1 : 0, grouped: int.includes(','), suffix };
}

export function formatCount(p: CountParts, n: number): string {
  const body = p.grouped
    ? n.toLocaleString('en-IN', { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
    : n.toFixed(p.decimals);
  return `${p.prefix}${body}${p.suffix}`;
}

/** The number to show at progress t (0..1), eased so it settles gently. */
export function countAt(from: number, to: number, t: number): number {
  const e = 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  return from + (to - from) * e;
}
