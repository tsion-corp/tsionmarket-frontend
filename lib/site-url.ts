// The canonical origin for links we hand to other people.
//
// A shareable link must NEVER be built from window.location.origin: on a
// Vercel preview or branch deployment that origin is a transient URL like
// wsws-git-xyz.vercel.app, and once Vercel supersedes or pauses that
// deployment every later click gets "this deployment is temporarily paused".
// A referral or game invite that worked for the first person then breaks for
// everyone after is exactly that. So a shared link always resolves to the
// stable production domain (or an explicit override), and only a local dev
// origin is kept so links work on localhost.

/** Fallback production domain when NEXT_PUBLIC_SITE_URL is not set. */
export const CANONICAL_SITE_URL = "https://www.tsionark.com";

/** True for a local development origin, where keeping the origin is correct. */
function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local");
}

/**
 * The origin to embed in a link shared with someone else. An explicit
 * NEXT_PUBLIC_SITE_URL wins; localhost keeps its own origin for dev; every
 * other case (production, and crucially every preview deployment) resolves to
 * the canonical domain, so a shared link is never a pausable deployment URL.
 */
export function shareOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined" && isLocalHost(window.location.hostname)) {
    return window.location.origin;
  }
  return CANONICAL_SITE_URL;
}
