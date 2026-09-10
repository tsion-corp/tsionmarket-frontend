---
date: 2026-09-10
feature: Last Man reads the vault service first
scope: casino, dashboard feed, gateway default host
scenario-impact: updated
adr: docs/adr/ADR-2026-09-10-last-man-backend-reads.md
plan: docs/plans/2026-09-10-last-man-backend-reads-plan.md
---

# Last Man reads the vault service first

## What changed

The vault service now serves everything the Last Man screens read, so the
frontend stops reading the contract for it. Verified against the live
gateway and hub on 2026-09-10 before any code changed.

- **Lobby, game page and feeds** read the service only. The 20-game
  multicalls, the `previewSplit` multicall and the four 10,000-block log
  scans are gone, with `lib/vault/read.ts`, `lib/server/vault-chain.ts`,
  `GET /api/vault/chain-games` and `merge-feeds.ts`.
- **A game the user just started** is confirmed through `GET /games/:id`,
  which falls through to the contract on the service side. The client reads
  `games(id)` itself only if the service is unreachable.
- **The keeper settles.** The winner's wallet sends `settle` only if the
  game is still unsettled 15 seconds after the round ends. The manual
  settle button on a finished game is unchanged.
- **Pending winnings** come from `GET /players/:address` (the service reads
  `pendingWithdrawals` from the contract), once on mount and on the events
  that can change them, not on every Base block. The block ticker no longer
  runs on Last Man screens.
- **Contract parameters** (stake floor, payout split, round length) come
  from `GET /config` every five minutes, shared by the entry hook and the
  game page. The browser makes no contract read of its own for them.
- **Proxy allowlist** gains `config` and `players/0x…`; `chain-games` is
  gone.
- **Socket revision check**: the hub numbers its frames; a gap triggers one
  REST resync.
- **Bug fix**: a followed game is unfollowed when it settles or never
  existed, so the floating timer stops polling it on every page.
- **Winners list** shows `paidToWinner` from the service, the exact amount
  settle() sent that wallet.
- **Dashboard feed** builds its live chips from the index alone.
- **Gateway default** in `lib/wsapi-base.ts` is now `api.tsionark.com`; the
  old default host times out on every request.
- **Logging**: `[vault] …` lines in the console on every read, frame and
  settlement decision, on by default outside production and switchable on
  in production with `localStorage.setItem("wsws.vault.debug", "1")`.

## Failure states, reviewed after player reports of the page breaking

- **Arkade error boundary.** The Arkade routes sit outside the `(app)`
  group, so a render crash in a game fell through to the root boundary and
  replaced the whole page, shell included. `app/(session)/casino/error.tsx`
  now catches it below the shell, with "Try again" and a way out.
- **Service rows are checked before they are drawn.** The service records a
  winner or starter as `null` when a log did not carry it; rendered, that row
  crashed the page on `address.length`. Winners and activity rows now pass a
  shape check at the boundary and a malformed row is dropped with a warning,
  as the lobby's rows already were.
- **The game page says what went wrong.** With nothing to show, it used to
  sit on a pot skeleton and a "Loading…" button forever. It now shows one of
  two cards: "We couldn't load this round" with Try again, or "There's no
  round here" with a link back to the lobby. A game already on screen never
  goes through this; a failed refetch keeps it up under the existing
  "Connection lost" overlay.
- **The lobby keeps its list on a bad connection.** A failed refetch with
  games on screen used to swap the list for the error card on every failed
  poll. It now keeps the last list and says it is the last one it got.
- **Reads give up after fifteen seconds.** The vault client sets a request
  timeout, so a stuck poll on a poor connection fails and the next poll runs
  instead of the clock freezing with nothing said. Writes are never timed
  out by the client.
- **Socket handlers act on their own socket.** Found in the maintainer's
  test session on 2026-09-10, walking from the lobby to a game page: the
  lobby's unmount closed socket A while the page's mount opened socket B.
  A's late close event cleared the shared reference (B's) and scheduled a
  reconnect that opened C; when B opened, its handler sent the subscribe
  frame through the shared reference, C, still connecting, and the browser
  threw `InvalidStateError: Still in CONNECTING state`, leaving B open and
  abandoned beside C. Every handler now checks it still owns the shared
  reference, and a socket being replaced has its handlers detached before
  it is closed. Locked with a test that replays the exact sequence.
- **Socket reconnects back off** from two seconds to thirty, reset on a
  successful connection, and wait for the browser's `online` event while
  offline instead of retrying into nothing. REST polls carry the page in the
  meantime, as before.

## The balance card moves with the money

