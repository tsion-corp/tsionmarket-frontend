# ADR-2026-09-21: the notification inbox and browser push, on the user-management service

## Status

Approved by the maintainer on 2026-09-21, including §1: Earn's own push path is
retired so the platform subscription owns the browser's one registration.

## Context

The backend now has a notification service in `apps/user-management`, with a
handoff document (the admin/user frontend handoff, 2026-09-20). This ADR covers
**only the public user side**, which the maintainer confirmed belongs in this
app. The admin broadcast composer belongs in the separate admin dashboard,
because every `/admin/*` call needs `x-admin-api-key`, which must never reach a
public browser bundle.

### What the service actually does, read from its code

`notification.controller.ts`, `notification.service.ts`,
`notification.repository.ts` and `push-sender.ts` on `origin/main`:

| Route                                        | Auth         | Returns                                       |
| -------------------------------------------- | ------------ | --------------------------------------------- |
| `GET /users/{id}/notifications?limit&cursor` | Privy bearer | `{ items, unreadCount, nextCursor }`          |
| `POST /users/{id}/notifications/read`        | Privy bearer | `{ updated }`; body `{ids?}`, omit = mark all |
| `GET /users/{id}/push/vapid-public-key`      | Privy bearer | `{ publicKey: string \| null }`               |
| `POST /users/{id}/push/subscriptions`        | Privy bearer | `{ subscribed: true }`; body is `toJSON()`    |
| `DELETE /users/{id}/push/subscriptions`      | Privy bearer | `{ subscribed: false }`; body `{ endpoint }`  |

- `{id}` must equal the access token's `sub`, and the service verifies the
  ES256 token, issuer, audience, expiry and subject. It is not the identity
  token.
- The push payload is fixed:
  `{ campaignId, title, body, url, imageUrl, tag: "admin:<campaignId>" }`,
  sent with `TTL: 86400`. Endpoints answering 404 or 410 are deleted upstream.
- `publicKey()` returns `null` when the server has no VAPID keys. Subscribing
  then returns 409 `web push is not configured`.
- A publish also pushes a realtime frame to the gateway topic `user:<did>`,
  type `notificationCreated`, data `{ campaignId }`.
- At most ten subscriptions are kept per user, and an endpoint is moved to
  whichever user last registered it.

### What it does not do

Inbox rows are only ever written by a campaign publish:

```sql
INSERT INTO user_notifications (campaign_id, privy_user_id)
SELECT $1, privy_user_id FROM user_directory ON CONFLICT DO NOTHING
```

There is no per-user notify route and no event-bus consumer, so today the
platform can send **admin broadcasts to everyone**, and nothing else. The
maintainer's original ask, a notification for each activity in their own
account, needs a further backend change and will be raised separately. The
browser half built here is the same either way: when per-user notifications
arrive, they light up through this pipe with no frontend redesign.

### What is in this app today

- `public/sw.js`: a worker that handles `push` and `notificationclick`,
  defaulting every click to `/earn`.
- `hooks/use-push-notifications.ts`: subscribes with **Earn's** VAPID key and
  posts to `/api/earn/notifications/subscribe`. Errors are swallowed.
- `features/earn/components/notification-bell.tsx`: its only caller.
- `components/layout/notification-bell.tsx`: the global bell, showing on-chain
  wallet activity from `/api/activity`, with a localStorage read marker.
- There is **no** `app/api/user-management` proxy.

## Decision

### 1. The collision that decides the shape: one subscription per browser

A browser holds **one** push subscription per service worker registration,
bound to the one VAPID key it was created with. Earn's subscription and a
user-management subscription cannot both exist. Registering a different script
at the same scope also replaces the registration.

So the platform subscription wins, and the Earn path is retired in this app:

- One worker, `public/push-service-worker.js`, the name the handoff uses,
  registered once at scope `/`.
- `public/sw.js` is deleted, and the app **unregisters any existing `/sw.js`
  registration** on first load after this ships, so a stale Earn worker cannot
  keep showing notifications.
- Before subscribing to the platform key, any existing subscription is
  `unsubscribe()`d and its endpoint sent to Earn's unsubscribe route, so Earn's
  table does not keep a dead row waiting for a 410.
- `hooks/use-push-notifications.ts` is replaced. The Earn bell keeps its in-app
  feed and loses its private push prompt; there is now one place to turn
  notifications on.

### 2. A proxy, because the browser never holds a gateway URL

`app/api/user-management/[...path]/route.ts`, following the shape of the
existing service proxies: `GET`, `POST` and `DELETE`, an allowlist of exactly
the five user routes above, `isSafeProxyPath`, a verified session
(`verifyRequest`), the bearer token forwarded, `cache: "no-store"`, and the
app's error envelope. `/admin/*` is refused outright, so the admin surface can
never be reached from this app even by path.

Unlike the Earn proxy, **responses are validated at the boundary with Zod** and
mapped to domain types, as AGENTS.md requires, because this is a new route.

