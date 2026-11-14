// How far the slide-out (push) menu moves the page. The menu works at EVERY window size: phone, tablet, desktop window, split screen, rotated, folded or unfolded.
// Its geometry is computed from the window as it is right now (see push-shell.tsx), so there is no size at which it stops working. Pure, so it runs under `npm test`.

const SLIDE_FRACTION = 0.66; // how much of a narrow window the card slides across
const SLIDE_MAX = 360; // a menu wider than this is only wasted space on a big window

/** How far the page card slides to the right to uncover the menu, in dp: a fraction of a narrow window, a fixed comfortable width on a wide one. */
export function slideDistance(windowWidth: number): number {
  return Math.min(windowWidth * SLIDE_FRACTION, SLIDE_MAX);
}
