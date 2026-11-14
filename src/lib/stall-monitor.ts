// Notices when the app's JavaScript thread was blocked: a timer that should fire every `intervalMs` fires late by `thresholdMs` or more. Each late moment is
// kept with the screen the person was on, so "the app hangs" turns into "this screen, this long". Plain functions, no React, so node --test runs them.

export type Stall = { at: number; ms: number; where: string };

export type StallMonitor = {
  start(): void;
  stop(): void;
  /** Call when the app comes back from the background: the timer was paused, which is not a stall. */
  resume(): void;
  setWhere(where: string): void;
  list(): Stall[];
  clear(): void;
  /** Text for the speed log: newest first. */
  format(): string;
  /** One timer step. Public so a test can drive it with a fake clock. */
  tick(): void;
};

type Options = { intervalMs?: number; thresholdMs?: number; max?: number; now?: () => number };

export function createStallMonitor(o: Options = {}): StallMonitor {
  const interval = o.intervalMs ?? 250;
  const threshold = o.thresholdMs ?? 600;
  const max = o.max ?? 40;
  const now = o.now ?? Date.now;
  let timer: ReturnType<typeof setInterval> | null = null;
  let last = 0;
  let where = 'start';
  const stalls: Stall[] = [];

  const tick = () => {
    const t = now();
    if (last > 0) {
      const late = t - last - interval;
      if (late >= threshold) {
        stalls.push({ at: t, ms: late, where });
        if (stalls.length > max) stalls.shift();
      }
    }
    last = t;
  };

  const clock = (at: number) => new Date(at).toLocaleTimeString('en-IN', { hour12: false });
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

  return {
    start() { if (timer) return; last = now(); timer = setInterval(tick, interval); },
    stop() { if (timer) clearInterval(timer); timer = null; last = 0; },
    resume() { last = now(); },
    setWhere(w) { where = w; },
    list: () => [...stalls],
    clear() { stalls.length = 0; },
    format() {
      if (stalls.length === 0) return 'No slow moments since the app opened.';
      const worst = Math.max(...stalls.map((s) => s.ms));
      const lines = [...stalls].reverse().slice(0, 12).map((s) => `${clock(s.at)}  ${seconds(s.ms)}  ${s.where}`);
      return [`${stalls.length} slow moments, worst ${seconds(worst)}`, '', ...lines].join('\n');
    },
    tick,
  };
}

/** The one monitor of the app. */
export const stallMonitor = createStallMonitor();
