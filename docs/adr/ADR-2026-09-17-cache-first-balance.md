# ADR-2026-09-17: The wallet balance is cache-first and event-driven

## Status

Accepted on 2026-09-17. The maintainer asked for the balance to be served from the local cache and to stop making RPC calls "all the time until a successful transaction is done." Confirmed in conversation: refresh policy = transactions only (no background poll), incoming deposits auto-detected plus a manual refresh, scope = the spot/portfolio balance only (Kash and perps unchanged). Supersedes the polling cadence of ADR-2026-09-09-portfolio-polling-at-scale; keeps its refresh-scope ruling (ADR-2026-09-09-portfolio-refresh-scope).

## Context

- `usePortfolio` (`hooks/use-portfolio.ts`) held `staleTime: 60s` and a `refetchInterval` that re-read `/api/portfolio` every **60s** on balance pages (30s while a network was missing) and every **3min** elsewhere — from every balance chip on screen. Each tick is a real multicall/RPC round trip on the server, for a number that only changes when the user moves money.
- The balance is already **persisted to localStorage** (`lib/query-persist.ts` persists the `"portfolio"` key to `wsws.rq-cache.v1`, 24h) and **pre-hydrated from the server** (`lib/server/portfolio-snapshot.ts`). A returning user already paints a cached balance instantly — the polling was the only reason RPC kept firing behind it.
- Post-transaction refresh is already wired at ~30 sites via `usePortfolio().refetchFresh(scope)` / `refetchUntilChanged(scope)` (trades, withdrawals, casino/RWA/prediction funding, perps). These call `refetch()` explicitly, which ignores `staleTime`.

So the balance did not need a cache added; it needed the time-based refresh replaced with an event-driven one.

## Decision

1. **`usePortfolio` is cache-first.** `staleTime: Infinity` (a stored/rehydrated value is fresh, so mounting a chip never refetches), `refetchOnReconnect: false`, `refetchOnWindowFocus: false`. The steady `refetchInterval` is dropped.
2. **The one remaining background refetch is the incomplete-snapshot heal.** When a snapshot has `missing` networks (an optional chain timed out, leaving the total a floor) _and_ the current page is a balance page (`/portfolio`, `/dashboard`), it re-reads at 30s until the snapshot is whole, then stops. Off a balance page a partial snapshot waits for the next event, so a chip on a game page never becomes a cross-chain polling loop.
3. **Transactions refresh as before.** The ~30 `refetchFresh`/`refetchUntilChanged`/`applyReceipt` call sites are unchanged; explicit refetch bypasses `staleTime: Infinity`.
4. **Incoming deposits refresh on arrival.** A settled deposit is not an in-app transaction; it surfaces as an inbound stablecoin transfer in the activity feed. `useDepositBalanceRefresh` (`features/activity/hooks/`) reuses the deposit-watch detection (`lib/analytics/deposit-watch.ts`), and on a genuinely new arrival calls `refetchFresh([<arrival network>])`. It seeds silently on a device's first run (those arrivals are already in the shown balance) and persists its own remembered set (`wsws.balance.deposit-seen.v1`), separate from the analytics one. Mounted beside `useDepositAnalytics` in `DepositAnalytics`, which runs on the balance pages off the shared activity/bell poll (no new portfolio RPC).
5. **A manual refresh is the escape hatch.** The balance card carries a refresh control (`onRefresh` on `BalanceCardViewProps`, wired in `balance-card.tsx`) that does a fresh read scoped to the networks the wallet actually holds — never a sweep of every known chain.

## Consequences

- Steady-state portfolio RPC drops to zero: after first load, the number is re-read only on a transaction, a detected deposit, or a manual refresh. First load is unchanged (empty cache still fetches once; the server prefetch usually seeds it first).
- A balance change with no in-app transaction and no activity-feed arrival (rare — e.g. an on-chain action taken from another app) shows only after a manual refresh or the next transaction. This is the accepted trade-off of "transactions only."
- Deposit auto-refresh is bounded to the balance pages, where `DepositAnalytics` mounts and where the balance is shown; landing on the portfolio page after a deposit refreshes it, because the remembered set persists across sessions.
- Base-scoped consumers (`usePortfolio({ scope: "base" })` — the chess/arkjet game-balance chips) are a separate query key from the full portfolio and also stop polling. They refresh on their own funding actions, which call `refetchFresh(SCOPE)` at settle time, so the balance is read fresh at the moment it gates a stake (`use-game-balance.ts`, `arkjet-cashier.tsx`) — the chip is never stale for a money decision. Between actions it can lag a change made on a different scope (e.g. a spot trade) until the next casino action or a manual refresh, where before it polled at 3 min. This is the same "transactions only" trade-off applied to that chip.
- The **Kash+ balance** is brought onto the same model the same day, at the maintainer's request: persisted to localStorage (`"kash"` added to the persist allowlist), the 5-minute account poll removed, and `gcTime` raised to the persisted window so it restores reliably (`use-kash.ts`, `useKashAccount`). It refreshes on the user's Kash actions (`useInvalidateKash`, unchanged), on opening the card, and on returning to the tab — `refetchOnWindowFocus` is deliberately kept here, because Kash points settle to KSH **weekly on the server** with no in-app transaction, so the on-open / on-return read is what catches a settlement. Perps (refresh-on-focus) is unchanged and out of scope.
