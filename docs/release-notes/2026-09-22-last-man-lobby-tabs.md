---
date: 2026-09-22
feature: The Last Man lobby, leaderboard, private games and the share card
scope: feat
scenario-impact: needs_automation
---

# The Last Man gets a lobby, a leaderboard and shareable games

Built for an event where the game is being introduced to people who have never
played it.

## The lobby

- Three tabs under the back link: Last man, Leaderboard, How the game works.
- The banner carries the game's name over the Arkade shelf's warm ground, with
  the three numbers that decide whether somebody plays: the clock, the stake
  and the winner's share.
- The lobby lists one game, the public one. Everything else running is reachable
  only by its link.

## Leaderboard

- Every wallet that has ever won, ranked by total winnings, ten to a page.
- It reads all 581 winners rather than the 25 the feed returns by default: the
  service pages that endpoint and the lobby only ever asked for the first page,
  so the board was the last 25 games. The walk happens in our own route, cached,
  with concurrent readers sharing one pass.
- Amounts are summed as base units per token and priced once. Most wins are
  native ETH from the v4 era and the rest USDC, so adding them raw would be out
  by twelve orders of magnitude.
- A reader's own row carries their name and Market Square face; every other
  player is an address.

## How the game works

Four steps, the payout split and the game's real numbers, read from the live
contract config. In all five locales.

## Public and private games

- The start sheet asks who can find the game. Public takes the lobby's single
  spot; private stays off the lobby and is reachable only by its link, which
  anyone can still play.
- Only one public game at a time. A private game never competes for the spot,
  so starting one is always offered.
- Once a game exists the sheet hands over its link, a QR built to be scanned
  off a screen, and a square PNG card carrying the game number and stake.

## Along the way

- A signed-out visitor following any link now lands back on that route after
  signing in, instead of on the portfolio. The destination is validated as a
  same-origin path.
- A player short of the entry gets the deposit flow instead of a toast.
- The arena starts its own sound off the player's first interaction, stops when
  the round ends, and keeps a mute.
- Leaving a live round offers the pop-out; only "yes" navigates.
- The pop-out sent its wager through an 18-decimal conversion against a
  6-decimal game, which the contract could only reject. It now converts at the
  game's own scale, shows the round settling, and drops its play button when
  the round is over.
- A wager still confirming when the clock hit zero made the arena declare a
  winner for a round that then carried on. The verdict now waits on this
  client's own wager.
- Help & support opens the in-app support chat rather than a Google form.
