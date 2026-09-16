---
date: 2026-09-15
feature: The Base balance read stops asking for everything in one request
scope: portfolio
scenario-impact: none
---

# The Base balance read stops asking for everything in one request

## What was wrong

On staging the portfolio read $0.02 for a wallet holding 5.921098 USDC on Base.
Production, on the same wallet, read $5.95 and was right.

The cause is in this repo, not in a provider. `readHoldings` put every allowed
contract for a network into ONE Multicall3 request. That was fine while Base
listed about a hundred tokens. When the memecoin catalogue started paging, the
Base allowed set went from roughly 100 contracts to as many as 10,000 (500 a
page, up to 20 pages), the encoded body ran past a megabyte, and both read
providers refused it:

```
evm-read: ZeroDev answered 413 for chain 8453 (...); using Alchemy
readEvmPortfolioTokens: 1/28 networks failed [ 'Alchemy request failed: 413' ]
```

Base then dropped out of the sweep entirely. Every Base balance went with it,
including the USDC that the balance card counts as cash — which is why the
figure was not merely stale or slightly off, but missing the whole of someone's
money while presenting itself as a reading of it.

Production was untouched only because `main` still asks the catalogue for one
page of 100.

## The fix

Contracts are read in chunks of 400 per request. The first request still
carries the native balance, so a short allowed set is one call exactly as
before; a long one costs more round trips instead of one rejected body.

Two details that matter more than the chunking itself:

- **Each chunk decodes against its own slice, and rows are attributed by that
  slice's offset.** An index inside chunk three is not an index into the whole
  list, and reading it as one would put a real balance under another token's
  address.
- **If any chunk fails, the read throws.** Keeping the chunks that answered
  would report a number that is missing money and looks exactly like a correct
  one. Throwing hands the caller its stale snapshot, which the existing
  stale-serve path already handles.

Chunk requests for one network run at most four at a time. Thousands of
contracts is a couple of dozen requests, and firing them all at once is how a
read that no longer 413s starts being rate limited instead.

## What this does not fix

Reading up to 10,000 contract balances per wallet is a lot of work for one
number, and chunking makes it more requests rather than fewer. This restores
correctness; it does not make the read cheap. The intended end state is already
recorded in ADR-2026-09-14-memecoins-trade-contract, slice 5: the trade
service's own `/portfolio` becomes the source of truth for held memecoins, and
this path becomes the fallback for coins that arrived outside it.

## Tests

- `portfolio-holdings.test.ts`: a list longer than the chunk size is split
  across requests, no request exceeds the cap, and a balance held by the last
  contract in the overflow chunk is found and attributed to that contract. The
  test fails against the old single-request reader.
