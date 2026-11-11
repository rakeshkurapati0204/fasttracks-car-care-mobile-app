// The docked sidebar can be dragged wider or narrower, or folded into an icon-only rail. These are the rules, with no imports so node --test can
// run them; the functions marked 'worklet' also run on the UI thread while a finger is dragging.

export const SIDEBAR_DEFAULT = 224;
/** Narrowest width that still shows the labels. */
export const SIDEBAR_MIN = 184;
export const SIDEBAR_MAX = 360;
/** Icon-only rail. */
export const SIDEBAR_RAIL = 72;
/** While dragging, narrower than this the sidebar already shows icons only; letting go there folds it into the rail. */
export const SIDEBAR_RAIL_BELOW = 150;
export const SIDEBAR_STEP = 24;

/** The widest the sidebar may be in a window this wide: never more than 40%, so the content always keeps its room. */
export function maxFor(windowWidth: number): number {
  'worklet';
  return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.floor(windowWidth * 0.4)));
}

/** A width the sidebar may take while the finger is down: anything from the rail to `max`. */
export function liveWidth(w: number, max: number = SIDEBAR_MAX): number {
  'worklet';
  if (!Number.isFinite(w)) return SIDEBAR_DEFAULT;
  return Math.max(SIDEBAR_RAIL, Math.min(max, Math.round(w)));
}

export function isRail(w: number): boolean {
  'worklet';
  return w < SIDEBAR_RAIL_BELOW;
}

/** Where the sidebar lands when the finger lifts: a rail, or a width between MIN and MAX (never an unreadable in-between). */
export function settleWidth(w: number, max: number = SIDEBAR_MAX): number {
  'worklet';
  const v = liveWidth(w, max);
  if (isRail(v)) return SIDEBAR_RAIL;
  return Math.max(SIDEBAR_MIN, v);
}

/** The saved width, as it is actually shown in a window of this width (a narrow window squeezes a wide sidebar; the rail stays a rail). */
export function fitWidth(w: number, windowWidth: number): number {
  if (isRail(w)) return SIDEBAR_RAIL;
  return Math.min(w, maxFor(windowWidth));
}

/** Keyboard / screen reader steps: wider (+1) or narrower (-1). Narrowing the minimum folds it; widening a rail opens it to the minimum. */
export function nudgeWidth(w: number, dir: 1 | -1): number {
  if (isRail(w)) return dir > 0 ? SIDEBAR_MIN : SIDEBAR_RAIL;
  const next = w + dir * SIDEBAR_STEP;
  if (next < SIDEBAR_MIN) return SIDEBAR_RAIL;
  return Math.min(SIDEBAR_MAX, next);
}

/** What was saved on the device -> a width that is safe to use (default when missing or damaged). */
export function parseSavedWidth(raw: string | null | undefined): number {
  if (raw == null) return SIDEBAR_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT;
  return settleWidth(n);
}

/** The folded / unfolded toggle: a rail opens to the width it had before (or the default), anything else folds. */
export function toggledWidth(current: number, lastExpanded: number): number {
  if (isRail(current)) return lastExpanded >= SIDEBAR_MIN ? Math.min(SIDEBAR_MAX, lastExpanded) : SIDEBAR_DEFAULT;
  return SIDEBAR_RAIL;
}
