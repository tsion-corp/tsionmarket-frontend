/**
 * Market Square — the ecosystem's social and discovery surface.
 *
 * It is a sibling deployment rather than a route in this app, so the entry is a
 * link, not a section. The PRD makes it the connective tissue of the platform,
 * so it belongs in the navigation at top level: prominent by default, never
 * buried behind a menu.
 *
 * With the URL unset the entry is hidden entirely — an inert link to a social
 * network that does not open is worse than no link, and hiding it means a
 * deployment without the variable degrades quietly instead of breaking.
 */
export const MARKET_SQUARE_URL = process.env.NEXT_PUBLIC_MARKET_SQUARE_URL ?? "";

/**
 * Whether the product currently offers a way in to the square. It does not.
 *
 * This is a visibility switch, not a removal. Two surfaces read it: the
 * sidebar entry and the square blocks on the dashboard. While it is true they
 * render nothing, and everything behind them stays wired, so the square's own
 * deployment is still reachable at its URL and the proxy in
 * `app/api/market-square` still serves the broadcast flows that need it.
 *
 * To bring the entries back, set this to false. Nothing else has to change.
 *
 * Deliberately not read from the environment. A deployment that forgets the
 * variable should keep the square hidden rather than reveal it by omission,
 * and the decision to show it again belongs in a reviewed change.
 */
export const MARKET_SQUARE_HIDDEN: boolean = true;

export function marketSquareHref(path = ""): string | null {
  if (MARKET_SQUARE_URL === "") return null;
  const base = MARKET_SQUARE_URL.replace(/\/+$/, "");
  if (path === "") return base;
  return `${base}/${path.replace(/^\/+/, "")}`;
}
