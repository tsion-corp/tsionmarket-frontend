# Implementation Plan: Unified User Management & React Query Deduplication

Implement a centralized user management hook and standardize React Query keys across the application to prevent redundant network requests and eliminate unnecessary `useEffect` polling.

## Proposed Changes

### 1. Centralized User API Service (`lib/api/services/user.ts`)

- Use `createServiceClient("/api/auth", "User service unavailable.")`
- Add `fetchCurrentUser()` that calls `authedGet<{ userId: string; sessionId: string; user: AuthMeUser | null }>("/me")`
- Export from `lib/api/services/index.ts`

### 2. Type-Safe Query Key Factory (`lib/query-keys.ts`)

- Define strongly typed query key hierarchies:
  - `queryKeys.user`: `all`, `me()`, `session()`
  - `queryKeys.portfolio`: `all`, `byWallet(evm, solana)`
  - `queryKeys.activity`: `all`, `byWallet(evm, solana)`
  - `queryKeys.kash`: `all`, `status()`, `account(wallet)`
  - `queryKeys.dextopus`: `chains()`, `tokens(chainId)`, `status(id, purpose)`

### 3. Unified User Hook (`hooks/use-user.ts`)

- Combine Privy session state with React Query `/api/auth/me` cache using `queryKeys.user.me()`
- Provide instant synchronous access to:
  - `user`: Privy user
  - `profile`: derived profile name, avatar, email
  - `evmAddress`: Ethereum embedded wallet address
  - `solanaAddress`: Solana embedded wallet address
  - `isDelegated`: whether wallets are delegated to the backend
  - `isAuthenticated`: boolean
  - `isLoading`: boolean
- Invalidate user query on logout or account updates.

### 4. Optimize React Query Defaults (`lib/query-client.ts`)

- Standardize `staleTime: 60 * 1000` (1 min) for dynamic user data
- Prevent duplicate refetching when window focus changes if data is not yet stale

### 5. Automated Tests

- Unit test for `lib/query-keys.test.ts`
- Unit test for `lib/api/services/user.test.ts`
- Unit test for `hooks/use-user.test.ts`
