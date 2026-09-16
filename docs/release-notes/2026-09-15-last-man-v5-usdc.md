---
date: 2026-09-15
feature: The Last Man moves to the v5 vault and is played in USDC
scope: casino
scenario-impact: none
---

# The Last Man moves to the v5 vault and is played in USDC

Staging only. Production keeps the game hidden until the backend's keeper is
confirmed settling v5 games on its own.

## What changed for a player

The game is played in **USDC**, the balance they already hold, at a **0.1 USDC**
floor and a $0.38 default entry.

"Add money" and "Withdraw" are gone from both Last Man screens. They existed to
convert the player's USDC into the ETH a v4 game needed, and back again: two
conversions, two waits, two chances to fail, for a game they wanted to play in
the dollars they already had. Winnings now land back on the same balance.

Starting or joining is one tap. Nothing prompts: signing stays headless.

## What changed underneath

**Contract.** `NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS` points at the v5 proxy
`0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0` on staging.
`lib/vault/king-of-night-v5-abi.ts` is generated from the backend's artifact by
`scripts/generate-vault-v5-abi.mjs`, never hand-typed: v5's `games()` tuple
gained `decimals` and `token` at positions 4 and 5, so a v4-shaped decode does
not fail, it reports a pot of 7.49e29. TypeScript caught exactly that when the
old `readGame()` was pointed at the new ABI; that read is deleted rather than
re-indexed, because `GET /games/:id` already falls through to the chain
service-side.

**One atomic operation per action.** v5 pulls an ERC-20 stake with
`transferFrom`, so each action needs an allowance first. Both calls go out as a
single sponsored user operation through the existing `useEvmSendBatch`:

| action | one operation                                      |
| ------ | -------------------------------------------------- |
| start  | `approve(vault, stake)` + `startGame(USDC, stake)` |
| join   | `approve(vault, amount)` + `wager(gameId, amount)` |
| claim  | `claim(USDC)`                                      |

Exact-amount approvals, never unbounded. The reason to batch is not a saved
prompt — there are none — it is the 60-second timer: sent in sequence, the game
can settle between the two and the second call reverts on an allowance that is
already standing.

**Claiming takes an asset.** `claim()` does not exist on v5; the selector is
absent from the deployed bytecode. The pending banner is driven by
`pendingByAsset` from `GET /players/:address` and claims per entry, because a
wallet can be owed in more than one asset.

**Reads ask the service first.** `app/api/vault/lobby` asks `GET /games` and
reads the chain only when the service is unreachable — not when it answers with
an empty lobby, which is the normal state between games and would otherwise cost
an RPC round trip on every poll for ever. The fallback runs on the server so
every viewer shares one answer, and is two RPC round trips regardless of how
many games exist: `nextGameId()`, then one Multicall3 `aggregate3` over a
bounded window. `POST /transactions` hands the service each hash so it indexes a
new game immediately rather than when its own poll reaches that block.

## Money on screen

Every amount is priced by **asset**, not by one price
(`lib/last-standing/pricing`). This is where the bugs were, and they were not
subtle:

| surface           | was               | cause                                         |
| ----------------- | ----------------- | --------------------------------------------- |
| pot, cost to play | $925.68 for $0.38 | multiplied by the ETH price                   |
| lobby row         | $0.00             | 6-decimal amount read at 18                   |
| Hall of Winners   | $0.00             | read `usdValue`, native-only                  |
| win banner        | $0.23 for $0.46   | read `toWinner`, and a stale pot snapshot     |
| Add liquidity     | sent 0n           | converted through an ETH price that is 0 here |

Two rules now hold everywhere: `usdValue` is never read (the service sets it for
native games only), and a payout is `paidToWinner`, not `toWinner` — when one
wallet opens and wins a game the contract pays both shares to it in one
`settle()`. The activity feed follows the same rule for a self-started win, so
one payout no longer reads as two different numbers on one screen.

## How it was verified

Red-first tests throughout: the USDC base-unit arithmetic, the chain lobby
reader (including that it issues exactly two RPC round trips for N games), the
lobby route's service-first order, the call builders decoded back from their
calldata, the pricing helper against both the $925.68 and the $0.00 shapes, and
the self-started win rule.

Exercised end to end on a local build against the live v5 contract: four games
started, joined, expired and settled, with the payout figures checked against
`GET /game/winners` (game 3 `paidToWinner` 0.456, game 4 0.228).

Full `./scripts/preflight.sh` clean: 4,609 tests.

## Not in this change

Unhiding on production. That is a revert of the hide PR, and it waits on a v5
game settling on its own.
