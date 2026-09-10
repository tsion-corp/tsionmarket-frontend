# ADR-2026-09-10: Why Last Man should stop asking the blockchain what our own server already knows (Plain English Guide / ADR for Dummies)

## Status

Proposed, 2026-09-10, waiting for the maintainer to approve.

## The Problem

When Last Man Standing was built, our own game server was broken. It listed
no games, it knew no winners, it had never sent a live update, and nobody was
paying winners when a round ended. So the app was built to trust nothing but
the blockchain: it asked the blockchain provider which games exist, who won,
what happened recently, whether a payout was stuck, and it paid the winner
from the winner's own wallet so nobody had to wait on the server.

The server has since been fixed. Checked today, it lists live games, serves
every winner with the exact amounts paid, serves the activity feed, sends a
live update every ten seconds, and settles a finished round within about five
seconds of the clock running out.

The app does not know that. It still asks the blockchain provider for all of
it, on top of asking our server. Providers charge per question, and these are
the heaviest questions on the page:

- Every ten seconds, on a game page, the app asks "what block are we on" and
  "is a payout waiting for me", even when nothing has happened.
- Every time a game page opens or the live feed reconnects, the app scans
  10,000 blocks of history three or four times over to rebuild feeds our
  server now serves in one request.
- When a round ends, the winner's wallet sends a "pay me" transaction at the
  same moment the server sends one. One of the two always fails.
- The floating countdown keeps asking about a game on every page of the app,
  forever, even after that game settled.

## What We Do

- Read games, winners and activity from our own server only. The blockchain
  is asked only for what the server cannot tell us: signing the player's own
  transactions, and a single check for a stuck payout after a round settles.
- When a player starts a game, confirm it through our server, which now looks
  it up on the blockchain for us if the index is a few seconds behind.
- Let the server pay the winner. The winner's wallet only steps in if the
  server has not paid within fifteen seconds. The manual button stays.
- Read the contract's settings (minimum stake, payout split) in one request
  every five minutes instead of three requests at different times.
- Stop following a game once it has settled, so the floating clock goes
  quiet.

## What Users See

Nothing different, except faster. Games, pots and timers move from the live
feed as they do now. A game you just started shows up within a second or
two. Winners are shown with the exact amount they were paid. Payouts arrive
from the server's settlement, and you sign nothing unless it is late.

## What It Saves

For one browser on a game page during a round: from about twelve blockchain
requests a minute, plus a burst of ten to fifty every time the page opens, to
zero in steady state. With the live feed down: from up to fifty a minute to
zero. One settlement transaction per round instead of two.

## The Risk

Our server is now the thing the screens depend on. That is what it is for,
and the app already caches its answers and shows the last good data when a
request fails. If the server stops paying winners, the winner's wallet still
does it after the grace period, exactly as today.
