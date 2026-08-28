/**
 * One item per author, for a promo rail.
 *
 * A rail of eight cards from the same person reads as one loud user rather
 * than a place worth joining — the design shows five different faces for
 * exactly that reason. Order is preserved, so the newest post from each author
 * wins and the feed's own ranking survives.
 *
 * The fallback matters as much as the rule: on a quiet deployment nearly
 * everything can be by one or two people, and three distinct cards is not a
 * rail. Below `minimum` it returns the original list, because a repetitive
 * rail is better than a nearly-empty one.
 *
 * Pure, so the behaviour can be pinned without a renderer.
 */
export function distinctByAuthor<T>(
  items: readonly T[],
  authorOf: (item: T) => string | undefined,
  minimum = 3
): T[] {
  const seen = new Set<string>();
  const distinct: T[] = [];
  for (const item of items) {
    const author = authorOf(item);
    if (!author || seen.has(author)) continue;
    seen.add(author);
    distinct.push(item);
  }
  return distinct.length >= minimum ? distinct : [...items];
}
