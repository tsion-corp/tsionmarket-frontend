/**
 * What to call the person who wrote a post.
 *
 * "Someone" is a last resort, not a default. The feed hydrates an author on
 * almost every post, and falling back to an anonymous word the moment one
 * field is missing makes a populated feed read as a room full of strangers.
 * So this walks what the square actually sends — display name, then handle,
 * then a short form of the id — and only gives up when there is nothing at
 * all to show.
 *
 * Pure and dependency-free so it can be pinned without a renderer.
 */
export interface NamedAuthor {
  displayName?: string | null;
  username?: string | null;
  id?: string | null;
}

export function authorName(author: NamedAuthor | null | undefined, fallback: string): string {
  const display = author?.displayName?.trim();
  if (display) return display;

  const handle = author?.username?.trim();
  if (handle) return `@${handle}`;

  // A Privy DID is `did:privy:<opaque>`. The tail is meaningless to a reader,
  // but it is stable and distinguishes two unnamed people from each other —
  // which "Someone" repeated down the page does not.
  const id = author?.id?.trim();
  if (id) {
    const tail = id.split(":").pop() ?? id;
    if (tail.length >= 4) return `${fallback} ${tail.slice(-4).toUpperCase()}`;
  }
  return fallback;
}
