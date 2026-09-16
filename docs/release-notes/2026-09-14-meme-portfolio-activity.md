---
title: Memecoin positions, profit and loss, and activity from the trade service
date: 2026-09-14
area: memecoins, portfolio
adr: ADR-2026-09-14-memecoins-trade-contract
scenario-impact: updated
---

# Release Note: portfolio, P&L and activity (slice 5 of the trade contract)

The last of five slices bringing the memecoins feature onto the trade
service's frontend contract (`trade-llms.txt`). The service keeps a
moving-average ledger of every confirmed Base and Solana swap; `/portfolio`
now shows it, with honest blanks where the market cannot price a coin.

## What changed

- **A "Memecoins" section on `/portfolio`**, under the balance cards and promo
  strip, on the desk and the phone (one responsive section). A summary strip
  (current value, total P&L, total return, realised P&L, when it was
  calculated), then tabs Open · Closed · Activity · Base · Solana. Each list
  keeps the server's paging: 50 a page, "Load more" until `page * limit`
  covers the total, and "N of total" beside it.
- **Position rows** show the coin (initials when there is no logo), the
  remaining quantity, the average entry, the market value and its age, and the
  total P&L with its return. The rules the contract sets:
  - `currentPriceUsd: null` reads **"Valuation unavailable"**, never `$0` and
    never `-100%`; the realised P&L stays, marked "Realised only".
  - `balanceStatus: UNAVAILABLE` labels the quantity **"Ledger-derived"**.
  - `costBasisStatus: PARTIAL` carries a **"Partial cost basis"** badge and the
    reason: a transfer or trade outside the app has no known price.
  - The mark's age from `marketDataUpdatedAt`: "Price 5 min ago", **"Stale
    price · 16 min ago"** past fifteen minutes, **"No market data"** when null.
  - P&L is green or red by its sign, with an explicit `+` on a gain.
  - `marketValueComplete: false` puts **"Partial — some positions can't be
    priced"** on the aggregate value and total P&L.
  - The service's `valuationDisclaimer` is shown as fine print, and the value
    column is labelled "Market value", never proceeds.
- **Sell from a position** opens the memecoin trade sheet on SELL, on the
  position's own chain (`chainId: 101` for Solana, the mint as written), and
  the sheet previews the proceeds before any confirmation. The sheet is reached
  through the existing `onOpenMemeSell` → app modal host chain; the portfolio
  feature does not import the trade feature.
- **Activity tab** lists the service's `/activity` feed: side, amounts, USD
  size, platform fee (USD, or the USDC base units when the USD figure is
  null), a status chip, and "View transaction" only when the service holds a
  transaction hash. A pending swap says it is not in the holdings until
  confirmed. A position's own trades open under "Trades" from the detail route.
- **Refreshes**: each portfolio query re-reads every 60 s while the section is
  on screen and not at all off it; a swap reaching `CONFIRMED` invalidates all
  four at once. `delivered` and `pending` trades do not, because the service's
  ledger has not changed.
- **The Alchemy holdings path** (the topbar holdings sheet and the hidden
  holdings table) keeps showing memecoins the service does not know. A
  catalogue coin with no price is now "Valuation unavailable" instead of
  `$0.00` (the registry keeps the null price the catalogue sent). A held meme's
  Sell opens on the chain the holding lives on instead of Base for every coin.
  Coins the service has a position for leave the generic holdings table, so a
  coin is never listed twice at two values.
- **Decimal strings stay strings.** `lib/meme/decimal.ts` signs, rounds and
  groups the service's figures through `bigint` at 18 places (cents from a
  dollar up, four significant digits below, so a sub-cent memecoin price never
  collapses toward `$0`). No new dependency.
- The portfolio client (`lib/meme/portfolio.ts`) goes through the trade
  client's request, so its zod mappers load on demand, like every other trade
  route; the first-load guard test now covers it.

## Tests

- `lib/meme/decimal.test.ts`: `"32"` → `+32%`; `"-0.5"` keeps the minus;
  null → null; four significant digits below a dollar; figures past 2^53.
- `lib/meme/portfolio.test.ts`: routes, `limit` default 50 and capped at 100,
  bearer, `no-store`, a Solana mint as written, filters together, drift →
  `BAD_RESPONSE` with the request id, one key prefix for all four queries.
- `lib/meme/parse.portfolio.test.ts`: the four mappers; null valuation stays
  null; a number where a decimal string belongs fails.
- `lib/meme/api.first-load.test.ts`: `portfolio.ts` never statically imports
  the mappers, zod or the schemas.
- `lib/meme/chain.test.ts`, `lib/meme/format.test.ts`: network → chain id,
  explorer links, market-data age and the fifteen-minute stale line.
- `features/portfolio/hooks/use-meme-portfolio.test.tsx`: paging stops at the
  total; chain scoping; 60 s polling on screen, none off screen, none signed
  out; position detail; activity filters.
- `features/trade/hooks/use-meme-trade.test.tsx`: invalidation on `CONFIRMED`
  (Base and Solana), not on `delivered` or `pending`. The existing tests gained
  a query-client wrapper.
- `features/portfolio/components/meme-positions.test.tsx`: no `$0`/`-100%` on
  a null price; partial badge; sign and colour; ledger-derived; stale past 15
  minutes under fake timers; partial cost basis; disclaimer; a Solana
  position's Sell carries `chainId: 101`; tabs, Load more, error with retry;
  activity rows with null hashes not linked.
- `lib/server/buyable-registry.test.ts`, `lib/server/alchemy.test.ts`: a null
  catalogue price stays null in the registry and never leaks into a balance.
- `features/portfolio/lib/holdings.test.ts`,
  `features/portfolio/components/holdings-modal.test.tsx`: unpriced holdings
  read "Valuation unavailable", a held Solana meme sells on chain 101, and
  service-known memes leave the generic table.

## Still needed from the backend

- A `status=OPEN|CLOSED` filter on `/portfolio`. Without it the Open and Closed
  tabs filter the pages already loaded, so an Open tab can look short until
  "Load more" brings the next page.
- Confirm the rate limits on `/portfolio*` and `/activity` for a 60 s poll, and
  that `/activity` accepts `chain`, `side` and `status` together.

`scenario-impact: updated`: the portfolio scenario gains a Memecoins section
with P&L, and the meme sell scenario starts from a position on its own chain.
