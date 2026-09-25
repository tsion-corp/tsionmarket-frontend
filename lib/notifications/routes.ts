// The user-management notification paths, written down once. Everything goes
// through the same-origin proxy (app/api/user-management), so the browser never
// holds a gateway URL.
//
// The id is the Privy DID, which contains colons and could contain anything
// else, so it is encoded as one segment. That is what stops a crafted id from
// reaching a path the proxy does not allowlist.

const USERS = "/api/user-management/users";

export const NOTIFICATION_ROUTES = {
  inbox: (userId: string) => `${USERS}/${encodeURIComponent(userId)}/notifications`,
  read: (userId: string) => `${USERS}/${encodeURIComponent(userId)}/notifications/read`,
  vapidKey: (userId: string) => `${USERS}/${encodeURIComponent(userId)}/push/vapid-public-key`,
  subscriptions: (userId: string) => `${USERS}/${encodeURIComponent(userId)}/push/subscriptions`,
} as const;
