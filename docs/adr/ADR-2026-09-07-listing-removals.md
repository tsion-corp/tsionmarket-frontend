# ADR-2026-09-07: Take DOGE, RON, MON, unrated and high-risk memecoins and tokenized shares off the buy surfaces

## Status

Accepted — 2026-09-07, on the maintainers' instruction (Desmond, John:
"remove those unrated and low rated meme coins", "remove this GOOGLE token",
"remove doge on spot", "remove Ron", "remove Monad") and the delegation of
the day's incidents.

## Context

Where each list comes from:

- **Spot.** `spotSymbolsFor()` in `lib/spot-markets.ts` composes the desk
  from Dextopus's live destinations (RON is Ronin's native coin, MON is
  Monad's) plus one same-chain swap route (DOGE as cbDOGE on Base, a
  frontend-only route in `lib/spot-swap.ts`). All three are frontend
  decisions.
- **Memecoins.** The board, trending and search pass through
  `isMemecoinHere()` in `lib/meme/catalog.ts`. The trade service's catalog
  carries `riskLevel` and `status`: on 2026-09-07, of 692 rows, 271 were
  `UNKNOWN`/`DISCOVERED` (unrated), 45 `HIGH`, 222 `CRITICAL`/`BLOCKED`, 75
  `LOW`, 79 `MEDIUM`. "GOOGLE" is `GOOGLc`, a tokenized share of Alphabet
  Inc.; `TSLAc` and `$BSLN` are its siblings, all minted under the issuer's
  `0xb2000000…` address prefix on Base. Its first buy failed.

The rule that binds every removal: taking a token off a buy list must not
hide a holding of it or its sell path (the team: "we need to find a way to
convert people's money in the stuff we are removing back to usdc").

## Decision

1. `SPOT_DELISTED = {DOGE, RON, MON}` applied in `spotSymbolsFor()`, the buy
   list only. Holdings of MON and RON stay visible (native coins on tracked
   chains) and sell through Dextopus as before; cbDOGE stays in the holdings
   allowlist and its swap route remains for selling.
2. Discovery keeps `riskLevel` `LOW` and `MEDIUM` only. `UNKNOWN` (unrated)
   and `HIGH` (the low band) are dropped; `CRITICAL` rows were already
   `BLOCKED` by the service. On today's catalog the Base board keeps 107 of
   366 rows.
3. Discovery drops tokenized equities: the `0xb2000000…` issuer prefix, or a
   name ending in a corporate suffix (Inc., Corp., Ltd., plc, AG, S.A.).
   GOOGLc, TSLAc and $BSLN match; "British American Oil Company" does not.
4. Holdings are untouched: the allowlist reads the catalog directly and the
   sell sheet fetches a held token by address, not through discovery.

### What only the backend can do

- Remove GOOGLc and the other tokenized shares from the trade catalog
  itself (`/v1/trade/tokens`), so they stop appearing anywhere, including
  search by address.
- Let holders sell out of delisted tokens: 493 of 692 rows are
  `sellEnabled: false` today and the sell sheet obeys that flag. This is the
  actual "convert their money back to USDC" work and it is a trade-service
  policy.

## Consequences

- Spot loses three rows; the memecoin board thins to rated, non-high-risk
  coins; tokenized shares vanish from discovery.
- Nothing already held disappears (see ADR-2026-09-07-holdings-allowlist-full-catalog
  for the separate holdings fix) and no sell path changes.
- The user-facing risk filter on the board keeps working within the
  narrower set.
- Scenario impact: `updated` on spot and the memecoin board.

## Verification plan

Red: spot composer keeps RON/MON/DOGE; discovery keeps UNKNOWN/HIGH rows and
GOOGLc. Six failing tests. Green: the denylist, the risk band, the equity
check. Preflight in full.
