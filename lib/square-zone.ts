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

/** A path the Square zone answers: `/square`, `/square/…`, `/square?…`, `/square#…`. */
export function isSquareZonePath(href: string): boolean {
  const path = href.split(/[?#]/)[0] ?? "";
  return path === SQUARE_ZONE_PATH || path.startsWith(`${SQUARE_ZONE_PATH}/`);
}

/** Leave this app for the Square: a full navigation, never a client transition. */
export function openSquareZone(href: string = SQUARE_ZONE_PATH): void {
  window.location.assign(href);
}