### 3. The pure core, `lib/notifications/`

```ts
// routes.ts  — the only place the five paths are written down
export const NOTIFICATION_ROUTES = {
  inbox: (id: string) => `/api/user-management/users/${encodeURIComponent(id)}/notifications`,
  read: (id: string) => `…/notifications/read`,
  vapidKey: (id: string) => `…/push/vapid-public-key`,
  subscriptions: (id: string) => `…/push/subscriptions`,
} as const;

// types.ts + schema.ts — InboxNotification, InboxPage, zod parsers
export interface InboxNotification {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  url: string;
  imageUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

// push.ts — support detection, base64url → key bytes, subscription DTO
export type PushSupport = "supported" | "needs-install" | "unsupported";
export function pushSupport(win?: Window): PushSupport;
export function applicationServerKey(base64url: string): ArrayBuffer;
export function toSubscriptionDto(sub: PushSubscription): PushSubscriptionDto;

// payload.ts — the worker's contract, written down once
export interface PushPayload {
  campaignId: string;
  title: string;
  body: string;
  url: string;
  imageUrl: string | null;
  tag: string;
}
export function readPushPayload(raw: unknown): PushPayload | null;

// destination.ts — where a notification may send the reader
export function notificationDestination(
  url: string
): { kind: "internal"; path: string } | { kind: "external"; href: string } | null;
```

`notificationDestination` is a security boundary, not a formatter. The backend
accepts a relative path **or** an absolute HTTPS URL, so the worker and the UI
must both refuse anything else: no `javascript:`, no protocol-relative `//host`,
no `http:`. An external destination opens with `noopener`.

### 4. The service worker

`public/push-service-worker.js`, plain JavaScript, caching nothing and
intercepting no fetch, because a caching worker on a trading surface would
serve stale prices.

- `push`: read the payload, and show `title`, `body`, `icon`, `badge`,
  `image: imageUrl`, `tag`, `renotify: true`, `data: { url, campaignId }`,
  inside `event.waitUntil`. A payload without a title shows nothing.
- It also `postMessage`s every open client, so a tab that is already open
  refreshes its bell at once rather than waiting for the next poll.
- `notificationclick`: close, then focus a client already on the target path
  and otherwise open one. Validate the destination first.
- `pushsubscriptionchange`: re-subscribe with the old options and POST the new
  subscription to the proxy. Best effort: the hook's reconciliation on load is
  the mechanism, since Chrome fires this only from 138 and Edge and iOS Safari
  never do.
- Tested by evaluating the file in `node:vm` against a stub `self`.

### 5. A web app manifest, for iOS

`app/manifest.ts` with `display: "standalone"` and 192/512/maskable icons, and
`metadata.manifest` in the root layout. **On iOS and iPadOS, Web Push only
exists for a site installed to the Home Screen**; without a manifest the entire
iOS audience cannot receive a notification. It also exempts the app from
Chrome's automatic revocation of notification permission on low-engagement
sites. `/push-service-worker.js` gets `Cache-Control: no-cache, no-store,
must-revalidate` in `next.config.ts`, so a stale worker cannot outlive a deploy.

### 6. Hooks

```ts
// hooks/use-notification-inbox.ts
export function useNotificationInbox(): {
  items: InboxNotification[];
  unreadCount: number;
  hasMore: boolean;
  loadMore(): void;
  markRead(ids: string[]): Promise<void>;
  markAllRead(): Promise<void>;
  isLoading: boolean;
  error: unknown;
  refetch(): void;
};

// hooks/use-push-subscription.ts
export type PushState =
  | "unsupported"
  | "needs-install"
  | "unavailable" // server has no VAPID key
  | "prompt"
  | "enabling"
  | "enabled"
  | "blocked"
  | "failed";
export function usePushSubscription(): {
  state: PushState;
  error: string | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
  retry(): void;
};
```

- `unreadCount` comes from the server and is the badge, not a count of loaded
  rows.
- Marking read is optimistic and rolls back on failure. "Mark all" sends `{}`;
  `ids: []` would update nothing, which is the handoff's trap.
- The inbox is cleared from the query cache on sign-out or account switch: it
  is another person's private data otherwise. The push subscription follows the
  new account through the silent refresh above.
- `enable()` runs only from a click, which iOS requires. `blocked` is terminal
  and never re-prompts. `disable()` unsubscribes in the browser **and** deletes
  the row upstream.
- **Silent refresh on every signed-in load**, which the handoff asks for
  directly: when a subscription already exists, POST it again without ever
  calling `requestPermission`. The route is an upsert, so this refreshes the
  keys and the last-used timestamp, moves the endpoint to whoever is now signed
  in (which is how account switching is handled), and repairs the common case
  where the browser kept its endpoint but the server row was lost. No stored
  fingerprint is needed: the server reconciles, not the client.
- A `null` public key renders as `unavailable`: the inbox still works and the
  toggle explains push is off server-side. This is the state to expect until
  ops sets the VAPID keys.

