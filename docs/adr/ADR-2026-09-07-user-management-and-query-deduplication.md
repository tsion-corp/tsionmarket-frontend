# ADR-2026-09-07: User Management Architecture & TanStack React Query Deduplication

## Status

Proposed — 2026-09-07. Awaiting human maintainer review and approval.

---

## Context

The application has over 20,000 active users and hundreds of interactive components across trading, predictions, portfolio, casino, square, and earn features. An audit of user management and data-fetching patterns across the codebase revealed several inefficiencies:

1. **Fragmented User Session Access (`usePrivy()`)**:
   - Over 50 components and hooks repeatedly invoke `usePrivy()` directly.
   - Each caller manually executes `getWalletAddress(user, "ethereum")` and `getWalletAddress(user, "solana")`, or derives user display names from scratch.
   - When components mount simultaneously on a dashboard or page load, this lack of centralized user state leads to repeated profile derivations and duplicate token resolution calls.
   - There is no unified `useUser()` hook managing cached user data, session state, wallet addresses, and delegation metadata via TanStack Query.

2. **Unnecessary `useEffect` Fetching & Endpoint Recall**:
   - Several components use `useEffect` to trigger data fetching or perform manual state synchronization instead of declarative TanStack `useQuery` / `useMutation`.
   - Ad-hoc query keys (e.g. string literals `["kash", "account", wallet]`, `["activity", evm, solana]`) lack a single source of truth, causing accidental key mismatches and preventing proper query deduplication across unrelated component mounts.
   - Over-eager background refetching (e.g., polling when windows lose focus or when a network is failing) creates unnecessary endpoint churn and exhausts backend gateway rate limits.

---

## Decision

We will implement a unified user management layer and standardize React Query keys and caching policies:

### 1. Unified User Management Hook (`hooks/use-user.ts`)

- Implement a centralized `useUser()` hook powered by TanStack Query and Privy:
  - Fetches the verified user profile and delegation metadata from `/api/auth/me` with deduplication (`queryKey: userKeys.me()`).
  - Stale time of 5 minutes; caches profile data, embedded wallet addresses (`evmAddress`, `solanaAddress`), and `isDelegated` status.
  - Automatically synchronizes when Privy authenticates, and invalidates cache when the user logs out.
  - Exposes clean accessors: `{ user, profile, evmAddress, solanaAddress, isDelegated, isLoading, isAuthenticated }`.

### 2. Centralized User Service Client (`lib/api/services/user.ts`)

- Add `userService` client via `createServiceClient("/api/auth", "User service unavailable.")`.
- Provide `fetchCurrentUser()` calling `userService.authedGet<AuthMeResponse>("/me")`.

### 3. Type-Safe Query Key Factory (`lib/query-keys.ts`)

- Create a centralized query key factory (`queryKeys`) covering:
  - `userKeys`: `me()`, `profile()`, `wallets()`
  - `portfolioKeys`: `all()`, `byWallet(evm, solana)`
  - `activityKeys`: `all()`, `byWallet(evm, solana)`
  - `kashKeys`: `status()`, `account(wallet)`
  - `depositKeys`: `chains()`, `tokens(chainId)`, `staticAddress(req)`
- Ensures query key uniformity across all hooks and components, preventing accidental cache misses and redundant endpoint calls.

### 4. Smart Endpoint Deduplication & Polling Optimization

- Update `lib/query-client.ts`:
  - Enhance global default options to avoid re-requesting un-staled data when switching between tabs or mounting child components.
  - Standardize `staleTime: 60 * 1000` (1 minute) for user-scoped reads and `5 * 60 * 1000` (5 minutes) for static catalogs.
  - Retain circuit breaker awareness so failing endpoints back off cleanly instead of spamming.

---

## Consequences & Safety for 20,000 Live Users

- **Zero Risk of Stale Lockouts**: When user metadata changes or a wallet delegates, the `userKeys.me()` query is invalidated explicitly, keeping the UI instantly reactive.
- **Dramatically Reduced Network Traffic**: Concurrent mounts will share identical query promises in TanStack Query's cache instead of firing multiple concurrent GET requests to `/api/auth/me` or `/api/portfolio`.
- **Zero Breaking Changes**: Existing Privy hooks and components continue to work normally; new components and updated hooks migrate to the unified `useUser()` seamlessly.
