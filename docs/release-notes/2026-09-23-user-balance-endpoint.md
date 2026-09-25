---
date: 2026-09-23
feature: The user balance endpoint
scope: balance
scenario-impact: needs_automation
adr: docs/adr/ADR-2026-09-23-user-balance-endpoint.md
---

# The user balance endpoint

`GET /v1/user-management/users/{did}/balance` is now reachable from this app,
parsed at the boundary and again in the browser, and it is what the balance
card's **"ready to spend"** figure is computed from.

The activity endpoint is out of scope by the backend lead's call. The Activity
screens from #548 are untouched and keep their existing data source.

## Why nothing on screen changes yet

Three reasons, any one of which would be enough not to repoint a figure someone
reads as their money:

- **It returns no dollars.** Every `usdValue` is null, and so is
  `totalUsdValue`. The endpoint reports quantities; this app's prices come from
  its own source.
- **It covers one chain.** `chains: ["0x2105"]` — Base. The incumbent
  `/api/portfolio` path covers five EVM chains plus Solana. `slot: null` on a
  wallet suggests Solana is anticipated and absent.
- **It sums a different wallet set.** The endpoint says _linked_ wallets;
  `getEmbeddedWallets` (`lib/user.ts:52`) filters `walletClientType === "privy"`,
  the wallets this app created. Same person, two legitimate totals. Swapping
  them silently is how "my balance changed overnight" happens.

What landed is the whole vertical slice, so wiring a consumer later is a
component change rather than an integration.

## Two security fixes to the shared proxy

Both are in `app/api/user-management/`, which already carries private mail and
now carries wallet balances.

**The proxy never checked who was asking.** It verified the session and threw
the claims away, so what stopped person A reading person B's data was the
upstream 403 — the proxy was not a second line of defence. It now refuses with
**403 before any upstream call** when the verified `sub` does not match the did
in the path. This protects the four pre-existing routes too, not just balance.

Two details that are easy to get wrong, both now pinned by tests: the
comparison is against the **raw** path segment, not the allowlist's
percent-encoded form (`:` → `%3A`), which would have refused every legitimate
caller; and it is **case-sensitive**, because folding case could only loosen the
check and make the proxy the one lenient link in a chain where the service
itself is strict.

**An unmodelled route validated nothing, silently.**
`lib/server/validate-upstream.ts` treats a null schema as a pass, so a path
added to the allowlist without a schema relayed whatever the gateway said,
unjudged, and looked perfectly healthy. A test now walks the real allowlist and
asserts every route resolves to a schema. It was verified to fail by
temporarily adding an unmodelled tail.

## Money is a string, end to end

The payload sends base units as decimal strings — `"504709067444182"` with
`decimals: 18` — which is exactly what Checklist 4 asks for, so this path is
float-free from the wire to the domain type. `Number()` is never called on a
balance. `baseUnits` stays a string rather than becoming a `bigint` because a
bigint does not survive React Query dehydration or `JSON.stringify`.

The service sends each figure twice, as base units and as a rendered decimal.
The parser keeps the base units and **fails the parse if the two disagree** — a
service contradicting itself about someone's money is not a coin toss between
two figures.

## The seam between the two halves, and how it was settled

The boundary schema and the browser parser were built in parallel and disagreed
about `usdValue`: the boundary accepted anything, the client demanded null. That
meant the first priced response would have passed the boundary and then failed
in a hook — moving a contract failure off the boundary and into a component,
which is backwards.

Settled the other way: **both tolerate it, and the domain carries no dollar
figure at all.** Pricing is an additive change upstream; refusing the payload
the day it ships would have taken every balance read down until a frontend
release caught up, over a field nothing here reads. Dropping the field beats
carrying `null`, because a type that says `null` would quietly become a lie the
day prices arrive, while a type that says nothing stays true.

Two tests hold this: a priced payload still parses, and the domain carries
neither `usdValue` nor `totalUsdValue`. One earlier assertion that demanded the
opposite was rewritten rather than deleted, with the reversal explained in the
test itself.

## Cache, keys and privacy

- Keyed on the **Privy DID**, which is what the endpoint is scoped by.
- **Evicted on account switch** via the `removeQueries` predicate the
  notification inbox uses. `SessionCacheGuard` only fires on a full sign-out,
  which is not the same event.
- **Not persisted to `localStorage`**, pinned by a test. Worth recording that
  `"portfolio"` **is** persisted today, so wallet balances already sit in plain
  text for up to 24 hours — a live inconsistency this change does not create and
  does not fix.
- `staleTime` is **15 seconds**, taken from the payload's own
  `generatedAt`/`staleAt` gap, which is the upstream Redis window. Shorter than
  the app-wide 60s default, because inside that window the service answers the
  same bytes and this is money.
- **No polling at all.** No `refetchInterval`; focus and explicit invalidation
  are the whole cadence.
- Zod is dynamically imported, with a first-load test, following the pattern the
  notification inbox established after a bundle-budget regression.

## Not in this change

**Realtime.** The spec describes a `walletBalanceChanged` frame on `user:<did>`.
That subscription does not exist — `notificationCreated`, `walletBalanceChanged`
and the `user:` topic literal have zero occurrences in this codebase, and the
notifications ADR deferred it explicitly. Building it means a shared
authenticated gateway client under `lib/`, a global mount, and an extraction
past the lint boundary that stops `lib/` importing a feature. Its own decision.

## Known follow-ups

- **The wallet-set question is answered in practice, not in writing.** On a real
  account after a $1 deposit, the main balance and the new figure both read $1.
  The code narrows the endpoint's wallets to the embedded set regardless, so a
  self-connected wallet cannot inflate a figure the app cannot spend from.
- **Balance and the notification bell share a circuit breaker**, keyed on the
  first path segment after `/api`, so an outage in one silences the other.
  Accepted by default rather than by decision; giving balance its own segment is
  the alternative.
- **One error string is still hardcoded English** — "Could not load your
  balances", the `unwrap()` fallback, following the existing
  `useNotificationInbox` precedent. The user-visible row has its own key
  (`balance.readyToSpendUnknown`, added across all five catalogues); this one is
  the thrown message behind it.
- The proxy's `error.message` reaches the client untranslated for every route,
  not just this one. A localised UI should branch on `error.code`.
- `hooks/use-global-balance.ts` still does `Number(state.withdrawable)` on a
  real USD balance. Untouched here, still a Checklist 4 violation.

## Scenario impact

`needs_automation`. On the preview, with a real account:

1. The request fires on the portfolio screen and "ready to spend" matches the
   account's settled Base USDC.
2. An account holding stablecoins **off** Base: confirm the figure is lower than
   before and that the main balance still counts that money.
3. A settling bank deposit with a known figure under the minimum holds the
   withdraw button; the same account mid-load does **not**.
4. Account switch: the figure does not carry over from the previous account.
5. Slow session: the row shows its placeholder, never "unavailable", before
   settling.

What tests cover and a preview cannot: the 403 on a mismatched did, the
schema-coverage gate, base-unit precision, and the forged-USDC refusal.
