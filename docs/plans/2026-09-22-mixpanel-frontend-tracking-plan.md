# Plan: Mixpanel frontend tracking

**Date:** 22 September 2026
**Decision:** [ADR-2026-09-22-mixpanel-frontend-tracking](../adr/ADR-2026-09-22-mixpanel-frontend-tracking.md) (accepted 22 September 2026)
**Branch:** `feat/mixpanel-integration_carniel`, tracking `origin/main` (decided at approval)
**Out of scope:** server-side events and the `daily_metrics` job ([server brief](../mixpanel-server-events-integration.md))

## Delivery

Eight slices on one branch, each red-green test-first. `./scripts/preflight.sh` runs across the whole branch, and one release note covers the change. They are ordered so the largest wrong numbers go first.

| PR  | Slice                                                                      | ADR    | Depends on                             |
| --- | -------------------------------------------------------------------------- | ------ | -------------------------------------- |
| 1   | Trade amounts: sells in dollars, `token_quantity`, delivered swaps counted | D3, D4 | none                                   |
| 2   | Environment property and first-party relay                                 | D1, D2 | none                                   |
| 3   | Attribution: UTMs through redirects, first-touch, `landing_viewed`         | D3, D7 | 2 (super property wiring)              |
| 4   | Identity: signup after identify, stale-identity reset, `wallet_evm`        | D6     | 2                                      |
| 5   | Failure vocabulary and `trade_submitted`                                   | D3     | 1                                      |
| 6   | Hyperliquid perps events                                                   | D5     | 5 (reason union)                       |
| 7   | Game properties and counting corrections                                   | D3, D9 | none                                   |
| 8   | Interim money watchers                                                     | D8     | only if approved (ADR open question 4) |

## Shared contracts

### Catalog (`lib/analytics/events.ts`, `lib/analytics/schema.ts`)

All additions are optional unless stated, and nothing is renamed.

```ts
export type FailureReason =
  | "insufficient_balance"
  | "address_unavailable"
  | "no_route"
  | "simulation_failed"
  | "slippage_exceeded"
  | "rail_rejected"
  | "provider_timeout"
  | "user_cancelled"
  | "unknown";

interface MoneyIds {
  order_id?: string;
  tx_hash?: string;
  token_address?: string;
  chain_id?: number;
}

// trade_completed: every branch gains
//   MoneyIds & { amount_source: "fill" | "quote"; recorded?: "confirmed" | "delivered" }
// and, on side "sell", token_quantity: number is REQUIRED (schema refuses a sell without it).
// trade_previewed gains token_quantity on sells.
// trade_failed: reason: FailureReason; reason_detail?: string; amount_usd?: number; side?: Side
// trade_submitted (new): { vertical; asset; side; amount_usd; order_id }

// SuperProperties gains:
//   environment: "production" | "preview" | "development";
//   wallet_evm?: string;
//   utm_source? utm_medium? utm_campaign? utm_content? utm_term? initial_referrer?: string
```

`schema.ts` gets a conditional rule: `trade_completed` and `trade_previewed` with `side: "sell"` must carry a finite `token_quantity`. This is the regression lock for the units bug.

### Helpers (`lib/analytics/`)

| Module              | Exports                                                                            | Rule                                                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `amounts.ts`        | `usdFromBaseUnits(raw: bigint, decimals: number): number`                          | The only `bigint` → `number` conversion for analytics. Exact tests at 6 and 18 decimals, zero, and values past 2^53 base units.                                                                                                                   |
| `failure-reason.ts` | `failureReason(error: unknown): { reason: FailureReason; reason_detail?: string }` | Maps EIP-1193 `4001` and Privy's user-rejection error to `user_cancelled`; `NO_ROUTE`, `SIMULATION_FAILED`, `QUOTE_EXPIRED`, `INSUFFICIENT_*`, timeouts to their values; everything else to `unknown` with a coded detail, never the raw message. |
| `environment.ts`    | `ANALYTICS_ENVIRONMENT`                                                            | The single environment constant; `watchtower.ts` imports it instead of computing its own.                                                                                                                                                         |

