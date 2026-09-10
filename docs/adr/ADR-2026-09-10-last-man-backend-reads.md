# ADR-2026-09-10: Last Man reads the vault service first and the chain only to act

## Status

Proposed, 2026-09-10. Awaiting the maintainer's approval before any code
changes.

## Context

The Last Man Standing screens were built while the vault service returned
nothing. On 16 August every feed was `[]`, `GET /games/:id` returned 404 for
every game, no socket frame had ever been observed and no keeper settled a
finished round (`docs/last-man-backend-report.md`). The frontend answered by
reading the contract itself for everything: which games exist, who won, what
happened recently, whether a payout is waiting, and by settling a won game
from the winner's own wallet so the payout never depended on the keeper.

That is no longer the world. Verified against the live gateway
(`api.tsionark.com`) and the live hub (`ws.tsionark.com`) on 2026-09-10:

| Surface                | Then                        | Now                                                                                   |
| ---------------------- | --------------------------- | ------------------------------------------------------------------------------------- |
| `GET /games`           | `[]`                        | Live lobby, `nextCursor`                                                              |
| `GET /games/:id`       | 404 for every id            | Indexed row, falls through to the contract on a miss; 404 only for an id never used   |
| `GET /game/winners`    | `[]`                        | 25 newest, with `toWinner`, `toStarter`, `toTreasury`, `paidToWinner`, `settlementTx` |
| `GET /game/activities` | `[]`                        | 25 newest, `started` / `joined` / `won`, every row carries `gameId`, cursor paging    |
| Socket                 | Hub up, no frame ever seen  | `welcome`, `subscribed` with topic versions, `activeGames` every 10 s with a revision |
| Keeper                 | Settled by hand, hours late | Games 419 to 421 settled 5 s after their clocks ran out                               |

The frontend has not caught up. Its chain reads are now duplicates of what
the service serves, and they are the expensive part of the page. Counted from
the code on `main` (`f3d56656`), for one browser on a game page during a live
round with the socket up:

| Read                                                                                                                        | Trigger                      | RPC requests / min |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------ |
| Base block number (`useBaseBlockNumber`)                                                                                    | 10 s poll                    | 6                  |
| `pendingWithdrawals(address)`                                                                                               | every block                  | 6                  |
| `GET /games/:id` refetch                                                                                                    | every block                  | 0 (REST, wasted)   |
| Settled games: `nextGameId`, 20-game `games` multicall, `previewSplit` multicall, `GameSettled` log scan, one block per hit | mount, reconnect, settlement | 5 to 25 per event  |
| Recent activity: three 10,000-block log scans, one block per hit                                                            | mount, reconnect             | 4 to 30 per event  |
| Split: `winnerBps`, `starterBps`                                                                                            | once per session             | 2 (batched to 1)   |
| Floor: `minStartStake`                                                                                                      | once per minute              | 1                  |

Socket down adds the two feed reads every 12 s: 25 to 50 RPC requests a
minute per browser. After a round ends the winner sends a `settle`
transaction and polls for its receipt; the keeper sends the same transaction
five seconds later or earlier, and one of the two reverts `AlreadySettled`.
The floating timer host mounts `useVaultGame` on every route while a game is
followed, so the block poll runs app-wide, and nothing ever calls
`unfollowGame`, so a game that settled hours ago is still polled on every
page.

The lobby was already moved to the socket by ADR-2026-09-09. It still reads
the contract through `GET /api/vault/chain-games` once a minute (every 8 s
with the socket down), and the dashboard feed reads the contract on every
build, both to cover an indexer that trailed the chain. `GET /games/:id` now
covers that window on the service side.

## Decision

The vault service is the source of truth for reading. The contract is read
only where the service cannot answer, and written only by the user's wallet,
as before.

