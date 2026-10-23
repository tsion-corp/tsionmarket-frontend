/**
 * Deterministic avatar artwork for an account.
 *
 * Do not change the hash or the artwork order: either re-rolls every existing
 * user's avatar.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a, 32-bit, over UTF-16 code units. `Math.imul` keeps the multiply in
 * 32-bit space and `>>> 0` returns it unsigned so `% length` is safe.
 */
export function hashSeed(input: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

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

/** An empty seed pins to 0 so it never drifts if the set grows. */
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
