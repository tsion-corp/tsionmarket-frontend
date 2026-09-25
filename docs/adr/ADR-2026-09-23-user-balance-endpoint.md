# ADR-2026-09-23: the user balance endpoint

## Status

**Accepted** by the maintainer on 2026-09-23 and implemented, with the
amendment in §1a: after the maintainer supplied the domain definitions, the
"ready to spend" figure moved to this endpoint. The first draft decided no
user-facing surface would move; that is no longer true, and §1a records why the
reasoning changed rather than quietly rewriting it.

Scope is **balance only**. The activity endpoint is out of scope by the backend
lead's decision; the Activity screens shipped in #548 are untouched and keep
their existing data source.

## Context

```
GET /v1/user-management/users/{encodedPrivyUserId}/balance
```

"Native and token balances across the authenticated user's linked wallets."
Takes the Privy **access** token as `Authorization: Bearer`; the `{id}` path
segment must equal the token's `sub` claim, encoded as one segment. Cached in
Redis upstream, with a `data.cached` boolean on the response.

### What this app does today

`GET /api/portfolio` → `lib/server/alchemy.ts#fetchPortfolio` →
`hooks/use-portfolio.ts`, with **52 consumer call sites**. Three of them want a
total. The other forty-nine want `tokens[]` filtered by network and contract
address, to decide whether a trade is affordable, to fund one, or to compute
Max. Around it sit a server-side prefetch that dehydrates into the query cache
before first paint, optimistic receipt application, post-trade settle polling,
per-network cache-busting, and a partial-failure `missing[]` contract.

### The finding that shapes this decision

**The new endpoint is additive, not a replacement**, for two reasons.

**It answers a different question about whose money it is.**
`getEmbeddedWallets` (`lib/user.ts:52`) filters `walletClientType === "privy"` —
the wallets this app created. The endpoint says _linked_ wallets, which in Privy
includes wallets the user connected themselves. Same person, different total,
and no code defect to point at if we silently swap one for the other.

**Nothing consumes an aggregate.** An object of totals with a `cached` flag does
not replace forty-nine call sites that need per-token, per-network rows carrying
base units.

### What the payload settles, including one thing against us

The sample response answers both open questions and corrects an earlier draft of
this ADR.

**Quantities, not dollars — and no dollars at all yet.** Every `usdValue` is
`null`, and so is `totalUsdValue`. Balances arrive as **base-unit strings**
(`"504709067444182"` with `decimals: 18`) alongside a decimal-string
`balanceFormatted`. That is exactly the representation Checklist 4 asks for, and
it means no float ever enters this path.

An earlier draft read that as "nothing displaying a dollar figure can move
here". §1a corrects it: a **settled USDC** figure needs no price, because the
quantity is the dollar amount. A figure that values _other_ assets still cannot
move here, which is why the main balance does not.

**It does not fill the games/vault gap.** An earlier draft proposed landing this
in `useGlobalBalance`, whose comment documents a missing games balance. The
payload disproves it — these are wallet native and ERC-20 balances, and that
comment says precisely why they cannot serve:

> Games/vault balance is intentionally excluded: world-street-vault has no
> per-user balance concept anywhere today … showing a real games balance here
> needs a new per-user endpoint on that service first.

That gap needs an endpoint on the **vault** service, not this one.

**Base only.** `chains: ["0x2105"]` (8453). `slot: null` on the wallet entry
suggests Solana is anticipated and absent. Narrower than the portfolio path's
five EVM chains plus Solana — which is a gap for a _valuation_ and the correct
scope for _settled cash_, since Base is where this platform settles.

**A 15-second freshness window.** `generatedAt` and `staleAt` are 15s apart —
useful for `staleTime`, and not an invitation to poll at that rate.

## Decision

### 1. Add the route and its parser; do not move the headline number

Two entries of work at the boundary, which must land together:

- `lib/api/user-management-proxy-paths.ts` — add a `["balance"]` tail, `GET`.
  The matcher already validates the did segment generically and forwards the
  query string verbatim, so no structural change is needed.
- `lib/api/schemas/user-management.ts` — add the schema **and** its branch in
  `userManagementSchemaFor`.

The second is not optional and not cosmetic: `lib/server/validate-upstream.ts:15`
treats a null schema as a pass, so a route added to the allowlist without a
schema works perfectly and is never validated. See §3.

The forty-nine per-token consumers stay on `/api/portfolio`.

### 1a. Amended after review: "ready to spend" moves to this endpoint

The first draft of this ADR decided that **no** user-facing surface would move,
on three grounds. The maintainer then supplied the domain definitions, and two
of the three did not survive them:

> The main balance is a computation of everything the user holds — USDC on
> Base, spot tokens on any chain we support, reward assets, memecoins. The
> ready to spend is the one that has already settled on Base USDC.

- **"It returns no dollars" was wrong.** Settled USDC _is_ dollars. This
  codebase already says so — "Stablecoins are the product's cash: they read as
  dollars, never as a token symbol" — so the figure needs no price source at
  all. That is a property, not a workaround: it is the one number on the card
  that cannot be wrong because a feed was wrong.
- **"It covers one chain" was wrong for this figure.** Everything on this
  platform settles on Base, and "ready to spend" is defined as settled Base
  USDC. Base-only is the correct scope, not a gap.
- **The wallet-set doubt is answered**, empirically: on a real account the main
  balance and the new figure both read $1 after a $1 deposit.

So `readyToSpend` — and only `readyToSpend` — now comes from this endpoint. The
headline total, the token list and the breakdown stay where they are, because
the main balance is a valuation of everything held and this endpoint values
nothing.

