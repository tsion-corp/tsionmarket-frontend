---
scenario-impact: updated
---

# Release Note: DOGE, RON and MON off spot; unrated, high-risk and tokenized-share rows off the memecoin board

## Summary

On the maintainers' instruction: `spotSymbolsFor()` drops DOGE, RON and MON
from the spot buy list; memecoin discovery (board, trending, search) keeps
only `LOW` and `MEDIUM` risk rows and drops tokenized equities (the
`0xb2000000…` issuer prefix or a corporate name suffix; GOOGLc, TSLAc,
$BSLN). Holdings and sell paths are untouched.

Decision record: `docs/adr/ADR-2026-09-07-listing-removals.md` (+ plain-English
companion).

## What changed

- `lib/spot-markets.ts`: `SPOT_DELISTED`.
- `lib/meme/catalog.ts`: `DISCOVERY_RISK`, `isTokenizedEquity`.
- Tests: `lib/spot-markets.test.ts` (new); `lib/meme/catalog.test.ts`;
  fixtures in the meme and dashboard-feed tests now carry the `riskLevel`
  the service documents as always present.

## Backend follow-ups (named, not done here)

- Remove GOOGLc, TSLAc, $BSLN from `/v1/trade/tokens`.
- Allow `sellEnabled` for delisted tokens with holders, so people can
  convert them back to USDC; 493 of 692 catalog rows are `sellEnabled:false`
  today and the sell sheet obeys it.

## Verification

Red then green (six cases); full preflight; live catalog counts in the ADR.

## Scenario impact

`updated`: three fewer spot rows; the memecoin board shows about 107 Base
coins instead of 366; no change to holdings or selling.
