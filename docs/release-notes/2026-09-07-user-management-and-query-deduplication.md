# Release Notes: Unified User Management & React Query Deduplication

- **Date**: 2026-09-07
- **Topic**: User Management & React Query Key Standardization
- **scenario-impact**: none

## Summary

Implemented a centralized user management layer and a type-safe query key factory to eliminate redundant `useEffect` calls, avoid duplicate API requests across concurrent components, and tune global React Query caching policies.

## Key Changes

1. **Centralized Query Key Factory (`lib/query-keys.ts`)**:
   - Standardized hierarchical keys for `user`, `portfolio`, `activity`, `kash`, and `dextopus`.
   - Ensures distinct components mount with identical query keys, allowing TanStack Query to deduplicate network requests globally.

2. **User Domain API Client (`lib/api/services/user.ts`)**:
   - Centralized `userClient` connecting to `/api/auth` with `fetchCurrentUser()`.
   - Exported as part of the domain service clients under `lib/api/services/`.

3. **Unified User Hook (`hooks/use-user.ts`)**:
   - Single hook combining Privy client auth with TanStack React Query caching for verified `/api/auth/me` state.
   - Provides instant, cached access to `user`, `profile`, `evmAddress`, `solanaAddress`, `isDelegated`, `isAuthenticated`, and `isLoading`.

4. **React Query Defaults Optimization (`lib/query-client.ts`)**:
   - Tuned `staleTime` to 60 seconds and set `refetchOnWindowFocus` to `false` by default, preventing unexpected background storms on rapid tab switching.

## Verification

- `lib/query-keys.test.ts`: 5/5 tests passed.
- `lib/api/services/user.test.ts`: 1/1 tests passed.
- `hooks/use-user.test.ts`: 2/2 tests passed.
- `lib/query-client.test.ts`: 1/1 tests passed.
