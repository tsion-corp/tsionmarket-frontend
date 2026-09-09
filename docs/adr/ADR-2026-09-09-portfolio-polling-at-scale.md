# ADR-2026-09-09: Portfolio and activity polling at 30,000 users

## Status

Proposed — 2026-09-09. Awaiting the maintainer's approval; built and tested
so the approval is made against working code.

## Context

The user base went from 20,000 to 30,000. The trade flow, the post-trade
refresh and the Last Man lobby were fixed this week (#421, #423, #425).
What remains is the steady cost of a signed-in tab doing nothing, which is
what scales with users. Measured from the code on 2026-09-09, per active
user per hour on one warm instance:

| read                     | how                                                                                                                                        | per hour         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| portfolio, hot networks  | Base, Ethereum, Arbitrum, Optimism, Polygon: one batch each; client polls every 60 s against a 75 s cache                                  | ~200 chain-RPC   |
| portfolio, cold networks | the other 23, one batch each every 10 min, whatever the wallet holds there                                                                 | ~138 chain-RPC   |
| activity bell            | 5 networks × 2 directions (+ internal on some) + Solana, polled every 5 min from every page against a 90 s cache, so every poll is a sweep | ~180 Alchemy API |
| Solana leg               | Portfolio API, up to 10 pages, on every uncached portfolio read                                                                            | ~48 Alchemy API  |
| prices                   | one batched call per 75 s                                                                                                                  | ~48 Alchemy API  |

About 600 provider calls per active user per hour. The audit of 2026-09-08
put the activity sweep at 77 calls; that was wrong, the sweep is limited to
the five networks in `RPC_HOST`, and this ADR uses the measured figure.

Two multipliers stay outside this change: every serverless instance keeps
its own caches, and the memory of which networks a wallet uses lives in
those caches and dies on a deploy. Both need a shared store, which is a
platform decision recorded as the next step.

## Decision

1. **Cold networks that answer empty back off.** In
   `lib/server/portfolio-holdings.ts`, a cold network whose last read held
   nothing is next read after 10 min as now, then 1 h, then 2 h, capped.
   Any balance resets it. A fresh read scoped to the network, or the
   "Refresh balance" button, which now asks for a fresh read of every
   network, bypasses the backoff. A first-ever transfer on a never-used
   chain can therefore take up to 2 h to appear unless the user refreshes;
   deposits are unaffected because they settle on Base, a hot network.
   ~138 becomes ~12 per hour.
2. **The portfolio poll follows the page.** `usePortfolio()` polls every
   60 s on `/portfolio` and `/dashboard`, where the numbers are the page,
   and every 3 min elsewhere, where only the balance chip reads them. A
   trade still gets its scoped fresh read at once. Hot-network cost roughly
   halves for a user who is trading or browsing rather than watching the
   balance.
3. **The activity sweep is served longer and asked less.** The server cache
   goes from 90 s to 5 min; the bell polls every 10 min instead of 5; the
   activity page every 2 min instead of 1. The sweep itself is unchanged: a
   previous attempt to narrow it by current balances lost history on chains
   the wallet had spent out, and the code says so. ~180 becomes ~90.
4. **The portfolio snapshot is prefetched for every session page**, from
   `app/(session)/(app)/layout.tsx`, not only the dashboard. The server
   cache dedupes it with the dashboard's own prefetch. Landing on `/spot`
   or `/meme` no longer pays a cold client fetch after the render.

After this change: about 260 provider calls per active user per hour, down
from about 600. The balance shown is unchanged in every case except a
first-ever transfer on a never-used chain, covered above.

```
tab open, off the portfolio page          tab open, on the portfolio page
  /api/portfolio every 3 min                /api/portfolio every 60 s
    hot networks: cached 75 s                 hot networks: cached 75 s
    cold networks: 10 min → 1 h → 2 h         cold networks: same backoff
  /api/activity every 10 min (bell)         /api/activity every 2 min (page)
    cached 5 min                              cached 5 min
```

## Next steps, not in this change

- A shared cache (Redis on the Vercel Marketplace) behind `cached()` and
  the holdings memory, so the cold cost is paid once platform-wide and a
  deploy does not re-sweep every wallet.
- Alchemy Address Activity webhooks marking a wallet's network dirty, so an
  idle wallet costs nothing and a transfer shows in seconds.

## Consequences

- Fewer than half the provider calls per active user, with no change to
  what a user sees except the cold-chain case named above.
- The "Refresh balance" button becomes the honest escape hatch: it reads
  every network fresh, which is also what it says it does.
- Verification: holdings backoff with fake timers; the page-aware poll with
  a mocked pathname; the activity cache window; the layout prefetch; the
  five gates; and a dashboard and a spot page left open on the dev server
  with the server log counting upstream reads.
