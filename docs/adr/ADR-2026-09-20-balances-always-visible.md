---
date: 2026-09-20
status: proposed
supersedes: ADR-2026-09-17-cache-first-balance (in part)
---

# A balance is never allowed to be silently wrong

## Context

Users reported that their balances did not show. The screens looked healthy on
our own devices, which is what the defect needs to look like: every path below
fails for a subset of users and leaves the rest untouched.

ADR-2026-09-17 made the balance cache-first and event-driven: a stored value is
painted at once, treated as fresh forever (`staleTime: Infinity`), never
re-read on mount, focus or reconnect, and persisted to localStorage for 24
hours. That removed a poll that was costing real Alchemy calls for a number
that had not changed, and it was the right trade. What it did not survive is a
bad value: once a wrong or empty snapshot was in the cache, nothing replaced it
except an in-app transaction or the refresh icon.

Four paths produced a wrong value, in order of how much damage they do.

1. **A silent zero from a half-failed read.** `fetchPortfolio` runs the EVM leg
   and the Solana leg together and tolerates one failing. When the EVM leg
   failed, `missing` was never assigned, so the snapshot said it was complete
   while carrying none of the user's EVM money. The server cached it for 75
   seconds, the browser kept it forever, and the user watched their balance go
   to zero with no error anywhere.
2. **A rate-limited read is final.** A 429 is deliberately not retried, because
   retrying a throttled key makes it worse. With no refetch on mount, focus or
   reconnect, that single 429 was the end: no balance until the user found the
   refresh icon.
3. **A blocked localStorage took the page, not the cache.** The persister was
   built with `window.localStorage` read during render. Chrome and Edge throw a
   SecurityError on that property when the user blocks site data, and the throw
   happens in a provider above the whole app.
4. **No wallet reads as no money.** A signed-in session whose embedded wallet
   Privy has not yet returned reported `loading: false` and an empty token
   list, which the card renders as $0.00.

We now run our own Base node (`BASE_READ_RPC_URL`), and Base is where the
balance people mean lives, so a Base read is ours to make and no longer has to
be rationed against a third party's quota.

## Decision

A cached balance may be shown instantly, but it may never outlive its own
truth. Concretely:

- `fetchPortfolio` marks every EVM network as missing when the EVM leg fails,
  so a partial answer can never present itself as a complete one. The existing
  incomplete-snapshot TTL (5s server-side) then applies.
- The client keeps a stored balance fresh for `BALANCE_STALE_MS` (5 minutes)
  rather than forever, and re-reads on mount, focus and reconnect once past it.
  There is still no steady poll.
- A failed read retries every `ERROR_RETRY_MS` (20s), paused in a hidden tab,
  until a balance lands. This covers the 429 that is deliberately not retried
  in place.
- An incomplete snapshot heals anywhere when Base is the missing network, and
  on balance pages for any other chain.
- Storage access goes through `safeLocalStorage()`, which probes with a write
  and returns undefined when the browser refuses. A blocked browser loses the
  cache, not the page.
- A signed-in session with no wallet address yet reports `loading`, never zero.

## Consequences

- Cost: a balance older than five minutes is re-read when a screen mounts or
  the tab is focused. For Base that read goes to our own node.
- A user can no longer be left with a stale, empty or missing balance and no
  way back except a button they may not find.
- ADR-2026-09-17's polling removal stands; what changes is that "fresh forever"
  becomes "fresh for five minutes, and never fresh when the read failed".
