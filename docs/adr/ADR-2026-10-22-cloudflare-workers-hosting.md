# ADR: Host the market frontend on Cloudflare Workers (Free plan) instead of Vercel

- **Status:** Accepted 2026-10-22 (revised the same day for the Free plan)
- **Deciders:** the maintainer
- **Delivery:** staging Worker first, measured on `workers.dev`, then production; Vercel stays live until cutover is proven
- **Depends on:** [ADR-2026-10-22-remove-square-shine-mixpanel-watchtower](./ADR-2026-10-22-remove-square-shine-mixpanel-watchtower.md), shipped first
- **Out of scope:** the new market domain and the tsionark.com redirect (a later ADR)

## Context

The team is moving the market frontend from Vercel to a Cloudflare team
account (Tsionmarket, subdomain `tsionmarket.workers.dev`) to cut hosting
cost. There is no budget for Workers Paid ($5 a month), so the target is the
**Workers Free plan**.

| Vercel project | Branch    | Serves               |
| -------------- | --------- | -------------------- |
| `wsws`         | `main`    | www.tsionark.com     |
| `wsws-test`    | `staging` | wsws-test.vercel.app |

The domain stays **tsionark.com** for this migration. Passkeys are bound to
the domain they were created on (we never set the wallet kit's `rpId`, so it
is the page's host); a domain change is handled separately.

### Free plan limits that matter

| Limit                   | Free                      | Our Vercel numbers (wsws, last 30 days) |
| ----------------------- | ------------------------- | --------------------------------------- |
| Worker requests         | 100,000 a day (UTC)       | 3.6M invocations, about 120,000 a day   |
| CPU per request         | 10 ms (brief overruns OK) | 70 ms P75 active CPU                    |
| Static asset requests   | Free, unlimited           |                                         |
| Worker size             | 64 MiB uncompressed       | 53.7 MB in the trial build              |
| Memory                  | 128 MB                    |                                         |
| Subrequests per request | 50                        |                                         |
| Env vars per Worker     | 64                        | about 60 before removals                |
| Cron Triggers (account) | 5                         | none needed after the removal ADR       |

Over the request limit, visitors get Cloudflare **error 1027** until midnight
UTC. Consistently over the CPU limit, they get **error 1102**. Waiting on
`fetch` does not count as CPU; rendering, `proxy.ts` and parsing do.
Cloudflare's docs put server-side rendering at "typically 10-20 ms".

**The Free plan is not proven to fit.** The removal ADR cuts requests
(analytics relay, error tunnel, heartbeat, Square, broadcast) and per-request
CPU (the Sentry server SDK). Vercel's CPU figure is measured differently from
Cloudflare's. So this ADR makes a measured go/no-go gate (section 6) the
deciding step, before any DNS change.

### How Next.js runs on Cloudflare

The OpenNext adapter (`@opennextjs/cloudflare` 1.20.13, supports every
Next.js 16 minor) turns the `next build` output into one Worker plus static
assets. Workers Builds (Cloudflare's CI, included on Free) builds and deploys
on every push to a connected branch.

### Trial build (2026-10-22, staging @ `cc20704b`, throwaway worktree)

| Check                        | Result                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next build`                 | Passes unchanged.                                                                                                                                                                                                                                                   |
| OpenNext bundling            | **Failed** on 3 errors, one cause: the chess screens load Lichess scripts with `import(/* webpackIgnore: true */ "/compiled/lib.*.js")`; Turbopack inlines the constant and esbuild tries to resolve it on the server. Building the URL at runtime fixes all three. |
| Worker size                  | 53.7 MB uncompressed, 11.5 MB gzip, against 64 MiB.                                                                                                                                                                                                                 |
| Pages on the Workers runtime | `/`, `/privacy`, `/casino` 200; `/dashboard` redirects through `proxy.ts` as on Vercel.                                                                                                                                                                             |
| API routes                   | `/api/fx`, `/api/prices` 200; signed-out POST to `/api/migration/legacy-account` 401 as expected; `/api/market-tokens` 502 only for lack of a CoinGecko key.                                                                                                        |
| File reads                   | Same behavior as Vercel (the CSV is gitignored on both; the chess-coach asset route is development-only).                                                                                                                                                           |

## Decision

### 1. Two Workers, mirroring today's two Vercel projects

```
GitHub tsion-corp/tsionmarket-frontend
   │
   ├── push to main ────► Workers Builds ──► Worker "tsionmarket"         ──► www.tsionark.com (at cutover)
   │
   └── push to staging ─► Workers Builds ──► Worker "tsionmarket-staging" ──► tsionmarket-staging.tsionmarket.workers.dev
```

One `wrangler.jsonc`: production at the top level, staging as `env.staging`.

- Build command: `pnpm build:cloudflare`
- Deploy command: `pnpm opennextjs-cloudflare deploy` (production),
  `pnpm opennextjs-cloudflare deploy --env staging` (staging)

### 2. Files added

| File                  | Purpose                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `wrangler.jsonc`      | Worker names, `nodejs_compat`, compatibility date, assets, `WORKER_SELF_REFERENCE`, `env.staging`. |
| `open-next.config.ts` | Minimal config: no incremental cache store (see section 3).                                        |
| `.dev.vars.example`   | `NEXTJS_ENV=development` for `wrangler dev`. `.dev.vars` is gitignored.                            |

No R2 bucket, Durable Object, cron or custom worker entry. `vercel.json` and
`.vercel/` stay until Vercel is switched off.

### 3. What each Vercel feature becomes

| Vercel today                                | Cloudflare Free                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next: { revalidate }` on about ten proxies | **No shared data cache.** R2 needs a checkout with a card; KV allows only 1,000 writes a day and OpenNext advises against it. Each proxy request calls its upstream. Waiting on the upstream costs no CPU, but upstream load rises; measured at the gate. A cache store can be added later. |
| `s-maxage` on API responses                 | Not cached by Cloudflare's CDN by default. A free Cache Rule on the public GET routes (prices, fx, chart) can cache them at the edge, so repeat hits never reach the Worker or count as requests. Configured during the gate if needed.                                                     |
| `maxDuration` 30 to 60 s                    | Not applicable; Workers limit CPU, not wall time.                                                                                                                                                                                                                                           |
| `next/image` optimization                   | No `IMAGES` binding; images are served as uploaded.                                                                                                                                                                                                                                         |
| Hourly heartbeat cron                       | Removed by the removal ADR.                                                                                                                                                                                                                                                                 |
| Vercel PR previews                          | Workers Builds preview builds on non-production branches. Each counts against the shared 100k/day.                                                                                                                                                                                          |

### 4. Environment variables

- **Build variables** (Workers Builds settings): every `NEXT_PUBLIC_*` and
  `R2_PUBLIC_URL` (read by `next.config.ts`).
- **Runtime secrets** (Worker settings, max 64): every server-only key,
  read through `process.env` as today.
- Not migrated: everything the removal ADR deletes (Square, Mixpanel,
  Watchtower, `CRON_SECRET`).

`scripts/cloudflare/migrate-env.sh` pulls one Vercel environment with
`vercel env pull` into a temporary file, **stops if any value is empty**
(Vercel never returns values marked Sensitive), uploads the runtime secrets
with `wrangler secret bulk`, prints the build-variable names for the
dashboard, and deletes the temporary file. The maintainer runs it; values
never pass through the agent or git.

### 5. Code changes

1. The three chess `import()` calls build their URL at runtime.
2. `package.json`: `@opennextjs/cloudflare` and `wrangler` as dev
   dependencies; scripts `build:cloudflare`, `preview:cloudflare`,
   `deploy:cloudflare`.
3. Whatever the gate in section 6 shows is needed, each change listed and
   approved before it is made.

### 6. Go/no-go gate on the staging Worker

After the removal ADR ships, the staging Worker runs on `workers.dev` for at
least 3 days of normal team use. Cloudflare's dashboard
(Workers > Metrics) gives the numbers.

| Measure                                        | Go if                                               |
| ---------------------------------------------- | --------------------------------------------------- |
| Error 1102 (`exceededCpu`) invocations         | Effectively none                                    |
| CPU time per request                           | P50 well under 10 ms; P99 overruns rare             |
| Requests per active user per day, from staging | Projected production total under about 70,000 a day |

Production's request total is projected by dividing staging's daily requests
by its daily active users and multiplying by production's daily active users.

If CPU fails on specific routes, the fixes in order are: validate fewer
fields in the heavy proxies, move pages that need no user data to static
generation, and lower `proxy.ts` work. If requests fail, the fixes are: Cache
Rules on public GET routes, slower polling on the least important of the
roughly 130 `refetchInterval`s, and pausing polling in hidden tabs. If the
gate still fails, the options go back to the maintainer: Workers Paid, or a
static frontend with the API routes moved to the backend gateway.

### 7. Cutover for www.tsionark.com (only after the gate passes)

1. Add tsionark.com to Cloudflare (Free); it imports the existing records.
2. Check the import against the live records: Zoho MX (3), Mailgun SPF, Brevo
   and Zoho TXT, the `uptime.` CNAME to Vercel. All DNS only (grey cloud).
3. Switch the nameservers at Namecheap. Nothing visible changes yet.
4. Attach `www.tsionark.com` and `tsionark.com` to `tsionmarket` as Custom
   Domains. This is the cutover.
5. Rollback: remove the Custom Domains and restore the Vercel records.

## Consequences

- Hosting cost falls to zero, if the gate passes.
- A hard daily request ceiling: a traffic spike past 100,000 shows an error
  page until midnight UTC. Growth that crosses it forces the Paid decision.
  The dashboard's daily request count should be watched weekly.
- No shared data cache: more upstream calls than on Vercel.
- Images are no longer resized or converted.
- Staging, previews and production share the account's 100k/day.
- About 10 MiB of Worker size headroom, more after the removals.

## Plan of work (after approval of both ADRs)

1. Ship the removal ADR (staging, then main).
2. Branch `chore/cloudflare-migration` off `staging`: config, import fixes,
   scripts. Preflight.
3. Maintainer: run `migrate-env.sh` for staging, connect `staging` in Workers
   Builds.
4. Run the gate (section 6) on staging. Report the numbers; decide.
5. If go: ship to `main`, env script for production, connect `main`, test on
   `tsionmarket.tsionmarket.workers.dev`, then cutover (section 7). Vercel
   kept for a week, then switched off.

## References

- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- OpenNext for Cloudflare: https://opennext.js.org/cloudflare
- OpenNext caching: https://opennext.js.org/cloudflare/caching
- Environment variables: https://opennext.js.org/cloudflare/howtos/env-vars
- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
- Cache Rules: https://developers.cloudflare.com/cache/how-to/cache-rules/
- Custom Domains: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
