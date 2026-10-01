---
date: 2026-09-30
feature: Liquidity joins the memecoin table, and a token charts from its pool instead of a listing
scope: feature
scenario-impact: updated
---

# The third of the desk that had no chart

Two changes to the memecoin desk. One is a column. The other started as "the
TradingView search isn't finding these tokens" and turned out to be something
else entirely.

## Liquidity, as a column

`Asset · Price · Change · Mkt cap · Liquidity`, sortable from its own heading,
formatted like the other money columns — `$12.5K`, `<$0.01` for a pool too thin
to round, `—` when the service published nothing.

Nothing was fetched for it. `liquidityUsd` was already on every row, already
required in the Zod schema (unlike volume and market cap, which are optional),
and already parsed. `meme.colLiquidity` was already translated in all five
catalogues. The figure was arriving and being thrown away.

It reads last, beside market cap, because those are the two numbers that have to
be weighed against each other: a large cap over a thin pool is the shape of a
coin you cannot get out of.

Two things worth knowing:

**Sorting by liquidity used to add a temporary Liquidity column.** Now that the
column is permanent, liquidity had to join the set of metrics the table already
shows, or a liquidity sort would have printed the same figure twice, side by
side. There is a test on exactly that.

**The desk got 96px wider.** Its intrinsic minimum goes from 856px to 952px, so
`/meme` starts scrolling horizontally on a window 96px wider than before. That is
the column's cost and it is recorded next to the grid template.

The phone list is unchanged: it has no columns at all, only a 60px flex row, so
there was nothing for a column to join.

## The charts, and a premise that was wrong

The report was that some tokens show no chart, that every token is on
TradingView, and that we must be searching TradingView badly.

**Memecoin charts have never touched TradingView.** It has two call sites in the
whole repo — spot markets and the leverage desk. Memecoins chart through
CoinGecko, by a coin id resolved from the token's contract address.

Searching TradingView harder could not have fixed it either. TradingView indexes
`EXCHANGE:TICKER` for listed markets; a memecoin is identified here by chain id
plus contract, and `MemeToken.symbol` is nullable — for some rows there is no
ticker to search with. A token that only trades on a Base or Solana DEX has no
TradingView market to find.

### What the failure actually is, measured

Twenty live Base rows pulled from `/v1/trade/tokens` on 2026-09-30, each source
retried past its rate limit so a 429 was never mistaken for an absence:

| Source                                          | Resolved                                           |
| ----------------------------------------------- | -------------------------------------------------- |
| CoinGecko — today's source                      | **14 / 20** (6 answered 404)                       |
| Alchemy — the paid history behind the RWA chart | **same 6 fail** (400 on every one)                 |
| GeckoTerminal by `pairAddress`                  | **6 / 6 of those misses**, 168 hourly candles each |

So roughly **a third of this desk had no chart**, and it was never a search
problem: those tokens are not listed anywhere to be found.

The Alchemy row is the one that decided the design. It was the free win — a
premium key already in the repo, already charting RWA, keyed by chain and token
address, covering Base and Solana. It has the same blind spot. It answers a full
week for tokens CoinGecko lists and 400 for every token CoinGecko does not.
A listing-based source cannot chart an unlisted token, whoever sells it.

### Why a pool, and why it is affordable this time

`lib/server/token-history.ts` carries a note explaining why GeckoTerminal was
dropped as a price source before:

> "30 requests a minute shared across all users, and **two calls per chart
> because the pool had to be discovered first**. It rate-limited within a handful
> of opened modals."

That objection does not survive contact with this case. Every `MemeToken`
already carries `pairAddress` from the trade service, so the discovery hop is
already paid for. This is one call per chart, not two — and the six tokens above
were charted against those stored pool addresses directly, not against pools
this code went looking for.

The budget is still real and is now tighter than that note remembers: keyless
GeckoTerminal is roughly **ten calls a minute, shared by IP across every
reader**, with no rate-limit headers and a 429 after three bursts. What makes it
viable is that a chart series is identical for everyone who asks, so the route
now sets `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` and
the number that matters is cache misses rather than page views. That also
implements W4 of ADR-2026-09-08 for this handler, which had named `chart` and
never been done. The 502 branch carries the same directive, so a token with no
chart is not re-asked on every render.

