---
date: 2026-09-21
feature: The notification inbox and browser push
scope: notifications
scenario-impact: needs_automation
adr: docs/adr/ADR-2026-09-21-user-notifications-and-web-push.md
plan: docs/plans/2026-09-21-user-notifications-and-web-push-plan.md
---

# The notification inbox and browser push

The backend's notification service (`apps/user-management`) publishes an admin
broadcast to every user: a durable inbox row each, and a browser push to every
registered device. This is the user half of it. The admin composer lives in the
admin dashboard, because those routes need an admin key that must never reach a
public bundle.

## What a reader sees

The bell in the top bar now holds two sections:

- **Notifications**: the broadcasts sent to them, newest first, with unread
  marks, "Mark all read", and older pages on request. Clicking one marks it read
  and opens where it points.
- **Activity**: their on-chain wallet history, exactly as before.

The badge counts unread notifications from the server plus unread activity.
Opening the panel still marks activity read and deliberately does **not** mark
notifications read.

Above them, one row about push itself:

- **Off**: what the alerts are for and a "Turn on" button. The browser's own
  permission dialog is never raised until that button is pressed.
- **On**: "On for this device", with "Turn off".
- **Blocked**: how to undo it in site settings. No button, because a browser
  will not ask again once denied.
- **iPhone or iPad in a tab**: how to add the app to the Home Screen, which is
  the only way Apple allows web push.
- **Push switched off server-side**: said plainly, instead of a button that
  cannot work.
- A browser that cannot do push at all sees nothing.

## What was added

- **`app/api/user-management`**: a proxy over exactly five user routes, session
  verified, `/admin/*` refused by name, every response validated with Zod at the
  boundary and never cached. A 409 (push not configured) and a 400 pass through
  with their own status, so the UI can tell them from a transient failure.
- **`lib/notifications`**: the inbox types and parsers, push support detection
  (including iPadOS reporting itself as a Mac), VAPID key decoding that rejects
  a malformed key instead of failing opaquely inside `subscribe()`, the
  subscription DTO checked against the service's own limits, and the destination
  validator.
- **`public/push-service-worker.js`**: caches nothing, intercepts no fetch.
  Shows one notification per push, tells open tabs to refresh their bell, and on
  a click focuses a tab already on the target path instead of opening a second
  one.
- **`app/manifest.ts`**: `display: "standalone"` with 192/512/maskable icons.
  This is what makes the app installable, and on iOS installation is the only
  way push works at all. It also exempts the app from Chrome's automatic
  revocation of notification permission on low-engagement sites.
- **`/push-service-worker.js` headers** in `next.config.ts`, so a stale worker
  cannot outlive a deploy.

## Security decisions worth recording

- **A notification's destination is validated before anything navigates.** A
  relative path or an absolute HTTPS URL is allowed. `javascript:`, `data:`,
  `http:`, `//host`, `/\host` and credential-carrying URLs such as
  `https://docs.example.com@evil.com` are refused: that last form reads as one
  host and navigates to another. An invalid destination renders as plain,
  unclickable text.
- **The push endpoint is a capability URL**: anyone holding it can push to that
  device. It is never logged, never put in an error message, and never stored
  beyond the subscription itself. The same holds for the Privy DID and the
  access token.
- **`title` and `body` are rendered as text, never as HTML.** They are
  operator-authored strings that reach every user.
- The inbox is private and is deliberately kept out of the localStorage query
  snapshot. It is dropped from the cache on sign-out or an account switch.

## Earn's push is retired

A browser holds one push subscription per service worker, bound to one VAPID
key, so Earn's and the platform's could not coexist. The platform now owns it.

On first load after this ships, and only for a registration whose script is
`/sw.js`: the old endpoint is captured, unsubscribed, sent to Earn's unsubscribe
route so its table does not keep a dead row, and then the registration is
removed. Earn's in-app notification feed is unchanged; only its private push
prompt is gone. Anyone who had Earn push enabled turns the new one on once and
then receives every platform broadcast as well.

## Two things the service does not do yet

- **Only admin broadcasts exist.** Inbox rows are written solely by a campaign
  publish; there is no per-user notify route and no event-bus consumer, so "your
  order filled" cannot be sent yet. That is a backend change the maintainer is
  raising separately. The browser half here is the same either way.
- `pushsubscriptionchange` cannot re-register from the worker: that call needs a
  verified session and the user's DID, and caching a DID on disk would outlive
  sign-out. The worker tells the page, and the page re-registers. With no page
  open, the silent refresh on the next signed-in load repairs it.

## Scenario impact

`needs_automation`. Permission dialogs, service workers and a real push service
cannot be exercised in jsdom. Before this merges, against staging on `localhost`
(already a secure context):

1. Signed-in load: exactly one inbox read, and if already subscribed exactly one
   silent `POST push/subscriptions` with no permission dialog.
2. Turn on from the bell, receive a real broadcast with the tab open (the bell
   updates without a reload) and with the tab closed (the OS notification
   arrives, and clicking it focuses the existing tab).
3. Turn off, and confirm both the browser subscription and the server row are
   gone.
4. A broadcast with an external HTTPS url opens a new tab; one with a
   `javascript:` or `//host` url renders as plain text and navigates nowhere.
5. The Earn migration on a browser that actually has Earn push enabled.
6. Account switch in one browser: the first account's rows disappear and the
   endpoint moves to the new user.
7. Installed on iOS, since that path cannot be reached any other way.
8. `curl -I` the deployed preview for `/push-service-worker.js` and confirm the
   content type and `no-store`. A wrong content type stops the worker
   registering at all.

## Strings

A new `notifications` namespace, 22 keys, in all five catalogues. Relative times
reuse the existing `activity` namespace.

## Tests

New: `lib/api/user-management-proxy-paths`, `lib/api/schemas/user-management`,
the proxy route, `lib/notifications/*` (six suites),
`__tests__/push-service-worker.ts` driving the worker through `node:vm`,
`use-notification-inbox` and `use-push-subscription`. Extended: the global bell,
which keeps its six activity tests unedited and adds eighteen.

The worker test also runs the same payloads and URLs through both the worker and
`lib/notifications`, asserting identical results, because the worker cannot
import from the bundle and the two copies would otherwise drift.
