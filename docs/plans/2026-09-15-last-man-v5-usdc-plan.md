# Plan — The Last Man on v5, played in USDC

Approved ADRs: [technical](../adr/ADR-2026-09-15-last-man-v5-usdc.md) ·
[plain](../adr/ADR-2026-09-15-last-man-v5-usdc-for-dummies.md).
Branch `feat/lastman-v5-usdc` off `origin/staging`. Target: `staging` only.

## Slices

Each slice is independently green: preflight passes at the end of every one.

### 1 — Foundations: the asset, the ABI, the arithmetic

- `lib/vault/king-of-night-v5-abi.ts`, generated from the backend artifact by
  script, never hand-typed.
- `lib/vault/contract.ts` gains the game asset: USDC on Base, 6 decimals, and
  the native sentinel for reading an ETH game we did not start.
- `features/casino/lib/last-standing/stake.ts` loses the ETH price entirely.
  A USDC amount _is_ a dollar amount, so `usdToWei(usd, ethPrice)` becomes
  `usdToUnits(usd)` — integer, no oracle, no rounding against a moving price.

**Tests:** base-unit conversion at 6 decimals including the fractional cent,
the floor clamp, and formatting. Red first against the ETH helpers.

### 2 — Reads: one server route, service first, chain second

- `app/api/vault/lobby/route.ts`: asks `GET /games`; when that returns no rows,
  reads the chain instead — `nextGameId()` then one Multicall3 `aggregate3` of
  `getGameStatus(id)` across a bounded window — through `lib/server/evm-read`
  and `lib/server/response-cache`.
- The response carries `source: "index" | "chain"` so the UI can say the index
  is catching up rather than presenting two sources as one.
- `lib/api/vault-proxy-paths.ts` gains `games/:id/activities` and POST
  `transactions`.

**Tests:** the service's rows win when present; an empty index falls through to
the chain; the chain path issues exactly two RPC round trips for N games;
a chain failure after an empty index is an honest error, not an empty lobby.

### 3 — Writes: one atomic sponsored operation per action

`use-vault-actions.ts`, on `useEvmSendBatch`:

| action | calls sent as one sponsored operation              |
| ------ | -------------------------------------------------- |
| start  | `approve(vault, stake)` + `startGame(USDC, stake)` |
| join   | `approve(vault, amount)` + `wager(gameId, amount)` |
| claim  | `claim(USDC)`                                      |

Exact-amount approvals, never unbounded. `readGame()` deleted; slice 2's route
replaces it.

**Tests:** the batch is two calls in that order with the exact stake; a start
below the floor is refused before anything is sent; claim carries the token.

### 4 — Money on screen at six decimals

Remove `formatEther` (`last-standing-section.tsx:309`) and the `1e18` division
(`use-vault-game.ts:63`). Amounts render from the service's `TokenAmount.amount`
and compute on `raw` as `bigint`. Nothing branches on `usdValue`, which is
native-only and zero for a token game.

**Tests:** a USDC game and an ETH game side by side, each at its own scale —
20 USDC reads `20.0`, not `0.00000000002`.

### 5 — The funding round-trip goes

- Delete `fund-sheet.tsx` and its entry point.
- Drop `renderWithdrawSheet` / `SellSheet` from both Last Man routes.
- The stake input validates against the USDC portfolio balance and the 0.1 USDC
  floor from `/config`, and blocks before the wallet opens.
- Pending winnings move from `pendingWei` to `pendingByAsset`, claimed per entry.

**Tests:** a stake over balance blocks with the reason; the claim banner clears
per asset.

### 6 — Locales, release note, ship

Five catalogues together. Release note under `docs/release-notes/`.

## Out of scope

Unhiding on production. That is gated on `/games` populating and a real USDC
game settling on its own, and is a separate revert of the hide PR.
