import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { countAt, formatCount, parseCount } from '@/lib/count-up';

const DURATION = 700;

type Anim = { target: string; n: number; from: number };

/** Returns `value` as text, counting up from zero the first time it appears (and from the old figure when it changes). */
export function useCountUp(value: string | number): string {
  const text = String(value);
  const parts = parseCount(text);
  const [anim, setAnim] = useState<Anim>(() => ({ target: text, n: 0, from: 0 }));

  useEffect(() => {
    const p = parseCount(text);
    if (!p) return;
    let raf = 0;
    let cancelled = false;
    // Where the count starts: zero the first time, the figure on screen when it later changes.
    const from = anim.target === text ? anim.from : anim.n;
    if (from === p.n) return;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) { setAnim({ target: text, from: p.n, n: p.n }); return; }
      const start = Date.now();
      const tick = () => {
        const t = (Date.now() - start) / DURATION;
        setAnim({ target: text, from, n: t >= 1 ? p.n : countAt(from, p.n, t) });
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => { if (!cancelled) setAnim({ target: text, from: p.n, n: p.n }); });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!parts) return text;
  if (anim.target !== text || anim.n === parts.n) return text; // at rest, show the original text exactly (leading zeros, signs)
  return formatCount(parts, anim.n);
}
