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
 * Whether the product offers a way in to the square. It does, wherever the
 * square's URL is configured.
 *
 * This is a visibility switch, not a removal. Two surfaces read it: the
 * sidebar entry and the square blocks on the dashboard. While it is true they
 * render nothing, and everything behind them stays wired, so the square's own
 * deployment is still reachable at its URL and the proxy in
 * `app/api/market-square` still serves the broadcast flows that need it.
 *
 * On by default, off only when said so, the way the launch gate's takedown
 * works (NEXT_PUBLIC_APP_ACTIVE in lib/launch-gate.ts): setting
 * NEXT_PUBLIC_MARKET_SQUARE_LIVE to exactly "false" closes the square in that
 * environment without a code change. Any other value, including none, is on.
 * The URL stays the real precondition: without a destination every entry is
 * a dead link, so a deployment without NEXT_PUBLIC_MARKET_SQUARE_URL shows
 * nothing whatever the switch says.
 *
 * Both are inlined at build like every NEXT_PUBLIC_ value, so flipping either
 * means a redeploy, which is also what makes them tamper-proof at runtime.
 * Decision record: docs/adr/ADR-2026-09-06-market-square-launch-switch.md.
 */
export const MARKET_SQUARE_HIDDEN: boolean =
  process.env.NEXT_PUBLIC_MARKET_SQUARE_LIVE === "false" || MARKET_SQUARE_URL === "";

export function marketSquareHref(path = ""): string | null {
  if (MARKET_SQUARE_URL === "") return null;
  const base = MARKET_SQUARE_URL.replace(/\/+$/, "");
  if (path === "") return base;
  return `${base}/${path.replace(/^\/+/, "")}`;
}
