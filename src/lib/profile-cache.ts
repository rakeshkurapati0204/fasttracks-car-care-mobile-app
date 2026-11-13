// The signed-in person's basic profile, kept on the device so the app can open straight to their screen without waiting for the network (a slow or
// unreachable server must never leave the opening screen hanging). It is refreshed in the background on every start. Only what the app needs to choose
// a screen is kept; salary and joining details are not stored here. Pure, so it runs under `npm test`.
import type { AuthUser } from '@/types/api';

export type CachedProfile = Pick<AuthUser, 'id' | 'username' | 'name' | 'role' | 'employeeId' | 'designation' | 'mustChangePassword'>;

const MAX_BYTES = 2000; // the secure store is meant for small values

export function serializeProfile(user: AuthUser): string | null {
  const slim: CachedProfile = {
    id: user.id, username: user.username, name: user.name, role: user.role,
    employeeId: user.employeeId ?? null, designation: user.designation ?? null, mustChangePassword: user.mustChangePassword ?? false,
  };
  const raw = JSON.stringify(slim);
  return raw.length <= MAX_BYTES ? raw : null;
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The stored profile, or null when there is none or it is not a valid profile (a damaged value must never sign anyone in as a stranger). */
export function parseCachedProfile(raw: string | null | undefined): AuthUser | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || !isText(v.id) || !isText(v.username) || !isText(v.name) || !isText(v.role)) return null;
    return {
      id: v.id, username: v.username, name: v.name, role: v.role,
      employeeId: typeof v.employeeId === 'string' ? v.employeeId : null,
      designation: typeof v.designation === 'string' ? v.designation : null,
      mustChangePassword: v.mustChangePassword === true,
    };
  } catch {
    return null;
  }
}