## PR 1: trade amounts

**Red:**

- `use-spot-sell.test.tsx`: selling 1,000,000 tokens at $0.000005 reports `amount_usd: 5` and `token_quantity: 1000000`, on both the swap-engine and Dextopus branches.
- `meme-trade-sheet.test.tsx`: a sell reports the USDC received from the receipt as `amount_usd`, with `amount_source: "fill"`.
- `use-rwa-ticket.test.tsx`: a sell reports expected proceeds with `amount_source: "quote"`, and `token_quantity`.
- `use-meme-trade.test.tsx`: `trade()` resolves with `received` (base units) and `txHash`.
- `use-spot-buy.test.tsx` and `meme-trade-sheet.test.tsx`: `outcome: "delivered"` sends `trade_completed` with `recorded: "delivered"`.
- `schema.test.ts`: a sell without `token_quantity` is a violation.

**Green:**

- `features/trade/hooks/use-meme-trade.ts`: add `received?: bigint`, `receivedDecimals?: number`, `txHash?: string` to `TradeResult` from the values it already computes.
- `features/trade/hooks/use-spot-buy.ts`, `use-spot-sell.ts`, `features/trade/components/meme-trade-sheet.tsx`, `features/rwa/hooks/use-rwa-ticket.ts`, `features/rwa/components/rwa-settlement-tracker.tsx`, `features/trade/components/meme-settlement-tracker.tsx`: report from the result, through `usdFromBaseUnits`; add ids (`order_id` = `swapId` or `requestId`, `tx_hash`, `chain_id`, `token_address`).
- `lib/analytics/mixpanel.ts`: `accumulateProfile` adds `total_volume_usd` only when `amount_source` is `"fill"` or the side is `"buy"`.

## PR 2: environment and relay

Read `node_modules/next/dist/docs/` for route handlers and `instrumentation-client` before writing code.

**Red:**

- `app/api/relay/[...path]/route.test.ts`, modelled on `app/api/monitoring/route.test.ts`: forwards `track` with the right token; refuses an unknown path (404), a foreign token (403), an oversized body (413); passes 429 and `Retry-After` through; forwards the client IP; logs and returns 502 on upstream failure; returns 204 when no token is configured.
- `__tests__/mixpanel.test.ts`: `init` receives `api_host` on our origin; `environment` is registered.

**Green:**

- `app/api/relay/[...path]/route.ts`, with the upstream host and allowlist in `lib/server/mixpanel-relay.ts` (route handlers import from `lib/server/`, never a feature).
- `lib/analytics/environment.ts`; `lib/analytics/mixpanel.ts` sets `api_host` and registers `environment` at boot; `lib/analytics/watchtower.ts` uses the shared constant.
- `.env.example`: document the EU relay and the single token.
- `proxy.ts`: allow `/api/relay` through maintenance mode, the way `/api/monitoring` should be; `proxy.test.ts` covers it.

**Verify on the preview:** events visible in Mixpanel Live View from a Brave window; a user's city is theirs, not the server region.

## PR 3: attribution

The SDK already registers `utm_*` and sets `initial_utm_*` when the boot URL carries them (ADR D7), so this slice only makes sure the parameters reach that URL.

**Red:** `app/r/[username]/route.test.ts` (new): `/r/alice?utm_source=x` redirects to `/auth?utm_source=x`. `proxy.test.ts`: the pre-launch redirect keeps the query. `lib/analytics/page-name.test.ts`: `landingPageForPath` names `/` and `/welcome` and nothing else.

**Green:** the two redirects copy `search`; `instrumentation-client.ts` sends `landing_viewed` on the first load of a landing path.

## PR 4: identity

**Red** (new `components/providers/analytics-identity.test.tsx`): a new user's `signup_completed` is sent after `identify`, not before; a returning session with no Privy session but a stored identified id triggers `reset`; `wallet_evm` is registered lowercase while `identify` receives the checksummed address unchanged.

