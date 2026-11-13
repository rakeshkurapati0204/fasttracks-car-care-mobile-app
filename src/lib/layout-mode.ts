// How the menu behaves. The slide-out (push) menu works at EVERY window size: phone, tablet, desktop window, split screen, rotated, folded or unfolded. Its geometry is
// computed from the window as it is right now (see push-shell.tsx), so there is no size at which it stops working. A person who prefers a permanent sidebar can pin it
// when the window has room for it. Pure, so it runs under `npm test`.

/** The narrowest window that can spare room for a pinned sidebar beside the content (Material "medium" width class). */
export const PIN_MIN_WIDTH = 600;

export type MenuStyle = 'slide' | 'pinned';

/** A stored value that is not a style (or an old one from an earlier version) is the default: slide-out. */
export function parseMenuStyle(raw: string | null | undefined): MenuStyle {
  return raw === 'pinned' ? 'pinned' : 'slide';
}

/** Is the sidebar pinned beside the content at this window width? Only when asked for, and never in a window too narrow to leave room for the screen. */
export function isPinned(width: number, style: MenuStyle): boolean {
  return style === 'pinned' && width >= PIN_MIN_WIDTH;
}

/** Can the person pin the sidebar in this window at all? */
export function canPin(width: number): boolean {
  return width >= PIN_MIN_WIDTH;
}

const SLIDE_FRACTION = 0.66; // how much of a narrow window the card slides across
const SLIDE_MAX = 360; // a menu wider than this is only wasted space on a big window

/** How far the page card slides to the right to uncover the menu, in dp: a fraction of a narrow window, a fixed comfortable width on a wide one. */
export function slideDistance(windowWidth: number): number {
  return Math.min(windowWidth * SLIDE_FRACTION, SLIDE_MAX);
}