**This corrects an overstatement that predates the change.**
`readyToSpendUsd` sums USDC _and USDT_ across _four_ chains — Base, Arbitrum,
Polygon and Solana — and calls the result ready to spend. By the definition
above that has been telling people they can spend money that has not settled on
Base at all. The new figure is narrower because the old one was wrong, not
because coverage was lost.

### 1b. Cash is matched by contract, never by symbol

Anyone can deploy a token on Base and name it USDC, and this endpoint reports
whatever a wallet holds. A symbol test would let an airdropped forgery inflate
the one figure that gates the withdraw button.

The attack is not hypothetical: a sample from the sibling activity endpoint
carried a token calling itself USDC with a homoglyph S (U+1E62), sent from an
address poisoned to match one the reader had genuinely used. A red test proves
the forgery is refused; before the fix it counted as $500 of spendable money.

The address comes from `USDC_BY_CHAIN` (`lib/trade/usdc.ts`), the table the rest
of the app already trades against, so there is no second copy to drift.

### 2. Base units, not floats

Whatever the payload's shape, the parser keeps every figure as a **string** and
any arithmetic runs on scaled `bigint` through `lib/meme/decimal.ts`, which
exists for exactly this and whose header states the contract: _"A float is never
produced, and a null is never turned into a zero."_

This is the moment to get the representation right, because the existing
Alchemy path is the float side of the repo's fault line: `TokenBalance.balance`,
`priceUsd`, `valueUsd` and `Portfolio.totalUsd` are all `number`, and
`toNumber(raw, decimals)` at `lib/server/alchemy.ts:110` is where precision is
lost. We do not extend that.

### 3. Two proxy fixes, while we are in front of wallet balances

**The proxy never checks who is asking.**
`app/api/user-management/[...path]/route.ts:122` verifies the session and
discards the claims:

```ts
if (!(await verifyRequest(req))) return failure("UNAUTHORIZED", …, 401);
```

`userId` and `claims` appear nowhere else in the file. What stops person A
requesting person B's data today is the upstream returning 403 — the proxy is
not a second line of defence. Acceptable for a broadcast inbox; not what we want
in front of balances. Fix: capture the claims and refuse when
`claims.userId !== segments[1]`. One line, one test, and it protects the five
existing routes too.

**An unmodelled route validates nothing, silently.** Fix: a test that every
allowlisted path resolves to a schema, so the omission fails in CI.

### 4. Cache, keys and eviction

- **Query key on the Privy DID**, not the wallet address, because that is what
  the endpoint is scoped by.
- **Evict on account switch** with the `removeQueries` predicate the notification
  inbox already uses (`hooks/use-notification-inbox.ts:143`): _"Another
  account's private mail has no business staying in this tab's cache."_ A
  balance deserves the same. `SessionCacheGuard` only fires on a full sign-out.
- **Not persisted to `localStorage`.** `PERSISTED_PREFIXES` is an allowlist and
  a new key is excluded by default, which is the right default here. Note the
  live inconsistency this exposes: `"portfolio"` **is** persisted today, so
  balances already sit in plain text for up to a day
  (`session-cache-guard.tsx:11` acknowledges it). Not this change's job to fix,
  but recorded.
- **`refetchOnWindowFocus: true` on this query specifically.** The app-wide
  default is `false` (`lib/query-client.ts:10`); the balance hooks that need it
  opt in one by one, and this is one of them.
- **`data.cached` is payload, not a cache header.** The proxy sets `no-store` on
  everything and must keep doing so. If it drives anything, it drives a
  "refreshing" hint, which `use-portfolio.ts:261` already models.

### 5. Realtime is out of scope

The spec describes a `walletBalanceChanged` frame on `user:<did>`. That
subscription does not exist: `notificationCreated`, `walletBalanceChanged` and
the `user:` topic literal have **zero occurrences** in this codebase. The
notifications ADR deferred it explicitly. There are five unshared, feature-bound
WebSocket implementations and none authenticates its connection.

Building it means a shared authenticated gateway client under `lib/`, a global
mount, and an extraction past the lint boundary that stops `lib/` importing a
feature. That is its own decision. Focus refetching covers the gap meanwhile.

## Consequences

**Gained.** A balance with a real parse boundary and no floats. The gap in
`useGlobalBalance` filled. Two latent holes closed in a proxy that already
carries private mail.

**Cost.** Two balance sources coexist until the wallet-set question is settled.
Recorded here so it is a known state rather than a later discovery.

**Risk.** These routes share a circuit breaker with the notification inbox
(keyed on the first path segment after `/api`), so a balance outage would
silence the bell and vice versa. Accept deliberately or give balance its own
segment.

## Blocking question: the response shape

**We have no sample balance payload and no schema for it.** The Swagger line
gives a description and `data.cached`; that is not enough to write a parser, and
guessing one would either reject valid responses or validate nothing.

Needed before implementation: one real response body, or the Swagger schema.
Two things it decides:

1. **Quantities or USD values?** Quantities cost nothing — the price path is
   independent, public and CDN-cached. USD values create a second dollar figure
   per token that will disagree with `valueUsd` from Alchemy, and
   `use-casino-wallet.ts:32` back-derives a unit price from that ratio.
2. **Linked wallets or embedded wallets?** This decides whether the headline
   number can ever move here.

## Alternatives considered

**Repoint every balance consumer at the new endpoint.** Rejected: 49 of 52 need
per-token rows, and the wallet-set semantics are unconfirmed.

**Replace `/api/portfolio` server-side.** Rejected: it carries optimistic
receipt application and settle polling that an upstream cache cannot express.

**Ship the realtime frame with it.** Rejected as scope, not as value.
