/**
 * Market Square — the ecosystem's social and discovery surface.
 *
 * It is a sibling deployment rather than a route in this app, so the entry is a
 * link, not a section. The PRD makes it the connective tissue of the platform,
 * so it belongs in the navigation at top level: prominent by default, never
 * buried behind a menu.
 *
 * The production square is the default, so a deployment that says nothing
 * links there, the way the API gateway defaults to production. Setting the
 * variable to an empty string hides the entry entirely: an inert link to a
 * social network that does not open is worse than no link.
 */
export const PRODUCTION_MARKET_SQUARE_URL = "https://square.tsionark.com";

export const MARKET_SQUARE_URL =
  process.env.NEXT_PUBLIC_MARKET_SQUARE_URL ?? PRODUCTION_MARKET_SQUARE_URL;

/**
 * Whether the product offers a way in to the square. It does, wherever the
 * square's URL is configured.
 *
 * This is the WAY IN, not the square's content: the sidebar entry, which is a
 * link out to the square's own deployment. What the app renders of the square
 * itself is a separate question, answered by SQUARE_SECTIONS_HIDDEN below.
 * The two were one switch until the rail and the dashboard needed opposite
 * answers, and folding them back together brings that back.
 *
 * A visibility switch, not a removal. While it is true the entry renders
 * nothing, and everything behind it stays wired, so the square's own
 * deployment is still reachable at its URL and the proxy in
 * `app/api/market-square` still serves the broadcast flows that need it.
 *
 * On by default, off only when said so, the way the launch gate's takedown
 * works (NEXT_PUBLIC_APP_ACTIVE in lib/launch-gate.ts): setting
 * NEXT_PUBLIC_MARKET_SQUARE_LIVE to exactly "false" closes the square in that
 * environment without a code change. Any other value, including none, is on.
 * The URL stays the real precondition: without a destination every entry is
 * a dead link, so a deployment that sets NEXT_PUBLIC_MARKET_SQUARE_URL to an
 * empty string shows nothing whatever the switch says.
 *
 * Both are inlined at build like every NEXT_PUBLIC_ value, so flipping either
 * means a redeploy, which is also what makes them tamper-proof at runtime.
 * Decision record: docs/adr/ADR-2026-09-06-market-square-launch-switch.md.
 */
export const MARKET_SQUARE_HIDDEN: boolean =
  process.env.NEXT_PUBLIC_MARKET_SQUARE_LIVE === "false" || MARKET_SQUARE_URL === "";

/**
 * Whether the app renders the square's own content in its pages: the feed
 * section at the foot of the portfolio, the promos interleaved between the
 * service briefs, and the compose button that posts into the square.
 *
 * Kept off for now at the maintainer's request. The portfolio is where someone
 * comes to read their money, and a social feed under it is not what it is for.
 * The way in stays: the rail links out to the square's own deployment, which
 * is where its feed belongs.
 *
 * A code constant, not an environment variable, and deliberately so. These
 * sections are a product decision rather than a per-deployment one, so turning
 * them on is a reviewed change, the way HIDDEN_NAV_SECTIONS in lib/sections.ts
 * and HOLDINGS_HIDDEN in the portfolio view are. It also keeps them out of
 * NEXT_PUBLIC_MARKET_SQUARE_LIVE's way: that switch is the operator's, and
 * making it carry this too is what left one flag unable to answer for both the
 * rail and the dashboard at once.
 *
 * A visibility switch, not a removal. Everything behind it stays wired: the
 * square slice under features/square, its hooks, the proxy in
 * app/api/market-square, and the render sites themselves. Flipping
 * IN_APP_SQUARE_SHOWN to true is the whole of bringing them back.
 *
 * The environment still has the last word when they are on, because a section
 * of a square that is unreachable or taken down has nothing to show: hence the
 * MARKET_SQUARE_HIDDEN term, which carries both the URL precondition and the
 * operator takedown.
 */
const IN_APP_SQUARE_SHOWN: boolean = false;

export const SQUARE_SECTIONS_HIDDEN: boolean = !IN_APP_SQUARE_SHOWN || MARKET_SQUARE_HIDDEN;

/**
 * The operator TAKEDOWN alone: NEXT_PUBLIC_MARKET_SQUARE_LIVE set to exactly
 * "false", independent of whether a URL is configured.
 *
 * A surface that should still appear in a URL-less dev environment (so it can be
 * built and reviewed) but MUST vanish when the square is deliberately taken down
 * gates on THIS, not MARKET_SQUARE_HIDDEN. The mobile "Join the Conversation"
 * doorway is the one such surface: it renders as a static promo without a URL,
 * but a real takedown has to remove it and its live "Join Space" link.
 *
 * It is a doorway, not a section, so it does not read SQUARE_SECTIONS_HIDDEN
 * either: it shows no square content, it offers a way to the square, and that
 * is the half of the split the phone home keeps.
 */
export const MARKET_SQUARE_TAKEN_DOWN: boolean =
  process.env.NEXT_PUBLIC_MARKET_SQUARE_LIVE === "false";

export function marketSquareHref(path = ""): string | null {
  if (MARKET_SQUARE_URL === "") return null;
  const base = MARKET_SQUARE_URL.replace(/\/+$/, "");
  if (path === "") return base;
  return `${base}/${path.replace(/^\/+/, "")}`;
}