### 6b. Contract details taken from the handoff, not guessed

- The inbox cursor is an **opaque ISO timestamp**. It is sent back exactly as
  received, URL-encoded, and never generated on the client.
- `limit` is 1 to 100, default 50.
- `ids` on mark-read holds at most 100 UUIDs, and they are
  `InboxNotification.id` values, never `campaignId`.
- `title` and `body` are rendered as text. Never `innerHTML`: they are
  operator-authored strings that reach every user.
- `imageUrl` is used only as an image source, with a layout fallback when it is
  null or fails to load.
- Web Push and the WebSocket frame are **best-effort signals**. The REST inbox
  is the record, and inbox state is never built from a push message or a frame.

### 7. The bell

The global bell keeps its activity list and gains the inbox above it, as two
labelled sections in the one panel:

```
┌──────────── bell ─────────────┐
│ 🔔 Get notified    [Turn on]   │  ← soft ask, only when it can be turned on
│ ── Notifications ──────────────│  ← the inbox: unread dot, title, body, time
│ ── Activity ───────────────────│  ← today's on-chain list, unchanged
└────────────────────────────────┘
```

- The badge becomes `unreadCount` plus the existing unread activity count.
- Opening the panel no longer silently marks platform notifications read;
  reading one marks that row, and an explicit "Mark all read" marks the rest.
  Activity keeps its existing localStorage marker.
- Clicking a notification marks it read and navigates to its destination.

### 8. Strings

A `notifications` namespace in all five catalogues, covering the soft ask, each
push state, the inbox empty and error states, relative times and the mark-read
actions.

## What is not changed

- The activity feed, its endpoint, its polling and its read marker.
- Earn's in-app notification feed, its bell and its API.
- Any trade, money or portfolio path.
- The admin surface, which is not reachable from this app at all.

## Consequences

**Positive**

- A broadcast reaches a laptop with the tab closed, which is the thing that did
  not exist before.
- One subscription, one worker, one place to turn notifications on and off, and
  one inbox that is the durable record.
- iOS can receive notifications once the app is installed.

**Negative and risks**

- **The VAPID keys are set on the deployed service** (confirmed by the
  maintainer on 2026-09-21), so delivery should work end to end. The
  `unavailable` state is still built, because `publicKey` can be `null` on a
  local or preview environment whose keys are unset, and the app must say so
  rather than showing a button that cannot work.
- Earn's own push stops. Its notifications stay in its in-app feed, and the
  platform toggle replaces its prompt. That is a visible behaviour change for
  anyone who had enabled Earn push.
- Only broadcasts exist, so the inbox will be empty for most users at first.
- A user with more than ten browsers loses their oldest subscription, which is
  the service's cap, not something the frontend can change.

## Alternatives considered

- **Keep both workers and both subscriptions.** Impossible: one registration
  per scope, one key per subscription.
- **Leave Earn owning push and add the inbox only.** Rejected: the broadcast
  would never reach a closed tab, which is the whole point.
- **A separate notifications page instead of the bell.** Rejected for now: the
  bell is where people already look, and there is no settings page in this app.
- **Subscribe to the realtime `user:<did>` frame for instant refresh.**
  Deferred. The worker's `postMessage` covers an open tab, and the gateway
  client in this app is feature-bound to prediction. Worth doing when a
  per-user event stream lands.

## Test plan

- `lib/notifications/*`: schema parsing including a null `imageUrl` and an
  absent `nextCursor`; destination validation rejecting `javascript:`,
  `//host`, `http:` and accepting a relative path and an HTTPS URL; support
  detection across server, desktop, iOS tab and iOS standalone; key decoding;
  DTO shape matching the service's validator exactly.
- `public/push-service-worker.js` through `node:vm`: a valid payload shows one
  notification with the right tag and data; a foreign payload shows nothing;
  open clients receive the message; a click focuses a matching client rather
  than opening a second window; an external URL opens with `noopener`; a
  malformed URL opens nothing.
- The proxy route: the five paths allowed, `/admin/*` refused, a session
  required, upstream errors mapped, and a bad upstream shape becoming a 502
  rather than reaching a component.
- `use-notification-inbox`: pages with the cursor, stops at `null`, dedupes by
  id, optimistic mark-read with rollback, "mark all" sending `{}`, the server's
  `unreadCount` as the badge, and the cache cleared on sign-out.
- `use-push-subscription`: every transition; nothing requested without a click;
  `blocked` never re-prompts; `disable` calls both sides; a changed endpoint
  re-registers; a `null` key renders `unavailable`; a 409 from subscribe is
  reported as not configured.
- The bell: both sections, the combined badge, reading one row, mark all, and
  every existing activity assertion still passing unedited.
- `lib/i18n-catalogs.test.ts` for the new namespace in all five catalogues.
- `./scripts/preflight.sh`, then a manual pass on `localhost` (a secure context
  already) against staging, and an installed iOS check if ops has the keys set.
