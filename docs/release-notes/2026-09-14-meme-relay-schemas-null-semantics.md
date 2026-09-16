---
title: Every memecoin trade route is validated, and a missing figure is never a zero
date: 2026-09-14
area: memecoins
adr: ADR-2026-09-14-memecoins-trade-contract
scenario-impact: updated
---

# Release Note: relay schemas and null semantics (slice 2 of the trade contract)

The second of five slices bringing the memecoins feature onto the trade
service's frontend contract (`trade-llms.txt`). This one makes every payload
the app relays a checked shape, and makes "the service published no figure"
look different from "the figure is zero".

## What changed

- **Zod on every forwarded trade route.** `lib/api/schemas/trade.ts` now has a
  schema for the token list, trending, search, token detail and its `market`,
  `risk` and `tradability` reads, both previews, both quotes, `/swaps` (with
  `meta`), `/swaps/{id}`, `/swaps/{id}/status`, both submission routes, wallet
  challenge and verify on both chains, and, ahead of slice 5, `/portfolio`,
  `/portfolio/summary`, `/portfolio/{chain}/{address}` and `/activity`.
  `riskLevel` is the contract's five-value enum, `warnings` is
  `{ code, message }[]`, a token's `status` is `ACTIVE | BLOCKED | DISCOVERED`,
  and every list carries `meta { page, limit, total }`. The list and search
  schemas keep the risk block optional because the live search route omits it.
- **Path templates, not literals.** The relay picks a schema by route template
  (`swaps/:id/status`, `tokens/:address/risk`, `portfolio/:chain/:address`), so
  a route with an id in it is validated instead of passing through. A literal
  route always wins over a template (`tokens/trending` is never a token called
  "trending").
- **The client parses; it no longer casts.** `request<T>` in `lib/meme/api.ts`
  runs every envelope through a mapper in the new `lib/meme/parse.ts`, against
  the same schemas. A body that does not match is a `BAD_RESPONSE`
  `TradeApiError` carrying the relay's request id. Swap, wallet and risk types
  moved to `lib/meme/types.ts`; fields no code reads (`liquidityAvailable`,
  `approvalRequired`, `executionMode`, `quoteId`, a call's `type`) are optional
  rather than asserted.
- **A null change is neutral, not green.** `changeDirection` and `chartUp` in
  the new `lib/meme/format.ts` replace the four `Number(x ?? "0") >= 0` sites
  (the desk chart, the phone board chart, and the pro view's two charts).
  `PriceChart`/`AssetChart` accept `up={null}` and draw a neutral line.
- **"Hot" puts unpublished volume last** on the phone Memecoins tab instead of
  ranking it as `$0`.
- **A real zero is `$0`.** `compactUsd` (now in `lib/meme/format.ts`, still
  exported from `lib/meme/api.ts`) renders `"0"` as `$0`; only a null or
  unreadable figure is `—`. The metrics panels on the phone board and the Market
  tab therefore show a published zero liquidity as `$0` and a missing one as
  "Unavailable".
- **Unknown liquidity is said out loud.** A token whose `liquidityUsd` is null
  shows a neutral line beside its warnings on the trade sheet and in the pro
  view's detail card.
- **502 vs 404 on the token detail read.** `useMemeToken` retries a 502
  (`PROVIDER_ERROR`, or a failure that never reached the service) four times at
  1 s, 2 s, 4 s and 8 s, and never retries a 404. The sheet says "temporarily
  unavailable" or "not found" and keeps the listed row. Neither is stored as a
  missing token: a failed query holds no data, and the relay's two-second
  public cache now stores successful reads only (before, it cached a 502, so the
  first retry was served the same failure).

## Copy

`meme.liquidityUnknown`, `meme.detailUnavailable`, `meme.detailNotFound`, in
en, de, es, fr and pt:

- "Liquidity unknown — the quote decides whether this trade can execute."
- "This token's details are temporarily unavailable. Trying again shortly."
- "This token wasn't found on its network."

## Tests

- `lib/api/schemas/trade.test.ts`: every forwarded route has a schema that
  accepts its sample (live 2026-09-14 captures for the public routes) and
  rejects a malformed body; template matching (`swaps/abc/status`, literals
  over templates); live search shape without a risk block passes; a list
  without `meta` fails; risk enum, warning shape, status union; detail requires
  the risk block; quote requires calls and expiry; portfolio nulls.
- `app/api/trade/[...path]/route.test.ts`: status and risk reads validated by
  template (drift is a 502 `BAD_RESPONSE`); a 502 and a 404 are not cached; a
  success still is.
- `lib/meme/parse.test.ts` (new): each mapper; search defaults; null stays
  null and an absent market field reads as null; unknown fields dropped;
  shape errors name the field.
- `lib/meme/api.test.ts`: a drifted body becomes `BAD_RESPONSE` with the
  request id; a detail read without a risk level is rejected.
- `lib/meme/format.test.ts` (new): `changeDirection(null) === null`;
  `compactUsd("0") === "$0"`; only null/unreadable is `—`.
- `features/trade/hooks/use-meme-tokens.test.tsx` (new, fake timers): four
  retries on 502 at 1/2/4/8 s then "temporary"; recovery on a later success; no
  retry on 404 and "not-found"; no data stored for a failure; the last good
  token kept through a later 502.
- `features/trade/components/memecoins-view.test.tsx` (new): Hot sort with a
  null volume last; `$0` vs `—` in the volume cell.
- `components/ui/price-chart.test.tsx` (new): neutral colour for `up={null}`.
- `features/trade/components/meme-board-chart.test.tsx` (new): a null change
  hands the chart `up={null}`.
- `features/trade/components/meme-trade-sheet.test.tsx`: the liquidity-unknown
  line for null (not for `"0"`); the temporary and not-found lines.
- `features/trade/components/meme-board.test.tsx`: rewritten to the contract.
  It pinned a published `"0"` liquidity as "Unavailable"; it now expects `$0`,
  with a second case keeping null as "Unavailable".
- `lib/meme/api.chain.test.ts`: the preview and tradability doubles were
  `{}`-shaped and are now contract-shaped, since the client parses them.

## Still needed from the backend

- The authenticated shapes (previews, quotes, swaps, submissions, wallet
  verify, portfolio, activity) answer 401 without a bearer, so their schemas
  follow the contract and the fields this client already reads, not a live
  capture. A drift there now shows as a 502 with a request id rather than a
  crash; the first one seen in staging should be compared against these
  schemas.
- The preview's platform fee **token and recipient** field names: the
  contract lists them, the response this client has seen carries only the
  amount. They are not pinned.
- A documented response for `wallets/verify` (only "an object" is pinned).
- Whether `QUOTED` is still a swap status (the contract's lifecycle omits it;
  the schema still accepts it).
- The live search route omitting the risk block: the schema stays optional
  either way.

`scenario-impact: updated`: the memecoin discovery and trade scenarios now
show neutral charts for an unpublished change, `$0` for a published zero, an
unknown-liquidity line, and temporary/not-found states on the token read.

## First-load weight

The response mappers validate through zod, and importing them statically put
zod and every route schema into the first-load payload of `/meme` and `/spot`
(1648 → 1714 kB against a 1650 kB budget; CI failed). The browser client now
names each route's mapper and loads `lib/meme/parse.ts` when a trade request
runs, and `TradeShapeError` lives in its own zod-free module. Measured on a
production build: `/meme` 1649 kB, `/spot` 1646 kB. Pinned by
`lib/meme/api.first-load.test.ts`, which failed against the static import.
