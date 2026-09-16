import { marketSquareHref } from "@/lib/market-square";

/**
 * Paths into the Market Square app.
 *
 * These belong to ITS router, not ours, and they are not guessable — a post
 * lives at `/p/<id>`, not `/post/<id>`, and there is no `/compose` route at
 * all. Both were hand-written into components and shipped as 404s: the
 * composer told people their post was live and then linked them to a page that
 * does not exist, which reads as the post having failed.
 *
 * So the shapes are declared once, here, mirroring the app's own route folders:
 *
 *     app/p/[id]        → squarePath.post(id)
 *     app/live/[id]     → squarePath.live(id)
 *     app/u/[username]  → squarePath.profile(username)
 *     app/houses/[id]   → squarePath.house(id)
 *     app/pals          → squarePath.pals()
 *
 * `squarePath` is pure and env-free so the shapes can be pinned in a test that
 * runs everywhere; `squareLinks` is the same set resolved against the
 * configured deployment, returning null when there is none.
 */
export const squarePath = {
  post: (id: string): string => `p/${encodeURIComponent(id)}`,
  live: (id: string): string => `live/${encodeURIComponent(id)}`,
  profile: (username: string): string => `u/${encodeURIComponent(username)}`,
  /** app/notifications — the reader's square inbox. */
  notifications: (): string => "notifications",
  /** app/houses/[id]: a house, where the Square page's "Join house" lands. */
  house: (id: string): string => `houses/${encodeURIComponent(id)}`,
  /** app/pals: the whole people deck, where "Make some friends" views more. */
  pals: (): string => "pals",
  /** app/gist-rooms: every room, where "Top GistRooms" and "Coming Soon" view more. */
  gistRooms: (): string => "gist-rooms",
  /** app/houses: the whole directory, where "Popular Houses" views more. */
  houses: (): string => "houses",
  /** app/feed: the whole timeline, where "Post For You" views more. */
  feed: (): string => "feed",
  /** app/gist-rooms with its create sheet open: where Home's banner lands. */
  hostRoom: (): string => "gist-rooms?open=1",
  /** app/code/[code]: a room by its code, where Home's search sends one. */
  roomCode: (code: string): string => `code/${encodeURIComponent(code)}`,
  /** app/store/[slug]: a product the search found. */
  product: (slug: string): string => `store/${encodeURIComponent(slug)}`,
} as const;

export const squareLinks = {
  home: (): string | null => marketSquareHref(),
  post: (id: string): string | null => marketSquareHref(squarePath.post(id)),
  live: (id: string): string | null => marketSquareHref(squarePath.live(id)),
  profile: (username: string): string | null => marketSquareHref(squarePath.profile(username)),
  notifications: (): string | null => marketSquareHref(squarePath.notifications()),
  house: (id: string): string | null => marketSquareHref(squarePath.house(id)),
  pals: (): string | null => marketSquareHref(squarePath.pals()),
  gistRooms: (): string | null => marketSquareHref(squarePath.gistRooms()),
  houses: (): string | null => marketSquareHref(squarePath.houses()),
  feed: (): string | null => marketSquareHref(squarePath.feed()),
  hostRoom: (): string | null => marketSquareHref(squarePath.hostRoom()),
  roomCode: (code: string): string | null => marketSquareHref(squarePath.roomCode(code)),
  product: (slug: string): string | null => marketSquareHref(squarePath.product(slug)),
} as const;
