/**
 * What the composer will accept.
 *
 * The limit mirrors the service's own (`createPostBodySchema`: 1–2000). It is
 * enforced here so the counter and the disabled state agree with the server
 * rather than letting someone write 2100 characters and be refused on submit.
 *
 * Pure and dependency-free so it can be pinned without a renderer.
 */
export const POST_MAX_LENGTH = 2000;

/** Below this the counter appears; above it, it would only be noise. */
export const COUNTER_VISIBLE_FROM = POST_MAX_LENGTH - 200;

export type ComposeProblem = "empty" | "too-long" | null;

export function checkPost(text: string): ComposeProblem {
  const trimmed = text.trim();
  if (trimmed === "") return "empty";
  // Length is judged on the TRIMMED text, because that is what gets sent —
  // counting trailing whitespace toward the limit would reject a post the
  // server would have accepted.
  if (trimmed.length > POST_MAX_LENGTH) return "too-long";
  return null;
}

export function canPost(text: string): boolean {
  return checkPost(text) === null;
}

/** Characters left, for the counter. Negative once over. */
export function remaining(text: string): number {
  return POST_MAX_LENGTH - text.trim().length;
}
