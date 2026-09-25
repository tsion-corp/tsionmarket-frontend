# Plan: the notification inbox and browser push

ADR: `docs/adr/ADR-2026-09-21-user-notifications-and-web-push.md`, approved
2026-09-21 including §1 (Earn's own push is retired).

Branch: `feat/user-notifications`, cut from `origin/staging` (`1ffef20f`).
Backend: `apps/user-management` on `tsionark-monorepo@origin/main`. The VAPID
keys are set on the deployed service, confirmed by the maintainer.

## Ground rules for every slice

- Layers point down: `app/` → `features/` → `components/ui/`, `hooks/` → `lib/`.
  No cross-feature imports. No `fetch` in components: the one transport is
  `apiFetch` (`lib/api.ts`), which already resolves and attaches the Privy
  tokens, so call it with `{ requireAuth: true }`.
- Test first. Red, then green. No `any`, no `@ts-ignore`, no empty catch, no
  fallback object standing in for a failure.
- Locale keys are added by the lead before the slices start. A slice needing
  another adds it to all five catalogues and runs `lib/i18n-catalogs.test.ts`.
- Comments: plain English, why rather than what, no em-dashes, matching the
  density of the file being edited.
- Touch only the files your slice owns. If another slice's file needs a change,
  stop and report it.
- **Never log a push endpoint, a Privy DID or an access token.** The endpoint is
  a capability URL: anyone holding it can push to that device.
- `title` and `body` are operator-authored text that reaches every user. Render
  them as text, never through `innerHTML`.

## Slice ownership

| Slice | Owner | Files (new unless marked "edit")                                                                                                                                                                                                                                 |
| ----- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | lead  | ADRs, this plan, `messages/*.json` (edit: new `notifications` namespace)                                                                                                                                                                                         |
| A     | agent | `app/api/user-management/[...path]/route.ts` + test, `lib/api/user-management-proxy-paths.ts` + test, `lib/api/schemas/user-management.ts` + test                                                                                                                |
| B     | agent | `lib/notifications/{routes,types,schema,push,payload,destination}.ts` + tests                                                                                                                                                                                    |
| C     | agent | `public/push-service-worker.js`, `__tests__/push-service-worker.test.ts`, `app/manifest.ts`, `app/layout.tsx` (edit: manifest only), `next.config.ts` (edit: headers only), icons                                                                                |
| D     | agent | `hooks/use-notification-inbox.ts` + test, `hooks/use-push-subscription.ts` + test, `components/layout/notification-bell.tsx` (edit) + test, `features/earn/components/notification-bell.tsx` (edit), delete `hooks/use-push-notifications.ts` and `public/sw.js` |
| E     | lead  | release note, preflight, manual pass against staging                                                                                                                                                                                                             |

Order: 0, then **A, B and C in parallel**, then **D**, then E.

## The contract, verified against the service's code

Every path below is behind the proxy, so the browser calls
`/api/user-management/...` and never the gateway.

| Method + path                               | Body                    | Data                                 |
| ------------------------------------------- | ----------------------- | ------------------------------------ |
| `GET users/{id}/notifications?limit&cursor` | –                       | `{ items, unreadCount, nextCursor }` |
| `POST users/{id}/notifications/read`        | `{ ids? }`              | `{ updated }`                        |
| `GET users/{id}/push/vapid-public-key`      | –                       | `{ publicKey: string \| null }`      |
| `POST users/{id}/push/subscriptions`        | `subscription.toJSON()` | `{ subscribed: true }`               |
| `DELETE users/{id}/push/subscriptions`      | `{ endpoint }`          | `{ subscribed: false }`              |

- Responses are wrapped: `{ success: true, data: … }`.
- `{id}` is the Privy DID and must equal the access token's `sub`. Encode it
  with `encodeURIComponent` as one segment.
- `limit` is 1 to 100, default 50. `cursor` is an **opaque ISO timestamp** taken
  from `nextCursor` and sent back as received. Never generate one.
- `ids` holds at most 100 `InboxNotification.id` values, never a `campaignId`.
  Omitting `ids` marks everything read; `ids: []` marks nothing.
- Subscribing when the server has no VAPID keys returns **409**.
- The push payload is
  `{ campaignId, title, body, url, imageUrl, tag: "admin:<campaignId>" }`.
- `url` is either an app-relative path starting with one `/`, or an absolute
  HTTPS URL. Nothing else is valid.

## Slice A: the proxy

`lib/api/user-management-proxy-paths.ts`, modelled on
`lib/api/market-square-proxy-paths.ts`:

```ts
/** Exactly the five user routes. Everything else, /admin/* first of all, is refused. */
export function userManagementProxyPath(
  segments: string[],
  method: "GET" | "POST" | "DELETE"
): { ok: true; path: string } | { ok: false };
```

- The shape is `users/<did>/notifications`, `…/notifications/read`,
  `…/push/vapid-public-key`, `…/push/subscriptions`.
- The DID segment is matched, not interpolated: anything with a path separator,
  `..`, or over 255 characters is refused before it reaches the gateway.
- `/admin/*` is refused for every method, with a test naming it, because that
  surface needs an admin key this app must never hold.

`app/api/user-management/[...path]/route.ts`, modelled on
`app/api/earn/[...path]/route.ts` but validating at the boundary:

- `GET`, `POST`, `DELETE`. Every method requires `verifyRequest(req)`; there is
  no public route here.
- `const BASE = process.env.USER_MANAGEMENT_API_URL ?? wsapiService("user-management")`.
- Forwards `Authorization`, sends `cache: "no-store"`, a 15s
  `AbortSignal.timeout`, and `x-forwarded-for`.
- **Validates the upstream body with Zod** (slice A's schemas) and returns our
  domain shape. A mismatch is a 502 `BAD_RESPONSE` with a request id, never a
  raw upstream object reaching a component.
- Errors use the app's envelope: `NOT_CONFIGURED` 503, `UNAUTHORIZED` 401,
  `BAD_REQUEST` 400, `UPSTREAM_ERROR` 502.
- No response is cached: every one of these is private to one user.

`lib/api/schemas/user-management.ts`: `inboxNotificationSchema`, `inboxPageSchema`,
`readResultSchema`, `vapidKeySchema`, `subscribeResultSchema`. `imageUrl` and
`nextCursor` are nullable; `readAt` is nullable.

## Slice B: `lib/notifications/`

```ts
// routes.ts
export const NOTIFICATION_ROUTES = {
  inbox: (userId: string) => string, // /api/user-management/users/<enc>/notifications
  read: (userId: string) => string,
  vapidKey: (userId: string) => string,
  subscriptions: (userId: string) => string,
};

// types.ts
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
export interface InboxPage {
  items: InboxNotification[];
  unreadCount: number;
  nextCursor: string | null;
}

// push.ts
export type PushSupport = "supported" | "needs-install" | "unsupported";
export function pushSupport(win?: Window): PushSupport; // "needs-install" = iOS/iPadOS in a tab
export function applicationServerKey(base64url: string): ArrayBuffer; // throws PushKeyError
export interface PushSubscriptionDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}
export function toSubscriptionDto(sub: PushSubscription): PushSubscriptionDto; // throws on a shape the server rejects

// payload.ts  (the worker mirrors these rules in plain JS)
export interface PushPayload {
  campaignId: string;
  title: string;
  body: string;
  url: string;
  imageUrl: string | null;
  tag: string;
}
export function readPushPayload(raw: unknown): PushPayload | null;

// destination.ts  (a security boundary, not a formatter)
export type NotificationDestination =
  { kind: "internal"; path: string } | { kind: "external"; href: string };
export function notificationDestination(url: string): NotificationDestination | null;
```

`notificationDestination` accepts a single-slash relative path and an absolute
`https:` URL. It refuses `javascript:`, `data:`, `http:`, `//host` and anything
unparsable, because this value decides where a click sends the reader.

Tests: iOS tab and iOS standalone and desktop and server; key decoding with and
without padding and a malformed key; DTO validation matching the service's own
validator (endpoint ≤ 2048, keys ≤ 255, non-empty); payload reading including a
missing title, a null `imageUrl` and foreign JSON; destination accepting
`/perps`, rejecting `javascript:alert(1)`, `//evil.com`, `http://x`, `""`.

## Slice C: worker, manifest, headers

`public/push-service-worker.js` (the handoff's filename), plain JS, no imports,
caching nothing and intercepting no fetch:

- `push`: read the payload with the same rules as `payload.ts`; show one
  notification with `body`, `icon`, `badge`, `image` (when `imageUrl` is set),
  `tag`, `renotify: true` and `data: { url, campaignId }`, inside
  `event.waitUntil`. No title means show nothing.
- Also `postMessage({ type: "notification" })` to every client, so an open tab
  refreshes its bell at once.
- `notificationclick`: `close()`, resolve the destination with the same rules as
  `destination.ts`, then focus a client already on that path and otherwise open
  one. An external destination opens with `noopener`. An invalid one opens
  nothing.
- `pushsubscriptionchange`: re-subscribe with `event.oldSubscription.options`
  and POST to the proxy. Best effort, since Chrome fires it only from 138 and
  Edge and iOS Safari never do; the hook's silent refresh is the mechanism.
- A `SW_VERSION` constant at the top.

`__tests__/push-service-worker.test.ts` evaluates the file with `node:vm`
against a stub `self`, asserting each of the above plus: a foreign payload shows
nothing, a click never navigates a non-matching client, and an invalid
destination opens nothing.

`app/manifest.ts`: `MetadataRoute.Manifest`, `display: "standalone"`,
`start_url: "/"`, colours from the design tokens, 192/512/maskable icons
(generate from `app/icon.svg` with the `sharp` in `node_modules`; if it is
missing, stop and report rather than shipping icons that 404).
`app/layout.tsx` gains `manifest` in its metadata and nothing else.
`next.config.ts` gains a `headers()` entry for `/push-service-worker.js` only:
`Content-Type: application/javascript; charset=utf-8` and
`Cache-Control: no-cache, no-store, must-revalidate`.

## Slice D: hooks, bell, and retiring Earn's push

```ts
// hooks/use-notification-inbox.ts
export function useNotificationInbox(): {
  items: InboxNotification[];
  unreadCount: number;
  hasMore: boolean;
  loadMore(): void;
  isLoadingMore: boolean;
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
  | "unavailable"
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

- The inbox is an infinite query keyed by the signed-in DID, paged with
  `nextCursor`, deduped by `id`. `unreadCount` comes from the server and is the
  badge. It is **not** in `PERSISTED_PREFIXES`: it is private and must not be
  written to the localStorage snapshot. It is removed from the cache on sign-out
  or account switch.
- `markRead` and `markAllRead` are optimistic with rollback. `markAllRead` sends
  `{}`; sending `ids: []` would silently mark nothing.
- The worker's `postMessage` triggers a refetch, so an open tab updates the
  moment a push lands.
- `enable()` only ever runs from a click: iOS requires a gesture and drops the
  prompt otherwise. `blocked` is terminal and never re-prompts. A 409 from
  subscribe means the server has no VAPID key and renders as `unavailable`.
- **Silent refresh**, which the handoff asks for: on every signed-in load with a
  subscription already present, POST it again with no permission prompt. The
  route upserts, so this refreshes keys and ownership and repairs a lost server
  row. Never call `requestPermission` on this path.
- `disable()` unsubscribes in the browser, then DELETEs with the endpoint.
- **Migration off Earn's push**, exactly once per browser: unregister any
  `/sw.js` registration, and before subscribing to the platform key,
  `unsubscribe()` whatever exists and POST that endpoint to Earn's unsubscribe
  route so its table does not keep a dead row. `hooks/use-push-notifications.ts`
  and `public/sw.js` are deleted, and the Earn bell keeps its in-app feed with
  its push prompt removed.

**The bell** (`components/layout/notification-bell.tsx`) keeps its activity list
and gains the inbox above it:

```
┌──────────── bell ─────────────────────┐
│ 🔔 Get notified            [Turn on]   │ ← only when it can be turned on
│ NOTIFICATIONS            Mark all read │
│  • title / body / 2h ago               │ ← unread dot, click marks + navigates
│ ACTIVITY                               │
│  … today's rows, unchanged …           │
└────────────────────────────────────────┘
```

- The badge is `unreadCount` plus the existing unread activity count.
- Opening the panel keeps marking **activity** read as it does today, and does
  not mark notifications read. Reading one marks that row; "Mark all read"
  marks the rest.
- Every existing activity test must pass unedited.

## Strings

The `notifications` namespace, added by the lead in all five catalogues:
`title`, `activity`, `empty`, `error`, `retry`, `markAllRead`, `loadMore`,
`enableTitle`, `enableBody`, `enable`, `enabling`, `enabled`, `disable`,
`blockedTitle`, `blockedBody`, `installTitle`, `installBody`,
`unavailableTitle`, `unavailableBody`, `failed`, `failedOff`, `newCount`.
Relative times reuse the existing `activity` namespace.

## Test strategy

Pure modules get exact unit tests. The worker runs through `node:vm`. The proxy
route is tested as a route handler: each path allowed, `/admin/*` refused, a
session required, a bad upstream shape becoming a 502. The hooks are tested with
a real `QueryClient`, a mocked `apiFetch`, and stubbed
`navigator.serviceWorker`, `PushManager` and `Notification`. The bell is tested
for both sections, the combined badge and every existing assertion. The gate is
`./scripts/preflight.sh`, then a manual pass on `localhost` (already a secure
context) against staging.
