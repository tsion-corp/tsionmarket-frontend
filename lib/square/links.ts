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
 *
 * `squarePath` is pure and env-free so the shapes can be pinned in a test that
 * runs everywhere; `squareLinks` is the same set resolved against the
 * configured deployment, returning null when there is none.
 */
export const squarePath = {
  post: (id: string): string => `p/${encodeURIComponent(id)}`,
  live: (id: string): string => `live/${encodeURIComponent(id)}`,
  profile: (username: string): string => `u/${encodeURIComponent(username)}`,
} as const;

export const squareLinks = {
  home: (): string | null => marketSquareHref(),
  post: (id: string): string | null => marketSquareHref(squarePath.post(id)),
  live: (id: string): string | null => marketSquareHref(squarePath.live(id)),
  profile: (username: string): string | null => marketSquareHref(squarePath.profile(username)),
} as const;
