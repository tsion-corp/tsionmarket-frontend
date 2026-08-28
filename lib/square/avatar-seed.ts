/**
 * The SAME deterministic avatar seeding Market Square uses.
 *
 * A person must render the identical placeholder on both surfaces. Ark's own
 * `Avatar` draws a geometric identicon, so before this the same account showed
 * a mascot in the square and a pattern of blocks on the dashboard — which
 * reads as two different people, and undoes the point of showing the square's
 * content here at all.
 *
 * This is a DELIBERATE copy of `market-square-frontend/lib/avatar-seed.ts`,
 * not an import: the two apps are separate deployments with no shared package,
 * and a near-miss reimplementation would be worse than an honest duplicate.
 *
 * !! DO NOT CHANGE THE HASH OR THE ARTWORK ORDER !!
 * The offset basis, the prime, and the LENGTH and ORDER of `AVATAR_ARTWORK`
 * are a cross-app contract. Changing any of them re-rolls every existing
 * user's avatar, and does so on one surface only — so the two drift apart
 * silently and nobody notices until a person says "that isn't me".
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a, 32-bit, over UTF-16 code units.
 *
 * `Math.imul` keeps the multiply in 32-bit space — a plain `*` overflows into
 * float territory and loses the low bits — and `>>> 0` returns it unsigned so
 * a bare `% length` downstream is safe.
 */
export function hashSeed(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** The nine ARK mascots, in the order the square pins them. */
export const AVATAR_ARTWORK: readonly string[] = [
  "/avatar/avatar-01.jpg",
  "/avatar/avatar-02.jpg",
  "/avatar/avatar-03.jpg",
  "/avatar/avatar-04.jpg",
  "/avatar/avatar-05.jpg",
  "/avatar/avatar-06.jpg",
  "/avatar/avatar-07.jpg",
  "/avatar/avatar-08.jpg",
  "/avatar/avatar-09.jpg",
];

/**
 * Map a seed onto an index.
 *
 * An empty seed pins to 0 deliberately — it is the "we do not know who this
 * is" artwork, and it must not drift if the set ever grows.
 */
export function seedIndex(seed: string, length: number): number {
  if (length <= 0) throw new RangeError("artwork length must be positive");
  if (!seed) return 0;
  return hashSeed(seed) % length;
}

/** Most stable identifier first: id, then username, then name. */
export function resolveSeed(source: {
  id?: string | null;
  username?: string | null;
  name?: string | null;
}): string {
  for (const candidate of [source.id, source.username, source.name]) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

/** The artwork for a seed, or null when nothing identifies this row. */
export function artworkForSeed(seed: string): string | null {
  if (!seed) return null;
  return AVATAR_ARTWORK[seedIndex(seed, AVATAR_ARTWORK.length)] ?? null;
}
