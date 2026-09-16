# Chess R2 Asset Migration Plan

## Objective

Move immutable, heavy Ark Chess runtime assets from the frontend repository to Cloudflare R2 while preserving all current Lichess URL contracts and keeping credentials out of Git and browser bundles.

## Scope

- Publish the Vosk model and worker, Stockfish engines, Lichess media, optional sounds, pieces, themes, flair, and FIDE assets under `chess-assets/v1/`.
- Keep application source, the small compiled CSS and JavaScript integration runtime, and same-origin JavaScript worker loaders local.
- Route programmatic asset loads directly to R2.
- Preserve root-relative paths embedded in upstream Lichess CSS through compatibility routes.
- Verify remote objects before removing local files.
- Make clean CI builds validate the remote manifest instead of requiring removed assets.

## Components

### Asset Publisher

`scripts/chess-r2-assets.mjs` owns upload and verification. It reads write credentials from environment variables, walks configured local roots, applies MIME and immutable cache metadata, uploads with bounded concurrency, and writes a deterministic manifest to R2.

### Asset Manifest

The remote `chess-assets/v1/manifest.json` records every object key, byte size, content type, and SHA-256 checksum. The tracked `config/chess-assets-r2.json` records its checksum, required objects, and per-root totals without adding a large generated manifest to the application bundle. Runtime code does not need credentials or bucket API access.

### Runtime Resolver

`features/casino/lib/chess/lichess-assets.ts` resolves heavy programmatic paths against `NEXT_PUBLIC_CHESS_ASSET_BASE_URL`. Local compiled CSS, JavaScript, and worker loaders continue using same-origin paths.

### Compatibility Routing

`next.config.ts` redirects fully migrated namespaced paths to R2 and retains fallback handling for root-relative paths that can overlap non-chess application assets.

### Build Verification

`scripts/verify-chess-assets.mjs` verifies required local integration files and the manifest contract. Remote network verification is a separate explicit command so production builds remain deterministic and do not depend on an external request during compilation.

## Test Strategy

1. Extend the asset resolver tests first so they fail until CDN behavior is implemented.
2. Unit-test path normalization and local-versus-remote classification.
3. Unit-test manifest validation and configured migration roots.
4. Run targeted Vitest tests after each production edit.
5. Upload assets, verify object metadata, then remove verified local copies.
6. Run the repository preflight dispatcher.
7. Smoke-test puzzle, lobby, friend challenge, computer game, round, review, spectator, Stockfish, voice, sounds, and promotion paths.

## Rollout

1. Configure ignored local credentials and a public asset base URL.
2. Upload `v1` objects without deleting local assets.
3. Verify public reads and MIME types.
4. Enable R2 routing and verify against the still-present local fallback.
5. Remove only files present in the verified manifest.
6. Deploy the frontend with `NEXT_PUBLIC_CHESS_ASSET_BASE_URL` configured.
7. Keep `v1` immutable; publish future changes under a new version.

## Rollback

Restore the removed files from the migration commit and disable the external routes, or point the public base URL to the last verified immutable version. No database or API rollback is required.
