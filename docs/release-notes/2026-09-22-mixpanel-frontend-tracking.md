---
date: 2026-09-22
feature: Mixpanel tracking that reaches Mixpanel and reports real amounts
scope: fix
scenario-impact: none
---

# Mixpanel: events arrive, sells are in dollars, perps and first deposits count

Decided in [ADR-2026-09-22-mixpanel-frontend-tracking](../adr/ADR-2026-09-22-mixpanel-frontend-tracking.md).
The data team should add a Mixpanel annotation on the release date: several
charts step on it, and the reasons are below.

## Delivery

- Events go through `/api/relay` on our own domain to Mixpanel's EU host
  (project 4051122 is EU-resident), on neutral paths, so ad blockers stop
  dropping them. The relay forwards only our project's token and the visitor's
  public IP, so locations stay correct.
- Every event carries `environment` (`production`, `preview`, `development`).
  There is one project; reports on real users filter on `production`.
- Referral links and the pre-launch redirect keep their `utm_*` tags, and a new
  `landing_viewed` event fires on `/` and `/welcome`, so campaigns are
  attributed.

## Amounts

- **`trade_completed.amount_usd` is dollars on sells.** Memecoin and real-asset
  sells reported the token count, which is the $1.26M of phantom volume. Every
  trade now reports the USDC leg as `amount_usd` and the token leg as
  `token_quantity`, and the validator refuses a sell without `token_quantity`.
- New on trades: `amount_source` (`fill` when the figure is what moved, `quote`
  when it is what was expected), `order_id`, `tx_hash`, `token_address`,
  `chain_id` (EVM only), and `recorded` (`confirmed` or `delivered`).
- Swaps the receipt proves delivered, but the trade service recorded otherwise,
  now count as completed trades (`recorded: delivered`).
- New `trade_submitted`, sharing its `order_id` with the completion.

## Newly reported

- Hyperliquid perps: `perp_market_viewed` (once per market), `perp_trade_opened`
  with `notional_usd` = collateral x leverage, `perp_trade_closed`, and a new
  `perp_order_failed`. The Hyperliquid desk sent nothing before.
- A new account's first deposit. A device's first run used to stay silent and
  drop it; it now reports the last four days, stamped with the deposit's own
  `time` and a stable `$insert_id`, so one deposit seen on two devices is one
  event.
- Deposits and bank withdrawals on every signed-in page, not only while the
  dashboard or the withdraw screen is open. New `withdraw_failed`.
- `chess_game_started` for both players, not only the one who accepted.

## Vocabulary and counts

- Every `_failed` event's `reason` is one of: `insufficient_balance`,
  `address_unavailable`, `no_route`, `simulation_failed`, `slippage_exceeded`,
  `rail_rejected`, `provider_timeout`, `user_cancelled`, `unknown`, with the
  service's code in `reason_detail`. A dismissed wallet is `user_cancelled`, no
  longer a failed trade.
- Game events add `amount_usd` and `game_id` beside their existing names
  (`stake_usd`, `payout_usd`, `entry_usd`, `winnings_usd`, `match_id`), which
  are unchanged.
- `auth_started` no longer fires for signed-in visitors being forwarded.
  `passkey_skipped` carries `supported`. `deposit_failed` carries `network` and
  `asset`.
- Signups are sent after the account is identified, so they land on the person.
  A previous session's identity is cleared on a shared device. `wallet_evm`
  (lowercase) is added for joins; `distinct_id` is unchanged.

## Not changed

- `bank_transfer_completed` is not restored: Naira deposits are
  `deposit_completed` with `method: bank`, as since 26 August.
- `distinct_id` casing and existing property names.
- Profile running totals are still client-side and can double-count a deposit
  noticed on two new devices within four days. Totals come from the ledger.

## Configuration

- `NEXT_PUBLIC_MIXPANEL_TOKEN` is unchanged. No new variables.
- The privacy policy now describes named events, the relay and EU storage.
  Legal should review the wording.
