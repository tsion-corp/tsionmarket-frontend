# ADR-2026-09-14: Bringing the memecoins feature onto the trade service's frontend contract

## Status

Accepted — 2026-09-14. The maintainer approved this record and its companion
(`ADR-2026-09-14-memecoins-trade-contract-for-dummies.md`) in conversation
("go for what they say we should do") and the five slices in
`docs/plans/2026-09-14-memecoins-trade-contract-plan.md` are being built in
order, one pull request each.

## Context

### The contract

The trade team published `trade-llms.txt`, the canonical frontend contract for
memecoin discovery, market-data rendering, warning consent, Base and Solana
execution, USDC platform fees, gas sponsorship, swap status, and — new since
this app's meme desk was built — a service-side **portfolio, profit/loss and
activity** model. It ends with an eleven-point frontend checklist and says it
overrides "generated SDK types or older UI behavior".

Its non-negotiables, in the order this ADR audits them:

1. Null market fields are never hidden, never coerced to `0`.
2. A token is `chainId + address`; Solana addresses are case-sensitive.
3. `/tokens` is paged until `page * limit >= total`, `limit` at most 500.
4. `LOW_LIQUIDITY` needs an explicit confirmation **before a quote is
   requested**; other warnings are shown and advisory. Only `BLOCKED`,
   `buyEnabled: false`, `sellEnabled: false` or a server error stops a trade.
5. Preview → quote (fresh `Idempotency-Key`) → execute → register every
   submission → poll status; never execute past `expiresAt`; never say
   "successful" before `CONFIRMED`.
6. Solana: the sponsor rewrites the fee payer **before** the user signs; branch
   on `submittedSignature`.
7. Show the USDC platform fee the preview/quote returns.
8. Portfolio valuation nulls render "Valuation unavailable", never `$0` or
   `-100%`; `marketDataUpdatedAt` labels stale marks; `marketValueComplete`
   labels partial aggregates.
9. `/activity` is the user-facing feed; `/swaps` is the lower-level lifecycle.
10. The admin key never reaches the browser.
11. `requestId` is preserved in client logs and support reports.

### What is live on the gateway (probed 2026-09-14)

The contract names `https://api.worldstreetwebservices.com/v1/trade`. From this
machine that host (18.117.108.26) times out at TCP. The app's default gateway
is `https://api.tsionark.com` (`lib/wsapi-base.ts:14`), and every route below
answered there:

