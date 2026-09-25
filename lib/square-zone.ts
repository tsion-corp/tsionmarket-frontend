import { peekDecaneAccessToken } from "@/lib/auth-token";

/**
 * `/square` IS ANOTHER APP.
 *
 * Market Square is served at www.tsionark.com/square as a Next.js Multi-Zone:
 * `next.config.ts` rewrites `/square` and `/square/*` to the Square's own
 * deployment (`SQUARE_ZONE_URL`). This app has no page there any more, so the
 * client router cannot move into it — a `next/link` or `router.push` would ask
 * THIS build for a route it does not have. Every way into the Square is a full
 * page load instead, which is also what hands the reader to the Square's own
 * code, styles and session.
 *
 * `/api/square/*` is a different prefix and stays this app's own API.
 */
export const SQUARE_ZONE_PATH = "/square";

/**
 * The query parameter the Square reads the reader's session from on arrival.
 *
 * Both apps are one Decane identity, but the Square is its own build with its
 * own storage, so a session this app holds does not exist there. The Square
 * button hands it over in the URL: `/square?decane_token=<access token>`, the
 * same ES256 JWT every API call here carries as a Bearer, at most two hours
 * old. The Square takes it from the URL on load and drops it from the address
 * bar at once; it is never written into a link on the page (see the sidebar),
 * only into the navigation the tap makes.
 */
export const SQUARE_HANDOFF_PARAM = "decane_token";

/** A path the Square zone answers: `/square`, `/square/…`, `/square?…`, `/square#…`. */
export function isSquareZonePath(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? "";
  return path === SQUARE_ZONE_PATH || path.startsWith(`${SQUARE_ZONE_PATH}/`);
}

/**
 * `href` with the session handed over, or `href` as it came when there is no
 * session to hand. Keeps the path, any query already there and the fragment.
 */
export function withSquareHandoff(
  href: string,
  token: string | null = peekDecaneAccessToken()
): string {
  if (!token) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const beforeHash = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = beforeHash.indexOf("?");
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : beforeHash.slice(queryAt + 1));
  params.set(SQUARE_HANDOFF_PARAM, token);
  return `${path}?${params.toString()}${hash}`;
}

/**
 * Leave this app for the Square: a full navigation, never a client transition,
 * carrying the session (withSquareHandoff) so the reader arrives signed in.
 */
export function openSquareZone(href: string = SQUARE_ZONE_PATH): void {
  window.location.assign(withSquareHandoff(href));
}
