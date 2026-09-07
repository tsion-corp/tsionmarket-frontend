---
scenario-impact: updated
---

# Release Note: GUN, xDAI, PLUME off spot; PENGU off Abstract; USDT0, USDC.e, USDzC treated as stablecoins

## Summary

Second batch of removals on the maintainers' instruction. GUN, xDAI and
PLUME join the spot denylist; PENGU is excluded on Abstract only (it stays
on Solana) through a route-level exclusion in the offerability rule; USDT0,
USDC.e and USDzC join the stablecoin set the spot desk already hides. Buy
lists only: holdings stay visible and sell as before.

Decision record: addendum in `docs/adr/ADR-2026-09-07-listing-removals.md`.

## Also

DEGEN, requested later the same afternoon: off the spot denylist and off
memecoin discovery by address on Base (it is LOW risk, so the rating rule
alone would keep it). Holdings unaffected.

## What changed

- `lib/spot-markets.ts`: `SPOT_DELISTED` gains GUN, XDAI, PLUME.
- `lib/buy.ts`: `EXCLUDED_ROUTES` with `2741:PENGU` in `isOfferable`.
- `lib/spot-chart.ts`: `SPOT_STABLES` gains USDT0, USDC.E, USDZC.
- Tests in `lib/spot-markets.test.ts` and `lib/buy.test.ts`.

## Verification

Red then green; full preflight; Dextopus destinations checked live for each
symbol's chains.

## Scenario impact

`updated`: fewer spot rows; nothing held disappears.
