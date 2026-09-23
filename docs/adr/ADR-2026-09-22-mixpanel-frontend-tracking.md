---
date: 2026-09-22
status: accepted
approved: 2026-09-22
---

# Mixpanel on the web app: first-party delivery, a v2 event contract, and honest amounts

## Context

The data team (`ARK-TRACKING-PLAN-004`, `ARK-METRICS-SPEC-001`) reports that Mixpanel cannot be used for accounts, money or trading volume. A review of `origin/main` at `0c99456f` (22 September 2026) confirms most of that, corrects some of it, and finds the causes below. Every event today is sent from the browser through `lib/analytics/mixpanel.ts`, validated against `lib/analytics/events.ts` and `lib/analytics/schema.ts`.

### What is broken in this app

**Events that never arrive**

1. **Ad blockers.** `mixpanel.init` sets no `api_host`, so the SDK posts to `api-js.mixpanel.com`, which uBlock Origin, Brave Shields and AdGuard block by default. The same failure was already measured and fixed for Watchtower (see `app/api/monitoring/route.ts`); Mixpanel was never given the same treatment.
2. **Hyperliquid perps send nothing.** The perps desk is now Hyperliquid (`hyperliquid-pro-perps.tsx`, `use-hyperliquid-trading.ts`, `features/trade/lib/hyperliquid-actions.ts`). None of those files call `track`. `perp_trade_opened` and `perp_trade_closed` are dead because the new desk never wired them, which is what the data team suspected.
3. **Swap-engine trades that deliver but are not confirmed by the trade service send no `trade_completed`.** `useMemeTrade().trade()` resolves with `outcome: "confirmed" | "delivered" | "pending"`. The spot buy path (`use-spot-buy.ts`) and the memecoin sheet (`meme-trade-sheet.tsx`) only report `confirmed`; a trade whose tokens arrived on chain but which the service recorded wrongly is missing from volume.
4. **A device's first deposit is never reported.** `use-deposit-analytics.ts` treats every arrival seen on a device's first run as history and stays silent, so a new user's first deposit, the step marketing cares about most, is dropped.
5. **Deposits are only watched while the dashboard is open**, and a Naira deposit is only labelled `bank` on the device that started it (`DepositAnalytics` and `BankDepositAnalytics` are mounted in `dashboard-page.tsx` only; open orders live in that device's `localStorage`).
6. **Bank withdrawals only count if the withdraw screen stays open** until the payout completes (`bank-withdraw-screen.tsx`).
7. **`signup_completed` is sent before the embedded wallet exists** (`analytics-identity.tsx`), so it is anonymous and only joins a user if the same browser later identifies.

**Values that are wrong**

8. **`amount_usd` on sells is the token quantity.** The memecoin sheet sends `Number(debouncedAmount)` on both sides; the RWA ticket (`use-rwa-ticket.ts`) sends `Number(amount)` on both sides. On a sell those inputs are tokens. This is the $1.26M of phantom volume. The spot sell (`use-spot-sell.ts`) multiplies by the displayed price, which is closer but still a quote, not a fill.
9. **`amount_usd` on buys is what was typed**, not what the fill cost, on every path.
10. **Failure `reason` values are free text** (`"order_failed"`, `"sell_failed"`, the internal `stage`, raw provider codes), and a user rejecting the signature counts as a failed trade.
11. **Counts are inflated** by `auth_started` firing for signed-in visitors being forwarded, and `passkey_skipped` firing when the device cannot make a passkey at all.

**Context the reports are missing**

12. **No environment.** Preview and local builds report into the production project with nothing to tell them apart (the data team measures about 7% of depositors as not real).
13. **Campaign attribution is lost.** `/r/<username>` redirects with `new URL("/auth", req.url)`, which drops `utm_*`; no event fires on `/` or `/welcome`, the pages that carry them.
14. **No identifiers.** No event carries `order_id`, `tx_hash`, `token_address` or `chain_id`, although several are in hand (`swapId`, `requestId`, onramp `orderId`, Kash `txHash`).
15. **Game events** send stakes and payouts as `stake_usd`, `entry_usd`, `payout_usd`, `winnings_usd`, which the data team reads as missing `amount_usd`; none carry a game id although `match.id` is available.

### What is not broken, and must not be "fixed"

- `bank_transfer_completed` was **renamed** into `deposit_completed` with `method: "bank"` on 26 August (`4e82eacf`) to stop Naira deposits counting twice. Restoring it would bring the double count back.
- The KYC screen (`KycOnboarding`) is not rendered anywhere, so its events cannot fire. That is a product decision, not tracking.
- `distinct_id` is the Privy EVM address in checksummed form. Lowercasing it would split every existing person in Mixpanel into two, because Mixpanel cannot merge two identified ids.

### What belongs somewhere else

Accounts, funded users, volume and revenue are counted from Privy and the ledger by the backend (`ARK-METRICS-SPEC-001` section 2), and settled money events move to the backend through the outbox design in `docs/mixpanel-server-events-integration.md`. This ADR covers the web app only. Its money events are the best the browser can do until each server event replaces it.

## Decision

### D1. Deliver events through our own origin

A route handler, `app/api/relay/[...path]/route.ts`, forwards Mixpanel's browser requests. It follows `app/api/monitoring/route.ts`:

- **Allowlisted:** only `track`, `engage` and `groups` paths are forwarded; anything else is 404. It only ever calls Mixpanel's EU ingestion host, `api-eu.mixpanel.com`, set in one constant. Project 4051122 has EU data residency; the SDK's default host today is the US one (`api-js.mixpanel.com`), so this also moves ingestion to the region the project lives in.
- **Not an open relay:** the payload's `token` must equal `NEXT_PUBLIC_MIXPANEL_TOKEN`, or it is refused with 403.
- **Location preserved:** the client's IP from the platform header is forwarded, so Mixpanel still geolocates the user rather than the server region.
- **Status passed through,** including 429 and `Retry-After`, so the SDK's own backoff still works. Upstream refusals are logged server-side with the status, never swallowed.
- **Bounded:** a size limit and a timeout on the upstream call.
- `lib/analytics/mixpanel.ts` sets `api_host` to `${window.location.origin}/api/relay`.

The path is deliberately neutral. Filter lists match words like `mixpanel`, `track` and `analytics` in paths on any host. The SDK appends its own endpoint names (`/track/`, `/engage/`, `/groups/`) to `api_host`, so the relay also renames them through the SDK's `api_routes` option (for example `e`, `p`, `g`) and maps them back to Mixpanel's paths on the server. Whether `mixpanel-browser` 2.81 supports `api_routes` in this form is to be confirmed against its current documentation before PR 2; if it does not, the relay accepts the SDK's default names and the word `track` stays in the path.

### D2. One project, and an `environment` property

There is one Mixpanel project for every environment (decided 22 September 2026: separate test projects are not needed).

- `environment` becomes a super property on every event, read from the same source Watchtower uses (`NEXT_PUBLIC_VERCEL_ENV`, falling back to `NODE_ENV`). The constant moves to one module both use.
- Reports that count real users filter on `environment = production`. Preview and local traffic stays visible, and separable, for QA.
- Local development without `NEXT_PUBLIC_MIXPANEL_TOKEN` sends nothing, as today.

### D3. Event contract v2: additive only

`lib/analytics/events.ts` and `lib/analytics/schema.ts` gain, never lose:

| Addition                                                                                                                                       | Where                                | Why                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment`, `wallet_evm` (lowercase), first-touch `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `initial_referrer` | Super properties                     | Filtering, joins to on-chain data, attribution                                                                                                                                                    |
| `order_id`, `tx_hash`, `token_address`, `chain_id` (all optional)                                                                              | Money events                         | Reconciliation; filled wherever the value is already in hand                                                                                                                                      |
| `token_quantity` (required on `side: "sell"`)                                                                                                  | `trade_completed`, `trade_previewed` | Makes the units bug impossible to reintroduce: the validator refuses a sell without it                                                                                                            |
| `amount_source: "fill" \| "quote"`                                                                                                             | `trade_completed`                    | Says whether `amount_usd` came from the settlement or from a quote, until every path reports a fill                                                                                               |
| `recorded: "confirmed" \| "delivered"`                                                                                                         | `trade_completed`                    | A delivered-but-unrecorded swap is still a trade                                                                                                                                                  |
| `trade_submitted` event                                                                                                                        | new                                  | Sent once a trade is submitted, with its `order_id`; `pending` swap outcomes end here instead of vanishing                                                                                        |
| `reason` as a closed union, plus optional `reason_detail` (coded value only)                                                                   | every `_failed` event                | The data team's vocabulary: `insufficient_balance`, `address_unavailable`, `no_route`, `simulation_failed`, `slippage_exceeded`, `rail_rejected`, `provider_timeout`, `user_cancelled`, `unknown` |
| `amount_usd` on `trade_failed`                                                                                                                 | trade failures                       | Sizes what failures cost                                                                                                                                                                          |
| `amount_usd`, `game_id` alongside the existing names                                                                                           | game events                          | The data team's names without breaking current reports                                                                                                                                            |
| `perp_order_failed` event, and `perp_trade_opened` / `perp_trade_closed` reshaped for Hyperliquid (below)                                      | perps                                | The desk that is actually live                                                                                                                                                                    |
| `landing_viewed` event                                                                                                                         | `/`, `/welcome`                      | The top of the funnel carries the campaign                                                                                                                                                        |

No property is renamed or removed. A rename the data team wants is done in the Mixpanel Lexicon or by sending both names; old names are retired only when the data team confirms their reports have moved.

### D4. Amounts come from the settlement, converted once at the edge

- A single helper, `lib/analytics/amounts.ts`, converts base units to the number Mixpanel stores: `usdFromBaseUnits(raw: bigint, decimals: number)`. Arithmetic stays in `bigint`; the conversion to `number` happens only here, which is the display edge for analytics.
- `amount_usd` on `trade_completed` is, in order of preference: the USDC actually debited or credited according to the receipt or settlement; otherwise the quote's expected amount, with `amount_source: "quote"`. It is never the raw input on a sell.
- `useMemeTrade().trade()` returns what it already decodes from the receipt (`receivedFromLogs`) and the tx hash, so its callers can report them.

### D5. Perps on Hyperliquid

Tracked at the action layer (`hyperliquid-actions.ts` callers), from the exchange response, not from the form:

- `perp_trade_opened` when an order fills or rests: `market`, `side`, `leverage`, `order_type`, `collateral_usd`, `notional_usd` (filled size × average fill price), `entry_price`, `order_id` (Hyperliquid `oid`).
- `perp_trade_closed` when the user closes: `close_type`, `close_reason: "manual"`, `pnl_usd` and `notional_usd` from the fill, `order_id`.
- `perp_order_failed` with a standard `reason`.
- Stops, take profits and liquidations execute on Hyperliquid, not in this app; they come from the backend or an indexer, per the server brief.

### D6. Identity

- `distinct_id` stays exactly as today. `wallet_evm` (lowercase) is added for joins.
- `signup_completed` is held until `identifyUser` has run for that session, then sent, so it lands on the person. It stays in the browser until the server version replaces it.
- On boot, if Privy has no session but Mixpanel still holds an identified user, Mixpanel is reset, so a shared device does not carry the last person's identity.

### D7. Attribution

`mixpanel-browser` 2.81 already records campaign data when the page it boots on carries it: it registers the `utm_*` parameters as super properties (`store_google: true`, `stop_utm_persistence: false`) and sets `initial_utm_*` once on the profile. What loses attribution is that the parameters never reach the page:

- `/r/<username>` and the launch-gate redirect in `proxy.ts` carry the query string through.
- `landing_viewed` fires on `/` and `/welcome`, so the campaign on the landing URL is attached to an event and a funnel can start there.

No custom first-touch code is added; the SDK's own handling is kept.

### D8. Interim fixes to the money watchers

Until each server event replaces them:

- `DepositAnalytics`, `BankDepositAnalytics` and a new bank-withdrawal watcher move from the dashboard to `app/(session)/providers.tsx`, so they run on every signed-in page.
- A device's first run stores a baseline time instead of marking every arrival as seen. Arrivals before the baseline are history; arrivals after it are reported. A new account's first deposit is therefore counted.

When the backend's version of an event is verified (server brief, section B10), the browser version and its case in `accumulateProfile` are deleted in the same release, so nothing is counted twice.

### D9. Counting corrections

- `auth_started` only once Privy is ready and the visitor is not signed in.
- `passkey_skipped` carries `supported: boolean`.
- `deposit_failed` carries `network` and `asset`.
- The privacy policy stops describing autocapture, which is off, and mentions the first-party relay.

## Architecture

```
Browser                                   Next.js (this app)                   Mixpanel
────────                                  ──────────────────                   ────────
screens ──track()──► lib/analytics/mixpanel.ts
                       │ validate (schema v2)
                       │ compact, super props:
                       │ environment, wallet_evm,
                       │ first-touch utm
                       ▼
                     mixpanel-browser ──POST /api/relay/track──► app/api/relay/[...path]
                                                                  allowlist path
                                                                  check token
                                                                  forward client IP ──────► api-js.mixpanel.com
                                                                  pass status/429  ◄──────

Money watchers (interim, session-wide):
  DepositAnalytics, BankDepositAnalytics, BankWithdrawAnalytics  ── mounted in app/(session)/providers.tsx

Later (backend, separate ADR): settlement services ─► outbox ─► forwarder ─► Mixpanel /import
  each server event verified ─► browser track() and accumulateProfile case removed
```

Layering is unchanged: `app/api/relay` depends on `lib/analytics` (server-safe constants only); features depend on `lib/analytics`; nothing imports upward and no feature imports another.

## Consequences

**Better**

- Events from Brave and uBlock users arrive; every event carries its environment and first-touch campaign.
- Trading volume stops being inflated by sells, and the validator prevents the regression.
- Hyperliquid perps become visible.
- New users' first deposits are counted; Naira deposits are labelled correctly on more devices.
- Failures can be grouped, and user cancellations stop reading as outages.

**Costs**

- The relay is a function invocation per batch of events. The SDK batches, so this is small, but it counts against Vercel usage and needs the same monitoring Watchtower's tunnel has.
- The catalog grows. Old and new property names coexist until the data team retires the old ones.
- Moving the watchers into the session providers means their polling runs on every signed-in page. `useActivity` already shares its query key with the notification bell, so the extra cost is the onramp order poll while a bank deposit is open.
- The interim watchers are throwaway work once server events land. They are kept small for that reason.

**Risks**

- Geolocation through the relay must be verified after release; if Mixpanel ignores the forwarded IP, the SDK's `ip` handling needs a follow-up.
- Changing `amount_usd` semantics creates a step change in historic charts. Release notes and a Mixpanel annotation mark the date.

## Alternatives considered

- **A `rewrites()` entry to Mixpanel instead of a route handler.** No allowlist, no token check, and the client IP is not forwarded, so every user would geolocate to the server region. Rejected for the same reasons Watchtower's tunnel is a route handler.
- **Mixpanel's own CDN-hosted proxy or a third-party CDP (Segment, RudderStack).** New vendor and contract for a problem one route handler solves.
- **Lowercasing `distinct_id` as the tracking plan asks.** Splits every existing person. `wallet_evm` gives the lowercase join without that cost.
- **Restoring `bank_transfer_completed` as the tracking plan asks.** Brings back the Naira double count.
- **Fixing every money event in the browser and skipping the backend.** The browser cannot see money that settles while it is closed, or perp exits run by Hyperliquid. The browser version is kept only as a bridge.

## Decisions recorded at approval (22 September 2026)

1. **Branch.** Implemented on `feat/mixpanel-integration_carniel`, which tracks `origin/main`.
2. **Residency.** Project 4051122 is in the EU. The relay forwards to `api-eu.mixpanel.com`.
3. **Projects.** No separate test projects. Environments are separated by the `environment` property (D2).
4. **Interim watchers (D8).** Approved: fix deposit and withdrawal counting in the browser now. The backend replaces them later, per the server brief.
