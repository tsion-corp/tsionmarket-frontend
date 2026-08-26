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

export function marketSquareHref(path = ""): string | null {
  if (MARKET_SQUARE_URL === "") return null;
  const base = MARKET_SQUARE_URL.replace(/\/+$/, "");
  if (path === "") return base;
  return `${base}/${path.replace(/^\/+/, "")}`;
}
