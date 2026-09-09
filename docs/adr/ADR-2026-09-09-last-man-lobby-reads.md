# ADR-2026-09-09: The Last Man lobby reads the chain only when the socket cannot tell it

## Status

Proposed — 2026-09-09. Awaiting the maintainer's approval; built and tested
so the approval is made against working code.

## Context

The lobby at `/casino/last-standing` makes about 46 chain-RPC requests a
minute while idle with no game running, and more during a game, all through
`/api/evm-rpc/base-mainnet`. Measured on the dev server on 2026-09-09 and
traced to five reads:

| read                                                                                          | cadence | requests/min | payload |
| --------------------------------------------------------------------------------------------- | ------- | ------------ | ------- |
| active games: `nextGameId`, then a 20-game `getGameStatus` multicall                          | 8 s     | 15           | medium  |
| the same read again, invalidated by the block ticker by key prefix                            | 10 s    | up to 12     | medium  |
| settled games: 20-game multicall, 10,000-block `GameSettled` log scan, a block lookup per hit | 12 s    | 10 to 30     | large   |
| recent activity: three 10,000-block log scans, a block lookup per hit                         | 12 s    | 15           | largest |
| block number                                                                                  | 10 s    | 6            | tiny    |

Three facts make most of it waste:

1. **The recent activity read is not rendered on the lobby.** The lobby
   destructures only winners from the feeds hook. Fifteen requests a minute
   and the heaviest payloads on the page feed nothing until a game page.
2. **The socket already carries what the lobby shows, but the app throws
   it away.** Probed on 2026-09-09 during a live game: the hub sends
   `activeGames` every 10 s with the game's id, starter, king, pot, min
   wager, end time and time remaining, plus `gameStarted` on creation. The
   rows are in the contract's shape (`potWei`, `minWagerWei` as strings).
   The frame handler validates rows against the API shape, which prices the
   pot, drops every row, and writes an empty list into the games cache. So
   while the socket is up it says "no games", and only the 8-second chain
   poll keeps a game on screen. The REST polls are switched off while the
   socket is connected; the chain polls never were, because they could not
   be.
3. **The winners read only feeds the Hall of Winners modal**, closed by
   default, yet it runs every 12 s with the log scan.

The block-tick invalidation targets `["vault","games"]`, and React Query
matches keys by prefix, so it also refetches the chain query keyed
`["vault","games","chain"]`, bypassing its stale time, on top of that query's
own 8-second interval.

## Decision

1. **The frame handler accepts the hub's row shape.** A row carrying
   `potWei` and `minWagerWei` is a contract row and is written into the chain
   games cache as a `ChainGame`, where `mergeGames` already prices it with the
   ETH price the lobby holds. A row in the API shape still goes to the API
   games cache. A row in neither shape is dropped with a warning, as now. The
   test uses the exact `activeGames` and `gameStarted` frames captured from
   the hub on 2026-09-09. `gameStarted` still invalidates, since the next
   `activeGames` frame carries the row.
2. **The chain games query gets its own key**, `["vault","chain","games"]`,
   so no prefix invalidation of the API list reaches it. The lobby drops
   `useInvalidateOnBlock`: the socket's `activeGames` frame every 10 s is the
   tick, and the chain poll below covers a dead socket.
3. **The chain polls are gated on the socket like the REST polls.** While
   connected, active games are re-read from the chain every 60 s as a
   reconciliation and settled games are not polled at all; while
   disconnected, the 8-second cadence returns. A reconnect already
   invalidates every vault key.
4. **The lobby stops reading recent activity.** `useVaultFeeds` takes
   `{ activity: false }` from the lobby; the game page keeps it.
5. **Winners load when the Hall of Winners opens** and stay fresh for five
   minutes; the `gameSettled` frame invalidates them. The lobby passes
   `historyOpen` to the feeds hook.
6. **Active games come from a cached server route while the socket is
   down.** `GET /api/vault/chain-games` runs `readActiveGamesWith` through
   `baseReadClient()`, the same machinery the dashboard feed uses, cached
   10 s per instance with `s-maxage=8`. The client's chain query calls this
   route. The browser makes no `/api/evm-rpc` request for the lobby list, and
   concurrent users share one upstream read per instance.

```
socket up:    activeGames frame (10 s) ──► chain games cache ──► mergeGames ──► lobby
              chain reconciliation      ──► every 60 s via /api/vault/chain-games
socket down:  /api/vault/chain-games    ──► every 8 s (one upstream read per instance)
              REST /games               ──► every 5 s (as today)
winners:      on modal open, 5 min stale, invalidated by gameSettled
activity:     game page only
```

## What the user still sees, and how

- A new game appears from `gameStarted` (invalidation) and the next
  `activeGames` frame, within 10 s. Today it appears from the 8-second chain
  poll, so the worst case is the same and the socket case is often faster.
- Pot, king and timer move from `wagerPlaced` and `activeGames` frames, as
  they were designed to.
- A settled game leaves the list from `gameSettled` and the next snapshot.
- If the socket drops, every poll returns to its current cadence at once.
- The Hall of Winners opens with fresh data and updates when a game settles.

## Consequences

- Idle lobby with the socket up: about 2 requests a minute to our API, zero
  to `/api/evm-rpc`. Down from about 46.
- Idle lobby with the socket down: about 8 requests a minute to our API, all
  served from the route's cache when several users are on the page.
- The game page is unchanged by this ADR beyond the shared key rename; its
  own reads are a separate change.
- The backend's "domain-shaped rows" report is closed from our side: the
  app now reads the shape the hub sends.
- Verification: frame handler tests with the captured frames; lobby hook
  tests pinning the query cadences with the socket up and down; a route
  test; the five gates; and a live game on the dev server with the Network
  tab open, before and after.
