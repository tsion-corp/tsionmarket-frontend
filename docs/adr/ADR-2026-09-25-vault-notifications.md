# ADR-2026-09-25: Getting Last Man Standing notifications to players

- Status: **Proposed — awaiting human approval**
- Date: 2026-09-25
- Area: `hooks/use-notification-inbox`, `components/layout/notification-bell`, `app/api`
- Author: Claude Code. **Not self-approvable** (Directive 2).

## Context

The vault publishes notifications when a game opens, settles, and when
somebody wins. The frontend has a working notification system: a bell in the
shell, an inbox, unread counts, web push, a service worker.

They are not connected, and the reason is not a missing hook.

### There are two notification systems, and we use the other one

Verified live on api.tsionark.com on 2026-09-25. Both answer 200 on `/health`
and 401 unauthenticated, so both exist and both are deployed.

|                           | `notification` service           | `user-management`                              |
| ------------------------- | -------------------------------- | ---------------------------------------------- |
| Inbox path                | `/v1/notification/notifications` | `/v1/user-management/users/{id}/notifications` |
| Filled by                 | RabbitMQ, from other services    | an operator, via `admin/notifications`         |
| The vault publishes here  | **yes**                          | no                                             |
| The frontend reads here   | **no**                           | yes (`lib/notifications/routes.ts`)            |
| VAPID public key endpoint | **none**                         | yes                                            |

`lib/notifications/routes.ts` points every path at `/api/user-management`. So
the bell shows operator announcements, and the vault's `vault.game.won` goes
into a store nothing in the app reads.

This is the whole of item 3. The frontend work people assumed was needed —
an inbox, a bell, push plumbing — is already built and generic: it renders
whatever title, body and url a notification carries, with a security boundary
on the url (`lib/notifications/destination.ts`). It does not need to learn
about vault events. It needs to be pointed at the store they land in.

### What the vault actually sends

From `apps/world-street-vault/src/events/vault-notifications.ts`:

| Event                       | Audience             | Durable? | Channels     |
| --------------------------- | -------------------- | -------- | ------------ |
| `vault.game.started`        | everyone             | **no**   | ws           |
| `vault.game.settled`        | everyone             | **no**   | ws           |
| `vault.game.won`            | the winner's wallet  | **yes**  | ws + webpush |
| `vault.game.starter_earned` | the starter's wallet | **yes**  | ws + webpush |

Two consequences that shape the design:

- **Only two of the four can ever reach an inbox.** Ephemeral means delivered
  live and stored nowhere. A bell badge will only ever count wins and starter
  shares. "A game opened" is a live ticker or it is nothing.
- **There is deliberately no wager notification.** Every join resets a
  60-second timer, and the vault's own comment says notifying on each would
  train people to ignore the channel. We must not add one client-side.

### The trap, and why it is probably already handled

`apps/notification/llms.txt`: _"a wallet nobody has signed in with resolves to
nobody and the notification is dropped, not stored."_ A winner the service
cannot resolve gets **nothing**, permanently and silently.

The code is more forgiving than the doc. `requireIdentity` calls `recordWallet`
on **every authenticated request** (`src/auth/identity.ts:146`), not only on an
inbox read, and for a Decane session it resolves the EVM wallet from the
caller's own access token (`identity.ts:170`). The link is written as a
non-fatal enrichment: if it fails, the caller still reads their inbox.

So any authed call to the service seeds the link, including the unread-count
poll. `NotificationBell` mounts in the topbar and `useNotificationInbox` is
`enabled: userId !== null`, so pointing it at this service means seeding
happens on first load, before anyone has won anything.

That is an argument for the design, not a reason to skip checking it. The
failure is silent, so it stays the acceptance test below.

## Decision

1. **Read both, drop neither.** The `notification` service is added as a
   second inbox source alongside user-management. Both stores are functional
   and both carry things a user wants: operator announcements in one, vault
   payouts in the other. Confirmed as a product requirement by the maintainer
   on 2026-09-25, so it is a constraint here rather than a preference: no
   design that retires one of the two is acceptable.
2. **Merge in the bell.** `notification-bell.tsx` already merges two sources
   (an activity feed and the inbox) and computes one badge. This is a third,
   sorted by time.
3. **Proxy it at `app/api/notification/[...path]`**, allowlisting only the five
   routes the bell needs: the inbox, the unread count, the two read routes, and
   the push subscription pair. Every one session-verified.
4. **Do not build per-event rendering.** The service ships templates for all
   four vault types. If a title reads badly, that is a template change on the
   backend, where it is fixed once for every client.
5. **Verify the seeding before shipping**, by signing in with an account that
   has never read that inbox, winning or simulating a win, and confirming the
   notification arrives. If it does not, the fix is an explicit inbox read on
   sign-in, and that is cheap; the expensive thing is not checking.
6. **Leave push on user-management for now.** The notification service has no
   VAPID public key endpoint, so a browser cannot subscribe to it. Vault wins
   will arrive in the inbox and live over the socket, but not as a phone
   buzz, until the backend exposes one. This is a gap we name rather than
   work around.

## Shape

```
  vault ──► RabbitMQ ──► notification service ──┐
                                                 ├──► bell (merged, one badge)
  operator ──► user-management ─────────────────┘
                     │
                     └──► web push (VAPID lives here)
```

## Consequences

**Good.** Players learn they won without watching the tab. The existing bell,
inbox, unread handling and security boundary are reused whole. No new UI
concept.

**Costs.** A second inbox query and a second proxy. Two stores means two
sources of truth for "read", and marking one does not mark the other; the
merge is display-only and each source keeps its own read state.

**The push gap is real.** Until the notification service exposes a VAPID key,
a win reaches the app but not a closed phone, which is the case the vault
marked `webpush` for. Worth raising with the backend now rather than at the end.

**Ephemeral events stay ephemeral.** A player who was not looking will not see
that a game opened. That is the vault's decision, and we are not going to
persist them client-side to work around it.

## Rejected

**Migrating the bell off user-management.** Loses operator announcements and
the only working VAPID endpoint, to solve a problem that a second source
solves. Ruled out explicitly by the maintainer: both systems stay.

**Asking the backend to merge the two services into one store.** It is their
decision and their timeline, and it would block this on a backend change. It is
also not what "sync the two" asks for: the requirement is that a user sees
everything in one place, which is a client-side merge, not one database. If the
backend ever does consolidate, the second source here becomes dead code and is
deleted, which is a cheap outcome to be wrong about.

**Polling the vault for wins.** A second mechanism for something the
notification service already does, and it would miss the case the whole feature
exists for: the player who is not on the page.

**Adding a wager notification.** The vault deliberately omits it. Adding one
client-side would recreate exactly the noise it avoided.

## How we will know it works

- An account that has never read its inbox still receives a win. **This is the
  acceptance test**, because failing it is silent.
- The badge counts both sources and clearing one does not clear the other.
- An ephemeral event renders live and never appears in the inbox afterwards.
- A notification with a hostile url is refused by the existing destination
  check, which gains a test for a vault-shaped payload.
