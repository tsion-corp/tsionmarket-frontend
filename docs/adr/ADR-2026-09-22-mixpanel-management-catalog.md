# ADR: adopt management's tracking catalog

- Status: accepted
- Date: 2026-09-22
- Approved by: the maintainer, 2026-09-22
- Amends: [ADR-2026-09-22-mixpanel-frontend-tracking](./ADR-2026-09-22-mixpanel-frontend-tracking.md)

## Context

Management circulated a tracking catalog of roughly 150 events across eleven
sections. It supersedes both ARK-TRACKING-PLAN-004 and the catalog this repo
implemented earlier the same day, and it is now the source of truth for event
names, property names and the values a property may take.

Three parts of it contradict decisions already taken and implemented, so they
are recorded here rather than being changed silently.

Sections 1 to 8 (landing, auth, add funds, withdraw, Kash, trading, prediction,
perps) map onto flows that already send events. Sections 9 to 11 (Arkade's five
games, Square, Arkivity) are almost entirely new call sites: Square alone is
thirty events across a slice that currently sends none.

## Decisions

### 1. `distinct_id` becomes the EVM address lowercased

The catalog specifies the wallet address lowercased. This app identifies by the
checksummed address Privy returns, and every profile in the project today is
keyed by that string.

Mixpanel's `distinct_id` is case-sensitive, so this is not a formatting change.
Every returning user arrives as a person the project has never seen. Profiles,
retention, funnels and the lifetime counters all split at the release.

Adopted as specified, against the recommendation in this document, on the
maintainer's decision. The cost is real and lands on the data team:

- Reports spanning the release date count one human as two.
- The `$email`, `signup_date` and `first_deposit_*` fields sit on the old
  profile. The new one starts empty and `set_once` will never backfill it.
- The running counters (`total_deposit_usd`, `total_volume_usd`, `trade_count`,
  `referral_count`) restart from zero.

The mitigation is an identity merge run in Mixpanel after release, mapping each
checksummed id to its lowercase form. It is the data team's to run, and nothing
in this repo can do it. Until it is run, any report crossing the release date
should be read as two cohorts.

`wallet_evm`, which already carries the lowercase address on every event, is
kept. It now duplicates `distinct_id` and is harmless.

### 2. The catalog's names win over the ones implemented today

`perp_order_failed` becomes `perp_trade_failed`, `market` becomes `pair` on the
perp events and `side` becomes `direction`, `real_asset` becomes `rwa` as a
vertical, and the memecoin variant reports `asset` rather than `token`.

None of these have shipped: they are uncommitted work on a feature branch, so
no production report depends on them. The two names that predate all of this,
`page_view` and `login_completed`, keep their spelling and the catalog agrees.

### 3. Naira deposits get their own event again

The catalog splits `bank_transfer_completed` back out of `deposit_completed`,
which becomes crypto-only.

The earlier ADR merged them because every Naira deposit fired both names and was
counted twice in the dollar totals. The split is safe as specified because the
rails are now disjoint rather than overlapping: a Naira deposit fires
`bank_transfer_completed` and nothing else. `deposit_completed` loses its
`method` property, since it can only mean one thing.

The profile accumulation in `lib/analytics/mixpanel.ts` therefore has to read
both event names, or `total_deposit_usd` and `has_deposited` would stop counting
the Naira rail. That is the one place the split costs something.

### 4. Failure vocabularies become per-domain

The catalog gives each section its own `reason` list rather than one shared set.
`lib/analytics/failure-reason.ts` keeps a single classifier and narrows its
result to the list the domain allows, so a screen cannot send a withdrawal
reason on a trade. A reason with no equivalent in a domain's list arrives as
`unknown` with the classifier's own verdict in `reason_detail`.

One value is kept that the catalog does not list: `user_cancelled`. A user
dismissing their wallet is not a failure of the product, and folding it into
`unknown` puts the single largest cause of abandoned trades into the bucket
nobody can act on. It is an addition to the catalog's lists, never a
substitution for one of them.

### 5. `page_view` fires on every page, and names it

The catalog asks for `path`, `referrer` and the four `utm_*` tags. The
maintainer asked that the page be named too, not only the landing page.

`page_view` therefore carries both: `page`, a name from a closed union, and
`path`, the raw pathname. A route with no name in the union still sends the
event with its path, so a page is never silently missing from the data; the
union exists so that the common pages group cleanly without anyone parsing URLs
in a report.

`landing_viewed`, added earlier the same day to carry campaign tags, is removed.
`page_view` now fires on the landing pages and carries the tags itself, and
keeping both would double-count every arrival.

### 6. An event only exists if something can send it

Sections 9 to 11 ask for events the app has no surface for: Square bookmarks,
stories, winks, gist rooms and direct messages; joining or creating a house; an
Arkivity filter the timeline does not have; a Last Man round start the browser
cannot observe.

Those are left out of the catalog rather than defined and left unsent. A
catalog entry is a promise that the event exists, and a list of promises that
cannot be kept is how a data team ends up querying for rows that were never
going to arrive. The release notes say which ones, and why, so the gap is
visible to whoever asks for them next.

Applied to the end: every event in the catalog that a browser can send is now
sent. What is left is three events with no surface (`chess_challenge_declined`,
`perp_tpsl_set`, `perp_margin_adjusted`, all removed) and two only a server can
send (`signup_failed`, `prediction_bet_settled`, both kept and documented).

## Consequences

- `lib/analytics/events.ts` and `schema.ts` are rewritten for sections 1 to 8.
  The validator still refuses an unknown property and still throws outside
  production, so a drifted call site fails the suite rather than the reports.
- Sections 9 to 11 landed in the same branch, after sections 1 to 8. Chess
  stops sending the generic `game_staked`, `game_result` and
  `tournament_joined`, which draughts keeps, so no stake is counted twice.
- `signup_completed` is specified to fire server-side from the account write.
  The browser cannot do that. It fires from the client on the identified
  account, as it does today, and the outbox brief in
  `docs/mixpanel-server-events-integration.md` is where the server-side version
  belongs.

## Rejected

- **Sending old and new names together.** Doubles the volume on every renamed
  flow and forces every report to pick a side, to protect charts that cannot
  exist yet because the events have never shipped.
- **Lowercasing `distinct_id` only for new accounts.** Leaves the project with
  two conventions and no way to tell from a row which one an id follows.
