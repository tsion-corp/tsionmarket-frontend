# ADR-2026-09-15 — The Last Man on the v5 vault, played in USDC

- **Status:** proposed, awaiting maintainer approval
- **Branch:** `feat/lastman-v5-usdc`, cut from `origin/staging`
- **Supersedes:** the v4 integration in `features/casino/**/last-standing`
- **Companion:** [ADR-2026-09-15-last-man-v5-usdc-for-dummies.md](./ADR-2026-09-15-last-man-v5-usdc-for-dummies.md)

## Context

The vault service moved to the King of Night v5 contract
(`0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0`). v5's product change is that the
player who starts a game chooses the asset. Everything else — the 60s timer, the
last-player-standing rule, the 50/10/40 split, permissionless settlement — is
unchanged.

This app still opens games on the retired v4 proxy, which is why The Last Man is
currently hidden on production (see `vault-v5-cutover-report.md`).

Two instructions from the maintainer shape this ADR:

1. **USDC only.** The game is played in USDC, not ETH.
2. **No funding step.** The player stakes straight from their USDC balance;
   there is no "add money" and no "withdraw".

Both follow from the platform's own position: a user's balance _is_ USDC on
Base, and gas is sponsored so they never hold ETH. The current flow contradicts
that — `fund-sheet.tsx` exists solely to convert the player's USDC into the ETH
the v4 game needed, and the withdraw sheet converts it back. v5 removes the
reason for both.

### What is verified

Read from Base mainnet and the live gateway on 2026-09-15.

| Fact                         | Value                                          |
| ---------------------------- | ---------------------------------------------- |
| v5 proxy                     | `0xc14e74724eC79977Abe9Cc1c0dfaD9E160bAD1e0`   |
| `/config` version            | `v5`                                           |
| USDC min start stake         | `100000` raw = **0.1 USDC**, 6 decimals        |
| `tokenConfig(USDC)` on chain | enabled, decimals 6, minStartStake 100000      |
| Split                        | winner 5000 / starter 1000 / treasury 4000 bps |
| Timer                        | 60s                                            |

### What is not yet working

`GET /games` returns zero rows for `active`, `settled` and `all`. Even v5's own
settled game 1 is absent; `GET /games/1` answers only because the service falls
through to the chain. v4's game history is gone from the API as well.

It is reported to the backend. Two consequences, and they are different:

- **The lobby** can be answered without the index, from the chain. Decision 7
  does exactly that.
- **Settlement** cannot. The keeper takes its due-list from that index, so a
  game started while it is empty is never settled automatically. `settle()` is
  permissionless, so the pot is recoverable, but not by itself.

So the chain fallback makes the game _playable_ on staging while the backend is
behind; it does not make it _safe to promote_. **This ADR proposes building and
merging to `staging` only. Promotion to `main` waits on `/games` populating and
a real USDC game settling on its own.**

## Decision

### 1. Contract and ABI

Point the vault at the v5 proxy through the existing
`NEXT_PUBLIC_VAULT_CONTRACT_ADDRESS`, set on the staging project only.

Add `lib/vault/king-of-night-v5-abi.ts`, generated from the backend repo's
artifact at `apps/world-street-vault/src/chain/king-of-night-v5-abi.json`. Not
hand-typed: the existing v4 file carries a warning that a transcribed event list
already cost us every `gameId` once, and v5's `games()` tuple gained two fields
in the middle (`decimals`, `token` at positions 4 and 5), so a v4-shaped decode
returns plausible nonsense rather than an error. We measured that: decoding v5's
game 1 with the v4 tuple reports a pot of 7.49 × 10²⁹ wei.

Keep the v4 ABI file. It is what reads settled v4 history if we ever need it,
and deleting it makes the diff harder to reason about.

### 2. USDC only, by policy, not by pretending ETH is gone

`/config` advertises ETH and USDC, both enabled. The asset picker offers **only
USDC**, and there is no picker UI: one asset needs no chooser.

