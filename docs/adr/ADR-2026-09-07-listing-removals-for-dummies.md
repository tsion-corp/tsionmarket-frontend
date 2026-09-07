# ADR-2026-09-07: The listing removals the team asked for (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-07, on the maintainers' instruction.

---

## What Is This Document?

The plain-English companion to
[`ADR-2026-09-07-listing-removals.md`](ADR-2026-09-07-listing-removals.md).

## What Was Asked

Take DOGE, RON and Monad off spot; take unrated and low-rated memecoins and
the "GOOGLE" token off the memecoin board.

## What We Did

- Spot no longer offers DOGE, RON or MON to buy.
- The memecoin board, trending and search show only coins the trade service
  has rated low or medium risk. Unrated coins and high-risk coins are gone;
  critical ones were already blocked.
- Tokenized shares (GOOGLc is Alphabet stock, not a memecoin; TSLAc and
  $BSLN are the same kind) are gone from discovery.

## What Did Not Change, On Purpose

Anyone who already holds one of these still sees it in their portfolio and
can press sell exactly as before. Removing a coin from the shop must never
make someone's money invisible.

## What Only The Backend Can Do

- Delete GOOGLc and its siblings from the trade catalog itself.
- Allow selling out of delisted coins: today the trade service marks most
  delisted and unrated coins "cannot sell", and the sell button obeys. That
  is the real "convert their money back to USDC" work.
