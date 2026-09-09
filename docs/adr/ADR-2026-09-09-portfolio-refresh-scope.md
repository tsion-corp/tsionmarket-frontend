# ADR-2026-09-09: Balances after a trade without the 28-network sweep

## Status

Proposed — 2026-09-09. Awaiting the maintainer's approval; built and tested
so the approval is made against working code.

## Context

The request-volume audit (docs/audits/2026-09-08-request-volume-audit.md)
and the map taken on 2026-09-09 agree on where the chain-RPC volume of a
trade goes. The trade itself now costs eight provider calls
(ADR-2026-09-09-one-call-sponsorship). What follows it costs up to forty
times more:

1. `usePortfolio().refetchUntilChanged()` reads `/api/portfolio?fresh=1` up
   to six times over forty seconds until the balances move.
2. `fresh=1` skips the portfolio snapshot cache, skips the per-network
   holdings cache on **all 28 EVM networks** including the cold ones the
   wallet has never held anything on, and re-runs the Solana leg through
   Alchemy's Portfolio API, which is not cached on its own.
3. Each cold network read is one JSON-RPC batch of two calls. About 340
   chain calls per trade per user, plus up to six Portfolio API pages.

Three more problems sit next to it:

- The bank on-ramp order is polled by three components at once from the
  dashboard (3 s, 15 s, 20 s). React Query runs the shortest, so a user who
  has just paid is polled at 3 s for as long as the sheet is open and at
  15 s after it closes, from every page.
- The crypto withdraw screen quotes through `POST deposit/quote`, which
  allocates a Dextopus deposit address per call, and re-quotes on every
  debounced amount change and every recipient character. Dextopus documents
  a `dry: true` flag that prices without persisting a request, probed live
  on 2026-09-09 with the trade key.
- `/api/evm-rpc` reads only ZeroDev and fails closed when it cannot answer,
  while the server sweep (`lib/server/evm-read.ts`) already falls back to
  the Alchemy key pool. ZeroDev's RPC is documented as a bundler and
  paymaster endpoint; plain reads through it are an undocumented behaviour
  that four of our chains already refuse.

## Decision

### 1. Fresh reads are scoped to networks

- `lib/portfolio/fresh-scope.ts` (pure): a fresh scope is `"all"` or a list
  of network slugs. `fresh=1` on the wire still means all; `fresh=<slug>,…`
  names networks. The route validates slugs against the known list.
- `fetchPortfolio(evm, solana, scope)` skips the snapshot cache for any
  scope, but `readHoldings` is told `fresh` only for the networks in scope.
  Cold networks keep their ten-minute cache. The Solana leg gets its own
  75 s cache entry and is re-read only when `solana-mainnet` is in scope.
- `usePortfolio()` exposes `refetchFresh(networks)`,
  `refetchUntilChanged(networks)` and `waitForTokenBalance(network, …)`.
  Every caller names the network its trade touched. A caller that cannot
  name one passes `"all"` explicitly, and there is none in this change.

### 2. The receipt patches the balance before any read

`lib/portfolio/apply-transfers.ts` (pure) takes a portfolio, the wallet and
the ERC-20 Transfer logs of a receipt and returns the portfolio with every
touched row's `rawBalance`, `balance` and `valueUsd` moved by the logged
amounts, and `totalUsd` re-summed. `usePortfolio().applyReceipt(network,
wallet, logs)` writes that into the query cache. It only moves rows the
portfolio already has; a coin not yet listed waits for the read. The read
that follows overwrites it within seconds, and the minute poll after that.
No receipt, no patch: the flow is then exactly what it was.

### 2b. A snapshot missing a network says so and does not linger

Seen on the dev server on 2026-09-09: ZeroDev timed out on Base during a
cold dashboard render, Base missed the sweep's ten-second deadline, and the
snapshot without the wallet's USD was cached for 75 s. The balance read
$1.96 instead of $9 for up to a minute. Now the sweep reports the networks
that did not answer, the portfolio carries them as `missing`, a snapshot
missing a hot network lives 5 s in the server cache instead of 75, and the
client polls it again after 5 s instead of 60. This was not caused by the
scoped reads; it is the deadline behaviour from
ADR-2026-09-07-portfolio-balances-via-multicall, made visible by a slow
provider.

### 3. One cadence for a ramp order

`useRampOrder` owns its interval: 3 s for the first minute after the order
is created or confirmed, 15 s after, off once terminal, off while the tab
is hidden. Observers no longer pass an interval, so three observers cost one
request per tick at one cadence.

### 4. Withdraw previews are dry

`useWithdrawQuote` previews with `dry: true`, keyed on the fields that set
the price (origin, destination, amount), not the recipient. The submit
fetches one real strict quote with the recipient, as it does today, and the
user confirms against that number.

### 5. The read proxy falls back to Alchemy

`lib/server/evm-rpc.ts` loads through `readEvm()` from
`lib/server/evm-read.ts`: ZeroDev first, the Alchemy key pool when ZeroDev
cannot serve the chain or the method or is rate limited, with the same
cooldowns the server sweep uses. The proxy's own cache, inflight dedupe,
concurrency cap and stale-serve stay as they are. Two existing tests that
asserted "no other provider" and "fails closed without ZeroDev" are
rewritten to assert the fallback, which is the point of this change.

```
trade receipt ──► applyReceipt(logs) ──► cache patched, UI right, 0 calls
                        │
                        └─► refetchUntilChanged(["base-mainnet"])
                                  │
                                  ▼
                 /api/portfolio?fresh=base-mainnet
                    snapshot cache: skipped
                    base-mainnet holdings: re-read   (1 batch, 2 calls)
                    27 other networks: cached
                    solana leg: cached (75 s)
```

## Alternatives considered

- **Alchemy Address Activity webhooks** (30 EVM chains plus Solana) telling
  the server which wallet moved on which network, replacing the timed sweep
  entirely. The right end state; it needs a store every serverless instance
  can read, which is a platform decision, so it is not in this change.
- **Dextopus deposit webhooks** for the crypto deposit wait. None is
  registered with Dextopus today. Same store requirement. Deferred.
- **`use cache` in Next.js 16** for the per-instance server caches. Plain
  `use cache` is in-memory per instance; the cross-instance variant needs
  `cacheComponents`, which ADR-2026-09-06 kept off. The `fetch` data cache
  the catalogue routes already use is the shared primitive available today.

## Consequences

- A trade costs about two chain calls after the receipt instead of about
  340, and the balance on screen is right at the receipt instead of after
  the first successful poll.
- A bank deposit in progress costs one request per 3 s for a minute, then
  one per 15 s, from one place, instead of up to three at once.
- A withdraw preview allocates no Dextopus addresses. Only the confirmed
  amount does.
- Balance reads keep working through a ZeroDev outage or rate limit, at
  Alchemy's cost while it lasts, and every fallback is logged with the chain
  and the reason.
- Verification: pure tests for the scope parser and the transfer patch;
  route and `fetchPortfolio` tests for which networks a scoped fresh
  re-reads; `useRampOrder` cadence with three observers; dry-quote body and
  key; proxy fallback on 429, on an unsupported chain and on a missing
  project id; the five gates; and a buy, a sell, a bank deposit and a
  withdraw preview on the dev server with the Network tab open.
