# ADR-2026-09-08: Frontend caching and request reduction

## Status

Proposed, 2026-09-08. Awaiting human maintainer review and approval.

No implementation may begin before that approval, per AGENTS.md Directive 2. The author of this
document is an AI agent and is forbidden from approving it.

Companion document for non-technical readers:
`docs/adr/ADR-2026-09-08-frontend-caching-and-request-reduction-for-dummies.md`.

## Context

The reported problem: "There are too many calls on the frontend (images, endpoints and so on) and
we're not caching them, so if I reload, multiple calls/requests are being made, even when I'm idle
the same thing."

Ten read-only audits were run across disjoint areas before any code was written. Nothing below is
estimated from experience or recalled from documentation. Every number is measured from this tree,
at commit `425dbb45`, on Next.js 16.2.11. Where a fact could not be established without running the
deployed app, it is marked as unverified rather than guessed.

### The headline measurements

| Measurement                                            | Value                     | How it was obtained                                                |
| ------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------ |
| Requests on a cold reload of `/portfolio`              | 18                        | Static trace of the mount tree                                     |
| Requests on a warm reload (persisted cache populated)  | 11 to 12                  | Same trace, cross-checked against `PERSISTED_PREFIXES`             |
| Waterfall depth, cold                                  | 4                         | Privy boot, then token resolve, then authed reads, then dependents |
| Requests per minute while idle on `/portfolio`         | 9.3                       | Two agents, independently, same arithmetic                         |
| Requests per hour per open idle tab                    | 558                       | 9.3 x 60                                                           |
| Route handlers under `app/api/`                        | 55                        | `find`                                                             |
| Route handlers setting no `Cache-Control`              | 34                        | `grep`, then read individually                                     |
| User-private money handlers setting no `Cache-Control` | 10                        | Read individually and classified                                   |
| Raw `<img>` elements                                   | 133                       | 136 grep hits, 3 of which are prose in comments                    |
| Files importing `next/image`                           | 12                        | All 12 load local assets only                                      |
| `images` configuration in `next.config.ts`             | absent                    | Read in full                                                       |
| `async headers()` in `next.config.ts`                  | absent                    | Read in full                                                       |
| `/public` total                                        | 446 files, 92.9 MiB       | `find` plus `stat`                                                 |
| `/public` files that are content-hashed                | 0                         | Digests computed for the 13 that look hashed                       |
| `refetchInterval` call sites                           | 95 real, of 103 grep hits | Read individually                                                  |
| `setInterval` call sites                               | 42 real, of 52 grep hits  | Read individually                                                  |
| Leaked intervals (no cleanup)                          | 0                         | All 42 checked                                                     |
| `useQuery` sites inheriting the default `staleTime`    | 79, across 42 files       | Machine count, false positives removed                             |
| `useQuery` sites inheriting the default `gcTime`       | 203 of 226                | Machine count                                                      |
| First-load bundle, `/portfolio`                        | 1877 kB across 58 chunks  | `node scripts/first-load.mjs`                                      |

### Why a reload still costs 11 to 12 requests

This is the central finding, and it reframes the problem.

The persistence layer works. `lib/query-persist.ts` dehydrates 16 query families to `localStorage`,
and on reload they rehydrate and paint immediately. But `hydrate()` restores each entry's original
`dataUpdatedAt`, and `refetchOnMount` is React Query's default `true`, never overridden in
`lib/query-client.ts`. A rehydrated value is therefore stale the instant it lands, and a background
refetch fires behind it.

Of roughly 20 queries live on a reloaded `/portfolio`, exactly four avoid a network call:
`buy-destinations`, `deposit-static` and `deposit-static-stable` (all three set
`refetchOnMount: false` explicitly) and the deposit catalogs (a one-hour `staleTime` that outlives
the gap). The other sixteen all fire.

**Persistence removes the skeleton. It does not remove the request.** The comment at
`lib/query-persist.ts:1-9` is honest about this. What was never written down is that request count
on reload is therefore unchanged by persistence, and request count is what the user is measuring.

Six of those requests have no persisted value at all, because their prefixes are absent from
`PERSISTED_PREFIXES`: `kash/status`, `kash/accounts`, `kash/subscriptions`, `activity`,
`perps-balance`, `market-tokens`. These are the Kash card, the notification bell, the perps half of
the balance total, and the token list. They are the top of the page, which is why the reload feels
uncached even though nine other queries restore instantly.

