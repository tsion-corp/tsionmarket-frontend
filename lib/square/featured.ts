/**
 * Profiles pinned to the front of "People to follow".
 *
 * A deliberate editorial choice, not a ranking: the rest of the rail is
 * ordered by followers, and these sit ahead of it. Kept in one named place —
 * rather than a stray `sort` in a component — so it is obvious that the order
 * is curated and obvious where to change it.
 *
 * Env-overridable so the list can move without a code change:
 *   NEXT_PUBLIC_SQUARE_FEATURED=ogazboiz,someoneelse
 *
 * Comparison is case-insensitive on the USERNAME, which is the only stable
 * handle a person outside the database can be named by.
 */
const FALLBACK_FEATURED = ["ogazboiz"];

export function featuredUsernames(): string[] {
  const configured = process.env.NEXT_PUBLIC_SQUARE_FEATURED;
  const list = configured ? configured.split(",").map((name) => name.trim()) : FALLBACK_FEATURED;
  return list.filter(Boolean).map((name) => name.replace(/^@/, "").toLowerCase());
}

/**
 * Pinned profiles first, in the order they are listed, then everyone else in
 * the order the service returned them.
 *
 * A pinned name that is absent from `profiles` is simply skipped — the rail
 * still fills, rather than leaving a hole for an account that is not in the
 * fetched page (or does not exist).
 */
export function withFeaturedFirst<T>(
  profiles: readonly T[],
  usernameOf: (profile: T) => string,
  featured: string[] = featuredUsernames()
): T[] {
  if (featured.length === 0) return [...profiles];

  const rank = new Map(featured.map((name, index) => [name, index]));
  const pinned: T[] = [];
  const rest: T[] = [];

  for (const profile of profiles) {
    if (rank.has(usernameOf(profile).toLowerCase())) pinned.push(profile);
    else rest.push(profile);
  }
  // Pinned keep the ORDER OF THE LIST, not the order the service returned
  // them, so "put X first" means first even when X has fewer followers.
  pinned.sort(
    (a, b) =>
      (rank.get(usernameOf(a).toLowerCase()) ?? 0) - (rank.get(usernameOf(b).toLowerCase()) ?? 0)
  );
  return [...pinned, ...rest];
}
