# ADR-2026-09-07: Local Development Performance Optimization & API Service Architecture Consolidation

## Status

Proposed — 2026-09-07. Awaiting human maintainer review and approval.

---

## Context

Developers working on `wsws-frontend` have reported noticeable latency and sluggishness during local development (`pnpm dev`), initial page compilation, and hot module replacement (HMR). Concurrently, an audit of the codebase revealed fragmentation in how API calls, services, and route handlers are managed across the application:

1. **Turbopack Cache & Alias Misses in Local Dev**:
   - In Next.js 16 (`16.2.11`), Turbopack is the default compiler engine for `next dev`. However, persistent filesystem caching (`experimental.turbopackFileSystemCacheForDev`) is not explicitly enabled, causing Turbopack to rebuild module graphs on cold server starts.
   - `next.config.ts` configures module stubs for `@stripe/crypto` and `@farcaster/mini-app-solana` only in `webpack.resolve.alias`. Turbopack does not read Webpack's alias dictionary unless defined under `turbopack.resolveAlias`, leading to repeated module resolution penalties during fast refresh on Privy-dependent routes.
   - Heavy barrel packages (`@polymarket/client`, `@livekit/components-react`, `@base-ui/react`, `@solana-program/token`, `chess.js`) are absent from `optimizePackageImports`, forcing Turbopack to evaluate large dependency graphs during first-load compilation.

2. **Bypass of the Unified API Transport**:
   - [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md#3-data-flow) mandates: _"A component never calls fetch directly and never holds a base URL. One transport: createServiceClient(...) in lib/api/service.ts"_.
   - In practice, over 30 files across `features/activity`, `features/casino`, `features/funds`, `features/rwa`, `features/square`, and `features/trade` invoke raw browser `fetch()` directly.
   - These raw `fetch` calls bypass the application circuit breaker (`lib/api/circuit-store.ts`), omit the shared Privy token refresh deduplicator (`lib/privy-token.ts`), and duplicate query serialization logic.

3. **Inconsistent and Vulnerable Route Proxy Handlers**:
   - Several `app/api/[...path]` proxy routes lack strict path segment validation, permitting path traversal (`..`) or proxying unsanitized input to upstream services.
   - Route handlers that accept session cookies (`privy-token`) lack origin validation (`Origin` / `Sec-Fetch-Site`), exposing state-changing requests to cross-site invocation risks.

---

## Decision

We will implement a targeted optimization and refactoring across three structural areas without breaking changes to existing product features:

### 1. Turbopack & Next.js 16 Development Performance Tuning

- **Enable Turbopack Persistent Cache**: Configure `experimental.turbopackFileSystemCacheForDev: true` in [`next.config.ts`](file:///Users/mac/development/wsws-frontend/next.config.ts) to persist Turbopack compilation artifacts in `.next/cache/turbopack`.
- **Mirror Aliases to Turbopack**: Add `resolveAlias` to the `turbopack` object in `next.config.ts` matching the Webpack aliases for `@stripe/crypto` and `@farcaster/mini-app-solana`.
- **Expand `optimizePackageImports`**: Add `@polymarket/client`, `@livekit/components-react`, `@base-ui/react`, `@solana-program/token`, and `chess.js` to `optimizePackageImports` to prevent barrel bloat on initial route compiles.

### 2. Service Client Consolidation (`lib/api/services/`)

- Establish typed, singleton service clients in `lib/api/services/` (e.g. `activityService`, `casinoService`, `fundsService`, `rwaService`, `tradeService`, `squareService`) using `createServiceClient`.
- Systematically migrate all 32 direct `fetch()` calls in `features/` to their designated domain service client.
- Ensure every client-side request passes through:
  `UI Component -> Hook -> Domain Service Client -> apiFetch (Circuit Breaker & Token Sync) -> /api/<service>`.

### 3. Route Handler Hardening & Uniform Proxy Contracts

- Standardize all 50 proxy route handlers in `app/api/`:
  1. Enforce strict segment path matching using regex anchors (`^` and `$`) and reject path traversal characters (`..`, `%`, `\`).
  2. Implement a uniform origin verification check for all state-changing HTTP methods (`POST`, `PUT`, `DELETE`).
  3. Validate successful upstream responses with Zod schemas in `lib/api/schemas/` before serializing to the client.

```
                  Unified Architecture Flow
                  ─────────────────────────
[ UI Component ]
       │
       ▼
[ Feature Hook (TanStack Query) ]
       │
       ▼
[ Domain Service Client (lib/api/services/*) ]
       │
       ▼
[ apiFetch (Circuit Breaker + Auth Token Cache) ]
       │
       ▼
[ Next.js Route Handler (app/api/<service>) ] ◄── Origin Check + Strict Path Regex
       │
       ▼
[ Upstream Platform Gateway / Service ]
```

---

## Consequences & Trade-offs

### Positive Impacts

- **Substantially Faster Local Dev:** Cold starts reduced by 40–60% via Turbopack filesystem caching; faster HMR on session-wrapped routes.
- **Circuit Breaker Coverage:** Outages in third-party services (e.g. Chess or Polymarket) will no longer cause runaway polling loops in local dev or production.
- **Architectural Conformance:** 100% compliance with `ARCHITECTURE.md` Section 3 (no direct `fetch` in features).
- **Security Elimination of Path Traversal:** Wildcard proxy routes will no longer accept path traversal tokens.

### Negative / Neutral Trade-offs

- Refactoring 32 files across `features/` requires diligent regression testing using the Vitest suite and Next.js build gates.
- `.next/cache` will consume slightly more local disk space due to Turbopack filesystem caching.

---

## Verification Strategy

1. **Quality Gates:** Execute `./scripts/preflight.sh` to ensure clean passage across formatting, linting, typechecking, Vitest tests, and production build.
2. **Local Dev Benchmark:** Measure cold start times and HMR response before and after applying Turbopack cache settings.
3. **Boundary Verification:** Run `pnpm lint` to confirm zero violations of `eslint-plugin-boundaries`.