Seen in the maintainer's test session on 2026-09-10: the lobby said $0.55
half way through a round it had just paid $0.49 into. Nothing on the lobby
asked for a new balance after a start, the start sheet's resync only
touched the vault caches, and a plain refetch would have been answered from
the portfolio route's 75 second server cache anyway. The game page had the
same gap after a wager and a claim.

- **The amount is applied the moment the receipt lands.** A stake is the
  value the transaction sent and gas is sponsored, so the wallet knows the
  debit exactly. A payout is what the settlement row says was paid to the
  winner and the starter. A claim is the pending figure just claimed. The
  card moves at once, with no request at all.
- **One fresh read of Base confirms it.** The existing scoped fresh path,
  `fresh=base-mainnet`, re-reads Base alone through the server's ZeroDev
  RPC: one batched request carrying one `eth_getBalance` and one multicall.
  A native balance is a node read at "latest", not an indexed figure, so one
  read after the receipt is enough and there is no retry loop. The other 27
  networks are not read.
- **Round end reads nothing.** The pot reaches the wallet with the keeper's
  settlement a few seconds later. The credit waits for the socket's settle
  frame, or the winners row when the socket is down or the page opened
  after the round, and lands on the lobby as well as the game page. The
  plain portfolio refetches that used to run every 2.5 s for 30 s after a
  round are gone.
- **The paid figure is used as the service gives it.** For a wallet that
  opened the game and outlasted everyone, `paidToWinner` is already the
  winner's half plus the starter's tenth in one transfer (game 425 on
  2026-09-10: 0.0001006 + 0.0000201 = 0.0001207 ETH), so the shares are
  not added on top of it. Without a paid figure the shares are summed. A
  settlement older than two minutes is not credited; the poll had it.
- **A failed confirming read keeps the applied figure**; the regular poll
  corrects it later. The card says "Updating…" while the read is in flight.

RPC cost of a money moment: one Base read for the wallet that moved money,
none for spectators. Start and wager do not trigger a read on the game or
lobby pages beyond that one.

`features/casino/hooks/use-game-balance.ts` is the one place the screens
read and move the game balance, `use-payout-refresh.ts` credits a
settlement once per browser from either source, and
`lib/last-standing/settlements.ts` holds the payout maths (50% winner, 40%
platform, 10% starter). `lib/portfolio/apply-transfers.ts` gains
`applyNativeDelta` and the portfolio hook exposes it.

## RPC budget, one browser on a game page

| State       | Before                                      | After                  |
| ----------- | ------------------------------------------- | ---------------------- |
| Socket up   | 12/min plus 10 to 55 per mount or reconnect | 0, on mount and after  |
| Socket down | 25 to 50/min                                | 0/min, REST polls only |
| Round end   | 2 settle transactions                       | 1 (the keeper's)       |

## Scenarios

- Open the lobby with no game: one `GET /api/vault/games`, then socket
  snapshots every 10 s, no `/api/evm-rpc` traffic.
- Start a game: receipt, then `[vault] confirm N: seeded` within a second or
  two, the lobby and the game page show the round before the index lists it.
- Round ends with the keeper up: `[vault] round N settled { paidHere }`
  within about five seconds, no `tx settle` line.
- Round ends with the keeper down: `[vault] round N: keeper did not settle
within the grace, settling from the wallet` after 15 s, then
  `tx settle confirmed`.
- Block `ws.tsionark.com` in DevTools: `[vault] socket: closed`, then REST
  polls every 5 s (game) and 15 s (feeds), still no `/api/evm-rpc` traffic.
- Reload a page while following a settled game: `[vault] unfollow N`.
- Start or join a game: the balance card drops by the stake within a second
  of the receipt, says "Updating…" briefly, and one
  `GET /api/portfolio?…&fresh=base-mainnet` follows. Win one: the card rises
  by the paid amount when the settlement row lands, with one such read.

## Tests

`features/casino/lib/vault-game.test.ts`, `use-game-balance.test.tsx`,
`use-payout-refresh.test.tsx`, `lib/last-standing/settlements.test.ts`,
`lib/portfolio/apply-transfers.test.ts`, `hooks/use-portfolio.test.tsx`, `use-vault-lobby.test.tsx`,
`use-vault-game.test.ts`, `use-vault-socket.test.ts`,
`use-vault-params.test.tsx`, `lib/server/dashboard-feed.test.ts`.

## Follow-ups for the backend

- `GET /games?cursor=<anything>` returns 500 instead of 400.
- `GET /config`, `GET /players/:address`, `GET /games/:id/activities`,
  `GET /transactions/:hash` and `POST /transactions` are served but missing
  from the gateway's OpenAPI document.
- `GET /transactions/:hash` could replace the client's receipt polling for
  the four vault writes; a separate change.
