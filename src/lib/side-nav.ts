// How the side menu and the screen transitions behave. Plain functions with no imports, so node --test can run them.
//
// Wide screens (docked sidebar): the sidebar entries are top-level destinations, like tabs. Tapping one REPLACES the current screen (the stack
// does not grow, "Back" never walks through every menu visit) and there is no slide animation: a slide would drag the previous screen across the
// sidebar edge and leave a strip of it visible while the new screen arrives. Phones (slide-in menu) keep the normal push and slide.

export type NavAction = 'none' | 'push' | 'replace';

const strip = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/** What tapping a sidebar entry should do. `none` = the person is already on exactly that screen. */
export function sideNavAction(pathname: string, href: string, docked: boolean): NavAction {
  if (strip(pathname) === strip(href)) return 'none';
  return docked ? 'replace' : 'push';
}

/** The `animation` option for every Stack: no transition when the sidebar is docked, the platform default otherwise. */
export function stackAnimation(docked: boolean): 'none' | undefined {
  return docked ? 'none' : undefined;
}
