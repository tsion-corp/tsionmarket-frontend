# casino-service

The server behind World Street's casino. It exists because staked play needs
an authority: something to pair players, hold both stakes, validate every move
so neither side can cheat, price the spectator market, and pay out.

Implements the contract in `wsws-frontend/docs/casino-backend.md`.

## Run

    pnpm install
    pnpm dev        # http://localhost:4000

Point the frontend at it:

    NEXT_PUBLIC_CASINO_API_URL=http://localhost:4000

## What works

- **Staked chess.** Invite links and automatch, both escrowing each player's
  stake on commitment. The position, clocks and result live on the server;
  clients propose moves in coordinate notation and are told what happened.
  Out-of-turn and illegal moves are rejected, and a player who walks away
  loses on time.
- **Spectator betting.** Prices derive from the position (material, squashed
  through a logistic curve) and from the money already on each side, so odds
  move on a blunder rather than at random. A bet carries the price the user
  saw and is rejected if the market has moved beyond 2%. Players cannot bet on
  their own game.
- **Settlement.** Winner takes the pot less the 5% participation fee; a draw
  returns both stakes. Spectator bets settle against locked odds.

## Custody

`src/domain/ledger.ts` is the boundary for holding money. The in-memory
implementation is a real double-entry ledger: player accounts cannot overdraw,
every movement is journalled, and the tests assert that total value is
conserved across a full match with bets.

**It is in memory, so it is not production custody.** Going live means
implementing the same `Ledger` interface against the escrow contract. Nothing
above that file changes.

## Not built yet

The number draw needs a scheduler and a published, auditable randomness
source, so `/draw/rounds/current` returns `NOT_CONFIGURED` and the frontend
shows "not available yet" rather than inventing numbers.
