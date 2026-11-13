/**
 * What a person reads when linking or provisioning fails. The codes come from
 * the migration service and the Next routes; raw server text is never shown.
 */
const MESSAGES: Record<string, string> = {
  UNAUTHORIZED:
    "One of your sign-ins has expired. Sign in to both accounts again, then try once more.",
  NEW_ACCOUNT_NOT_FRESH:
    "This new account is already set up as a different user, so it can't take over your old one. Use a different new account, or contact support.",
  LEGACY_ALREADY_LINKED:
    "Your old account is already connected to a different new account. Sign in with the one you used before, or contact support.",
  ALREADY_LINKED: "This account already has everything it needs. There is nothing more to connect.",
  NOT_FOUND: "That account could not be found. Sign out and sign in again.",
  NOT_CONFIGURED: "Connecting accounts isn't available yet.",
  NOT_AVAILABLE: "Connecting accounts isn't available in this environment.",
  SERVICE_UNAVAILABLE:
    "We couldn't reach the account service. Nothing was changed. Try again in a moment.",
  UPSTREAM_ERROR:
    "We couldn't reach the account service. Nothing was changed. Try again in a moment.",
};

const GENERIC = "Something went wrong and nothing was changed. Please try again.";

export function linkErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return (typeof code === "string" && MESSAGES[code]) || GENERIC;
}
