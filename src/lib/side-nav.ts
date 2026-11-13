// How the menu navigates and how screens change. Plain functions with no imports, so node --test can run them.
//
// Every menu entry is a TOP-LEVEL destination, like a tab: tapping one REPLACES the current screen. The stack does not grow (Back never walks through every
// menu visit) and the old screen is never left sitting beside the new one. The menu's own motion (the page card sliding back) is the transition, so the
// screens swap with a short fade, or instantly beside a pinned sidebar. Drilling into a record (a customer, a chat) still pushes and slides as usual.

export type NavAction = 'none' | 'replace';

const strip = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/** What tapping a menu entry should do. `none` = the person is already on exactly that screen. */
export function sideNavAction(pathname: string, href: string): NavAction {
  return strip(pathname) === strip(href) ? 'none' : 'replace';
}

/** The `animation` option for the stacks that hold top-level destinations: none beside a pinned sidebar, a short fade otherwise. */
export function topLevelAnimation(docked: boolean): 'none' | 'fade' {
  return docked ? 'none' : 'fade';
}

/** The `animation` option for stacks that hold detail screens (a customer, a chat): none beside a pinned sidebar, the platform's slide otherwise. */
export function detailAnimation(docked: boolean): 'none' | undefined {
  return docked ? 'none' : undefined;
}
