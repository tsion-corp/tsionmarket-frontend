// A screen's chance to answer before the app navigates away from it.
//
// Clicking a link can be caught in the DOM, which covers the sidebar and every
// other `next/link`. The phone's tab bar does not use links: it calls
// `router.push` directly, and a router call leaves no click to intercept. So a
// screen that needs to be asked about leaving registers here, and the places
// that navigate programmatically ask first.
//
// One guard at a time, which is all the app ever needs: only one screen is
// open, and a screen that registers a second one has a bug rather than a
// requirement.

/** Returns true when the guard has taken over and navigation must not happen. */
export type NavigationGuard = (href: string) => boolean;

let guard: NavigationGuard | null = null;

/** Registers the guard, or clears it with null. Returns the unregister. */
export function setNavigationGuard(next: NavigationGuard | null): () => void {
  guard = next;
  return () => {
    // Only clear our own: a screen that unmounts after another has registered
    // must not silently remove the newer one.
    if (guard === next) guard = null;
  };
}

/**
 * Asks the guard about a destination.
 *
 * True means it has taken over — do not navigate. False means carry on, which
 * is also the answer whenever no screen has registered.
 */
export function guardNavigation(href: string): boolean {
  if (!guard) return false;
  try {
    return guard(href);
  } catch {
    // A guard that throws must not trap somebody on a page.
    return false;
  }
}

/** Whether a screen is currently asking to be consulted. For tests. */
export function hasNavigationGuard(): boolean {
  return guard !== null;
}