We do _not_ filter ETH out of rendering. The contract's own guidance is that a
game already running in an asset still settles and pays out, so an ETH game in
the lobby renders with its own symbol and scale. We simply never start one.

This is a deliberate narrowing of a capability the contract offers. It is
reversible: the constant naming the asset is one export.

### 3. One atomic operation, through the existing sponsored batch

**Nothing here prompts the player.** Signing on this platform is headless: the
sponsored path builds a user operation and signs it through the Privy embedded
account (`lib/trade/sponsor.ts` → `bundlerClient.sendUserOperation`). There is
no wallet popup, no confirmation sheet, and there must never be one. A player
taps a button in our UI and the transaction happens. That is the product, and
it is why the asset is USDC and the gas is sponsored in the first place.

So the argument for batching is **not** "one signature instead of two" — there
were never any signatures to count.

v5 pulls the stake with `transferFrom`, so the vault needs an allowance first.
The migration guide ranks EIP-3009, then EIP-2612 permit, then approve-then-call.
Those rankings are about saving a user prompt, which is a problem we do not
have. What we do have is a **60-second timer**, and two _sequential_ operations
against it is the real risk: two bundler round trips, two confirmations, and a
window in between where the game can settle and leave the second call to revert
on an allowance that is already standing.

`useEvmSendBatch` sends several calls as **one atomic sponsored user
operation**, and its own comment names this exact case ("approve, then consume
the allowance"). So:

```
useEvmSendBatch([
  { to: USDC,  data: approve(vault, stake) },
  { to: vault, data: startGame(USDC, stake) },
], 8453)
```

One operation, one sponsorship, atomic: if `startGame` reverts the approval
goes down with it rather than leaving the vault able to pull later. No permit
plumbing and no 3009 nonce management, both of which exist to remove a prompt
we do not show. Joining a game batches the same way with `wager(gameId, amount)`.

We approve the exact stake rather than an unbounded allowance. The batch makes
the usual argument for infinite approval (saving a future transaction) worth
nothing here.

### 4. Amounts are 6-decimal, and come from the service

Every amount on screen comes from the service's `TokenAmount`: render `amount`,
which is already formatted at the game's own scale, and do arithmetic on `raw`
as `bigint`. `formatEther` and the hard-coded `1e18` divisions
(`last-standing-section.tsx:309`, `use-vault-game.ts:63`) are removed. A 20 USDC
pot must read `20.0`, not `0.00000000002`.

`usdValue` is native-only and returns 0 for a token game, so nothing branches on
it. A USDC figure is already a dollar figure; the game shows USDC and does not
ask the price service what a dollar is worth.

### 5. Funding and withdrawal are deleted from this surface

- `fund-sheet.tsx` goes. Its whole job was USDC → ETH.
- The withdraw sheet (`renderWithdrawSheet` / `SellSheet`) goes from the Last
  Man routes. Winnings arrive as USDC, which is the spendable balance already.
- The stake input validates against the **USDC portfolio balance** and the 0.1
  USDC floor from `/config`, and blocks before the wallet opens.

This deletes a conversion round-trip per game in each direction, which is the
single biggest simplification in this change.

### 6. Claiming takes an asset

`claim()` no longer exists; it is `claim(address token)`. The pending banner is
driven by `pendingByAsset` from `GET /players/:address`, and claims per entry.
For a USDC-only game that is one entry, but the list is rendered as a list so an
ETH payout owed from a v4-era win still claims.

### 7. A chain fallback, on the server, batched into one call

The service is the source of truth and is asked first. But `/games` is empty
today, and a lobby that shows nothing because an index is behind is a broken
game, so the chain answers when the service cannot. The maintainer's
instruction is explicit: fall back to RPC, and optimise hard against call
count.

Three rules make that affordable.

**It runs on the server, not in the browser.** A new route handler owns the
fallback, so one poll from one tab costs the platform one read, not one per
viewer. The browser keeps talking only to our own origin, as it does for every
other service.

**It is one batched call, not one per game.** Reads go through Multicall3
`aggregate3` over the existing read pool (`lib/server/evm-read`: ZeroDev first,
the Alchemy key pool as fallback), the same machinery the portfolio uses. The
shape is two round trips per refresh, regardless of how many games exist:

```
batch 1: nextGameId()                       // the id range
batch 2: getGameStatus(id) × the live window  // one aggregate3
```

`getGameStatus` returns `(active, token, decimals, pot, timeRemaining, king,
starter, minWager)` in one call per game, which is exactly a lobby row, and it
is decoded from the generated v5 ABI so the tuple cannot drift. The window is
bounded — the most recent N ids, never "every game ever played", which is the
cost the backend's own settlement notes call out as growing and never coming
back down.

**It is cached and shared.** The result goes through `lib/server/response-cache`
on a short TTL, so concurrent pollers and a reconnecting socket collapse onto
one read. A five-second window with a 60-second game timer is ample.

The fallback is a fallback: when `/games` returns rows, the chain is not read at
all. When it returns empty _and_ the chain shows live games, the response is
marked as chain-derived so the UI can say the index is catching up rather than
silently presenting a different source as the same thing.

The one read we do delete is the old `readGame()` in `use-vault-actions.ts`: a
browser-side `games()` decode against the v4 tuple, which on v5 returns
plausible nonsense rather than failing. It is replaced by the server fallback
above, not by nothing.

`pendingWithdrawals` polling is replaced by `GET /players/:address` in one
request, with the same server-side chain fallback available if that route is
also behind. Decoding `GameStarted` for our own `gameId` is replaced by
`POST /transactions`, with the receipt's own log as the fallback, since we have
the receipt in hand either way and it costs nothing extra.

### 8. Proxy allowlist

`lib/api/vault-proxy-paths.ts` gains `games/:id/activities` and a POST path for
`transactions`. Today `/^games\/\d+$/` rejects the activities route and the
proxy has no POST at all.

## Consequences

**Good.** One sponsored operation per action instead of a conversion, an
approval and a send. No ETH anywhere in the flow, which is what the platform promises. Amounts
that are correct at 6 decimals. Roughly 600 lines of funding UI deleted.

**Costs.** A second source of truth. The chain fallback means the lobby can be
served two ways, and the two can disagree while the index catches up — which is
why a chain-derived response says so rather than passing itself off as the
index. The alternative was a game that shows nothing whenever the backend is
behind, which today is always.

RPC spend is bounded by design: server-side, batched through Multicall3, cached,
windowed, and skipped entirely whenever the service answers. The worst case is
two round trips per cache window for the whole platform.

**Risk carried deliberately.** ETH games can still exist on v5 if someone starts
one outside our UI. We render them correctly and do not offer to start them.

**Scope.** `staging` only. `main` keeps The Last Man hidden until `/games`
populates and a real USDC game has been played end to end on the preview.

## Alternatives rejected

- **EIP-2612 permit / EIP-3009.** Both exist to collapse a user prompt into a
  signature. We show no prompt, so they buy nothing and cost a signing path and,
  for 2612, a sequential nonce that stops two games being started at once.
- **approve + startGame as two sequential operations.** Two bundler round trips
  and two sponsorships against a 60-second clock, with a window between them
  where the game can settle and the second call reverts on a standing
  allowance.
- **Offering ETH alongside USDC.** Contradicts the maintainer's instruction and
  the gas-abstraction position: a player would have to hold ETH to play.
- **Porting `readGame()` to the v5 tuple, in the browser.** The decode itself is
  fine once generated from the artifact; doing it per viewer is not. One tab
  polling a 60-second game is one RPC read every few seconds, multiplied by
  everyone watching. The server-side batched fallback gives the same answer for
  one read shared by all of them.
- **No fallback at all, waiting on the index.** Correct in principle, and what
  an earlier draft of this ADR proposed. Rejected on the maintainer's
  instruction: with the index empty, it means the game does not work.

## Plan

`docs/plans/2026-09-15-last-man-v5-usdc-plan.md`, written after approval.
