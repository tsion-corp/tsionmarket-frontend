---
date: 2026-09-23
feature: Opening a game you just created no longer shows an empty pot
scope: fix
scenario-impact: none
---

# "Open the game" opened an empty game

Creating a game and pressing "Open the game" landed on the arena with a pot of
0.00 and no countdown. The clock never started and the pot never filled. The
same game opened from the lobby banner was fine.

## What was happening

After the start transaction, the app asks the service to confirm the new game
and seeds the answer into the cache, so the arena can open without a second
round trip. That confirm loop retried on a 404 only.

The service does not answer 404 for a game its index has not reached. It falls
through and reads the contract, and that read can land a block or two before
the start transaction. The row it returns is real but empty: no pot, an end
time of zero, not active.

Seeding writes that row as fresh. With the socket up, the REST poll is off, so
nothing ever replaced it. The lobby path never seeded anything, which is why
the same game was fine when opened from there.

## The fix

The confirm loop now keeps asking until the round has actually started — the
game is active, settled, or carries an end time — on the same retry schedule
the 404 case already used.

If it never does, nothing is seeded and the arena fetches for itself, exactly
as the lobby path does. Failing safe means falling back to the route that
already works.
