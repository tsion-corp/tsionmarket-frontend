---
scenario-impact: updated
---

# Release Note: memecoins sharing the 0xb2… address prefix are back on the board

## Summary

#403 hid tokenized shares from memecoin discovery partly by the
`0xb2000000…` address prefix the three known ones share. That prefix is a Base
launchpad's vanity pattern carried by 41 tokens, most of them ordinary
memecoins; Basecat, MOONBASE and BASEJUICE (ACTIVE, LOW risk) were hidden by
mistake. The rule now names the three tokenized shares by address and keeps
the corporate-name suffix; the prefix test is removed.

## What changed

- `lib/meme/catalog.ts`: `TOKENIZED_EQUITIES` by chain and address;
  `isTokenizedEquity` no longer tests the prefix.
- `lib/meme/catalog.test.ts`: BRIAN and BASEJUICE at 0xb2… addresses stay;
  GOOGLc, TSLAc, $BSLN and corporate names still go.

## Verification

Live catalog scan (766 rows) listing every 0xb2… token with its status; red
then green; full preflight.

## Scenario impact

`updated`: the Base memecoin board regains the wrongly hidden coins.
