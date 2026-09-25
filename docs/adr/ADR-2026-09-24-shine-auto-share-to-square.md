# ADR-2026-09-24: Shine — auto-sharing activity to Market Square

## Status

**Accepted** by the maintainer on 2026-09-24, with one amendment recorded in
§5: a Shine post carries **no deep link**. It is a plain post, like any other
written in the square.

## Context

A per-service toggle called **Shine**, prominently placed on each service page,
**default ON**. While it is on, a user's confirmed successful action is posted to
their Market Square automatically, with no per-post confirmation.

In scope: memecoin, spot, RWA, prediction markets, perps, arcade/casino games,
sportsbook. **Not** deposits or withdrawals. Each service's toggle is
independent — Shine-on-memecoins is a different setting from Shine-on-perps.

Posts carry **what was done and its PnL as a percentage**. No amounts, no
position sizes, no dollar figures.

### This reverses a documented product position

`components/share/share-to-square.tsx:19` states the current stance as an
invariant:

> It NEVER posts on its own. Everything here is a draft the user edits and
> confirms, because a platform that publishes your activity without asking is a
> different product from one that lets you share it.

And on money, at `:32`:

> On a trading platform one careless tap should not publish a position size to
> strangers.

This ADR supersedes the first sentence deliberately. It **keeps** the second:
excluding amounts is not an oversight in the brief, it is the part of the
original reasoning that still holds, and the post composers are typed so a
dollar figure cannot reach a post by accident.

### What recon established

Two read-only passes mapped every service and every preference mechanism.

**The success moments split in two.** Six services expose success as a resolved
promise inside the handler that ran the action — once per action, no re-fire
possible. Seven expose it as **derived state from a poll or a socket**, which
re-fires on refetch, remount and tab refocus. With a modal that was harmless. As
a public post it is a duplicate nobody approved. The worst case found:
`useGameActivity` polls every 60s and re-serves every settled row indefinitely.

**Five services have no confirmation at all**: spot sell, perps close, ArkBall
wins, prediction (a fill-and-kill acceptance is the strongest signal), and RWA on
chains with no pinned read client.

**`createPost` has no rate limit, retry, queue or dedup** — client or proxy. Its
only 429 handling is a sentence written for a human who just pressed a button.

**Preferences are device-local except one.** `app/api/consent/route.ts` writes
named keys into Privy custom metadata, per account. Sign-out clears exactly one
localStorage key — the React Query snapshot — and nothing else, ever.

**A one-time notice cannot use the notification inbox.** Inbox rows are written
only by an admin campaign that fans out to every user; there is no per-user
notify route and this app cannot reach the admin surface by design.

## Decision

### 1. The toggle lives on the account, not the device

Seven booleans in Privy custom metadata, written through a new
`app/api/preferences` route modelled directly on `app/api/consent/route.ts`,
including its merge-spread so an unrelated key is never clobbered.

This is not a preference about where to store a preference. Sign-out clears no
preference key, so a device-local Shine would mean:

> You turn Shine off for perps. Someone else signs in on your laptop. Their
> first memecoin trade is auto-posted publicly, and they are shown no notice,
> because the "already notified" flag is yours.

That is a privacy incident on a shared device. Account storage removes it
outright, and costs one route.

Read through React Query, **excluded from the localStorage snapshot** — the
notification inbox's reasoning applies unchanged.

### 2. One durable dedup store, and it is the load-bearing piece

`lib/shine/posted-store.ts`: a reload-surviving record of what has already been
posted, keyed by **account DID + service + the service's own natural id**.

Every service already has that id: `swapId` (memecoin), `requestId` (spot, RWA
cross-chain), the action id or tx hash (RWA direct), the Polymarket order id
(prediction), the entry order or position id (perps), `match.id` (chess,
draughts), `settlementTx` (vault), the ticket id (ArkBall), `ticketId`
(sportsbook).

The repo has four dedup patterns; **only one survives a reload** — the
localStorage record behind `clearPendingRwaSettlement`. That is the bar, because
the output is public and nothing downstream can catch a mistake. Chess needed
three hand-rolled guards and still only protects within one tab session.

Keying by DID is what stops an account switch inheriting another person's
"already posted" set.

### 3. Posting goes through a queue, never straight to `createPost`

`lib/shine/queue.ts`: serialises posts, retries with backoff, and consults the
dedup store before and after sending.

A user placing several memecoin trades in a minute would otherwise hit the
gateway's 429 and lose posts silently — there is no button and nobody to read
"you are posting too quickly". Failures are silent to the user, per the brief,
but the queue retries rather than dropping, and a post that has been sent is
recorded before the next is attempted.

