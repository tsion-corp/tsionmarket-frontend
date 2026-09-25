// The user-management balance path, written down once. It goes through the
// same-origin proxy (app/api/user-management), so the browser never holds a
// gateway URL and never holds the service's base path either.
//
// The id is the Privy DID. It contains colons, and a DID from elsewhere could
// contain anything, so it is encoded as exactly one path segment — the same
// rule lib/notifications/routes.ts states and for the same reason: that
// encoding is what stops a crafted id from addressing a path the proxy's
// allowlist never admitted.
//
// Deliberately not an entry in NOTIFICATION_ROUTES. A balance is not a
// notification; the two only share a URL prefix because one service serves
// both, and folding this in there would make every later reader of that file
// believe otherwise.

const USERS = "/api/user-management/users";

export const BALANCE_ROUTES = {
  /** Native and token balances across one user's linked wallets. */
  userBalance: (userId: string) => `${USERS}/${encodeURIComponent(userId)}/balance`,
} as const;
