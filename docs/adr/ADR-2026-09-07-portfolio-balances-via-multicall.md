# ADR-2026-09-07: Read EVM balances on-chain through the read pool instead of the Portfolio API

## Status

Accepted — 2026-09-07. The maintainer delegated the decision after the
research summary ("please do what is needed"), and asked that ZeroDev's
capability be verified before concluding. It was, chain by chain; the table
is below.

## Context

The team proposed moving reads off the paid Alchemy key and onto ZeroDev,
keeping only gas sponsorship (the policy id) on Alchemy. Research showed:

- Standard EVM reads already go to ZeroDev first (`lib/server/evm-rpc.ts`,
  since #350). The proposal is already the architecture for those.
- The reads that still cost Alchemy compute units are not JSON-RPC. The
  portfolio uses the **Portfolio API** (`assets/tokens/by-address`, 360 CU
  per request, two requests for our 28 EVM networks, up to ten pages each
  because of spam tokens) on every refresh of every signed-in user, at a
  60-second client poll behind a 75-second server cache. Prices use the
  **Prices API** (40 CU). Those are HTTPS REST endpoints; no RPC proxy can
  serve them.
- ZeroDev, probed with the project id in use: standard reads answer on 24 of
  the 28 networks; Gensyn, Soneium, World Chain and Zora answer "No API
  provider supports the requested chainId". Alchemy's own `alchemy_*` token
  methods answer through ZeroDev on only 11 networks, whichever ZeroDev
  happens to route to Alchemy; the rest say "Method not found" or "not
  whitelisted". Eighteen parallel calls produced two 400s and a 502.
  ZeroDev is paid on mainnet (Launch, 69 USD a month) and publishes no read
  rate limit.
- Alchemy's free tier includes the Portfolio and Prices APIs but not mainnet
  sponsorship, at 30M CU a month and 25 requests a second.
- Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`) is deployed on
  all 28 networks (verified by `eth_getCode` on each).
- The holdings allowlist is strict and fully known server-side: native coin,
  tracked stablecoins, Polymarket collateral, two extras, the RWA registry
  and the buyable registry. Everything else is dropped after being fetched.

So per refresh the app pays 720 CU and up (often several thousand with
pagination) to download every spam token a wallet has ever received, then
throws almost all of it away.

## Decision

Read what the allowlist names, directly, with standard JSON-RPC only:

1. **Per network, one batch of two calls**: `eth_getBalance` for the native
   coin and one `eth_call` to Multicall3 `aggregate3` carrying `balanceOf`
   for every allowed contract on that network. No vendor method, so it works
   on whichever provider answers. No pagination, no spam.
2. **Provider order per call** (`lib/server/evm-read.ts`): ZeroDev first;
   a network ZeroDev cannot serve (its own "No API provider" 400, or a
   "method not found" style answer) is remembered for ten minutes and goes
   straight to Alchemy; a ZeroDev 429 backs the whole provider off for a
   minute; a 5xx parks only that chain for two seconds; any other failure
   falls through to the Alchemy key pool for that call. Nothing is retried
   against the same provider. A refresh has a 10-second deadline: a network
   that has not answered is logged and skipped for that refresh.
3. **Hot and cold networks** (`lib/server/portfolio-holdings.ts`), in a
   bounded store of their own rather than the shared 500-entry response
   cache, which 18 wallets' worth of snapshots would overrun: Base,
   Ethereum, Arbitrum, Optimism and Polygon are read on every refresh
   (75-second cache, unchanged). The other 23 are read every ten minutes,
   unless the wallet was recently seen holding something there, or the
   caller passed `fresh=1` after its own transaction, which bypasses every
   cache as it does today. Holdings on a cold chain only change when a buy
   settles there, and that path already sends `fresh=1`.
4. **Metadata on-chain, once**: `decimals`, `symbol` and `name` come from one
   Multicall3 call per network for tokens not yet seen, cached 24 hours. A
   logo is looked up best-effort from Alchemy's token metadata (10 CU, once
   per token per day, process-wide) and is null when unavailable; the icon
   component already has built-in icons and a badge fallback.
5. **Prices by address**, only for tokens actually held, through the Prices
   API in chunks of 25, cached per token for 75 seconds and shared across
   users. Native coins keep the existing by-symbol lookup.
6. **Solana is unchanged** for now: one Portfolio API request per refresh.
   Moving it to the Helius pool is the obvious next step and gets its own
   record.
7. `fetchPortfolio`'s signature, its result shape, `normalize`, the baseline
   rows and the route's error semantics do not change.

### Alternatives considered

- **Move the Portfolio and Prices APIs to ZeroDev.** Not possible; they are
  not RPC.
- **Alchemy's `alchemy_getTokenBalances` through ZeroDev.** Works on 11
  networks by accident of routing. Not a contract; rejected as the basis.
- **Query every allowed contract with individual `eth_call`s.** Hundreds of
  calls per network per refresh; Multicall3 folds them into one.
- **Keep the Portfolio API and only put a free key first in the pool.** A
  valid operations step (documented in the release note) but it moves the
  bill rather than removing the waste, and 25 requests a second is easily
  exceeded by the current call pattern.

## Consequences

Per user per refresh, EVM part, ZeroDev healthy:

|                                  | before                  | after                                      |
| -------------------------------- | ----------------------- | ------------------------------------------ |
| Alchemy CU for balances          | 720 to several thousand | 0                                          |
| Alchemy CU for held-token prices | included above          | 40 per 25 tokens, shared cache             |
| Upstream HTTP calls              | 2 to 20 (paged)         | 5 hot networks per 75s, 23 cold per 10 min |

If ZeroDev is down entirely, the same reads cost 46 CU per network on
Alchemy (26 for the multicall, 20 for the native read): 230 CU per hot
refresh, a third of today's per-refresh floor. Per user-hour, counting the
cold cycle too: 5 × 46 × 48 + 23 × 46 × 6 ≈ 17,400 CU against ≥ 34,560
today, about half.

- The 28 requests per cold cycle and 5 per hot cycle go to ZeroDev, whose
  limits are unknown; the fallback and the one-minute backoff bound the
  damage, and the concurrency gate caps parallel upstream calls at eight per
  instance.
- Holdings on a cold network appear within ten minutes of arriving by any
  path other than an in-app buy (which is immediate via `fresh=1`).
- A token's logo may be missing where Alchemy has none; symbol, name and
  decimals are authoritative from the contract.
- Scenario impact: `none` visible on the hot chains; `updated` for the
  ten-minute cadence on cold chains.

## Verification plan

1. Red: provider order and cooldowns in `evm-read`; one batch per network
   with the allowed contracts, decoding, hot/cold TTLs and `fresh` in
   `portfolio-holdings`; `fetchPortfolio` no longer calls
   `assets/tokens/by-address` for EVM and still does for Solana.
2. Green, then `./scripts/preflight.sh` in full.
3. Dev server: a signed-in wallet's holdings match production's list for the
   same wallet; the Alchemy dashboard shows Portfolio API calls falling to
   the Solana-only rate after deploy.
