// The backend's calling flags (GET /calls/capabilities) rarely change, but every Call / Call back press used to ask for them again before dialing: one extra network
// round trip on the critical path. Kept for a minute and shared, with one request in flight at most.
import { fetchCallCapabilities } from '@/lib/api';
import type { CallCapabilities } from '@/types/api';

const TTL_MS = 60_000;
let cached: { at: number; value: CallCapabilities } | null = null;
let inflight: Promise<CallCapabilities> | null = null;

export function peekCallCapabilities(): CallCapabilities | null {
  return cached && Date.now() - cached.at < TTL_MS ? cached.value : null;
}

export function getCallCapabilities(): Promise<CallCapabilities> {
  const fresh = peekCallCapabilities();
  if (fresh) return Promise.resolve(fresh);
  inflight ??= fetchCallCapabilities()
    .then((v) => { cached = { at: Date.now(), value: v }; return v; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** After a sign-out or a role change the flags can differ: forget them. */
export function clearCallCapabilities(): void {
  cached = null;
}