### A contradiction inside the persistence layer

`lib/query-persist.ts:50-52` states the contract: persisted queries get a long `gcTime` "so they are
not evicted from memory before the throttled write reaches storage, and so a restore has something
to hydrate."

Four of the sixteen persisted families never apply it. `portfolio`, `prices`, `fx-rates` and all five
`meme` keys inherit the five-minute default from `lib/query-client.ts:9`.

This matters because `persistQueryClientSave` calls `dehydrate()` over the cache **as it currently
is**, and `setItem` replaces the whole blob. A garbage-collected query is simply absent from the next
write. So `gcTime`, not the prefix list, is what actually decides what stays persisted.

`components/providers/session-cache-guard.tsx:11` states the layer's purpose: "The persisted cache
exists so a reload paints the last balance at once." The balance is the one that does not survive.
Concretely: `/portfolio`, then any `/earn` route (which mounts no `usePortfolio` observer), then five
minutes, then reload, gives a cold portfolio fetch and a skeleton.

### Where the idle 9.3 requests per minute come from

| Poll                                         | Interval | req/min | Note                                                          |
| -------------------------------------------- | -------- | ------- | ------------------------------------------------------------- |
| `hooks/use-global-balance.ts:45`             | 20s      | 3.0     | Feeds one addend of the balance card. Server caches it 75s.   |
| `features/portfolio/hooks/use-kash.ts:62`    | 30s      | 2.0     | Comment still says "ten second poll"; the constant is 30s.    |
| `features/trade/hooks/use-meme-tokens.ts:29` | 30s      | 2.0     | Has a visibility gate that is bypassed by where it is called. |
| `hooks/use-portfolio.ts:106`                 | 60s      | 1.0     | Beats against a 75s server TTL.                               |
| `hooks/use-prices.ts:79`                     | 60s      | 1.0     | Pulled in only by an ungated call site.                       |
| `features/activity/hooks/use-activity.ts:43` | 300s     | 0.2     |                                                               |
| `hooks/use-fx.ts:29`                         | 600s     | 0.1     |                                                               |

React Query's `refetchIntervalInBackground` defaults to `false` and is not overridden globally, so
all but four polls in the app do sleep when the browser tab is hidden. They do **not** sleep when the
tab is visible and the user is simply idle, which is the reported condition.

### The visibility gating is orphaned, not missing

