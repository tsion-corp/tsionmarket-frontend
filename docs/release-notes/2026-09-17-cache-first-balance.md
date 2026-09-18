---
date: 2026-09-17
feature: The wallet balance is cache-first — no more constant RPC polling
scope: feat
scenario-impact: none
---

# Wallet balance stops polling; refreshes on events instead

The spot/portfolio balance used to re-read `/api/portfolio` on a timer — every ~60s on `/portfolio` and `/dashboard`, every ~3min elsewhere — from every balance chip on screen. It now serves the value already cached on the device and only re-reads when the balance can actually have changed.

## What changed

- **`hooks/use-portfolio.ts` is cache-first.** `staleTime: Infinity`, no background `refetchInterval`, `refetchOnReconnect: false`. A stored/rehydrated balance is treated as fresh, so mounting a balance chip no longer triggers a fetch.
- **The only background refetch left** heals an _incomplete_ snapshot (a network timed out, leaving the total a floor) on a balance page at 30s until it is whole, then stops. Off a balance page, a partial snapshot waits for the next event.
- **Transactions still refresh instantly.** The ~30 existing `refetchFresh` / `refetchUntilChanged` call sites are unchanged — explicit refetches ignore `staleTime`.
- **Deposits refresh on arrival.** New `useDepositBalanceRefresh` (mounted beside the deposit analytics in `DepositAnalytics`) watches the activity feed and re-reads the arrival's network when a genuinely new deposit lands. It seeds silently on a device's first run and remembers arrivals in `wsws.balance.deposit-seen.v1`.
- **Manual refresh.** The balance card (desktop + mobile) now has a refresh button; it does a fresh read scoped to the networks the wallet holds. New `balance.refresh` string in all five locales.

## Why

The balance was already persisted to `localStorage` (`wsws.rq-cache.v1`) and pre-hydrated from the server; the minute poll was the only reason RPC kept firing behind a value that had not changed. Supersedes the polling cadence of ADR-2026-09-09-portfolio-polling-at-scale (see ADR-2026-09-17-cache-first-balance).

## Kash+ balance too

The Kash+ balance now follows the same model: `"kash"` added to the persist allowlist (so it caches to `wsws.rq-cache.v1`), the 5-minute account poll removed, and `gcTime` raised to the persisted window (`use-kash.ts`). It refreshes on Kash actions (`useInvalidateKash`), on opening the card, and on returning to the tab — `refetchOnWindowFocus` is kept for Kash because points settle to KSH weekly on the server, so the on-open / on-return read is what catches a settlement.

## Scope / not included

Perps (refresh-on-focus) is unchanged.

## Trade-off

A balance change with no in-app transaction and no activity-feed arrival (e.g. an on-chain action taken from a different app entirely) shows after a manual refresh or the next transaction.
