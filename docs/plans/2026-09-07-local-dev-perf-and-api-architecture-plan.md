# Technical Implementation Plan: Local Dev Performance & API Architecture Consolidation

**Date:** 2026-09-07  
**Status:** Draft / Pending Approval  
**ADR References:**

- [Technical ADR](../adr/ADR-2026-09-07-local-dev-perf-and-api-architecture.md)
- [Plain-English ADR](../adr/ADR-2026-09-07-local-dev-perf-and-api-architecture-for-dummies.md)

---

## 1. Objectives

1. Optimize local development build and compilation speed (`pnpm dev`) using Next.js 16 native Turbopack features.
2. Unify all client-side API requests under typed domain service clients in `lib/api/services/`.
3. Eliminate direct `fetch()` invocations in `features/` slices to enforce circuit breaker, token refresh, and error unwrap handling.
4. Harden `app/api/` proxy route handlers against path traversal and missing origin validation.
5. Pass all five quality gates in `./scripts/preflight.sh` with zero warnings or errors.

---

## 2. Proposed Changes

### Component 1: Turbopack & Next.js 16 Configuration

- **File:** `next.config.ts`
  - Add `resolveAlias` to `turbopack`:
    ```typescript
    turbopack: {
      root: import.meta.dirname,
      resolveAlias: {
        "@stripe/crypto": false,
        "@farcaster/mini-app-solana": false,
      },
    },
    ```
  - Enable `turbopackFileSystemCacheForDev: true` under `experimental`.
  - Expand `optimizePackageImports` with heavy packages:
    - `@polymarket/client`
    - `@livekit/components-react`
    - `@base-ui/react`
    - `@solana-program/token`
    - `chess.js`

### Component 2: Unified Domain Service Clients

- **Directory:** `lib/api/services/`
  - Create standardized domain service clients using `createServiceClient`:
    - `activityService.ts` (`/api/activity`)
    - `casinoService.ts` (`/api/chess`, `/api/draughts`, `/api/vault`)
    - `fundsService.ts` (`/api/pouch`, `/api/ramping`, `/api/payment`)
    - `rwaService.ts` (`/api/rwa`, `/api/rwa-prices`)
    - `tradeService.ts` (`/api/trade`, `/api/perp`, `/api/dextopus`)
    - `squareService.ts` (`/api/market-square`)

### Component 3: Feature Refactoring (Direct `fetch()` Migration)

- Migrate direct `fetch()` calls in the following 32 files across `features/` to their respective domain service clients:
  - `features/activity/hooks/use-activity.ts`
  - `features/casino/hooks/use-casino-arena.ts`
  - `features/casino/hooks/use-casino-chess.ts`
  - `features/casino/hooks/use-casino-swiss.ts`
  - `features/casino/hooks/use-draughts-match.ts`
  - `features/casino/hooks/use-game-broadcast.ts`
  - `features/funds/hooks/use-pouch-kyc.ts`
  - `features/funds/hooks/use-pouch-offramp.ts`
  - `features/funds/components/crypto-deposit-screen.tsx`
  - `features/funds/components/crypto-withdraw-screen.tsx`
  - `features/funds/components/bank-transfer-screen.tsx`
  - `features/funds/components/bank-withdraw-screen.tsx`
  - `features/rwa/hooks/use-rwa-assets.ts`
  - `features/rwa/hooks/use-rwa-prices.ts`
  - `features/square/components/square-section.tsx`
  - `features/square/components/square-comments.tsx`
  - `features/trade/hooks/use-meme-tokens.ts`
  - `features/trade/hooks/use-perp-actions.ts`
  - `features/trade/hooks/use-perp-markets.ts`
  - `features/trade/components/spot-panel.tsx`
  - `features/trade/components/sell-sheet.tsx`

### Component 4: Route Handler Hardening

- Audit and harden `app/api/`:
  - Enforce traversal rejection (`path.includes("..") || path.includes("%") || path.includes("\\")`) across `trade`, `dextopus`, `earn`, `prediction`, and `vault`.
  - Add Origin / Referer validation for mutation requests (`POST`, `PUT`, `DELETE`).

---

## 3. Verification Plan

### Automated Verification

1. `pnpm format:check`: Ensure all files conform to Prettier formatting.
2. `pnpm lint`: Verify clean passage with zero ESLint or boundary rule errors (`eslint-plugin-boundaries`).
3. `pnpm typecheck`: Full TypeScript compilation check (`tsc --noEmit`).
4. `pnpm test`: Execute entire Vitest test suite (`vitest run`).
5. `pnpm build`: Verify clean Next.js 16 production build.
6. `pnpm bundle:check`: Ensure first-load bundles remain strictly within budgets.
7. `./scripts/preflight.sh`: Execute comprehensive preflight validation dispatcher.

### Performance Verification

- Benchmark `pnpm dev` cold start times and page compilation times before and after enabling Turbopack filesystem caching.