Commits `8ae14c7` ("stop the dashboard polling everything nobody is looking at") and `558d915` ("cut
dashboard request volume, and repair three gates that were not gating") built the correct mechanism:
`SectionVisibility`, `useSectionActive()`, `subscribed` in preference to `enabled`, a callback-ref
`useInView` with a two-second leave grace, and `pollUnlessFailing`. All of it is still in the tree and
still correct.

Commit `f36d510` ("made all services stand alone pages") then moved every service to its own route
and left the mechanism attached to nothing:

- `dashboard-page.tsx:67` hides all four briefs, so the `briefs.map` that wraps each one in
  `SectionVisibility` iterates an empty list. That gate never runs.
- All five `useSectionActive()` call sites now mount on standalone routes with no provider above
  them, so the context returns its default `true`.
- `features/trade/components/meme-section.tsx` still holds a correct wrapper, but `MemeSection` is
  dead code referenced nowhere.

Two specific gates are dead in the same way. `dashboard-page.tsx:161` disables `useSpotMarkets` with
a comment explaining it would otherwise be "a price poll under a page that already had its numbers",
and then `token-moves-section.tsx:14` calls `useSpotMarkets()` with no argument, defaulting to
enabled. And `useMemeSpots()` is called at `dashboard-page.tsx:167` outside any `SectionVisibility`,
reproducing one level higher the exact trap `558d915` fixed.

This is the single most important structural finding: the work to be done is re-attachment, not
invention.

### HTTP caching

A route handler that sets no `Cache-Control` ships no `Cache-Control`. This was verified empirically
by running `next start` against the existing build and reading live headers: `GET
/api/polymarket/access` returns 200 with no cache directive at all. Next's documented dynamic default
of `private, no-cache, no-store, max-age=0, must-revalidate` applies to pages, not to route handlers.

Under RFC 9111 section 4.2.2, a 200 with no directive and no `Expires` is heuristically freshenable by
any shared cache. Next's `Vary` list on these responses contains neither `Cookie` nor `Authorization`.

Ten handlers return user-private money data with no directive: `kash/[...path]` (KSH balances),
`perp/[...path]` (margin, positions, orders), `ramping/[...path]` (orders in flight),
`payment/[...path]` (offramp orders), `pouch/onramp/status`, `pouch/kyc/status`, `auth/me`,
`earn/[...path]`, `dextopus/[...path]`, and `rwa-chart`.

Two of these are close to self-documenting. `ramping/[...path]:8` carries a comment reading "Orders
are money in flight and are never cached", which is true of the upstream `fetch` at line 76 and not
of the response the handler returns. And `dextopus/[...path]:25` sets `no-store` on the outage branch
but not on the success branch, so the pattern was known and simply not carried through.

The 21 handlers that do set `Cache-Control` set it correctly. Every one of the seven using `public` or
`s-maxage` was checked and reads no session, no bearer and no wallet; the two hottest are called with
credentials explicitly suppressed. `portfolio` and `activity` already use `private, max-age=30`. There
is no unsafe directive anywhere in the current code.

Whether Vercel's edge actually caches any of these responses today could not be verified from the
repo. This is therefore recorded as a missing required directive, not as a confirmed live leak. The
exposure is to intermediaries the team does not control: a corporate proxy, an ISP cache, or a future
CDN.

### Static assets

`/public` is served `public, max-age=0` with an `ETag` and `Last-Modified` (verified in
`node_modules/next/dist/server/lib/router-server.js:412` and the bundled `send`). It is therefore
already conditionally cached: browsers store every asset and revalidate with a 304. The cost is a
round trip per asset, not a re-download. This is a smaller problem than "nothing is cached".

`immutable` on `/public` would be actively unsafe here, for a specific reason: there is no cache
buster. Next's `deploymentId` mechanism appends a query suffix to Next-emitted asset URLs only. It
cannot rewrite a hand-authored `src="/market/kash-coin.png"` string, and with 133 raw `<img>` tags most
assets never reach the optimizer. `immutable` instructs browsers not to revalidate even on a
user-initiated reload. Shipping one wrong image under a stable path would leave no lever to retract
it. Zero of the 446 files are content-hashed. The 13 hex-named sportsbook PNGs look hashed but their
digests were computed and do not match their filenames: they are MongoDB ObjectIds, which are stable
names for concepts, not fingerprints of bytes.

Git history shows zero in-place modifications of a `/public` file and one rename
(`powerball/hero.png` to `arkball/hero.png`). That rename is the counter-example that proves the
point: when the team needed different bytes to reach users, it changed the path. Nothing enforces
that discipline, so it is habit, not an invariant.

### Images

There is no `images` block in `next.config.ts`, so `remotePatterns` is empty and would reject every
remote image. That is why 96 of the raw `<img>` tags carry an `eslint-disable` with a written
justification, typically the one at `components/ui/asset-icon.tsx:192`: "Logo hosts vary per provider;
next/image would reject unlisted hosts." Someone already hit this wall.

`remotePatterns` cannot be written today. Four hosts are verifiable from literal code (`flagcdn.com`,
`images.unsplash.com`, `upload.wikimedia.org`, `raw.githubusercontent.com`). Eight more arrive as
absolute URLs inside upstream payloads and are not knowable from this repo, including the
GeckoTerminal and CoinGecko image CDNs, memecoin and chain logo hosts, and sportsbook participant
artwork. Two sets are genuinely unbounded: Polymarket serves artwork from provider-controlled hosts,
and Square avatars are user-supplied.

`app/api/token-logo/[chain]/[address]/route.ts` is not a byte proxy. It issues a **307 redirect**, and
its `public, max-age=86400, immutable` header is attached to the redirect. The browser caches the
redirect hop for a day; the image bytes then come from the third-party target with whatever headers
that host sends. The route never sees the bytes and cannot optimize them. Its sibling
`app/api/token-logos/route.ts` (plural, POST) returns raw upstream URLs and bypasses even the
redirect. The same `AssetIcon` component therefore receives same-origin proxied URLs on RWA screens
and third-party URLs elsewhere.

One lever makes `next/image` viable against unknown hosts. The Next 16 documentation for
`maximumRedirects` states that redirect targets "do not need to satisfy `remotePatterns`". A
redirect handler of the shape `token-logo` already has is therefore the mechanism by which images
from unknowable hosts can be optimized and cached, without a permissive `**` pattern the same docs
warn against.

Separately, and larger than any caching change: `public/market-square/card-linked.svg` is
**11,152,320 bytes** and renders a 363 by 173 card at `features/square/components/square-promos.tsx:206`.
It is a Figma export with six full-resolution PNGs embedded as base64 inside a small viewBox. Two
near-identical 11 MB copies sit unreferenced beside it. Because it is an SVG in a raw `<img>`, no
config change and no `next/image` migration can shrink it.

### Sockets and polls carrying the same data

`features/casino/hooks/use-vault-feeds.ts:45` is the correct reference pattern:
`refetchInterval: connected ? false : FALLBACK_FEED_POLL_MS`. Ranked overlaps that do not follow it:

- Chess match page, about 42 req/min duplicated. Chat and comments poll every 4s with
  `refetchIntervalInBackground: true`, while the socket already writes both into the same cache keys.
- Prediction detail, 7 req/min. `use-prediction-market-stream.ts` already computes and returns a
  `healthy` flag; `market-detail.tsx:72` destructures `{ liveTrades }` and discards it.
- Vault, in the reference file itself: `use-vault-feeds.ts:59,66` and `use-vault-lobby.ts:84` are
  ungated while their siblings three lines above are gated.
- Draughts, `use-draughts-match.ts:68`: `matchRefetchMs` never returns `false`, so a settled board
  polls at 3 req/min indefinitely. Chess correctly returns `false` for settled.

Two connection defects compound this. `use-vault-socket.ts:247` reconnects on a fixed 2s with no
backoff and no cap, which is 30 dials per minute forever against a dead gateway; the correct
exponential version already exists at `live-socket.ts:147`. And `hyperliquid-ws-client.ts` contains
no `close()` at all, so the transport survives for the lifetime of the tab after one visit to
`/trade`.

The sportsbook SSE has a cost invisible in request counts. `vercel.json` caps `app/api/**/route.ts`
at `maxDuration: 30`, so each browser `EventSource` pins a serverless function for up to 30 seconds,
is killed, and redials about 3 seconds later: roughly 2 invocations per minute per open stream,
billed at up to 30 seconds of wall clock each, per viewer, indefinitely.

### Requests that bypass the cache entirely

- `features/trade/hooks/use-meme-trade.ts:201` and `:315` are `for(;;)` loops polling
  `fetchSwapStatus` every 4 seconds with no deadline, no attempt cap, and no unmount cancellation. If
  the trade service never returns a terminal status, these poll a money endpoint forever and survive
  navigation away from the screen.
- `use-game-broadcast.ts:248` (3s) and `use-arkjet-chat.ts:97` (20s POST) are hand-rolled polls that
  never enter React Query: no key, no dedupe, no `staleTime`, and duplicated per mounted component.
- `last-standing-section.tsx:543` calls `invalidateQueries` on two keys plus a `refetch()` every 2.5
  seconds. Scheduled invalidation defeats `staleTime` by construction.

### Correctness defects found while auditing caches

These are not performance issues. They are recorded here because they were found by this work and
because two of them touch money.

1. **`useStaticDepositAddress` omits the destination from its cache key.**
   `hooks/use-deposit.ts:441` keys on `["deposit-static", userId, settlementChainId, originChainId,
originAsset]` while the `queryFn` posts the whole request, including `settlementAddress` and
   `settlementAsset`. The entry is persisted, `staleTime` is 24 hours, and `refetchOnMount` is
   `false`. `lib/deposit.ts:351` states that "minting against a missing settlement address would bind
   the address to the wrong destination permanently, and a static address cannot be repointed". The
   sibling `useStableStaticAddress` at `:474` does include `settlementAddress`. `lib/query-keys.ts:39`
   replicates the omission. Live exploitability is narrower than the shape suggests, because
   `profileAddressSpec` returns `null` while the wallet is not ready, and no guaranteed repro was
   constructed.
2. **`useDepositTokens` omits `eligibleSet` from its key** (`hooks/use-deposit.ts:359`), although the
   `queryFn` reads it to compute `supportsStaticAddress`. This already bit once:
   `lib/query-persist.ts:45` documents bumping `RQ_PERSIST_BUSTER` to force-evict browsers holding
   ETH with the wrong flag. The eviction worked; the missing dependency that made it necessary
   remains, so the next eligibility change needs another global bust.
3. **`["market-square","me"]` has one key and two different `queryFn`s.** `fetchSquareMe` is anonymous
   and returns `avatarUrl` and `verification`; `fetchMarketSquareProfile` is authed and its mapper
   drops both. Whichever observer mounts first serves all four call sites. One outcome renders `@null`
   at `square-actions-sheet.tsx:117`; the other decides the creator gate at `share-flow.tsx:61` from
   an unauthed read.
4. **The persister has no `retry`.** `app/providers.tsx:26` constructs
   `createSyncStoragePersister` without one, so on `QuotaExceededError` the write loop exits with no
   throw and no log. Persistence stops silently and the blob freezes at its last successful write,
   which is worse than no persistence because stale data keeps rehydrating. The library ships
   `removeOldestQuery` for exactly this and it is unused. Estimated payload is 200 KB to 2 MB against
   an effective 2.5 million character budget, dominated by `deposit-tokens`.
5. **`useHyperliquidClearinghouse` has no refresh path.** `use-hyperliquid-markets.ts:46` and two
   sibling files carry comments asserting they are "caught by the app-wide refetchOnWindowFocus
   default", but `lib/query-client.ts:10` sets that to `false`. Positions and orders survive because
   they poll anyway. The clearinghouse does not poll, does not focus-refetch, and holds the user's
   free perps margin.
6. **`["vault"]` invalidation on socket reconnect sweeps two contract reads that opted out.**
   `use-vault-socket.ts:231` invalidates the `["vault"]` prefix, which also matches
   `["vault","split-bps"]` (`staleTime: Infinity`, commented "read once") and
   `["vault","minStartStake"]`.

### Bundle and third-party

- `/portfolio` is the heaviest route in the app at **1877 kB** across 58 chunks, 332 kB above
  `/dashboard`, which renders the same component.
- `@polymarket/client` contributes **189.7 kB gzipped to `/portfolio` and to no other route**, pulled
  in by one barrel import at `dashboard-page.tsx:17` (`import { PredictionMobile } from
"@/features/prediction"`). `optimizePackageImports` cannot help, because it rewrites npm barrels and
  not ours. `embla-carousel-react` is fused into the same chunk and is legitimately needed, so the
  barrel has to be unpicked rather than the chunk dropped.
- `livekit-client` contributes **130.7 kB gzipped to all 58 session routes**, because
  `lib/broadcast/broadcast.ts:5` imports `ScreenSharePresets` and `Track` as values. The component
  layer above it is careful to use type-only imports; that care is defeated one level down.
- **119 kB of `woff2` is preloaded on `/portfolio` and never rendered there**: Inter, Noto Sans and
  Roboto are instantiated in the root `app/layout.tsx` but scoped to the sportsbook and chess.
- Microsoft Clarity injects a remote session-replay script from `clarity.ms` on **every** route,
  including the landing and privacy pages. Its request volume is unmeasurable from this repo and
  invisible to every caching layer the app controls.
- `lib/rates.ts:18,27` fetches two external endpoints directly from the browser on a 10-minute
  interval, with no `app/api/` proxy and no validation, violating the proxy-boundary rule. It also
  duplicates the upstreams and failover order of `/api/fx`.
- A service worker exists at `public/sw.js`, but it is Web Push only: two listeners, no `fetch`
  interception, no caching. It is registered only after an explicit permission grant in the earn
  notification flow, so it contributes nothing on `/portfolio` for users who have not opted in.

### Prior art that must not be undone or re-litigated

- `ADR-2026-09-07-privy-identity-token-without-users-me.md` (Accepted) solved the Privy `/users/me`
  storm. It is fetched **zero** times per load in a healthy session. Do not touch this.
- `8ae14c7` and `558d915` built the visibility gating described above. Extend it; do not replace it.
- `ADR-2026-09-07-user-management-and-query-deduplication.md` settled the 60-second default
  `staleTime`. This ADR does not propose changing that number.

That last ADR is **Status: Proposed, awaiting approval**, yet `lib/query-keys.ts` and
`hooks/use-user.ts` were both built. That is a pre-existing Directive 2 violation, disclosed here for
the record. It is not created by this work, and it needs a separate decision. Note also that its
factory is adopted at only 5 of about 220 call sites and its entire `dextopus` branch is dead code.

## Decision

Eight workstreams, ordered by value over risk. Each is independently shippable and independently
revertible. W1 through W3 deliver the user-visible result; W4 and W5 are correctness; W6 through W8
are payload.

```
                   ┌───────────────────────────────────────────┐
   RELOAD COST     │ W1  persistence: what survives a reload   │  18 → target 8
                   │     gcTime, prefixes, quota retry         │
                   └───────────────────────────────────────────┘
                   ┌───────────────────────────────────────────┐
   IDLE COST       │ W2  re-attach visibility gating (f36d510) │  9.3/min → target 4
                   │ W3  gate polls on their own sockets       │
                   └───────────────────────────────────────────┘
                   ┌───────────────────────────────────────────┐
   SAFETY          │ W4  Cache-Control on 34 handlers          │  10 money routes
                   │ W5  cache-key correctness defects         │  deposit address
                   └───────────────────────────────────────────┘
                   ┌───────────────────────────────────────────┐
   PAYLOAD         │ W6  images and /public                    │  ~60 MB dead
                   │ W7  static asset headers                  │  RTT per asset
                   │ W8  bundle: barrels and fonts             │  ~440 kB
                   └───────────────────────────────────────────┘
```

### W1. Make the persisted cache actually persist, and stop it refetching what it just restored

1. Set `gcTime: PERSISTED_GC_TIME` on the four persisted families that inherit the 5-minute default:
   `portfolio`, `prices`, `fx-rates`, and the five `meme` keys. This aligns the code with the
   contract already written at `lib/query-persist.ts:50`.
2. Add `retry: removeOldestQuery` to `createSyncStoragePersister` in `app/providers.tsx:26`, so a
   quota overflow degrades gracefully instead of silently freezing the cache.
3. Add to `PERSISTED_PREFIXES` the six families that currently start cold on every reload:
   `kash`, `activity`, `perps-balance`, `market-tokens`, and resolve the two open questions
   (`withdraw-destinations`, which already takes `PERSISTED_GC_TIME` but is not in the set; and the
   prediction asymmetry where the combo family is persisted while the structurally identical sports
   and discovery families are not).
4. Exclude `["meme","preview"]` from persistence. It is a live swap quote with a 4-second
   `staleTime`, currently written to `localStorage` for up to 24 hours by the `"meme"` prefix match.
5. Set `refetchOnMount: false` on the families whose data does not move within a reload: the deposit
   catalogs already do this correctly and are the model. Do **not** apply it to `portfolio`,
   `prices` or any balance.

Point 5 is the one that reduces the request count on reload rather than merely the skeleton count.
It is deliberately narrow, and it is the item most in need of maintainer scrutiny.

**Non-goal:** the global 60-second `staleTime` is not changed.

### W2. Re-attach the visibility gating that `f36d510` orphaned

1. Wrap the standalone service routes (`/rwa`, `/meme`, and the discovery rows on `/portfolio`) in
   `SectionVisibility`, so the existing `useSectionActive()` calls resolve against a real provider
   instead of the default `true`.
2. Move `useMemeSpots()` from the `dashboard-page.tsx:167` page body into the gated subtree, closing
   the trap `558d915` fixed one level lower.
3. Fix the dead `useSpotMarkets` gate: `token-moves-section.tsx:14` must accept and honour the same
   `enabled` argument that `dashboard-page.tsx:161` passes.
4. Align `use-global-balance.ts` from 20s to 60s. It feeds one addend of a total whose own source
   polls at 60s and is cached upstream for 75s. This is the largest single idle win and the lowest
   risk one.
5. Delete the dead `MemeSection` component, or restore it to use.

### W3. Gate polls on the sockets that already carry their data

Apply the `use-vault-feeds.ts:45` reference pattern to the four places that should follow it and do
not: chess chat and comments, prediction detail (thread the existing `healthy` flag),
`use-vault-feeds.ts:59,66` with `use-vault-lobby.ts:84`, and draughts settled boards.

Also: add exponential backoff to `use-vault-socket.ts:247` by copying `live-socket.ts:147`; add a
`close()` on last unsubscribe to `hyperliquid-ws-client.ts`; and bound the two `for(;;)` loops in
`use-meme-trade.ts` with a deadline, an attempt cap and unmount cancellation.

**Non-goal:** the six settlement polls stay exactly as they are. `use-deposit.ts:538`,
`use-ramping.ts:205`, `use-offramp.ts:163`, `use-pouch-kyc.ts:85`, `use-pouch-onramp.ts:98` and
`use-sportsbook.ts:95` follow money the user has already committed, all six already self-terminate on
a terminal status, and `use-offramp.ts:158` notes the GET itself advances the payout server-side.
Gating these on visibility would strand a settlement the moment the user scrolls.

### W4. Give every route handler an explicit `Cache-Control`

Classify all 55 and set a directive on each. The ten user-private money handlers get
`private, no-store`, following the precedent `portfolio` and `activity` already set. Genuinely shared
handlers (`predictions`, `chart`, `ondo`, `vault`, the public prediction-combos branch) get
`public, s-maxage=N, stale-while-revalidate=M` sized to their volatility. Error and fallback branches
inherit the same directive as their success branch, closing the gap where `fx/route.ts:50` currently
drops the header on failover.

### W5. Fix the cache-key correctness defects

Add `settlementAddress` and `settlementAsset` to the `deposit-static` key and to
`lib/query-keys.ts:39`. Add an eligibility fingerprint to the `deposit-tokens` key. Lift a single
`useSquareProfile` hook to `hooks/` owning one key, one fetcher and one shape. Lift the Hyperliquid
clearinghouse read to `hooks/` so `use-global-balance` and `use-hyperliquid-markets` share a key
instead of issuing two authed requests for one number. Give `useHyperliquidClearinghouse` a refresh
path. Move `split-bps` and `minStartStake` out from under the `["vault"]` invalidation prefix.

Per Directive 3, each of these gets a failing test first.

### W6. Images

1. Delete `public/market-square/Card.svg` and `card-bg-clean.svg` (22 MB, unreferenced), the
   byte-identical duplicates (about 9 MB, md5-verified), and `public/fonts/` (dead, and its `.woff2`
   duplicates `app/fonts/`). Confirm with a human before deleting, since a reference arriving from an
   API payload would not appear in a literal grep.
2. Re-export `card-linked.svg` at a sane size. 11 MB for a 363 by 173 card is the largest single
   defect in the audit and no caching change touches it.
3. Add an `images` block: `remotePatterns` for the four verifiable hosts, `qualities` (required in
   Next 16), and an explicit `minimumCacheTTL`.
4. Extend the `token-logo` redirect-handler pattern to the other logo paths, so `next/image` can
   optimize images from hosts we cannot enumerate. Make `/api/token-logos` return route-relative URLs
   rather than raw upstream ones, so both paths cache identically.
5. Replace the deprecated `priority` prop at `arkball-section.tsx:60` and `sport-icon.tsx:60`.

**Non-goal:** migrating all 133 `<img>` tags to `next/image`. Most cannot migrate until step 4 exists,
and the 96 `eslint-disable` justifications are correct as written today.

### W7. Static asset headers

Add a path-scoped `async headers()`. Artwork directories get
`public, max-age=300, stale-while-revalidate=86400`. Large stable payloads (`public/film/*.mp4`,
`public/stockfish/*.wasm`) get a longer `max-age` with `stale-while-revalidate`. `public/sw.js` is
explicitly held at `max-age=0` and its rule is placed last, because the last matching rule wins.

**Non-goal:** `immutable` on anything under `/public`, and any rule touching `/_next/static`. Scope
rules to asset paths rather than a `/:path*` catch-all, since headers are evaluated before redirects
and a catch-all would decorate the three permanent redirects.

### W8. Bundle and third-party

Import `PredictionMobile` from its module path rather than the `@/features/prediction` barrel. Change
`lib/broadcast/broadcast.ts:5` to a type-only import and obtain `ScreenSharePresets` and `Track`
lazily. Move Inter, Noto Sans and Roboto out of the root layout into the routes that render them.
Proxy `lib/rates.ts` through `app/api/` or delete `useNgnRate` in favour of `useFx`. Remove the stale
Sentry secrets from `.env` and correct the stale `next.config.ts:63` comment.

Clarity is left alone pending a product decision; it is named here so the decision is conscious.

## Alternatives considered

**Add a caching service worker.** Rejected. `public/sw.js` already states the reason: a caching worker
on a live trading surface serves stale prices. It would also add a second, harder-to-invalidate cache
layer in front of money endpoints, and a stale worker can outlive several deploys.

**Set `immutable` on `/public` and be done.** Rejected. Analysed at length above: no cache buster
exists for hand-authored `src` strings, no file is content-hashed, and `immutable` cannot be
retracted. The measured cost today is one conditional round trip per asset, not a re-download, so the
upside is far smaller than the downside.

**Set a permissive `remotePatterns: ['**']` so every image can use `next/image`.** Rejected. The Next
16 docs warn against it explicitly, and two of our host sets are open by nature (provider-controlled
Polymarket artwork, user-supplied avatars). The redirect-handler route in W6 achieves the same result
without opening the optimizer to arbitrary origins.

**Raise the global `staleTime` from 60 seconds.** Rejected. It was settled by a prior ADR, and the
measured problem is not the default: it is the 79 sites that inherit it without meaning to and the
203 that inherit `gcTime` without meaning to.

**Turn off `refetchOnMount` globally.** Rejected as too blunt. It would silence stale balances across
the app. W1 point 5 applies it per family, only where the data provably does not move.

**Do nothing and rely on the existing persistence layer.** Rejected. It is exactly the current state,
and it produces the reported symptom: the skeleton disappears, the requests do not.

## Consequences

**Positive.** Reload cost should fall from 18 cold and 11 to 12 warm toward a target of about 8 warm.
Idle cost should fall from 9.3 requests per minute toward about 4. Ten money endpoints gain an
explicit private directive. Two cache-key defects that can bind a permanent deposit address to the
wrong destination are closed. About 60 MB of dead `/public` and about 440 kB of first-load bundle go
away.

**Negative and accepted.** Longer `gcTime` on four families increases the `localStorage` payload,
which is why the quota retry in W1 point 2 is not optional and ships in the same change.
`refetchOnMount: false` means a restored value can be shown briefly without a background refresh, so
it is confined to families whose data does not move within a reload. Visibility gating means a
scrolled-away section holds data one poll interval older than today. Path-scoped `stale-while-revalidate`
means redeployed artwork can be up to five minutes stale.

**Risks.** The largest is over-caching something user-specific. This is mitigated by making
`private, no-store` the default for anything reading a session, and by having a second reviewer check
the W4 classification table before merge. The second risk is that W1 point 5 hides a genuinely
changed value; mitigated by keeping every balance and price out of it.

**Explicitly unresolved, needing a maintainer decision.** Whether the eager LiveKit camera and
microphone publish at `live-video-player.tsx:144` is intended product behaviour. It auto-publishes
1080p30 video and audio on mount for the player seat in a video-enabled chess match, with no click,
and the "Join video" button is unreachable on the happy path. This is a consent question rather than
a caching one and no change is proposed here.

## Verification plan

1. **Red first, per Directive 3.** Every defect in W5, and the persistence contract in W1, gets a
   failing test before its fix. The `gcTime` contract is testable: assert that a persisted family's
   `gcTime` is `PERSISTED_GC_TIME`, which fails today for four families.
2. **Request-count regression test.** Assert the mounted-hook count for `/portfolio` so a future
   commit that re-orphans a gate fails CI rather than being discovered by a user. `f36d510` would have
   been caught by this.
3. **Measure before and after in a browser**, not statically. Record cold reload, warm reload, and a
   five-minute idle window on `/portfolio`, and compare against the 18 / 11-12 / 9.3 baselines in this
   document.
4. **`curl -I` against a Vercel preview** for `/market/kash-coin.png`, `/_next/static/...`, and a
   representative API route. This settles the one question the audit could not answer from the repo:
   whether Vercel's edge preserves or replaces the Next-level `public, max-age=0`. That number decides
   how much of W7 is worth doing, so it happens **before** W7 is sized.
5. **Verify no user-private response is shared-cacheable** by requesting each of the ten W4 handlers
   as two different users against a preview and confirming the directive on every response.
6. **`./scripts/preflight.sh` green** across all five gates, per Directive 5.
7. **Open the Vercel preview and exercise the money flows by hand**: a deposit, a withdrawal, a Kash
   convert, and a trade. Reading a diff is not reviewing a caching change.

## Scope note

This ADR covers eight workstreams and a large surface. It is written as one document because the
findings are interdependent: W1 without W2 leaves the idle cost, and W2 without W1 leaves the reload
cost. The maintainer may approve workstreams individually. If a smaller first step is preferred, W1,
W2 and W4 deliver most of the user-visible result and all of the safety benefit, and W6 point 2 (the
11 MB SVG) is a one-line win independent of everything else.