**Green:** `components/providers/analytics-identity.tsx` holds the signup method in a ref until identify runs; `lib/analytics/mixpanel.ts` exposes `isIdentified()` for the stale check.

## PR 5: failure vocabulary and `trade_submitted`

**Red:** `failure-reason.test.ts` covers each mapping. Each trade hook's test asserts `reason` is from the union, a rejected signature is `user_cancelled`, and `trade_failed` carries `amount_usd`. `trade_submitted` fires once per submission with the same `order_id` as the later `trade_completed`.

**Green:** replace every free-text `reason` in the trade paths, `deposit_failed`, `kyc_failed` and `perp_*` with `failureReason(error)`. Narrow `reason` in `events.ts` to `FailureReason`; the type check finds any site missed.

## PR 6: Hyperliquid perps

**Red** (`features/trade/lib/hyperliquid-actions.test.ts` and the desk's tests): an order that fills sends `perp_trade_opened` with `notional_usd` equal to filled size × average fill price and `order_id` = the exchange `oid`; a resting order sends it with `order_type: "limit"`; a close sends `perp_trade_closed` with realised PnL from the fill; an exchange error sends `perp_order_failed`; nothing is sent on a rejected signature except `user_cancelled`.

**Green:** tracking calls at the action callers in `use-hyperliquid-trading.ts` (the shared seam for simple and pro views), from the exchange response types in `hyperliquid-types.ts`. Remove the dead Avantis-era `perp_*` shapes from the catalog only after confirming nothing on `dev` still sends them.

## PR 7: games and counting

**Red:**

- Chess, checkers, Last Man and swiss hook tests: `amount_usd` and `game_id` are sent alongside the existing names.
- `chess_game_started` fires for the creator when the match starts, not only for the accepter.
- `auth_started` does not fire for an authenticated visitor.
- `passkey_skipped` carries `supported`.
- `deposit_failed` carries `network` and `asset`.

**Green:** `features/casino/hooks/use-casino-chess.ts`, `use-casino-swiss.ts`, `features/casino/components/chess/play-section.tsx`, `draughts/checkers-play.tsx`, `last-standing/*`; `app/(session)/auth/page.tsx`; `components/auth/passkey-enroll.tsx`; `features/funds/components/crypto-deposit-screen.tsx`. Update `app/privacy/content.ts` (all five locales if translated) for the relay and autocapture.

## PR 8: interim money watchers (only if approved)

**Red:** `use-deposit-analytics.test.ts`: the existing "first run is silent" case is replaced by "first run stores a baseline; an arrival after it is reported". A new watcher test: a bank withdrawal started on the withdraw screen reports `withdraw_completed` after that screen unmounts.

**Green:** baseline timestamp in `use-deposit-analytics.ts`; `features/funds/hooks/use-offramp-settlement.ts` and `components/bank-withdraw-analytics.tsx` on the onramp pattern; mount `DepositAnalytics`, `BankDepositAnalytics` and `BankWithdrawAnalytics` in `app/(session)/providers.tsx` and remove them from `dashboard-page.tsx`.

Replacing an existing assertion here is a behaviour change approved in the ADR, not a deleted failing test.

## Verification for every PR

1. `./scripts/preflight.sh`: format, lint, typecheck, Vitest, production build, zero warnings.
2. The Vercel preview (events arrive with `environment: preview`): exercise the flow, confirm each changed event in Live View with the expected properties.
3. Self-audit against the eight defect classes in `AGENTS.md`. Classes 4 (no floating point for amounts, `usdFromBaseUnits` only) and 7 (layering: route handler imports `lib/server/` only) are the ones this work is most likely to trip.
4. Release note with `scenario-impact` and the date for the data team's Mixpanel annotation.

## Hand-off to the data team

After each PR merges: the properties added, whether `amount_usd` changed meaning, and the release date. Kept in the release notes so they can annotate Mixpanel.
