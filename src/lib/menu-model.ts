// What the slide-out menu lists and what tapping an entry does: the entries the signed-in person may see, grouped, searchable, with the active one marked.
// The drawing is in push-shell.tsx.
import { router, usePathname } from 'expo-router';
import { useMemo, useRef } from 'react';
import { Platform } from 'react-native';

import { hasMenuIcon } from '@/components/menu-icon';
import { SCREEN_REGISTRY, type ScreenMeta } from '@/constants/screen-registry';
import { useAuth } from '@/lib/auth-context';
import { usePermissions } from '@/lib/permissions-context';
import { sideNavAction } from '@/lib/side-nav';

const NAV_GROUP_OF: Record<string, string> = { competencies: 'templates', 'onboarding-templates': 'templates' };
const NAV_GROUP_LABELS: Record<string, string> = { templates: 'Templates' };

export type NavNode = { type: 'item'; item: ScreenMeta } | { type: 'group'; key: string; label: string; items: ScreenMeta[] };

// Folds items sharing a group into one block at the position of the group's
// first member; everything else stays a top-level item (dashboard groupNavItems).
function groupNavItems(items: ScreenMeta[]): NavNode[] {
  const nodes: NavNode[] = [];
  const groups: Record<string, Extract<NavNode, { type: 'group' }>> = {};
  for (const item of items) {
    const key = NAV_GROUP_OF[item.id];
    if (!key) {
      nodes.push({ type: 'item', item });
      continue;
    }
    let node = groups[key];
    if (!node) {
      node = { type: 'group', key, label: NAV_GROUP_LABELS[key] ?? key, items: [] };
      groups[key] = node;
      nodes.push(node);
    }
    node.items.push(item);
  }
  return nodes;
}

const routeOf = (item: ScreenMeta) => item.route ?? `/more/${item.id}`;
const within = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + '/');

// Dev-only guard: a registry entry with no icon in menu-icon.tsx would silently
// render a plain circle in the menu. Surface it immediately.
if (__DEV__) {
  const missing = SCREEN_REGISTRY.filter((s) => !hasMenuIcon(s.id)).map((s) => s.id);
  if (missing.length > 0) {
    console.warn(
      `[menu] menu-icon.tsx has no icon for: ${missing.join(', ')} — these render as a plain circle. Add them to MENU_ICON_PATHS in src/components/menu-icon.tsx.`
    );
  }
}

export function useMenuModel(query: string, onNavigate?: () => void, navigateDelayMs = 0) {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role ?? '';
  const { hasAdsAccess, hasLegalAccess, hasTab } = usePermissions();
  const pending = useRef(false); // one navigation at a time: a second tap while the first is on its way does nothing

  const items = useMemo(
    () => SCREEN_REGISTRY.filter((s) => {
      if (s.id === 'install-app') return Platform.OS === 'web'; // installing the app is a web page's job: inside the app it only offers to download itself
      if (s.id === 'legal') return hasLegalAccess; // a per-person grant: no entry that only leads to "Access restricted"
      if (s.id === 'quotations') return role === 'OWNER' || hasTab('quotations');
      if (s.id === 'employee-documents') return ['OWNER', 'HR', 'STORE_MANAGER'].includes(role) || hasTab('employee_documents');
      if (s.requiresAccess === 'ads') return hasAdsAccess;
      if (s.requiresAccess === 'settings_company') return ['OWNER', 'STORE_MANAGER'].includes(role) || hasTab('settings_company');
      return !s.visibleToRoles || s.visibleToRoles.includes(role);
    }),
    [hasAdsAccess, hasLegalAccess, hasTab, role],
  );

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((s) => s.title.toLowerCase().includes(q)) : items;
  // While searching, groups are skipped so a match is never hidden in a collapsed section.
  const nodes: NavNode[] = q ? filtered.map((item) => ({ type: 'item', item })) : groupNavItems(filtered);

  // The ONE item whose route is the longest match for the current path.
  const activeId = useMemo(() => {
    let best: { id: string; len: number } | null = null;
    for (const s of items) {
      const href = routeOf(s);
      if (within(pathname, href) && (!best || href.length > best.len)) best = { id: s.id, len: href.length };
    }
    return best?.id ?? null;
  }, [items, pathname]);

  const go = (item: ScreenMeta) => {
    if (pending.current) return;
    const href = routeOf(item);
    if (sideNavAction(pathname, href) === 'none') { onNavigate?.(); return; } // already on this screen: just close the menu
    pending.current = true;
    onNavigate?.(); // starts the menu's closing motion first...
    // ...and the screen swaps a moment later, so the closing motion is never held up by the new screen being built.
    setTimeout(() => { pending.current = false; router.replace(href as never); }, navigateDelayMs);
  };

  return { items, filtered, nodes, activeId, go };
}
