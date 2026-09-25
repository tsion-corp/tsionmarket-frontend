// Privy signs inside an iframe served from its own domain — the "wallet
// window". A browser can refuse to load it: a strict ad or tracker blocker, or
// third-party storage switched off (Safari by default, Firefox strict mode,
// Chrome with third-party cookies blocked). When it does, every signature fails
// with one of the two messages below, and nothing in the app can make it load.
// The one useful thing is to say what happened and how to get past it — allow
// Privy's domain, pause the blocker for this site, or use another browser —
// instead of showing the raw error and letting the user retry into the same
// wall.

/** The exact strings Privy raises when its wallet iframe is not there. */
const SIGNS = ["iframe not initialized", "iframe did not initialize", "iframe failed to load"];

export function isWalletWindowError(message: string | null | undefined): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return SIGNS.some((sign) => lower.includes(sign));
}
