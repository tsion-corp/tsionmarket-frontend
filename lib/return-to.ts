// Where to send someone back to after they sign in.
//
// A shared game link reaches a signed-out visitor, who is bounced to /auth.
// Without this they land on the portfolio and the link they were handed is
// gone — at an event that is the difference between joining a round and
// giving up.

export const RETURN_PARAM = "next";

/**
 * Whether a path is safe to send a browser to after login.
 *
 * Only a same-origin, absolute path. Anything that could leave this origin is
 * refused: an attacker who can put a URL in front of a user would otherwise
 * have a link that logs them in and then hands them to another site wearing
 * our sign-in as the referrer.
 */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  if (!path || typeof path !== "string") return false;
  // Must be a rooted path, and must not be protocol-relative ("//host") or a
  // backslash variant that some browsers normalise into one.
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//") || path.startsWith("/\\")) return false;
  // A scheme anywhere in the first segment means it is not a plain path.
  if (/^\/+[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  // Never bounce back into the auth screens: that is a loop.
  if (path === "/auth" || path.startsWith("/auth?") || path.startsWith("/auth/")) return false;
  return true;
}

/** The /auth URL that remembers where the visitor was heading. */
export function authUrlFor(path: string): string {
  return isSafeReturnPath(path) ? `/auth?${RETURN_PARAM}=${encodeURIComponent(path)}` : "/auth";
}

/** The return path carried on an /auth URL, or null when there is none to trust. */
export function returnPathFrom(search: string | URLSearchParams): string | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const next = params.get(RETURN_PARAM);
  return isSafeReturnPath(next) ? next : null;
}
