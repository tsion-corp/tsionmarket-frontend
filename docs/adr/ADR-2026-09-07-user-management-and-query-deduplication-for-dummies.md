# ADR for Dummies: Unified User Management & Smart Query Deduplication

## What Problem Are We Solving?

1. **Too many repeated requests**: Right now, when a user navigates around the app, multiple components ask the server for the user's profile and wallet address at the exact same time. This leads to duplicate network calls and makes the app feel slower than it should be.
2. **Scattered `useEffect` code**: Different parts of the app use `useEffect` to fetch data or keep track of whether the user is logged in. This makes the code harder to maintain and sometimes causes endpoints to be recalled repeatedly.
3. **Random cache keys**: Different hooks type out query names like `["portfolio"]` or `["activity"]` manually. If someone types a slightly different key name, the cache doesn't share the data and an extra request is fired unnecessarily.

---

## How Are We Fixing It?

1. **One Unified `useUser()` Hook**:
   - Instead of every component calling Privy and figuring out the user's wallet address and profile on its own, they will now use a single `useUser()` hook.
   - It fetches and caches the user's profile, EVM address, Solana address, and delegation status in TanStack React Query.
   - When 5 components mount on the same page, only **one** network request is sent, and all 5 components share the exact same cached result immediately.

2. **Centralized Query Key Factory (`lib/query-keys.ts`)**:
   - We are introducing a single catalog of query keys (e.g. `queryKeys.user.me()`, `queryKeys.portfolio.byWallet(...)`).
   - This ensures that every component uses the exact same cache keys, so data is fetched once and reused everywhere.

3. **Smart Polling & Background Refresh**:
   - We prevent redundant endpoint recalls when users switch tabs or when components re-render.
   - Network calls will only happen when data is actually stale, saving user bandwidth and server load.

---

## Will This Affect Live Users?

**No negative impact.**

- It speeds up the app by eliminating redundant network calls.
- It reduces server load across our 20,000 live users.
- No user data, balances, or wallets are changed.
