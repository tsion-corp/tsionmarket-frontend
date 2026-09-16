---
date: 2026-09-16
feature: The memecoin list survives a hiccup, Try again works, and impossible price changes stop reaching the screen
scope: fix
scenario-impact: none
---

# Why the memecoin page went blank while the strip beside it looked fine

The report was "Memecoin markets are unavailable right now" on `/meme`, with the
Trending strip above it full of coins. The trade service was healthy at the time:
`trade/health` answered 200 on five of five probes at about 0.6 s, and the two
endpoints the page uses answered 200 on twelve of twelve through the production
proxy. Both payloads parsed cleanly against our own parser.

So the failure was ours. The asymmetry in the screenshot is the whole of it.

## The cause

The Trending strip seeds itself from `sessionStorage`. The catalogue never did.

```
use-meme-screener.ts   (the strip)   useSessionSeed x3
use-meme-tokens.ts     (the list)    none
```

`gcTime` is five minutes, so the list had no copy in memory either. That left
this sequence:

1. The trade service is slow rather than down. Measured through the production
   proxy: 0.59 s to 4.05 s, median about 2.5 s, which is exactly the status
   page's degraded threshold. Some of the tail requests fail.
2. Three failures open the client breaker for `trade` (`threshold: 3`).
3. While it is open the breaker throws `"Can't reach the server right now"`
   in process, without a request. `lib/query-client.ts` deliberately does not
   retry that message, which is correct on its own.
4. The catalogue now has an error, no data and no seed, so
   `blocked = failed && !rowsShowing` and the panel says the list is
   unavailable.
5. The strip renders its seed and looks healthy, including a change figure
   minutes old.

And "Try again" could not work. It called `refetch()`, which met the open
breaker and failed without reaching the network, while the cooldown doubled
toward two minutes. The button did nothing, repeatedly.

## What changed

**The catalogue keeps its first page.** Same mechanism the strip has used since
the screener shipped: `sessionStorage`, five-minute maximum age, handed to the
query as `initialData`. A tab that opens while the service is failing shows the
last good list rather than an empty panel. Only the first page is kept, because
that is what fills the visible rows and holding every loaded page would put
megabytes of token data in storage.

The write-back never re-writes a seed it just read. A seeded page carries the
`savedAt` it was stored under, so writing it back would reset its age and keep a
stale list alive indefinitely.

**Try again drops the cooldown first.** `MemeUnavailable` now calls
`retryCircuitNow()` before the caller's retry. That function already existed for
the global banner's "Try now"; the memecoin button simply was not wired to it.
Somebody pressing Try again is asking to probe now, which is what it means.

**Impossible price changes are refused at the boundary.** The service has been
sending 24h changes of up to `2.8e19` percent, which is how
`$100 -> $22,478,541,914,774,794` reached the strip. `toActivity` now reads a
change above `1e6` percent, or one that is not a finite number, as unavailable
for that window.

`1e6` percent is a ten-thousand-fold rise in the window. It sits far above any
honest memecoin run so that real moves are never discarded; past it the number
is not a market move but a division by a missing or near-zero baseline price
upstream. **The value is never replaced with an invented one** and the rest of
the window is untouched: volume, transactions and traders all still parse. This
is the mapping the pre-review checklist already requires at the boundary, not a
value we are papering over.

**The Trending strip pages three cards on the desk instead of four.** At four, a
card was narrow enough to cut a long change figure mid-number, which is how
`+2323839...` reached the screen. The phone keeps four, drawn two by two.

## What this does not fix

Two upstream bugs remain, and this change only stops them from rendering as
nonsense:

- `activity.24h.priceChangePercent` reaching `2.8e19`, seen on 果蝇 and ARGUS
- `tokens/trending` returning `USDC`, `WBTC`, `cbBTC` and `BTCB` in a memecoin
  feed

Neither is something the frontend can correct. A cache cannot make a wrong
number right, and holding the data longer would only keep a bad figure on screen
for longer.

## A note on caching

The suggestion from the backend side was to cache the memecoins rather than
re-fetch them. We already cache in four layers: a 60 s `staleTime`, the
screener's session cache, `pollUnlessFailing` on seven poll sites, and the
server-side backoff in `meme-positions.ts`. The problem was never fetch
frequency. It was that one surface had a fallback and the other did not.

## Verification

`./scripts/preflight.sh`: all five gates pass, 5,129 tests.

New tests:

- `features/trade/hooks/use-meme-catalog-session.test.tsx` — the first page
  survives into a fresh tab, a failing refresh does not take the rows away, and
  an empty store still starts empty.
- `features/trade/components/meme-unavailable.test.tsx` — the retry drops the
  cooldown so it can reach the network, and still retries when nothing is open.
- `lib/meme/parse.test.ts` — an impossible change is dropped while the rest of
  the window survives, a large but real move is kept, and ordinary and negative
  changes are untouched.

Updated: `meme-trending-strip.test.ts` and `app/(session)/(app)/meme/page.test.tsx`
now assert three desk cards. `use-meme-tokens.test.tsx` runs its paging cases
with storage switched off, since a seeded first page would otherwise satisfy
page 1 without asking for it.

## Follow-up worth doing

The catalogue's session helpers and the screener's are now two copies of the
same shape. They should be one module. Left out of this change deliberately:
refactoring a working file is not something to do in a fix branch.
