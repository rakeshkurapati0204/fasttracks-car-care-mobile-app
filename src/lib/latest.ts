// "Latest request wins". When a screen asks the server again before the previous answer has arrived (typing in a search box, switching a filter), the answers can
// come back in a different order; a slow OLD answer must never overwrite the newer one on screen. Take a ticket before each request and check it when the answer
// arrives. Pure, so it runs under `npm test`.

export type Latest = {
  /** A new request that replaces everything before it. */
  next: () => number;
  /** The ticket of the newest request so far, for a request that only adds to it (the next page) and is void only if a newer REPLACING request started. */
  current: () => number;
  isCurrent: (ticket: number) => boolean;
};

export function createLatest(): Latest {
  let current = 0;
  return { next: () => ++current, current: () => current, isCurrent: (ticket) => ticket === current };
}
