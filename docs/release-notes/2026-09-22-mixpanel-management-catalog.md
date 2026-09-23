---
date: 2026-09-22
feature: Management's tracking catalog, sections 1 to 8
scope: feat
scenario-impact: none
---

# Tracking: management's catalog for landing, auth, money and the desks

Decided in
[ADR-2026-09-22-mixpanel-management-catalog](../adr/ADR-2026-09-22-mixpanel-management-catalog.md),
which amends the tracking ADR from earlier the same day. The data team should
add a Mixpanel annotation on the release date: several event names, several
property names and the `distinct_id` itself all change on it.

## Read this first: every existing profile splits

`distinct_id` is now the EVM wallet address **lowercased**, as the catalog
specifies. It was the checksummed address, and Mixpanel's `distinct_id` is
case-sensitive, so every profile that exists today stays behind. A returning
user arrives as someone the project has never seen.

- Reports spanning the release date count one person as two.
- `$email`, `signup_date` and the `first_deposit_*` fields sit on the old
  profile; the new one starts empty and `set_once` will not backfill it.
- `total_deposit_usd`, `total_volume_usd`, `trade_count` and `referral_count`
  restart at zero.

The fix is an identity merge run inside Mixpanel after release, mapping each
checksummed id onto its lowercase form. Nothing in the app can do it. Until it
is run, read anything crossing the release date as two cohorts.

## Renamed

| Was                                                       | Is now                                               |
| --------------------------------------------------------- | ---------------------------------------------------- |
| `perp_order_failed`                                       | `perp_trade_failed`                                  |
| `landing_viewed`                                          | folded into `page_view`                              |
| `perp_*.market`                                           | `pair`                                               |
| `perp_*.side`                                             | `direction`                                          |
| `perp_trade_opened.has_take_profit` / `take_profit_price` | `take_profit` (the price, absent when there is none) |
| `perp_trade_opened.position_size_usd`                     | `notional_usd` alone                                 |
| `trade_*.vertical: "real_asset"`                          | `"rwa"`                                              |
| `trade_completed.token` (memecoin)                        | `asset`, as on every other vertical                  |
| `trade_recording_mismatch.hash`                           | `tx_hash`                                            |
| `arktivity_tx_opened.chain`                               | `network`, plus `tx_type`, `asset` and `tx_hash`     |

Naira deposits have their own event again: `bank_transfer_completed`.
`deposit_completed` is crypto-only and has lost its `method`. The two are
disjoint, so nothing fires both and nothing is counted twice; the profile
totals read both names.

## New events

- **Landing.** `get_started_clicked` with `placement` (hero, enter, cta,
  navbar), so it is visible which part of the page converts.
- **Auth.** `auth_method_selected` and `login_failed`, from each of the four
  ways in (Google, X, email code, passkey). `auth_started` now carries
  `intent`. `signup_failed` is defined but has no call site: the browser is
  told a sign-in failed, not whether the account it would have made was new,
  so every failed attempt is reported as `login_failed`. Telling the two apart
  needs the server.
- **Add funds.** `deposit_address_generated` and `deposit_address_failed`,
  `bank_account_generated` and `bank_account_failed`. The gap between picking a
  network and being given somewhere to send money was invisible before.
- **Withdraw.** `withdraw_method_selected`.
- **Kash.** `kash_failed`, with `side`. `kash_bought` and `kash_sold` gain
  `rate` and `tx_hash`.
- **Prediction.** The slip: `prediction_selection_added`,
  `prediction_selection_removed`, `prediction_slip_submitted`,
  `prediction_bet_failed`. `leg_count` is on every slip event, as the catalog
  requires. A single Polymarket bet is reported as a slip of one, so singles
  and combos count in the same series.
- **Perps.** `perp_order_submitted`, reported before the venue answers, so an
  order that never comes back is still counted.

## page_view

Now fires on **every** page, not only the nav sections, and carries:

- `page`: a name from a closed list, including one per Arkade game
  (`arkade_chess`, `arkade_arkjet` and the rest) rather than a single "arkade".
- `path`: the raw pathname. Always sent, so a route nobody has named yet is
  still counted rather than silently missing.
- `referrer`: on the first load of a session only. Repeating it on in-app
  navigation would read as a fresh arrival from that site each time.
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`: read off the URL
  being viewed, so a campaign link clicked part-way through a session is
  attributed. The SDK only ever sees the URL the session booted on.

## Failure reasons

Each section of the catalog has its own `reason` list. One classifier reads the
error and the domain narrows the result to a word it actually defines, so a
withdrawal reason can no longer appear on a trade; the validator rejects it in
development and in CI. A reason a domain has no word for arrives as `unknown`
with the classifier's verdict in `reason_detail`, so the bucket can still be
broken down.

The same failure is reported in each desk's own words: money the account does
not have is `insufficient_balance` on a trade and `insufficient_margin` on a
perp.

One value is kept that the catalog does not list: `user_cancelled`. A user
dismissing their wallet is not a failure of the product, and folding it into
`unknown` would bury the commonest cause of an abandoned trade.

## Trading

`fill_price_usd` is now on every trade event, derived from the two amounts
rather than passed in, so it cannot disagree with them. It follows
`amount_source`: the filled price on a completion, the quoted one on a preview.

## Not in this release

Sections 9 to 11 of the catalog: the five Arkade games, Square's thirty social
events and the rest of Arkivity. Arkade keeps sending its current events;
Square and the Arkivity filters send nothing. That is a second branch.

`signup_completed` is specified to fire server-side when the account row is
written. The browser cannot do that, so it still fires from the client on the
identified account. The server-side version, and `signup_failed` with it,
belong to the outbox work in `docs/mixpanel-server-events-integration.md`.

`prediction_bet_settled` is defined but not sent: settlement happens on the
venue, and the app only ever sees an already-settled ticket, so firing it from
here would report a settlement on whichever page load first noticed it rather
than when it happened.

## Known limit

A deposit noticed on a device that is not the one that requested the naira
transfer is reported as `deposit_completed` (crypto) rather than
`bank_transfer_completed`, because the record that says which rail it came from
is held on the requesting device. The two events have different names, so
Mixpanel's `$insert_id` cannot merge them and the deposit is counted twice in
that case. It needs the rail to be reported by the backend, which the outbox
brief covers.
