---
date: 2026-09-15
feature: Bought memecoins show in the portfolio
scope: portfolio
scenario-impact: none
---

# Bought memecoins show in the portfolio

## What was wrong

Users on production reported that memecoins they had bought were not in their
portfolio. They were right, and the reason was structural rather than
intermittent.

A wallet's token balances are read from the chain, but only contracts on the
holdings allowlist are asked for and only allowlisted contracts survive
`normalize`. The memecoin half of that allowlist was built in
`lib/server/buyable-registry.ts` from a single page of the trade service's
public catalogue:

```
GET /tokens?page=1&limit=100     // then filtered to chainId === 8453
```

Measured against production on 2026-09-15:

|                                 |         |
| ------------------------------- | ------- |
| tokens in the catalogue         | 121,383 |
| returned by that page           | 100     |
| on Base, after the chain filter | 67      |

So the portfolio could recognise 67 memecoins. Every other coin a user bought
was read off the chain and then discarded as an unknown token, and no Solana
memecoin could ever appear, because the filter dropped every `chainId: 101`
row. Which coins survived also changed as the catalogue churned, which is why
a holding could be visible one week and gone the next.

Paging the catalogue to find the rest would be over 1,200 requests for an
answer the service already holds.

## What changed

The trade service's `/portfolio` is that answer: scoped server-side to the
identity the bearer names, built from confirmed swaps only, and independent of
discovery and trending, so a coin stays in it after it stops trending and after
the position is closed. It is already live on the production gateway.

`lib/server/meme-positions.ts` reads it as the caller and returns the user's
own coins as portfolio registries, which are folded into the shared ones for
that one read. One request, at most five pages, and never written back into
the shared cache.

The bearer reaches it from both paths that build a portfolio: the browser's
call through `app/api/portfolio`, and the Server Component prefetch, which
needed it too. The prefetch populates the same cache, so one built anonymously
would have handed the next authenticated read a memecoin-less answer for the
length of the cache window and made the fix look intermittent.

Prices and logos for those coins now come from the position row
(`currentPriceUsd`, `logoUrl`) rather than the catalogue page. A null price
stays absent rather than becoming zero.

## What this does not do

It makes the coins visible and valued. It does not add the cost basis, profit
and loss, or activity feed that the same contract exposes; that surface exists
on `staging` (#486, slice 5) and is a separate port.

## How it was verified

The production gateway was probed directly: `/portfolio`, `/portfolio/summary`
and `/activity` all answer `401 UNAUTHORIZED`, so the routes are live and the
gap was entirely on this side. The catalogue figures above are from the same
probe.

Red first: `lib/server/meme-positions.test.ts` covers the mapping, the bearer,
Solana positions, the no-bearer short circuit, an unpriced position, and an
upstream failure leaving the chain-read portfolio intact. Wiring tests cover
each remaining link: the route forwards the bearer, the prefetch reads as the
session, and `fetchPortfolio` asks the trade service only when it has one.

Full `./scripts/preflight.sh` clean.
