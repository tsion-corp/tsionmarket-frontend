---
title: Local Development Performance Optimization and API Architecture Consolidation
date: 2026-09-07
area: architecture-performance
adr: ADR-2026-09-07-local-dev-perf-and-api-architecture
scenario-impact: none
---

# Release Note: Local Development Performance Optimization and API Architecture Consolidation

## Summary

This release resolves local development performance bottlenecks, normalizes API Gateway URL resolution to Tsion Ark (`https://api.tsionark.com`), centralizes API service clients under `lib/api/services/`, and hardens API proxy route handlers against path traversal attacks.

## What Changed

1. **Base URL Normalization & Tsion Ark Migration**:
   - Updated `lib/wsapi-base.ts` to sanitize trailing slashes and redundant `/v1` segments in `WSAPI_BASE_URL` and `NEXT_PUBLIC_WSAPI_BASE_URL`.
   - Replaced legacy fallback (`https://api.worldstreetwebservices.com`) with the canonical production Tsion Ark gateway: `https://api.tsionark.com`.
   - Updated live WebSocket fallbacks to `wss://ws.tsionark.com` in chess live sockets, prediction market streams, and `.env.example`.

2. **Next.js 16 & Turbopack Performance Optimization**:
   - Configured `turbopack.resolveAlias` in `next.config.ts` with empty module stubs for unused optional packages (`@stripe/crypto`, `@farcaster/mini-app-solana`) to eliminate module resolution overhead during Fast Refresh.
   - Enabled `turbopackFileSystemCacheForDev: true` in `next.config.ts` experimental settings for instant warm-start recompilation.
   - Expanded `optimizePackageImports` to include heavy barrels: `@polymarket/client`, `@livekit/components-react`, `@base-ui/react`, `@solana-program/token`, and `chess.js`.

3. **Domain Service Client Architecture**:
   - Introduced dedicated domain service clients under `lib/api/services/`:
     - `activityClient` (`lib/api/services/activity.ts`)
     - `rwaClient` (`lib/api/services/rwa.ts`)
     - `funds` (`pouchClient`, `paymentClient`, `rampingClient` in `lib/api/services/funds.ts`)
     - `casino` (`chessClient`, `draughtsClient`, `vaultClient` in `lib/api/services/casino.ts`)
     - `trade` (`tradeClient`, `perpClient` in `lib/api/services/trade.ts`)
     - `square` (`lib/api/services/square.ts`)
   - Migrated direct un-circuit-broken `fetch()` calls in `features/activity`, `features/funds`, `features/rwa`, and `hooks/` to use typed service clients with circuit breaker protections and envelope unwrapping.

4. **API Proxy Route Hardening**:
   - Implemented `isSafeProxyPath` guard utility (`lib/server/proxy-path.ts`) with unit tests.
   - Hardened `app/api/trade/[...path]`, `app/api/prediction/[...path]`, `app/api/vault/[...path]`, `app/api/earn/[...path]`, and `lib/server/dextopus.ts` against directory traversal (`..`), URL-encoded traversal (`%2e%2e`), backslashes (`\`), null bytes, and non-relative path tampering.

## Quality Gates Passed

- Prettier format check: Clean
- ESLint checks: Clean (0 errors)
- TypeScript typecheck (`tsc --noEmit`): Clean (0 errors)
- Vitest suite: 257 test files passed, 2,207 tests passed, 0 failures
- Next.js production build: Compiled in 23.2s with Turbopack, all 78 static and dynamic routes generated successfully.
