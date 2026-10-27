# Plan: Cloudflare Workers config (Free plan)

- **ADR:** [ADR-2026-10-22-cloudflare-workers-hosting](../adr/ADR-2026-10-22-cloudflare-workers-hosting.md) (Accepted 2026-10-22)
- **Branch:** `chore/cloudflare-migration`, from `staging` @ `17c79b0a` (after the Square, Shine and analytics removal)

## Code (this PR)

1. `wrangler.jsonc`: Worker `tsionmarket`, `env.staging` for `tsionmarket-staging`, `nodejs_compat`, assets, `WORKER_SELF_REFERENCE` per environment, Workers Logs on.
2. `open-next.config.ts` with no cache store; `.dev.vars.example`.
3. The three chess `import()` calls build their URL at runtime.
4. `@opennextjs/cloudflare` and `wrangler` pinned as dev dependencies; `build:cloudflare`, `preview:cloudflare`, `deploy:cloudflare` scripts.
5. `.open-next/`, `.wrangler/`, `.dev.vars` ignored by git, ESLint, Prettier, TypeScript and Vitest.
6. `scripts/cloudflare/migrate-env.sh` (section 4 of the ADR).

**Tests:** no app behavior changes. Verified with `pnpm build:cloudflare`, a `wrangler deploy --dry-run` size check, and the built Worker served locally with `wrangler dev`. The env script was run against a fake env file with `pnpm` stubbed: empty-value stop, skip list, secret and build split, `--env staging` flag.

## Maintainer steps (after the PR merges to staging)

1. In Cloudflare: Workers & Pages > Create > Import a repository > `tsion-corp/tsionmarket-frontend`.
   - Worker name: `tsionmarket-staging`
   - Production branch: `staging`
   - Build command: `pnpm build:cloudflare`
   - Deploy command: `pnpm opennextjs-cloudflare deploy --env staging`
   - Turn off preview builds for other branches. They share the 100k requests a day.

   The first build fails without build variables; that is expected.

2. Locally: `vercel login`, `pnpm wrangler login`, then `scripts/cloudflare/migrate-env.sh staging`. Fill in any values it asks for and run it again with the file.
3. Paste the printed build variables, plus `PNPM_VERSION`, into the Worker's build settings. Retry the build.
4. Open `https://tsionmarket-staging.tsionmarket.workers.dev` and use it as the team's staging for 3 days. Then read Workers > Metrics for the go/no-go gate (ADR section 6).
