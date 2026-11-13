// A poller for screens that refresh themselves every few seconds (the chat, the conversation list). A plain setInterval has three problems this fixes:
//   - overlap: on a slow connection a request takes longer than the interval, so requests pile up and older answers can land after newer ones. Here the next run
//     is scheduled only after the previous one has FINISHED;
//   - hammering a struggling server: after a failure the wait doubles (up to a ceiling) and returns to normal after a success;
//   - running when nobody is looking: start/stop are driven by the caller (see use-polling.ts: stopped while the app is in the background or the screen is not showing).
// Pure (timers can be injected), so it runs under `npm test`.

export type Poller = { start: (immediate?: boolean) => void; stop: () => void; readonly running: boolean };

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** Wait before the next run: the normal interval, doubled for every failure in a row, never more than `maxMs`. */
export function nextDelay(intervalMs: number, failures: number, maxMs: number): number {
  return Math.min(intervalMs * 2 ** Math.min(failures, 10), maxMs);
}

export function createPoller(task: () => Promise<unknown> | unknown, intervalMs: number, opts: { maxMs?: number; timers?: Timers } = {}): Poller {
  const maxMs = opts.maxMs ?? Math.max(intervalMs, 60_000);
  const timers = opts.timers ?? realTimers;
  let handle: unknown;
  let stopped = true;
  let inFlight = false;
  let failures = 0;

  const schedule = () => { if (!stopped) handle = timers.set(tick, nextDelay(intervalMs, failures, maxMs)); };

  async function tick() {
    handle = undefined;
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      await task();
      failures = 0;
    } catch {
      failures += 1;
    } finally {
      inFlight = false;
      schedule();
    }
  }

  return {
    start(immediate = false) {
      if (!stopped) return;
      stopped = false;
      failures = 0;
      if (immediate) void tick();
      else schedule();
    },
    stop() {
      stopped = true;
      if (handle !== undefined) timers.clear(handle);
      handle = undefined;
    },
    get running() { return !stopped; },
  };
}
