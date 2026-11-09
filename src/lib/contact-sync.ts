// Pure rules for the automatic phone-contact copy (no imports, so node --test can run them). The runner that touches Android is contact-sync-runner.ts.

/** Roles that may save contacts on the server (same list as the backend's MY_CONTACT_ROLES). */
export const CONTACT_SYNC_ROLES = ['OWNER', 'STORE_MANAGER', 'SALES'];
/** After the first copy, look for new phone contacts at most once a day. */
export const RESYNC_AFTER_MS = 24 * 60 * 60 * 1000;

export interface ContactSyncState {
  /** The person answered the one-time "copy your contacts?" question. */
  asked: boolean;
  /** They said yes. */
  agreed: boolean;
  /** ISO time of the last completed copy. */
  lastSyncAt: string | null;
}

export const EMPTY_SYNC_STATE: ContactSyncState = { asked: false, agreed: false, lastSyncAt: null };

export function syncKey(userId: string): string {
  return `ft_contact_sync_${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

export function canSyncContacts(role: string | undefined | null): boolean {
  return !!role && CONTACT_SYNC_ROLES.includes(role);
}

export function parseSyncState(raw: string | null): ContactSyncState {
  if (!raw) return { ...EMPTY_SYNC_STATE };
  try {
    const v = JSON.parse(raw) as Partial<ContactSyncState>;
    return {
      asked: v.asked === true,
      agreed: v.agreed === true,
      lastSyncAt: typeof v.lastSyncAt === 'string' ? v.lastSyncAt : null,
    };
  } catch {
    return { ...EMPTY_SYNC_STATE };
  }
}

export type SyncStep = 'ask' | 'sync' | 'skip';

/** ask = show the one-time question; sync = copy now; skip = nothing to do (declined, or copied recently). */
export function nextSyncStep(state: ContactSyncState, nowMs: number): SyncStep {
  if (!state.asked) return 'ask';
  if (!state.agreed) return 'skip';
  if (!state.lastSyncAt) return 'sync';
  const last = Date.parse(state.lastSyncAt);
  if (Number.isNaN(last)) return 'sync';
  return nowMs - last >= RESYNC_AFTER_MS ? 'sync' : 'skip';
}