If it throttles at scale, the upgrade is CoinGecko's paid onchain plan — same
data, same response shapes, a different base URL and a key header.

### The shape

`useChart` now takes a source rather than an id:

```ts
export type ChartSource =
  | { kind: "coingecko"; id: string }
  | { kind: "pool"; chain: string; pool: string; token: string; id?: string | null };
```

`memeChartSource(token, id)` picks between them — pure and synchronous, the same
shape as `spotChartSource`, deciding from what the caller already holds. The pool
wins when there is one, and carries the coin id along so the route can fall back
to the listing if the pool has nothing yet. `AssetChart` gained one optional
`source` prop; its toolbar, ranges and states are untouched, which is why the
chart looks identical.

One consequence worth naming: the chart no longer waits on the CoinGecko id
lookup. A token with a pool has a source on the first render, so it starts
drawing while that lookup is still in flight — and only a token with neither a
pool nor an id shows a spinner at all.

### When the stored pool is one the upstream has never seen

The trade service's `pairAddress` is right most of the time and wrong sometimes.
Sampling twelve rows from the live catalogue, eleven charted from the stored
pool and one did not: WETH names a pool GeckoTerminal returns 404 for, while the
upstream holds twenty other pools for that token, the largest with $161m in it.

So a 404 or an empty answer is no longer the end. The token is asked for its own
pools and the deepest is tried instead, which recovered WETH live — 168 candles
at $2,689.04, the right price, so the side of the pool was right too. Twelve of
twelve.

This is the discovery call the `token-history.ts` note warns about, and it only
runs on the path where the first attempt failed. Two tests hold that line: one
that it happens, one that it does NOT happen when the stored pool answered, so
the ordinary chart still costs one call.

### Three ways this could have been silently wrong

Each has a test, and each test was confirmed to fail against the mistake.

**The upstream returns newest-first.** Handed to the chart library as-is, that is
the series drawn backwards, or an exception — the library throws on out-of-order
timestamps rather than skipping them. The series is sorted here rather than
trusted.

**An area chart must draw the close.** Reading the open instead shifts the whole
line one interval into the past. It looks entirely plausible.

**A pool has two sides.** The desk's `pairAddress` may hold the token as the
quote rather than the base, and without naming the token in the request the
upstream charts the _other_ asset's price under this token's name. Every request
passes `token=`, which makes the side explicit whichever way round the pool is.

## Also fixed

`AssetChart` rendered "Chart unavailable" and "Loading chart…" as hardcoded
English while every surface around it translated its own states — so German,
Spanish, French and Portuguese readers saw English on precisely the failure path
this change is about. Both are now `common.chartUnavailable` and
`common.chartLoading`, in all five catalogues.

## Still to do

**Not every token is guaranteed a chart, and the gaps are known.** Of 100 live
Base rows every one carried a `pairAddress`; of 50 trending rows, four did not,
and a token with no pool falls back to a listing that may not exist either. A
pool minted minutes ago charts honestly but sparsely — two of the twelve sampled
had under a day of history, which is a short line rather than a full one. And
the keyless budget is roughly ten calls a minute shared by IP: a burst of cold,
uncached charts can be throttled, and a throttled chart is a blank one until the
cache fills.

**Nobody can yet say whether this worked in production.** There is no telemetry
on chart resolution — no event fires when a token resolves to nothing — so the
30% above is a measurement taken by hand against twenty rows, not a number the
product reports. Instrumenting the source decision would make the next claim
about coverage checkable rather than argued.

**`meme-pro-view.tsx` hardcodes the CoinGecko platform as `"base"`**, so a Solana
token would always miss. It is dead code — nothing in `app/` imports it — but it
should be fixed or deleted rather than left as a trap.

**Not checked in a browser.** The upstream calls were verified live and the
translation is unit-tested, but no one has watched a chart draw.
