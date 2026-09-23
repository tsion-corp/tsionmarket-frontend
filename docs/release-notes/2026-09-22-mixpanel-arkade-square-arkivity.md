---
date: 2026-09-22
feature: Management's tracking catalog, sections 9 to 11
scope: feat
scenario-impact: none
---

# Tracking: Arkade, Square and Arkivity

The second half of management's catalog, following
[sections 1 to 8](./2026-09-22-mixpanel-management-catalog.md). Decided in
[ADR-2026-09-22-mixpanel-management-catalog](../adr/ADR-2026-09-22-mixpanel-management-catalog.md).

Square sent nothing at all before this. Arkade sent six events across three
games; it now sends thirty across six.

## Arkade

**The hub.** `arkade_opened`, and `game_opened` now covers ArkBall, Arkjet and
Pilot Chicken as well as chess, draughts and Last Man. The three new ids were
added to the one map the desktop rail and the phone deck both read, so neither
surface can drift from the other.

**The balance.** `arkade_balance_funded` and `arkade_balance_withdrawn` replace
`game_wallet_funded`, which only ever reported chess. Moving money into the
Arkade float is a step every staked game passes through and it was invisible.

**Chess** stops sending the generic `game_staked`, `game_result` and
`tournament_joined` and sends its own events instead, so no stake is counted
twice:

- `chess_game_created` with `mode`, `staked`, `time_control`. The app's
  auto-pairing is the catalog's `play_online`; an invite is `challenge_friend`.
- `chess_challenge_sent` on an invite, and `chess_challenge_accepted`.
- `chess_game_started` gains `opponent_type` and `bot_level` (1 to 8, and only
  against the engine; a level outside that range is left off).
- `chess_game_ended` replaces `game_result`, with `end_reason`, `moves` and
  `house_usd` beside the payout. The house cut is reported rather than derived:
  the fee rate has changed before, and a report that divided one by the other
  would silently restate history the next time it does.

**Last Man.** `last_man_created` when a round is opened, `last_man_joined` when
a player buys in (replacing `last_man_played`), `last_man_ended` on the reveal
(replacing `last_man_won`), and `last_man_failed`. The three shares of the pot
are read from the contract's live split, which the owner can retune, not from a
rate written into the app.

**ArkBall.** `arkball_opened`, `arkball_numbers_selected` (with `quick_pick`,
cleared the moment a ball is touched by hand), `arkball_ticket_purchased`,
`arkball_ticket_failed` and `arkball_draw_settled`. The draw carries its own
jackpot, ticket count, player count and rollover, so the settled event is the
draw's own figures rather than anything reconstructed.

**Arkjet.** `arkjet_ticket_placed`, `arkjet_cashed_out`, `arkjet_round_lost`,
`arkjet_ticket_failed`. Every event names its `ticket_slot`, since two tickets
can ride one round. Settlements are reported from the one place every bet
update passes through, so a ticket that cashed out on its own, or lost, is
counted the same as one the player closed by hand.

**Pilot Chicken.** `chicken_round_started`, `chicken_lane_advanced`,
`chicken_cashed_out`, `chicken_round_lost`, `chicken_round_failed`. The session
is cumulative and arrives again on every socket frame, so each report carries a
key and a repeat is dropped: one lane crossed is one event, not one per frame.

**Draughts** is not in the catalog, so it keeps `game_staked`, `game_result`
and `tournament_joined` unchanged.

## Square

Everything here is new.

- `square_opened` and `square_feed_filtered`, which carries the tab id whole
  (`lane:following`, `topic:…`, a discussion id).
- `post_created` and `post_failed`, with `media_type` and `has_media`.
- `post_viewed`, on the same threshold the service itself counts: half the card
  on screen for a full second. Not on render, which would credit authors with
  views nobody gave.
- `post_liked` and `post_reposted`, sent only for the act, never for undoing
  it. There is no unlike event, and sending one would double every count.
- `post_commented`, from replies as well as top-level comments.
- `user_followed` with `source` (`feed_post`, `pals_deck`, `person_row`), so it
  is visible which surface actually grows the graph, and `user_unfollowed`.
- `creator_application_started` and `_submitted`.
- `stream_started` and `stream_ended`, with how long it was actually live.

## Arkivity

`arkivity_opened`, and `arkivity_tx_shared` when a transaction is shared to
Square. `arktivity_tx_opened` already carries its fuller shape from the first
half of this work.

## What is not sent, and why

The catalog asks for events the app has no surface for. Rather than define
events that can never fire, they are left out:

- **Square:** bookmarks, stories, winks, gist rooms, direct messages, joining
  or creating a house, `post_shared`, `hashtag_joined`, `profile_viewed`, and
  `stream_joined` for a viewer. The designs carry most of these but there is no
  write behind them; the guest role in a stream is a co-host, not a viewer.
- **Arkivity:** `arkivity_filtered`. The timeline has paging, not filters.
- **Last Man:** `last_man_started`. The round has no start the browser can see
  separately from players joining it, so an event for it could only be a second
  report of the same fact. `player_count` is optional on the Last Man events
  for the same reason: neither the contract nor the vault service exposes one,
  and a guessed figure on a pot game is worse than an absent one.
- **Chess:** `chess_challenge_declined`. The service declines a rematch and a
  takeback, but there is no decline for a challenge, so there is nothing to
  report.
- **Perps:** `perp_tpsl_set` and `perp_margin_adjusted`. Exits and leverage are
  set when the order is placed, which `perp_trade_opened` already carries, and
  the desk cannot change either on a position that is already open.

Two remain that only the backend can send, both from the first half of this
work: `signup_failed`, because the browser is told a sign-in failed but not
whether the account would have been new, and `prediction_bet_settled`, because
settlement happens on the venue and the app only ever sees a settled ticket.

## The rest of chess

Wired after the first pass, so the catalog's chess section is complete:

- `chess_mode_selected`, from the route rather than from six separate buttons.
  Puzzles, learn and watch are pages of their own; challenge_friend, vs_computer
  and play_online are the lobby's three `setup` values. Reported when the mode
  changes, so a re-render is not a second pick and a page that is not a way in
  (a game in progress, the history, a leaderboard) reports nothing.
- `chess_puzzle_started` and `chess_puzzle_solved`, from the puzzle bridge,
  which is the only thing that knows which puzzle is on the board: finishing
  one fetches the next without the page reloading. Only a win counts as a
  solve, since giving up finishes a puzzle too. `attempts` is not sent: the
  runner is Lichess's own and reports a move at a time, correct ones included,
  so counting those would give the length of the solution rather than the
  number of tries.
- `chess_tournament_joined` for both kinds, `swiss` and `arena`.
- `chess_game_failed` on the three ways a game can fail to start: creating a
  challenge, accepting one, and starting a game against the engine.

**A bug fixed on the way.** Swiss tournaments are one service feature shared by
chess and draughts, and the join event hardcoded `game: "chess"` — so every
draughts entry was reported as a chess one. The game now comes off the
tournament. Draughts keeps the generic `tournament_joined`; chess sends
`chess_tournament_joined`.

## Referrals

`referral_completed` now fires, from the service accepting the code rather than
from arriving with one in the URL. It was defined and unsent since before this
work; the profile's `referral_count` follows from it.

## Failure reasons

Two vocabularies join the seven from the first half: one shared across the five
Arkade games, and one for Square. The games share a list on purpose, so a
report can ask how often a game failed for want of balance without unioning
five spellings of the same word.
