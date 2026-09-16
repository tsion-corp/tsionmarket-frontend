---
date: 2026-09-16
feature: The Trending strip stops dealing cards for coins the service sent nothing about
scope: fix
scenario-impact: none
---

# Three cards, a name apiece, and two dashes

After #509 the memecoin list loads again and the strip pages three across. The
three cards it dealt on production were `axIDEUS`, `vWIG` and
`mooBaseSwapWETH-BSX`, each showing its name over a dash for the price and a
dash for the change.

The cards were right. The rows were empty.

## What the service is sending

`/tokens/trending?limit=40` on production, read directly:

```
of 40 trending tokens:
  usable 24h change : 5
  no change at all  : 35
  no price at all   : 35
```

Thirty-five of forty rows carry neither a price nor a 24h change. They are
ranked in the response like any other row, so whichever three landed on top
became the strip's three cards.

This is not the `2.8e19` percent problem #509 addressed, and the guard added
there is not what emptied these cards: the values were never there to begin
with. Both are the same upstream feed in poor health, in two different ways.

## The change

The strip's heading promises the hottest coins over a window. A row with no
price and no change cannot be one of them, whatever position the service
returned it in.

`rankableHere` is `tradableHere` minus those rows. The strip falls through to
the next row that has something to show, so with the feed in this state it deals
the five real coins instead of three empty shells.

A row needs only one of the two figures to earn a card. A price with no change
is still a coin at a price, and the strip draws a dash in the change column;
that is also what a change refused by #509's guard now looks like, and the price
beside it is still real.

Only the strip uses this. `useTrendingMemes`, which feeds the memecoin grids and
the phone list, keeps `tradableHere`: a token with no price yet is a legitimate
entry in a directory, because a directory makes no claim about performance. The
screener's own list keeps `tradableHere` for the same reason.

## What this does not fix

The trade service returning thirty-five empty rows in a forty-row trending feed
is the actual defect, and it is not one the frontend can correct. This change
stops the app presenting those rows as hot coins. If the feed degrades far
enough that no row is rankable, the strip shows its own empty state rather than
a row of dashes.

## Verification

`./scripts/preflight.sh`: all five gates pass, 5,135 tests.

New: `lib/meme/trending-shown.test.ts` — a row with neither figure is dropped,
the service's ranking order is preserved among the rows that survive, a row with
only a price is kept, a row with only a change is kept, and the discovery view
still applies.
