# Plan: Last Man reads the vault service first (2026-09-10)

Implements ADR-2026-09-10-last-man-backend-reads. Branch
`feat/last-man-backend-reads`, worktree `.worktrees/last-man-backend`, off
`origin/main` at `f3d56656`. The Last Man code is identical on `ui/2.0`, so
the same squash applies to staging after main.

Every step lands with its test first (red), then the change (green). Steps
are ordered so the app runs after each one.

## 1. Service types and the REST client

`features/casino/lib/vault-api.ts`

- `VaultWinner` gains optional `toStarter`, `toTreasury`, `paidToWinner`
  (`TokenAmount`). `VaultActivity.gameId` becomes required.
- Remove `fetchChainGames`. Add `fetchGamesPage(cursor?)` only if the history
  modal needs paging (it does not today; skip).
- `fetchGame` throws a typed `VaultNotFound` on a 404 so callers can tell
  "never started" from "service down".

`features/casino/lib/vault-game.ts`

- `ChainGame` and `toChainGame` move here from `lib/vault/read.ts`
  (unchanged); `sortGameRows` keeps accepting both row shapes.

Tests: `vault-game.test.ts` (new) for `sortGameRows` with a captured
`activeGames` row in each shape; `vault-api` 404 mapping through the service
client mock.

## 2. Feeds without the chain

`features/casino/hooks/use-vault-feeds.ts`

- Delete the `settledOnChain` and `activityOnChain` queries and the merge
  step. Scope by `gameId` on the REST rows directly.
- `winnersLoading` becomes `winners.isPending`.
- Cadence unchanged: activities stale 5 s, winners stale 5 min, both poll at
  15 s only while the socket is down; `gameSettled` still invalidates.

`features/casino/components/last-standing/winners-list.tsx`

- Show `paidToWinner ?? toWinner`.

Delete `features/casino/lib/last-standing/merge-feeds.ts` and its test.
Delete `readSettledGames`, `readRecentActivity`, `readGameStatus`,
`ChainSettledGame`, `ChainActivity` and the log helpers from
`use-vault-actions.ts`.

Tests: red test that `useVaultFeeds` issues no `/api/evm-rpc` request on
mount (mock `publicClientForChain` and assert it is never called); winners
list renders `paidToWinner`.

## 3. Lobby without the chain route

`features/casino/hooks/use-vault-lobby.ts`

- Drop the `chain` query and `CHAIN_POLL_MS` / `CHAIN_RECONCILE_MS`.
- `mergeGames` becomes `priceChainRows`: REST rows win; a socket row in the
  contract shape that REST does not list yet is priced with the ETH price and
  shown. Both stay in the caches the socket already writes (`games`,
  `chainGames`); only the REST poll feeds `games` now.
- `seedGame(game: VaultGame)` writes one row into `games` and `game(id)`
  caches, for step 5.

Delete `app/api/vault/chain-games/route.ts` and its test,
`lib/server/vault-chain.ts`, `lib/vault/read.ts`. Keep
`VAULT_KEYS.chainGames` (the socket writes it); delete `chainSettled` and
`chainActivity`.

`lib/server/dashboard-feed.ts`: drop the `readActiveGamesWith` branch of
`liveSection`; the index list alone feeds the marquee. Update
`dashboard-feed.test.ts`.

Tests: `use-vault-lobby.test.tsx` pins: socket up, zero REST polls and zero
RPC; socket down, `/games` every 5 s and nothing else; a contract-shaped
socket row shows priced; a REST row for the same id replaces it.

## 4. Game page without the block ticker

`features/casino/hooks/use-vault-game.ts`

- Remove `useInvalidateOnBlock`.
- `queryFn`: `fetchGame`; on `VaultNotFound` rethrow; on any other error read
  `games(id)` from the contract once (existing `readGame`) and map it, so a
  service outage degrades to one RPC read per poll interval rather than a
  blank page.
