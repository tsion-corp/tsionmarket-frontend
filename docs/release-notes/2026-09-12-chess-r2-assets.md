---
date: 2026-09-12
feature: Lazy-load heavy chess assets from Cloudflare R2
scope: casino/chess
scenario-impact: updated
---

# Lazy-load heavy chess assets from Cloudflare R2

## What changed

Heavy Lichess media, themes, piece sets, voice models, and Stockfish binary
artifacts now live under the immutable `chess-assets/v1` R2 namespace. Runtime
asset resolution points those files at the public R2 origin while retaining
same-origin JavaScript worker loaders required by browser worker security.

The repository keeps the compiled chess modules, core styles, worker loaders,
and small integration assets needed to start the application. Compatibility
redirects and fallback rewrites preserve existing Lichess asset paths during
the migration.

## Size impact

The published R2 inventory contains 6,254 files totaling 115.42 MiB. The
remaining local chess runtime assets total 8.94 MiB across
`public/compiled`, `public/css`, `public/chess`, and `public/npm`.

## Operations

`pnpm chess:assets:publish` uploads changed objects with immutable cache
headers. `pnpm chess:assets:remote:verify` checks the complete R2 inventory and
representative public downloads. Upload credentials are server-side tooling
variables only; the application receives only the public asset base URL.

`NEXT_PUBLIC_CHESS_ASSET_BASE_URL` can select another origin serving the same
versioned contract. A complete local rollback reverts this migration and
restores the deleted files. The local required-asset verifier and tracked R2
summary prevent a build from shipping with an incomplete asset contract.

## Verified

- R2 inventory verification: 6,254 objects and 22 representative public files.
- Targeted Vitest coverage: 21 tests for asset resolution, sound paths,
  publisher behavior, and Next.js routing.
- TypeScript typecheck passed.
- Next.js 16 Turbopack production build passed, including all 91 routes.