### 4. Confirmations we generate rather than invent

For the five services with no confirmation, the fix differs per service, and two
of them need no new machinery at all:

- **Perps open and close** — the confirmation already exists and is discarded.
  `hyperliquid-pro-perps.tsx` calls `waitForPositionsChange(...)` and `void`s
  the promise. That resolving is the fill. Shine consumes it. Nothing new is
  polled, and a resting limit order correctly posts nothing.
- **Spot sell** — reuse the pending-settlement record and reconciler the buy
  path already uses, so a sell confirms the same way a cross-chain buy does.
- **ArkBall** — a win is a field on a polled row, so the event is the _first
  observation_ of `status === "won"` for a ticket id, made safe by §2. This is
  the service most dependent on the dedup store being durable.
- **Prediction** — a filled fill-and-kill order is the strongest signal the
  service offers. Shine posts on it and the copy says what happened, rather
  than claiming a settlement nobody verified.
- **RWA on non-receipt chains** — the code calls its own await "best-effort", so
  Shine does not post there. A post asserting a confirmation the app did not get
  is exactly the failure this ADR is trying to avoid.

### 5. A plain post, stating the entry rather than a verdict

**Amended on approval: a Shine post carries no deep link and no card.** It is
text, exactly like a post someone writes in the square themselves.

That decides the write path. `createPost` requires a deep link and a preview —
its own comment explains why they are inseparable: _"A preview without a deep
link is refused by the service — a card that leads nowhere is not a share."_
Shine therefore uses `createSquarePost(text)`, the call the free-text composer
already makes, with no attachment.

**This also settles the "pumping or dumping" question, by removing it.** A post
is stored once and the square cannot read inside the products. With no deep
link there is nothing for our own surfaces to resolve either, so no enrichment
is possible in v1 — a post cannot move after it is written.

So a post states **what cannot go stale**: what was done, and the entry. "Bought
PEPE at $0.0000042" is true forever; "PEPE is pumping" is wrong within the hour
and cannot be corrected. Anyone reading can see where it is now for themselves.

PnL is a **percentage** wherever it appears, never a stored dollar figure. For an
action whose outcome is known at post time — a won game, a closed position —
that percentage is part of the text. For an entry it is not, because there is no
outcome yet.

### 6. The one-time notice is a toast, keyed to the account

The inbox cannot address one user. A toast is mounted app-wide already. It fires
on the **first** Shine post for an account, and the seen-marker is stored
per-DID, following `lib/consent.ts`'s `recordedFor` shape so two people on one
device each get their own notice.

Failing toward "already seen" when storage is unreadable, per
`features/tour/lib/tour-storage.ts`, so a private-mode session is not toasted on
every page load.

## Consequences

**Gained.** Sharing becomes a property of doing something rather than an errand.
A dedup store and a post queue that the app currently lacks, both of which any
future auto-posting needs.

**Cost.** A reversal of a documented product invariant, recorded here. Seven
service integrations, each touching a feature that already works.

**Risks.**

- **Duplicate public posts** are the failure mode that matters, and §2 is the
  whole mitigation. Every polled service must be proven against remount, refetch
  and reload — not just tested once.
- **Default ON** means the first a user learns of this may be a post that
  already exists. §6 reduces but does not remove that.
- Turning Shine off leaves existing posts up, per the brief. Worth saying in the
  toggle's own copy so nobody expects a retraction.

## Open questions for the backend

**Deep links are no longer blocking.** The original plan needed a ref per
product — a coin page, an RWA asset, a perps market — none of which the square
has. §5's amendment removes that dependency entirely for v1. It returns the day
a Shine post is meant to be tappable.

**Rate limiting remains worth confirming.** A population of auto-posters is a
different traffic shape from people pressing a button, and `createPost` has no
client- or proxy-side throttle today. §3's queue is this app's answer; whether
the square wants its own is theirs.

## Alternatives considered

**Post on submission rather than confirmation.** Rejected: the maintainer asked
for confirmed, and a post claiming a trade that later fails is unretractable.

**Per-device toggle.** Rejected in §1: the shared-device case is a privacy
incident, and the fix costs one route.

**A static "pumping" verdict baked into the post.** Rejected in §5: it is wrong
within the hour and cannot be corrected. With the no-deep-link amendment there
is also no mechanism to correct it later.

**Wiring Shine to `useGameActivity`.** Rejected: a 60-second poll that re-serves
every settled row would post a user's entire game history on a loop.
