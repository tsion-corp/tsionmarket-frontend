---
scenario-impact: updated
---

# Release Note: the memecoin board shows only coins that can be bought

## Summary

On the maintainers' instruction ("all these meme coins that can't be
bought, hide them"). Discovery (board, trending, search, dashboard brief)
now drops any row the trade service marks `buyEnabled: false`, any row whose
`status` is present and not `ACTIVE`, any row with less than $10,000 of
liquidity, and any row with less than $100 of trading volume in the last 24
hours. The last rule is the one that bites: 41 of the 104 rows the board
showed had six-figure liquidity figures and under a dollar of daily volume
(WKC: $369k and two cents), dead pools where a buy cannot fill. Rows with no
liquidity or volume figure (trending and search omit them) are kept.
Holdings are unaffected: the allowlist reads the catalog directly and the
sell sheet fetches a held token by address.

On the live catalog at the time of the change every rated Base row was
already ACTIVE and buyable; the liquidity floor removes two (AAG at $20,
KRAV at $7.7k) and the volume floor removes 57 more, leaving about 47 live
Base coins.

## What changed

- `lib/meme/catalog.ts`: `isBuyableHere`, `MIN_DISCOVERY_LIQUIDITY_USD`,
  applied at the discovery boundary.
- `lib/meme/types.ts`: optional `status` on `MemeToken`.
- Tests in `lib/meme/catalog.test.ts`.

## Verification

Red then green; full preflight; live catalog counts above.

## Scenario impact

`updated`: the Base board drops from ~104 rows to ~47 live ones; dead and
unbuyable rows can no longer appear.

## What the backend should do instead

The trade service knows all of this per row. It should mark dead pools
(24h volume near zero) as not `ACTIVE` / `buyEnabled: false` at the source,
so every client sees the same board; and it should keep `sellEnabled` true
for delisted tokens that still have holders, so people can convert them back
to USDC. The floors here are the frontend's stopgap until then.