1. **Lobby, game and feeds read the service only.** `useVaultLobby`,
   `useVaultGame` and `useVaultFeeds` drop every chain query. The winners list
   shows `paidToWinner` when the row carries it (the winner's share plus the
   starter's when one wallet did both, which the chain read computed itself)
   and `toWinner` otherwise. Feeds scope a game page by the `gameId` the rows
   now carry. `lib/vault/read.ts`, `lib/server/vault-chain.ts`,
   `app/api/vault/chain-games`, `readSettledGames`, `readRecentActivity`,
   `readGameStatus`, `merge-feeds.ts` and the chain query keys are deleted.
   The dashboard feed reads the index alone.

2. **A game the user just started confirms through `GET /games/:id`.** The
   id comes off the receipt as now. The service falls through to the contract
   for an id the index has not caught up with, so the client asks the service,
   retrying twice a second apart. Only if the service is unreachable does the
   client read `games(id)` from the contract itself, once. The lobby is seeded
   with that row until `GET /games` lists it.

3. **The keeper settles; the winner only backs it up.** When a round ends
   the page keeps its 2.5-second REST re-check, now for a 15-second keeper
   grace. A `gameSettled` frame or `settled: true` from the service ends the
   sequence with no transaction. Only a game still unsettled after the grace,
   with this wallet as winner, sends `settle` from the client. The manual
   settle button on a finished game stays.

4. **Pending winnings are read on events, not on blocks.** The pending
   payout comes from `GET /players/:address`, which the service answers from
   the contract on every call. It is read once when the page mounts with a
   wallet, and again when a settlement names this wallet as winner or
   starter, and after the wallet's own settle or claim confirms. The block
   ticker leaves the Last Man screens entirely.

5. **Contract parameters come from `GET /config`, once.** The service reads
   `minStartStake`, the split and the round length from the contract and
   caches them; the browser reads them into `["vault","params"]`, fresh for
   five minutes, shared by the default entry hook and the game page. No
   contract read at all where there were three. (`/config`, `/players` and
   `/transactions` are served by the vault service but missing from the
   gateway's OpenAPI document; found by reading the service source.)

6. **The socket carries its own consistency check.** The handler records
   the topic version from `subscribed` and the `revision` on each frame; a
   gap invalidates the vault queries once, which is a REST resync at no RPC
   cost. Rows in an `activeGames` frame are accepted in either shape as
   today; contract-shaped rows are priced with the ETH price the lobby holds.

7. **A followed game is unfollowed when it settles.** `useVaultGame` calls
   `unfollowGame` when the followed game reads `settled: true` or 404, so the
   floating timer stops polling a dead round on every page.

```
socket up:   frames (10 s) ─► react-query caches ─► lobby / game page
             REST /games/:id, /game/* only on invalidation and reconnect
socket down: REST /games/:id every 5 s, feeds every 15 s
own start:   receipt ─► GET /games/:id (service reads the chain) ─► lobby seed
round end:   REST every 2.5 s for 15 s ─► settled? done : winner sends settle
chain reads: games(id) (service unreachable only), receipts for own transactions
```

## What the user still sees, and how

- The lobby, pot, king and timer move from socket frames as today, and from
  REST polls when the socket is down.
- A game they just paid to start appears within a second or two, from the
  service's chain fall-through, instead of from a client contract read.
- The round-end suspense and the winner reveal run exactly as today. The
  payout lands from the keeper's settlement; the winner's wallet signs
  nothing unless the keeper is late.
- The Hall of Winners and the activity feed show the service's rows, priced
  at settlement, with explorer links from the indexed `settlementTx`.
- A payout the contract could not push is still swept by `claim()`; it is
  found on the next settlement or page load rather than on the next block.

## Consequences

- Game page, socket up: **0 RPC requests** in steady state and on mount,
  down from 12 a minute plus a 10 to 55 request burst on every mount and
  reconnect. The only contract traffic left is the user's own transactions
  and their receipts.
- Game page, socket down: 0 RPC requests a minute, down from 25 to 50. REST
  polls only, all through the cached proxy.
- Lobby: the chain-games route and its 60-second poll go away. 0 RPC.
- Dashboard feed: 0 RPC per build, down from 2.
- Settlement: one transaction per round in the common case (the keeper's),
  not two.
- The app-wide block poll while a game is followed goes away, and a settled
  game stops being followed.
- Risk: the service is now on the critical path for reads. Mitigation: the
  proxy already caches and collapses requests; a 5xx from the service falls
  back to the chain read for a single game only, once; everything else shows
  the last good data and the page's existing degraded state.
- Risk: the keeper stops. Mitigation: the winner's client still settles after
  the grace, as it does today, and the manual button remains.
- Verification: red tests first for every removed poll and the unfollow bug;
  hook tests pinning cadences with the socket up and down; frame-handler tests
  with revision gaps; the five gates; then a live round on the dev server with
  the Network tab filtered to `/api/evm-rpc`, before and after.

## Follow-ups outside this change

- `lib/wsapi-base.ts` falls back to `api.worldstreetwebservices.com`, which
  times out on every request today. Production works only because
  `WSAPI_BASE_URL` is set. Pointing the default at `api.tsionark.com` is a
  one-line change and its own PR.
- Ask the backend to add `GET /config`, `GET /players/:address`,
  `GET /games/:id/activities`, `GET /transactions/:hash` and
  `POST /transactions` to the gateway's OpenAPI document. Also:
  `GET /games?cursor=` returns 500 instead of 400.
- `GET /transactions/:hash` resolves a submitted transaction's outcome,
  action and `gameId`. It could replace the client's receipt polling and log
  decoding for the four vault writes; a separate change, since receipts are
  shared with every other sponsored send in the app.
