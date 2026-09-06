# ADR-2026-09-06: Server-first reconstruction of the signed-in app (v1.4)

## Status

Accepted — 2026-09-06. Approved by the maintainer in the working session that
produced branch `v1.4`; recorded here after the fact, since the governance
framework requiring this document landed on the same day.

## Context

Users reported lag, layout shift and slow interactions. An outside
specification proposed a "server-first reconstruction" built on premises that
did not hold for this repository: it assumed Redux Toolkit (there is none;
TanStack Query is the data layer), a `src/` tree, an unconfigured boundary
linter (`eslint-plugin-boundaries` already enforces the layering), and a
`NEXT_PUBLIC_BACKEND_URL` (the gateway is deliberately server-only). Its Next.js
samples were wrong for the installed version: synchronous `headers()`,
`revalidate` beside `force-dynamic`, a `<Suspense>` around already-awaited
data that could never stream, and Server Actions with no authorization.

An audit of the running app found the actual causes:

- 45 of 53 pages were client components, with no `loading.tsx` anywhere and one
  `error.tsx` at the root, above the shell.
- The shell (`DashboardShell`) was mounted by each page, so every navigation
  rebuilt the sidebar, topbar, tab bar, funds modal and broadcast dock.
- The root providers mounted Privy, viem and livekit-client on every route;
  the privacy policy shipped 1,255 kB of gzipped JavaScript.
- The transport (`lib/api.ts`, `lib/api/service.ts`) was `"use client"`, so no
  Server Component could fetch anything.
- The balance sat four serial network hops behind the first paint (bundle,
  Privy start-up, Privy `/users/me`, `/api/portfolio` to Alchemy), behind a
  client-side guard that held the whole app on a loader.
- An idle dashboard made thirty requests a minute from thirteen independent
  polls, several to upstreams that were down and answered 502 or 404 forever.
- Two security defects: the server trusted a client-supplied identity token
  without binding it to the verified session, and the persisted query cache
  (balances, addresses) survived sign-out in localStorage.

Design research (Polymarket, Robinhood, Hyperliquid, dYdX; web.dev; NN/g)
established the shape: server-render the snapshot on browse surfaces, keep the
trading terminal a client shell, prefer a last-known value over a skeleton,
and treat layout stability as a steady-state property.

## Decision

Rebuild incrementally, on one branch, by the strangler-fig method: each step
verified before the next, URLs unchanged throughout, existing hooks and pages
kept working while the server takes over the first byte.

### 1. Route groups own the shell and the session providers

```
app/
  layout.tsx                   fonts, locale, query client, toaster
  page.tsx  privacy/  welcome/ outside every group: no wallet SDK
  (session)/
    layout.tsx + providers.tsx Privy, broadcast session, analytics, once
    auth/  interests/  casino/  earn/  prediction/reclaim/
    (app)/
      layout.tsx               verifies the cookie; AppShell (guard + DashboardShell)
      loading.tsx  error.tsx
      dashboard/ spot/ perps/ meme/ rwa/ prediction/ activity/
```

`AppChromeProvider` derives the rail's highlight from the path
(`sectionForPathname`) and lets the dashboard override it from its scroll-spy.
This removed the objection recorded in `docs/ARCHITECTURE.md` §9.2.

### 2. A server-side data access layer

`lib/server/session.ts` verifies the `privy-token` cookie under React `cache`
and resolves the user by the verified id alone. `lib/server/embedded-wallets.ts`
picks the same wallet the browser picks. The `(app)` layout hands the browser a
`ServerSession` DTO (`lib/session.ts`); `AuthGuard` renders at once when the
server vouched, and Privy stays the authority once it has answered. The server
never redirects: an expired access token beside a live refresh token is a
session Privy restores in the browser.

### 3. Server prefetch, streamed into the query cache

Pages start a prefetch and pass the unresolved promise down. A small client
component (`components/providers/query-hydration.tsx`) reads it inside its own
`<Suspense>` and hands the dehydrated state to `HydrationBoundary`, which only
replaces a browser value when the server's is newer. The balance
(`lib/server/portfolio-snapshot.ts`) and the dashboard feed land under the keys
the existing hooks build, so the hooks' first requests become refreshes.

```
page.tsx (server) ── dehydratedDashboard() ──┐  promise, not awaited
   │                                          ▼
   ├─ <Suspense fallback={null}><QueryHydration snapshot={…}/></Suspense>
   └─ <DashboardPage/>  (client; usePortfolio / useDashboardFeed find data)
```

### 4. One public feed for the dashboard

`lib/server/dashboard-feed.ts` composes spot, perps, memes, RWA and the live
events once per twenty-second window (`cached`), each upstream asked once for
every user, each section `null` when its upstream cannot answer (logged with
the section). `GET /api/dashboard/feed` serves it anonymously with
`public, s-maxage=15, stale-while-revalidate=60`. The briefs and the marquee
read `useDashboardFeed()`; the full pages keep their own hooks. Nothing per
user may enter the feed.

The rules the feed applies were lifted below the feature line so server and
browser share them by construction: `lib/rwa/catalog.ts`,
`lib/chess/live-match.ts`, `lib/vault/{read,contract,king-of-night-abi}.ts`,
`lib/spot-markets.ts`, `lib/perp/brief.ts`, `lib/meme/{catalog,types}.ts`. The
feature files re-export them, so their callers did not change.

### 5. Breakers per service, polling by need

`lib/api/circuit-store.ts` keys the breaker by the segment after `/api`, with a
quiet set (games, square, logos) that never raises the app-wide banner. Polls
were gated on visibility and on sheets being open, decorative feeds stopped
retrying, and the analytics segment listens to the cache instead of polling.

### 6. Measurement as a gate

`scripts/first-load.mjs` reads each route's initial client chunks from the
build manifests and gzips them; `pnpm bundle:check` fails CI against
`scripts/first-load-budget.json`. Budgets are a ratchet, lowered as routes
improve.

## Consequences

- Landing 1,270 → 249 kB gzip; privacy 1,255 → 182 kB; dashboard 1,684 →
  1,625 kB; sign-in 1,290 → 1,232 kB.
- Idle dashboard traffic: one public request per thirty seconds plus the
  per-user balance (60 s) and Kash account (30 s), down from ~30 requests a
  minute across thirteen polls.
- The whole dashboard tree is server-rendered for a verified session; it had
  never been before, and it survives SSR (proved with a faked session).
- Casino and earn remain outside `(app)`; bringing them in is its own change
  (casino needs its immersive routes split into a sibling group).
- Open pull requests that edit `app/dashboard/page.tsx` or
  `app/perps/page.tsx` must be rebased onto this branch.
- `cacheComponents` stays off; `use cache` and PPR were not used and are a
  separate decision.

## Alternatives considered

- **Follow the outside specification as written.** Rejected: its premises were
  false for this repository and its samples would not stream, and its Server
  Action pattern moved money with no authorization.
- **Scrap all client fetching.** Rejected: the perps desk, order books and
  live matches are genuinely real-time; server-first is correct for the first
  paint and wrong as an absolute. The research confirmed the split.
- **Big-bang rewrite.** Rejected: nothing would be verifiable until all of it
  was, and eight pull requests were open against the same files.
- **A pathname switch in the root layout instead of route groups.** Rejected:
  route groups are the framework's mechanism and keep the layering readable.
