---
date: 2026-10-04
feature: Production ARK prediction markets
scope: fix
scenario-impact: prediction markets
---

# Production ARK prediction markets

First-party sportsbook requests now use the Rust `prediction` service instead
of inheriting the legacy prediction-market URL. This keeps production ARK
Markets on the production gateway even when the legacy market API has its own
override.

Ranked ARK events now contribute every active child market to a horizontal
Trending rail. Each market keeps its own artwork and Yes/No prices, and opens
the existing Base USDC ticket sidebar. The ARK Markets board also lists every
child market independently. The minimum stake remains 0.10 USDC while a new
ticket defaults to 10 USDC.
