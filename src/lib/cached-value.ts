// A value that lives in slow storage (the phone's secure store) but is read by something that runs constantly (every network request needs the sign-in token).
// The slow read happens once; after that the value is answered from memory, and a change is visible at once, before the slow write has finished.
// Pure, so it runs under `npm test`.

export type CachedValue<T> = {
  get: () => Promise<T>;
  /** The value is updated in memory immediately; the returned promise is the slow write (the caller may await it or not). */
  set: (value: T, write: (value: T) => Promise<unknown>) => Promise<unknown>;
  /** Same, for removing the value. */
  clear: (remove: () => Promise<unknown>, empty: T) => Promise<unknown>;
};

export function createCachedValue<T>(read: () => Promise<T>): CachedValue<T> {
  let loaded = false;
  let value: T;
  let loading: Promise<T> | null = null;
  return {
    async get() {
      if (loaded) return value;
      // Several callers asking before the first read has finished share that one read.
      loading ??= read().then((v) => { value = v; loaded = true; return v; }).finally(() => { loading = null; });
      return loading;
    },
    set(next, write) {
      value = next;
      loaded = true;
      return write(next);
    },
    clear(remove, empty) {
      value = empty;
      loaded = true;
      return remove();
    },
  };
}
