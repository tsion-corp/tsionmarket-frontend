/**
 * A post's pictures, as the Square's post card lays them out
 * (market-square-frontend/lib/post-media.ts and lib/media.ts, carried over).
 *
 * A post carries either one `mediaUrl` or a `media` list; the rail reads one
 * shape. The geometry is the file's, node 1029:22591, at the two sizes the
 * card is drawn at. Pure, so it can be pinned without a renderer.
 */
export interface PostMediaLike {
  url: string;
  kind: string;
  thumbnailUrl?: string | null;
}

export function postMediaList(post: {
  media?: readonly PostMediaLike[] | null;
  mediaUrl?: string | null;
  mediaKind?: string | null;
  thumbnailUrl?: string | null;
}): PostMediaLike[] {
  if (Array.isArray(post.media)) return [...post.media];
  if (!post.mediaUrl) return [];
  return [
    {
      url: post.mediaUrl,
      kind: post.mediaKind ?? "image",
      thumbnailUrl: post.thumbnailUrl ?? null,
    },
  ];
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm)(\?|#|$)/i.test(url) || url.startsWith("data:video/");
}

export function isVideoPost(post: {
  mediaUrl?: string | null;
  mediaKind?: string | null;
}): boolean {
  if (!post.mediaUrl) return false;
  if (post.mediaKind) return post.mediaKind.toLowerCase().startsWith("video");
  return isVideoUrl(post.mediaUrl);
}

export const RAIL_SIZES = {
  post: {
    tile: 250.93,
    tileHeight: 352.22,
    radius: 20.72,
    gap: 10.36,
    dotHeight: 4.99,
    dotGap: 3.12,
    dots: { active: 31.17, next: 11.85, rest: 10.6 },
  },
  compact: {
    tile: 134.3,
    tileHeight: 188.52,
    radius: 11.09,
    gap: 5.54,
    dotHeight: 2.67,
    dotGap: 1.67,
    dots: { active: 16.69, next: 6.34, rest: 5.67 },
  },
} as const;

export type RailSize = keyof typeof RAIL_SIZES;

export function railDotWidth(index: number, active: number, size: RailSize = "post"): number {
  const { dots } = RAIL_SIZES[size];
  if (index === active) return dots.active;
  return index === active + 1 ? dots.next : dots.rest;
}

export function railIndexAt(
  scrollLeft: number,
  maxScroll: number,
  count: number,
  size: RailSize = "post"
): number {
  if (count <= 0) return 0;
  if (maxScroll > 0 && scrollLeft >= maxScroll - 1) return count - 1;
  const { tile, gap } = RAIL_SIZES[size];
  const index = Math.round(scrollLeft / (tile + gap));
  return Math.min(count - 1, Math.max(0, index));
}