| Route                                                         | Result                                                                                                                                               |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /tokens?page=1&limit=500`                                | 200; `meta.total = 100006` (Base 11,502, Solana 88,504); rows carry the full risk block and `status`                                                 |
| first Base page of 500                                        | risk LOW 98 / MEDIUM 58 / HIGH 52 / CRITICAL 261 / UNKNOWN 31; 340 rows carry `LOW_LIQUIDITY`; 258 have `logoUrl: null`; 2 have `liquidityUsd: null` |
| `GET /tokens/trending?limit=500`                              | 200; 500 rows, mixed chains, **with** `riskLevel`, `warnings`, `status`                                                                              |
| `GET /tokens/search?q=bonk`                                   | 200; bare array **without** `riskLevel`, `warnings`, `buyEnabled`, `status`                                                                          |
| `GET /tokens/{solanaMint}` (no `chain`)                       | 400 `INVALID_TOKEN_ADDRESS` with `requestId`, as documented                                                                                          |
| `GET /tokens/{addr}/market                                    | risk                                                                                                                                                 | tradability` | 200; risk carries `assessedAt` and a `disclaimer` string |
| `GET /portfolio`, `/portfolio/summary`, `/activity`, `/swaps` | 401 `UNAUTHORIZED` (bearer required) — the routes exist                                                                                              |
| `GET /admin/tokens`                                           | 401 "Invalid admin API key"                                                                                                                          |
| `GET /gas-sponsor/capabilities`                               | `configured: true`, `previewOnly: false`, sponsor `EBLMEDB15dWkVG9kZhwKwgDbTmcBdCR2tBduZRB7XBZ1`; that wallet held 0.0623 SOL                        |

### What exists in this app

The memecoin surfaces: the desktop desk `app/(session)/(app)/meme/page.tsx`,
the phone Market page's Memecoins tab (`features/trade/components/mobile-market-view.tsx`
→ `meme-trade-ticket.tsx` / `meme-trade-sheet.tsx`), the discovery views
(`meme-grid.tsx`, `meme-trending.tsx`, `memecoins-view.tsx`, `meme-board.tsx`,
`meme-pro-view.tsx`), the dashboard brief (`lib/server/dashboard-feed.ts`,
`app/(session)/(app)/dashboard/discovery/memecoins.ts`), the client
(`lib/meme/api.ts`, `catalog.ts`, `chain.ts`, `funding.ts`, `delivery.ts`,
`sell-amount.ts`, `solana-signature.ts`), the hooks (`use-meme-tokens.ts`,
`use-meme-trade.ts`, `use-meme-swaps.ts`, `use-spot-buy.ts` for the spot desk's
cbDOGE path), the relay (`app/api/trade/[...path]/route.ts` with
`lib/api/schemas/trade.ts`), Solana sponsorship (`app/api/gas-sponsor/solana/*`,
`lib/server/solana-sponsor.ts`, `lib/trade/solana-sponsor.ts`,
`hooks/use-sponsored-solana.ts`), and the portfolio side (`app/api/portfolio`,
`lib/server/alchemy.ts`, `lib/server/buyable-registry.ts`,
`features/portfolio/lib/holdings.ts`, `features/portfolio/components/portfolio-view.tsx`).

The execution core is in good shape: chain-aware identity, wallet linking on
both chains, fresh idempotency keys, ordered Base calls with one registration
per call, the prepare → sign → submit sponsorship order, `expiresAt` checks, a
backoff status poll, and Zod on the token lists and both quote shapes. The gaps
are around it: what the user is shown before and after a trade, how much of the
catalogue the app admits exists, and the entire portfolio/activity model, which
the app still builds from Alchemy balances instead of the service.

### Gap table

Status key: **I** implemented · **P** partial · **M** missing · **C** contradicts.

| #   | Contract rule                                                                                      | Status | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Preserve `requestId` in client logs / support reports                                              | **M**  | `lib/meme/api.ts:136-140` `Envelope` has no `requestId`; `TradeApiError` (`:126-134`) carries `code`, `status` only; the relay's own error bodies (`app/api/trade/[...path]/route.ts:109-116`, `:127-134`) and `lib/errors.ts` never surface it                                                                                                                                                                                                                                    |
| 2   | Admin key never in the browser                                                                     | **I**  | `app/api/trade/[...path]/route.ts:61-66` 404s `admin*`; no `x-admin-api-key` anywhere in `app/`, `lib/`, `features/`                                                                                                                                                                                                                                                                                                                                                               |
| 3   | Bearer + `Idempotency-Key` pass through untouched                                                  | **I**  | `route.ts:68-73, 86-87`; `lib/meme/api.ts:159-171`                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 4   | Fresh UUID per action; reuse only for an identical retry                                           | **P**  | fresh keys: `lib/meme/api.ts:333-340`, `use-meme-trade.ts:172, 241`. `QUOTE_PROVIDER_ERROR` "retry carefully with the same key" is not implemented; no error code is mapped in `lib/errors.ts` (grep for `QUOTE_EXPIRED`, `NO_SWAP_ROUTE`, `HIGH_PRICE_IMPACT`, `TOKEN_BLOCKED` is empty), so upstream `message` text reaches the UI raw                                                                                                                                           |
| 5   | `chainId + address` identity everywhere                                                            | **P**  | correct in `lib/meme/chain.ts`, `api.ts:237-241`, `use-meme-trade.ts:121`, `meme-live-transactions.tsx:26-28`. **Contradicts** in `features/portfolio/components/portfolio-view.tsx:73-93` (`toMemeToken` hard-codes `chainId: 8453` for any held meme) and `memecoins-view.tsx:227, 273` (React keys by address only)                                                                                                                                                             |
| 6   | Solana addresses never lowercased                                                                  | **I**  | `lib/meme/chain.ts:50-53`, `catalog.ts:83-86`, `api.ts:234-241`; `lib/server/buyable-registry.ts:90-91` lowercases but admits Base rows only                                                                                                                                                                                                                                                                                                                                       |
| 7   | Page `/tokens` until `page*limit >= total`, `limit ≤ 500`                                          | **C**  | `app/(session)/(app)/meme/page.tsx:53-55` and `meme-grid.tsx:27-32` fetch page 1 at 500 and call it "all of it" (comment: "a little over 400 rows"); live `total` is 11,502 on Base. `use-meme-tokens.ts:42-58` reads `meta.total` but nothing walks pages. `lib/server/buyable-registry.ts:74` reads `limit=100`, page 1 only                                                                                                                                                     |
| 8   | Never render an unbounded response                                                                 | **I**  | 500 cap; `usePaged` slices client-side                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | Never hide a token because a market field is null                                                  | **P**  | `lib/meme/catalog.ts:175-179` keeps null liquidity/volume. But discovery drops known liquidity < $10k and volume < $100 (`:168-187`), UNKNOWN/HIGH/CRITICAL risk (`:131`), and every Solana row (`:122`) — maintainers' 2026-09-07 instructions (PR #403/#411/#412). On the live first Base page that keeps 156 of 500 by risk alone. The contract says low liquidity is a **consent** flow, not a hide                                                                            |
| 10  | Never coerce null price/liquidity/volume/change to `0`                                             | **C**  | list cells are right (`meme-bits.tsx:36-44, 54-62`; `api.ts:352-356`; `page.tsx:84-86`). Coercions: `page.tsx:115`, `meme-board-chart.tsx:29`, `meme-pro-view.tsx:281, 370` (`Number(priceChange24hPercent ?? "0") >= 0` paints a null change green); `memecoins-view.tsx:170` sorts null volume as 0; `buyable-registry.ts:93-97` stores `priceUsd: 0` for null → `lib/server/alchemy.ts:300-303, 337` values the holding at `$0.00`                                              |
| 11  | `—` / "Data pending" for null                                                                      | **I**  | `metricUnavailable`, `PctChange`, `priceLabel`, `compactUsd` (but `compactUsd` also turns a real `"0"` into `—`, `api.ts:354`)                                                                                                                                                                                                                                                                                                                                                     |
| 12  | No market cap computed from price; no fabricated pair URL                                          | **I**  | none found; `pairAddress`/`dexName` are never rendered                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 13  | Null `logoUrl` → deterministic placeholder                                                         | **I**  | `meme-bits.tsx:47-52` → `AssetIcon` fallback; `discovery/memecoins.ts:91-95`                                                                                                                                                                                                                                                                                                                                                                                                       |
| 14  | Null liquidity = "unknown liquidity", neutral warning                                              | **P**  | kept in lists; no neutral notice is shown anywhere                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 15  | Explicit confirmation for `LOW_LIQUIDITY` before requesting a quote                                | **M**  | no consent component exists (grep `LOW_LIQUIDITY                                                                                                                                                                                                                                                                                                                                                                                                                                   | consent`across`features/trade`, `lib/meme`, `app/(session)/(app)/meme`returns only a comment).`meme-trade-sheet.tsx:248-265`previews as soon as an amount is typed;`:842-852` lists up to three warnings as text but gates nothing |
| 16  | Risk badge + warnings on the trade surface                                                         | **P**  | sheet yes (`meme-trade-sheet.tsx:642, 842-856`); the desktop buy ticket (`page.tsx:164-367`), the desktop sell panel (`meme-sell-panel.tsx`) and the phone ticket (`meme-trade-ticket.tsx`) render **no** warnings or risk badge (grep count 0)                                                                                                                                                                                                                                    |
| 17  | Fresh tradability/risk before trading                                                              | **P**  | the sheet re-reads the token (`:153-155`); the desktop desk trades off the catalogue row (`page.tsx:398-410`); `fetchTradability` (`api.ts:247-252`) is unused                                                                                                                                                                                                                                                                                                                     |
| 18  | Link the wallet for the selected chain before any quote                                            | **I**  | `use-meme-trade.ts:113-145`, relink on `WALLET_OWNERSHIP_MISMATCH` (`:180-191, 250-261`); preview 403 relink in the sheet (`meme-trade-sheet.tsx:270-282`) — not on the desktop desk (`page.tsx` never calls `linkForPreview`)                                                                                                                                                                                                                                                     |
| 19  | Preview after debouncing amount input                                                              | **I**  | 600 ms (`meme-trade-sheet.tsx:41`, `page.tsx:60`)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 20  | Preview shows sell amount, expected, minimum, slippage, impact, risk, **platform fee**, **expiry** | **P**  | expected/min/impact/slippage: sheet `:773-812`, desk `:289-324`, phone ticket. **Fee never rendered** (grep `platformFee` outside `lib/meme/api.ts:42-43, 82-83` hits nothing in memes). Expiry watched in the sheet only (`:284-312`)                                                                                                                                                                                                                                             |
| 21  | Display the fee from preview/quote, never a hard-coded rate                                        | **M**  | as above                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 22  | Never execute after `expiresAt`                                                                    | **I**  | `use-meme-trade.ts:195-197, 274-276`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 23  | Base: execute calls in order, register one hash per `callIndex`                                    | **P**  | `:273-310` does exactly that. When the bundler receipt never arrives, `lib/trade/sponsor.ts:245` throws `SubmittedEvmOperationError` with a `userOperationHash`; `use-meme-trade.ts` neither catches it nor registers `{ userOperationHash }` (the contract's alternative body) — the trade reads "failed" with nothing registered                                                                                                                                                 |
| 24  | Poll status with backoff while `SUBMITTED`/`CONFIRMING`                                            | **I**  | `use-meme-trade.ts:58-63, 209-220, 343-374` (test pins 2/5/10/18 s). No ceiling on the loop                                                                                                                                                                                                                                                                                                                                                                                        |
| 25  | Never show "successful" before `CONFIRMED`                                                         | **C**  | `use-meme-trade.ts:327-340` and `:358-370` set `phase = "confirmed"` on the swap's own Transfer logs when the service records `FAILED`/`REVERTED` or refuses registration with 409; `meme-trade-sheet.tsx:321` and `buy-sheet.tsx:177` treat `received != null` as settled; `use-spot-buy.ts:175-181` toasts "bought". The code documents why (the verifier fails 7702-bundled user operations, `:288-296`, `:351-357`), and the mismatch is tracked as `trade_recording_mismatch` |
| 26  | Solana: sponsor seats fee payer **before** the user signs                                          | **I**  | `hooks/use-sponsored-solana.ts:29-34` prepare → sign → submit; `lib/server/solana-sponsor.ts:104-129`. Deviation: the app uses a two-step prepare/submit against the service's one-call `/solana/sponsor`; the `submittedSignature === null` branch (user broadcasts `sponsoredSerializedTransaction`) is not implemented — `use-sponsored-solana.ts:35-37` throws instead                                                                                                         |
| 27  | Register the Solana signature                                                                      | **I**  | `api.ts:294-300`, `use-meme-trade.ts:206`                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 28  | Solana quote validated at the relay                                                                | **I**  | `lib/api/schemas/trade.ts:48-53`                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 29  | Solana discovery                                                                                   | **C**  | `catalog.ts:117-122` hides every Solana row ("TEMPORARY … sponsor wallet is unfunded"). The sponsor reports `configured: true` and holds 0.0623 SOL today — low, not empty                                                                                                                                                                                                                                                                                                         |
| 30  | `/swaps` and `/swaps/{id}/status` for the lifecycle                                                | **I**  | `api.ts:320-328`; `use-meme-swaps.ts` polls page 1/20 every 15 s; `meme-live-transactions.tsx:18-22` shows only `SUBMITTED/CONFIRMING/CONFIRMED`. `SwapStatus` (`api.ts:87-96`) lists a `QUOTED` state the contract does not                                                                                                                                                                                                                                                       |
| 31  | `/activity` as the user-facing feed                                                                | **M**  | never called. The app's `/api/activity` (`lib/server/activity.ts`) is an Alchemy transfer sweep, unrelated to the trade service                                                                                                                                                                                                                                                                                                                                                    |
| 32  | `/portfolio`, `/portfolio/summary`, `/portfolio/{chain}/{address}`                                 | **M**  | never called. Holdings come from Alchemy balances (`app/api/portfolio/route.ts` → `lib/server/alchemy.ts`), allow-listed by `buyable-registry.ts:71-102` from **page 1, limit 100** of the catalogue, Base only — a coin bought from row 101 onward, or on Solana, is not a holding                                                                                                                                                                                                |
| 33  | Null valuation → "Valuation unavailable", never `$0`/`-100%`                                       | **C**  | `alchemy.ts:300-303, 336-337` price `0` → `valueUsd: 0`; `holdings.ts:76-79, 105-117` carve an unpriced balance out of the _hide_ rules but the row still prints `$0.00`                                                                                                                                                                                                                                                                                                           |
| 34  | `marketDataUpdatedAt` staleness label; `marketValueComplete` label                                 | **M**  | grep for both is empty                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 35  | Cost basis, realised/unrealised P&L, `costBasisStatus`                                             | **M**  | none                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 36  | Fresh SELL preview before closing a position                                                       | **I**  | portfolio "Sell" opens `MemeTradeSheet` on SELL (`components/layout/modals/app-modals.tsx:157-165`), which previews first — but with the wrong chain for a Solana holding (#5)                                                                                                                                                                                                                                                                                                     |
| 37  | Decimal strings, no float money                                                                    | **P**  | base units are `bigint` (`sell-amount.ts`, `meme-sell-panel.tsx:55-65`); USD figures are floats (`funding.ts:10-15`, `page.tsx:183`, `alchemy.ts:337`)                                                                                                                                                                                                                                                                                                                             |
| 38  | Proxy validates every upstream payload with Zod                                                    | **P**  | `schemas/trade.ts:55-61` covers `tokens`, `tokens/trending`, `tokens/search`, `swaps/quote`, `solana/swaps/quote`. Not covered: token detail/market/risk/tradability, both previews, status, `/swaps` list, submissions, wallet challenge/verify, portfolio, activity. `warnings: z.array(z.unknown())`, `riskLevel: z.string()`, and no `meta` on lists                                                                                                                           |
| 39  | 502 `PROVIDER_ERROR` on Solana detail → temporary state, backoff, no negative cache                | **P**  | `use-meme-tokens.ts:89-105` uses TanStack's default retry; the error is not cached as "missing", but nothing distinguishes 502 from 404 in the UI                                                                                                                                                                                                                                                                                                                                  |
| 40  | Refresh balances only after a terminal status                                                      | **I**  | `applyReceipt` moves the on-screen balance from the receipt; `refetchUntilChanged` after the trade resolves                                                                                                                                                                                                                                                                                                                                                                        |
| 41  | Never use trending as holdings                                                                     | **I**  | holdings never read trending                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

Counts: implemented 20 · partial 12 · missing 7 · contradicts 5 (the row on
Solana discovery and the row on hiding-by-liquidity are maintainer decisions
that happen to contradict the contract; this ADR asks for them to be
re-confirmed, not silently reversed).

## Decision

Build the missing pieces in five slices, one PR each, in this order:
correctness and safety first, then the flows the user sees, then the
service-backed portfolio and activity. Every slice is complete on its own and
leaves the app no less compliant than before.

```
┌─ browser ─────────────────────────────────────────────────────────────────┐
│ desk / phone tab / sheet / portfolio                                      │
│   ├─ useMemeCatalog (pages) ── useTrendingMemes ── useMemeSearch          │
│   ├─ useRiskConsent ─▶ useMemePreview ─▶ useMemeTrade                     │
│   │      (LOW_LIQUIDITY gate)    (fee, expiry)   idle→linking→quoting→    │
│   │                                              signing→confirming→      │
│   │                                              {confirmed | delivered | │
│   │                                               pending | failed}       │
│   └─ useMemePortfolio / useMemePortfolioSummary / useMemeActivity  (NEW)  │
│            all through lib/meme/api.ts  (requestId kept on every error)   │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │ /api/trade/*   /api/gas-sponsor/solana/*
┌──────────────────────────────▼────────────────────────────────────────────┐
│ relay: app/api/trade/[...path]/route.ts                                   │
│   Zod on EVERY route it forwards (lib/api/schemas/trade.ts, extended)     │
│   admin/* 404 · bearer + Idempotency-Key pass-through · 2 s public cache  │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │ WSAPI_BASE/v1/trade  (api.tsionark.com)
                        trade service · gas-sponsor service
```

### Slice 1 — Trade truth and transport (correctness, safety)

**`requestId` everywhere.** `Envelope.error` gains `requestId`; `TradeApiError`
carries it; the relay's own `BAD_RESPONSE`/`SERVICE_UNAVAILABLE` bodies mint
one (`crypto.randomUUID()`) so a support screenshot always has a reference;
every `console.warn/error` and `track(...)` in `use-meme-trade.ts` includes
`swapId` and `requestId`; `reportUpstreamFailure` (`lib/analytics/watchtower.ts`)
forwards it as a tag. `friendlyError` (`lib/errors.ts`) maps the contract's
codes (`TOKEN_BLOCKED`, `TOKEN_RISK_BLOCKED`, `TOKEN_BUY_DISABLED`,
`TOKEN_SELL_DISABLED`, `INSUFFICIENT_BALANCE`, `NO_SWAP_ROUTE`,
`HIGH_PRICE_IMPACT`, `INVALID_SLIPPAGE`, `QUOTE_EXPIRED`,
`SWAP_ALREADY_SUBMITTED`, `WALLET_OWNERSHIP_MISMATCH`, `QUOTE_PROVIDER_ERROR`,
`PROVIDER_ERROR`, `TOKEN_NOT_FOUND`) to our own copy, in five locales, and
appends "Ref: `<requestId>`" as the support detail. Upstream `message` text
stops reaching the UI.

**A `delivered` state, distinct from `confirmed`.** `TradePhase` gains
`"delivered"` and `"pending"`. `confirmed` is set **only** on status
`CONFIRMED`. When the swap's own receipt proves delivery but the service
records `FAILED`/`REVERTED` or refuses the registration (409), the phase is
`delivered`: the sheet/ticket shows the amount received, the transaction, and
the words "Delivered on-chain. World Street is still recording this trade
(ref …)". Toasts say "delivered", never "bought"/"sold", on that path. The
`trade_recording_mismatch` event is kept and now also goes to Watchtower with
`swapId`, `requestId` and the hash. When the status poll passes a ceiling
(10 minutes) without a terminal state, the phase is `pending` with the same
copy and the sheet may be closed; the swap stays visible in the transactions
card. This keeps the maintainers' rule — never tell someone their money did
not move when it did — while honouring the contract's rule that "successful"
is the service's word alone.

**Register user-operation hashes.** `registerSubmission` accepts
`{ transactionHash } | { userOperationHash }`. `use-meme-trade.ts` catches
`SubmittedEvmOperationError`, registers `{ userOperationHash }` for that
`callIndex`, and continues to the status poll instead of failing.

**Same-key retry.** `QUOTE_PROVIDER_ERROR` retries the quote once, after 1.5 s,
with the **same** idempotency key; every other failure keeps a fresh key per
user action as today.

Files: `lib/meme/api.ts`, `lib/errors.ts`, `lib/analytics/watchtower.ts`,
`features/trade/hooks/use-meme-trade.ts`, `use-spot-buy.ts`,
`features/trade/components/meme-trade-sheet.tsx`, `buy-sheet.tsx`,
`meme-trade-ticket.tsx`, `meme-sell-panel.tsx`, `app/(session)/(app)/meme/page.tsx`,
`app/api/trade/[...path]/route.ts`, `messages/*.json`.

### Slice 2 — Relay schemas and null semantics

**Zod on every forwarded route.** `lib/api/schemas/trade.ts` gains schemas for
`tokens/{address}` (+ `/market`, `/risk`, `/tradability`), `swaps/preview` and
`solana/swaps/preview`, `swaps/{id}`, `swaps/{id}/status`, `swaps` (list with
`meta`), `swaps/{id}/submissions`, `solana/swaps/{id}/submissions`,
`wallets/challenges`, `wallets/verify`, their Solana twins, and (for slice 5)
`portfolio`, `portfolio/summary`, `portfolio/{chain}/{address}`, `activity`.
`riskLevel` becomes the enum, `warnings` becomes `{ code, message }[]`,
`status` the `ACTIVE | BLOCKED | DISCOVERED` union, and every list schema
carries `meta { page, limit, total }`. The list-and-search schemas keep the
risk block optional because the live search route omits it (the client's
`withRiskDefaults` stays). `route.ts` matches path templates with ids, not
only literals. `request<T>` in `lib/meme/api.ts` stops casting `body.data as T`
and runs the same schema client-side through a `parseTokenView`-style mapper
in `lib/meme/parse.ts`, so a presentational component never holds raw JSON.

**Null is not zero.** A `changeDirection(value): "up" | "down" | null` helper
in `lib/meme/format.ts` replaces the four `Number(x ?? "0") >= 0` sites; a null
change draws a neutral chart/label, not green. `memecoins-view.tsx`'s "Hot"
sort places null volume last instead of at `0`. `compactUsd` renders a real
`"0"` as `$0` and only null/NaN as `—`. A token whose `liquidityUsd` is null
shows a neutral "Liquidity unknown — the quote decides whether this trade can
execute" line beside its warnings. `useMemeToken` retries a 502 with
exponential backoff (4 attempts) and shows "temporarily unavailable"; a 404
shows "not found"; neither is stored as a negative catalogue entry.

Files: `lib/api/schemas/trade.ts`, `app/api/trade/[...path]/route.ts`,
`lib/meme/api.ts`, `lib/meme/parse.ts` (new), `lib/meme/format.ts` (new),
`meme-bits.tsx`, `meme-board-chart.tsx`, `meme-pro-view.tsx`,
`memecoins-view.tsx`, `page.tsx`, `use-meme-tokens.ts`, `messages/*.json`.

### Slice 3 — Consent, fees and expiry on every trade surface

**`useRiskConsent`.** `features/trade/hooks/use-risk-consent.ts` keeps, per
session, the set of `chainId:address` the user has acknowledged. A new
`MemeRiskConsent` dialog (`features/trade/components/meme-risk-consent.tsx`,
built on the existing sheet primitives, `role="alertdialog"`) shows the
service's own `LOW_LIQUIDITY` message plus any other warnings, the risk badge,
and the disclaimer, with "I understand, continue" and "Cancel". The preview
query's `enabled` becomes `… && consented`, so **no quote is requested** for a
`LOW_LIQUIDITY` token until the dialog has been accepted; the dialog opens the
first time an amount is entered for such a token. Tokens with no
`LOW_LIQUIDITY` warning never see the dialog. `status === "BLOCKED"`,
`buyEnabled: false` and `sellEnabled: false` keep disabling the action as they
do today; nothing else does.

**Warnings and risk on every ticket.** The desktop buy ticket, the desktop sell
panel and the phone `TradeTicket` render `RiskBadge` and the visible warnings
the way the sheet already does. `visibleWarnings` keeps dropping the
upgradeable-proxy line (a maintainer choice, recorded here as a deviation from
"display other automated warnings").

**Fee and expiry.** Every ticket gains a "Platform fee" row from
`preview.platformFeeAmountFormatted` + the fee token's symbol (USDC on both
chains), and, once the quote is in hand, the Solana quote's
`platformFeeAmountAtomic` formatted at 6 decimals. Nothing hard-codes 0.5 %.
The sheet's `expiresAt` watch (`meme-trade-sheet.tsx:284-312`) moves into
`useMemePreview` as `{ quote, expired, refetch }` so the desk and the phone
ticket blank a lapsed quote the same way.

**Desk parity.** The desktop desk re-reads the selected token through
`useMemeToken` before trading and runs `linkForPreview` on a preview 403, as
the sheet does.

Files: `use-risk-consent.ts`, `meme-risk-consent.tsx` (new),
`use-meme-trade.ts`, `meme-trade-sheet.tsx`, `meme-trade-ticket.tsx`,
`meme-sell-panel.tsx`, `page.tsx`, `mobile-market-view.tsx`, `buy-sheet.tsx`,
`messages/*.json`.

### Slice 4 — Paging the catalogue, and the discovery policy

**Walk the pages.** `useMemeCatalog` becomes an `useInfiniteQuery` over
`/tokens?page=n&limit=500[&chain=]` with `getNextPageParam` from `meta`
(`page * limit < total`), a "Load more" control on the desk, the grid and the
phone tab, and the page count shown as "500 of 11,502". `tradableHere` no
longer overwrites `meta.total` (a separate `shownCount` carries the filtered
size), so a page count is the server's. `buyable-registry.ts` walks Base pages
at 500 until the total (bounded at 20 pages, revalidated 10 minutes) — but
slice 5 makes the service's `/portfolio` the source of truth for held memes,
so this is a stopgap for the Alchemy path.

**Discovery policy: a decision the maintainer must confirm.** The 2026-09-07
instructions ("hide unrated and low-rated", "hide coins that can't be bought",
$10k liquidity and $100 volume floors, Solana off) are recorded here as an
explicit `DISCOVERY_POLICY` object in `lib/meme/catalog.ts` with two named
views:

- `curated` (default; what `staging` shows today): LOW/MEDIUM, ACTIVE,
  `buyEnabled`, liquidity ≥ $10k where known, volume ≥ $100 where known.
- `all` (the contract's view): every ACTIVE row on a supported chain,
  wrapped majors, impersonators, equities and the quote currency still out;
  `LOW_LIQUIDITY` rows shown with their badge and gated by the slice-3 consent.

The desk, grid and phone tab get a "Curated / All" switch; the dashboard brief
and the 100X card stay curated. Solana rows are admitted to both views behind
`NEXT_PUBLIC_MEME_SOLANA_DISCOVERY=1`, to be switched on only when ops confirm
a funding SLA for the sponsor wallet (0.0623 SOL at the probe). If the
maintainer prefers to keep `curated` only, the switch is dropped and the
policy object stays as documentation of the deviation.

Files: `use-meme-tokens.ts`, `lib/meme/api.ts`, `lib/meme/catalog.ts`,
`meme-desktop-board.tsx`, `page.tsx`, `meme-grid.tsx`, `meme-board.tsx`,
`mobile-market-view.tsx`, `lib/server/buyable-registry.ts`,
`lib/server/dashboard-feed.ts`, `messages/*.json`.

### Slice 5 — Portfolio, P&L and activity from the trade service

**Relay and client.** The existing `/api/trade/[...path]` relay already
forwards `portfolio*` and `activity` with the bearer; slice 2's schemas make
them validated. `lib/meme/portfolio.ts` gains `fetchPortfolio(page, limit, chain?)`,
`fetchPortfolioSummary()`, `fetchPosition(chain, address)`,
`fetchActivity({ page, limit, chain?, side?, status? })`, all typed to the
contract's `PortfolioPosition`, `PortfolioSummary`, `TradeActivity` (decimal
strings, never numbers). Hooks: `useMemePortfolio`, `useMemePortfolioSummary`,
`useMemePosition`, `useMemeActivity` — 60 s `refetchInterval` while the
portfolio section is on screen (`useSectionActive`), and `use-meme-trade.ts`
invalidates all four the moment a swap reaches `CONFIRMED`.

**Arithmetic on strings.** No float touches a USD or quantity string. Signs,
comparisons and the "+" prefix use `lib/trade/math.ts` (`toBaseUnits` at 18
decimals → `bigint`) through a small `lib/meme/decimal.ts`: `signOf`,
`formatUsdString`, `formatPercentPoints`, `formatQuantity`. No new dependency.

**UI.** `features/portfolio/components/meme-positions.tsx`, a "Memecoins"
section on `/portfolio` (desktop and phone), replaces the Alchemy-derived meme
rows in the holdings table for tokens the service knows:

- summary strip: current value, total P&L (sign-coloured, explicit `+`), total
  return, realised P&L, `calculatedAt`; when `marketValueComplete === false`
  the value and unrealised/total P&L carry a "Partial — some positions can't
  be priced" badge;
- tabs Open · Closed · Activity · Base · Solana, each keeping server paging
  (limit 50, "Load more");
- a position row: logo (initials on null), symbol/name, `quantityRemaining`
  ("ledger-derived" label when `balanceStatus === "UNAVAILABLE"`), average
  entry, current value **or** "Valuation unavailable" when `currentPriceUsd`
  is null (never `$0`, never `-100%`), total P&L, `costBasisStatus: PARTIAL`
  badge with the contract's explanation, market-data age from
  `marketDataUpdatedAt` ("5 min ago", "stale" past 15 min, "no market data"
  when null), `valuationDisclaimer` as fine print, a Sell button that opens
  `MemeTradeSheet` on SELL with the position's **own** `chainId` (fixing
  `toMemeToken`), which previews before any confirm;
- the Activity tab lists `TradeActivity` rows with side, amounts, USD, fee,
  status chip (pending states never counted as holdings), hashes linking to
  the explorer only when non-null.

The Alchemy holdings path keeps showing meme balances the service does not
know (an airdrop, an external transfer), but `MemeTokenInfo.priceUsd` becomes
`number | null` and an unpriced row renders "Valuation unavailable" instead of
`$0.00`. `lib/server/activity.ts` is untouched; the wallet sweep is a
different product.

Files: `lib/meme/portfolio.ts`, `lib/meme/decimal.ts` (new),
`features/trade/hooks/use-meme-portfolio.ts` (new), `use-meme-trade.ts`,
`features/portfolio/components/meme-positions.tsx` (new), `portfolio-view.tsx`,
`holdings-mobile.tsx`, `lib/server/buyable-registry.ts`, `lib/server/alchemy.ts`,
`features/portfolio/lib/holdings.ts`, `messages/*.json`.

## Alternatives considered

- **Keep marking on-chain delivery as `confirmed`.** Rejected: it is the one
  rule the contract states twice, and the recording mismatch is a backend
  defect the frontend should surface, not paper over. `delivered` keeps the
  user informed without claiming what the service has not said.
- **Move the discovery filters to the server.** Preferred long-term
  (`catalog.ts:22-25` says so too) but the service exposes no such view today;
  the policy object is the honest interim.
- **A decimal library (`decimal.js-light`, ~12 KB) for portfolio maths.**
  Rejected for now: the only operations needed are sign, compare, add and
  format, all of which the existing base-unit `bigint` helpers do.
- **Build portfolio P&L in the browser from `/swaps`.** Rejected: the contract
  says the service's moving-average ledger is authoritative and reconciles
  live balances; a client ledger would disagree with it.
- **Drop the Alchemy holdings path for memes entirely.** Rejected: it is how a
  coin that arrived outside the service is seen at all; it stays as the
  fallback with honest null valuation.

## Consequences

**Reads and polling.** Slice 4 adds up to 23 catalogue pages on Base if a user
keeps loading; the relay's 2 s public cache and 15 s `staleTime` bound it, and
pages after the first are on demand. Slice 5 adds four authed reads on the
portfolio screen every 60 s while visible (summary, open positions, first
activity page, and the detail when opened), invalidated once per `CONFIRMED`
swap; nothing polls off-screen. The status poll gains a ceiling instead of
running forever. Trending polling is unchanged.

**Bundle.** The consent dialog and the positions section are small; the desk
already loads the sheet primitives. No new dependency. `lib/meme/decimal.ts`
and `parse.ts` are a few hundred bytes.

**Behaviour changes users will notice.** A first buy of a thin coin asks for
consent; a fee row appears on every ticket; the catalogue admits it is bigger
than one page; a delivered-but-unrecorded trade reads "delivered" instead of
"bought"; the portfolio gets a Memecoins section with P&L and honest blanks.

**Backend dependencies** (each slice ships without them, but the frontend
cannot be fully compliant until they land): see the plan.

## Tests (red first)

- `lib/meme/api.test.ts`: an error envelope's `requestId` survives on
  `TradeApiError`; a 502 from the relay carries a minted one.
- `lib/errors.test.ts`: every contract code maps to our copy; a raw upstream
  `message` never reaches the output.
- `features/trade/hooks/use-meme-trade.test.tsx`: `CONFIRMED` → `confirmed`;
  delivered + `FAILED` → `delivered` (not `confirmed`); delivered + 409 →
  `delivered`; `SubmittedEvmOperationError` → `{ userOperationHash }`
  registered and polling continues; `QUOTE_PROVIDER_ERROR` retries once with
  the same `Idempotency-Key`; the poll stops at the ceiling in `pending`.
- `lib/api/schemas/trade.test.ts`: every forwarded route has a schema; the
  live search shape (no risk block) still passes; a list without `meta` fails.
- `lib/meme/format.test.ts`: `changeDirection(null) === null`;
  `compactUsd("0") === "$0"`.
- `meme-risk-consent.test.tsx` and `use-meme-trade.test.tsx`: with a
  `LOW_LIQUIDITY` token, `previewSwap` is **not** called until the dialog is
  accepted; without the warning it is called on the debounced amount.
- `meme-trade-sheet.test.tsx`, `meme-trade-ticket.test.tsx`,
  `meme-sell-panel.test.tsx`: the fee row shows the preview's value and USDC;
  a lapsed quote blanks the figures on all three surfaces; warnings and the
  badge render on the desk and phone tickets.
- `use-meme-tokens.test.tsx`: three pages fetched until `page*limit >= total`,
  never a fourth; `limit` never above 500; `pageCount` from the server's total.
- `lib/meme/catalog.test.ts`: `all` keeps a `LOW_LIQUIDITY` ACTIVE row that
  `curated` drops; Solana rows admitted only behind the flag.
- `use-meme-portfolio.test.tsx` / `meme-positions.test.tsx`: a null
  `currentPriceUsd` renders "Valuation unavailable" and no `$0`/`-100%`;
  `marketValueComplete: false` shows the partial badge; a negative P&L keeps
  its minus and a positive one gains `+`; `balanceStatus: UNAVAILABLE` labels
  the quantity ledger-derived; Sell opens the sheet with the position's
  `chainId`; a `CONFIRMED` swap invalidates the four queries.

## Release notes

One per slice, `scenario-impact: updated`:
`docs/release-notes/2026-09-XX-meme-trade-truth.md`,
`…-meme-relay-schemas.md`, `…-meme-risk-consent-fees.md`,
`…-meme-catalog-paging.md`, `…-meme-portfolio-activity.md`.
