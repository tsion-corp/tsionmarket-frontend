---
date: 2026-10-23
feature: Cloudflare Workers build and deploy config
scope: chore
scenario-impact: none
---

# Cloudflare Workers config

Decided in [ADR-2026-10-22-cloudflare-workers-hosting](../adr/ADR-2026-10-22-cloudflare-workers-hosting.md).
Nothing changes for users: Vercel keeps serving www.tsionark.com. This lets
the same code also build and run as a Cloudflare Worker, so the staging Worker
can be measured against the Free plan before any switch.

## What changed

- **`wrangler.jsonc`:**
  - Worker `tsionmarket` (production, branch `main`) and `env.staging`, which deploys as `tsionmarket-staging` (branch `staging`).
  - Workers Logs is on, for the go/no-go numbers.
  - No R2, Durable Object, cron or image binding.
- **`open-next.config.ts`:** no incremental cache store, so `fetch()` revalidation goes to the upstream each time.
- **Scripts:**
  - `pnpm build:cloudflare` builds the Worker.
  - `pnpm preview:cloudflare` builds and serves it locally in the Workers runtime.
  - `pnpm deploy:cloudflare` builds and deploys it.
- **New dev dependencies:** `@opennextjs/cloudflare` 1.20.13 and `wrangler` 4.152.0.
- **Chess:** three Lichess script imports (`lichess-analysis.tsx`, `lichess-embed.tsx`) now build their URL at runtime, so the Worker bundler does not try to resolve them on the server. They behave the same in the browser.
- **`scripts/cloudflare/migrate-env.sh`:**
  - Copies a Vercel project's variables to its Worker:
    - server-only ones become Worker secrets;
    - `NEXT_PUBLIC_*` and `R2_PUBLIC_URL` are printed as build variables.
  - Only variables the code reads are copied.
  - It stops without uploading if any value is empty, because Vercel hides Sensitive values.
- **Ignores:** `.open-next/`, `.wrangler/` and `.dev.vars` are ignored by git, lint, format, typecheck and tests. `.dev.vars.example` documents local preview.

## Measured

| Check                      | Result                                                   |
| -------------------------- | -------------------------------------------------------- |
| `pnpm build:cloudflare`    | Passes                                                   |
| Worker size (uncompressed) | 40.8 MB of 64 MiB (53.7 MB before the removals)          |
| Static asset files         | 1,389 of 20,000                                          |
| Local Workers runtime      | Pages and `/api/fx`, `/api/prices` 200; `/dashboard` 307 |
