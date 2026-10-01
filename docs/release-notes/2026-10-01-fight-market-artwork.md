---
date: 2026-10-01
feature: Fight-market artwork and uncapped parimutuel tickets
scope: feature
scenario-impact: prediction markets
---

# Fight-market artwork and uncapped tickets

ARK Markets now opens with the supplied Matchday fight banner. Events with a
server-managed `trendingRank` also appear at the top of Trending, where only
their configured primary market is previewed. Selecting those odds opens the
same local Base USDC ticket used by the full ARK board, while “View all” keeps
the complete child-market list one click away.

The local prediction board now displays every active child market as an
independent betting row instead of hiding markets behind a selector. Each row
and selected ticket displays the market artwork, falling back to the event
image when a market does not provide its own image. The row tag identifies the
specific market, and its first and second outcomes use green and red odds
respectively. Selecting an odd opens a ticket scoped to that market and
outcome.

Dynamic parimutuel tickets no longer impose or advertise a product-level
maximum stake. Users may enter any amount at or above the market minimum,
subject to their available prediction balance and the service's ledger storage
limit.