- `confirmFromChain(id)` becomes `confirmGame(id)`: `fetchGame` with two
  retries one second apart (the service's chain fall-through), then one
  `readGame` as the last resort. Seeds `game(id)` and, through the lobby
  helper, `games`.
- When the followed game (`followedGameSnapshot()`) reads `settled: true` or
  throws `VaultNotFound`, call `unfollowGame()`.

`features/casino/components/last-standing/start-game-sheet.tsx` and
`mini-timer.tsx`: call `confirmGame`; no other change.

Tests: `use-vault-game.test.ts` red for the block poll (no
`getBlockNumber` while mounted), red for unfollow on settle, green after;
`confirmGame` retry order with a mocked service (404, 404, 200) and (network
error, chain read).

## 5. Keeper-first settlement and event-driven winnings

`features/casino/components/last-standing/last-standing-section.tsx`

- `KEEPER_GRACE_MS = 15_000`. The round-end re-check (`pollUntil`, 2.5 s)
  keeps running for the existing 30-second window. The auto-settle effect
  gains one condition: `Date.now() >= roundEndedAt + KEEPER_GRACE_MS`, and
  it stops as soon as `game.settled` is true. `onSettle` unchanged.
- Remove `BLOCK_WATCH_KEYS` and `useInvalidateOnBlock`. `refetchWinnings`
  is called when `game.settled` flips to true and `address` is the winner or
  the starter, and after own `settle` / `claim` (already there).
- The split query moves to the shared params hook (step 6).

`features/casino/hooks/use-vault-winnings.ts`

- `staleTime: Infinity`, `refetchOnWindowFocus: false`; the callers refetch
  on events. Read once on mount with a wallet.

Tests: a component-level test with fake timers: round ends, service reports
`settled` at 5 s, `settle` is never called; service still unsettled at 15 s
and the wallet is the winner, `settle` is called once. `pendingWithdrawals`
is read once on mount and once on a settlement naming the wallet, and not
on a timer.

## 6. One multicall for parameters

`features/casino/hooks/use-vault-params.ts` (new)

- `readVaultParams()`: one `multicall` for `minStartStake`, `winnerBps`,
  `starterBps`. Query `["vault","params"]`, `staleTime: 5 * 60_000`,
  `retry: 1`. Exposes `{ floorWei, split, floorFailed }`.
- `use-default-entry.ts` reads the floor from it; the section reads the
  split from it. `readSplitBps` and `readMinStartStake` are deleted.

Tests: one `multicall` call serves both hooks mounted together; a failed
read leaves `floorFailed` true and the split at `DEFAULT_SPLIT_BPS`.

## 7. Socket revision check

`features/casino/hooks/use-vault-socket.ts`

- Track `lastRevision` per topic from `subscribed.data.versions` and each
  frame's `revision`. A frame whose revision is greater than `last + 1`
  invalidates `VAULT_KEYS.all` once and resets the counter. Missing
  `revision` (older hub) is ignored.

Tests: `use-vault-socket.test.ts` with the captured `subscribed` and
`activeGames` frames from 2026-09-10; a gap triggers exactly one
invalidation; a contiguous sequence triggers none.

## 8. Proxy route

`app/api/vault/[...path]/route.ts`: unchanged allowlist. Forward `limit`
and `cursor` as today. No change expected; the route test gains a case that
`chain-games` now 404s.

## 9. Verify

- `./scripts/preflight.sh` green.
- Dev server, game page open, Network tab filtered to `/api/evm-rpc`: zero
  requests over five minutes with the socket up; zero with the socket
  blocked (block `ws.tsionark.com` in DevTools), REST polls visible.
- One live round on Base with two wallets: start, one wager, clock out.
  Confirm: the game appears in the lobby within 2 s of the receipt; the
  keeper's settlement ends the reveal with no client transaction; winners
  and activity rows arrive from the service; the followed timer stops after
  settlement. Capture the socket frames and add them to the release note.

## 10. Document and deliver

- `docs/release-notes/2026-09-10-last-man-backend-reads.md`, scenario
  impact: `updated`.
- Update `docs/last-man-backend-report.md` with a dated section closing
  items 3, 5, 6 and 7 from the frontend's side, and the two remaining asks
  (`/config`, `?cursor` 500).
- PR against `main` with the template; after merge, `git merge` main into
  staging as done on 2026-09-09 (squash does not carry ancestry).

## Files touched

Delete: `lib/vault/read.ts`, `lib/server/vault-chain.ts`,
`app/api/vault/chain-games/route.ts` (+test),
`features/casino/lib/last-standing/merge-feeds.ts` (+test).

Change: `features/casino/lib/vault-api.ts`, `vault-game.ts`,
`last-standing/keys.ts`, `hooks/use-vault-lobby.ts` (+test),
`use-vault-game.ts` (+test), `use-vault-feeds.ts`, `use-vault-socket.ts`
(+test), `use-vault-actions.ts`, `use-vault-winnings.ts`,
`use-default-entry.ts`, `components/last-standing/last-standing-section.tsx`,
`winners-list.tsx`, `start-game-sheet.tsx`, `mini-timer.tsx`,
`lib/server/dashboard-feed.ts` (+test), `app/api/vault/[...path]/route.test.ts`.

New: `features/casino/hooks/use-vault-params.ts` (+test),
`features/casino/lib/vault-game.test.ts`.

Not touched: writes (`startGame`, `wager`, `settle`, `claim`), the gasless
send path, receipts, the ABI, the countdown clock, sounds, layout.
