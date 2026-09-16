# ADR: Serve Heavy Chess Static Assets From Cloudflare R2

- Status: Accepted
- Date: 2026-09-12
- Owners: Frontend platform and Ark Chess
- Target branch: `revert-463-revert-460-feat/chess-lichess-staging-20260912`

## Context

The restored Ark Chess frontend carries a large Lichess-derived static payload in Git. The largest groups are the Vosk speech model, Stockfish engines, board and site images, optional sound packs, flair, and FIDE media. These files are immutable runtime artifacts rather than application source. Keeping them in the frontend repository increases clone size, CI transfer time, deployment size, and the chance that an asset-only change causes an unnecessary application deployment.

The browser currently reaches these files through three path shapes:

```text
/npm/*
/chess/lichess/*
/{images,sound,piece,font,flair,...}/*
```

The last shape exists because upstream Lichess CSS and compiled modules construct root-relative URLs. Any migration must preserve all three shapes without changing chess behavior, including Stockfish, voice input, pieces, sounds, themes, puzzle pages, and server-rendered chess iframes.

R2 write credentials are deployment tooling secrets. They must never enter client bundles, tracked files, logs, or pull-request descriptions. The R2 public URL is not a secret.

## Decision

Store heavy chess artifacts in the existing Cloudflare R2 bucket under a versioned, immutable namespace:

```text
chess-assets/v1/<path-relative-to-public>
```

Examples:

```text
chess-assets/v1/npm/stockfish-web/sf_18.wasm
chess-assets/v1/chess/lichess/lifat/vosk/model-en-us-0.15.tar.gz
chess-assets/v1/chess/lichess/images/board/wood.jpg
```

Keep application source, generated Ark integration modules, required Lichess JavaScript and CSS, same-origin JavaScript worker loaders, and a minimal local fallback set in Git. Move the large engine binaries, voice-model binaries, images, optional themes, optional sounds, flair, and media payloads to R2.

The public R2 origin is configured with `NEXT_PUBLIC_CHESS_ASSET_BASE_URL`. It contains only the public base URL and is safe for browser use. Upload tooling uses `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET` from an ignored local environment file or CI secret store.

### Runtime Routing

Use two routing mechanisms because the callers have different constraints:

1. TypeScript asset helpers produce direct R2 URLs for programmatically loaded engines, Vosk files, sounds, pieces, and images. This avoids proxying large responses through Next.js.
2. Next.js fallback rewrites preserve root-relative URLs embedded in upstream CSS. Local application files win first; only missing Lichess aliases are fetched from R2. This prevents `/images/*` and similar shared application paths from being captured by chess.
3. Fully migrated namespaced paths such as `/chess/lichess/lifat/*` use temporary redirects to immutable R2 objects. `/npm/*` uses a fallback rewrite so local JavaScript worker loaders win while their removed WASM and model dependencies transparently fall through to R2.

```text
Chess component
    |
    +-- asset helper ----------------------> R2 public origin
    |
    +-- local /npm worker loader
    |      +-- missing WASM/model -> fallback rewrite -> R2 public origin
    |
    +-- CSS root alias -> fallback rewrite -> R2 public origin
```

### Upload And Integrity

Add a Node upload command using the S3-compatible R2 API. The command will:

- load secrets only from process environment or ignored `.env` files;
- upload with bounded concurrency;
- set the correct content type;
- set `Cache-Control: public, max-age=31536000, immutable`;
- attach a SHA-256 checksum as object metadata;
- skip objects whose remote checksum already matches;
- publish a full manifest containing each object key, byte size, and checksum;
- emit a compact tracked summary containing manifest integrity and per-root totals;
- verify every public object before local artifacts are removed.

The R2 bucket must allow cross-origin `GET` and `HEAD` requests for the application origins. WASM files must be served as `application/wasm`; JavaScript workers must be served as JavaScript; compressed speech models must retain their archive content type.

### Failure And Rollback

The migration is staged. Upload and public verification happen before deletion. The production build verifies the tracked manifest and required local integration files. If R2 verification fails, no local asset is removed.

The public base URL can be pointed at another origin that serves the same immutable `chess-assets/v1` contract. A full local rollback restores the deleted files and removes the external routes by reverting the migration release. Existing `v1` objects are not overwritten with different bytes.

## Alternatives Considered

### Keep All Assets In Git

Rejected because it preserves the current repository and deployment weight and makes static media part of every frontend release.

### Proxy Every Asset Through Next.js

Rejected for the main path because it consumes application bandwidth and adds latency for large WASM and model downloads. A fallback rewrite remains necessary for unmodified root-relative CSS URLs.

### Store Assets On IPFS

Rejected for this release because browser delivery depends on gateway availability and cache behavior, MIME configuration is less direct, and immutable R2 object keys already provide deterministic versioning.

### Upload Assets Without A Versioned Prefix

Rejected because in-place replacement can produce mixed application and asset releases in browser caches.

## Consequences

### Positive

- The chess application source remains small and reviewable.
- CI and deployments stop transferring large immutable assets.
- Heavy downloads come from the storage edge and are cached for one year.
- Engine, voice, and visual behavior remain compatible with existing URL shapes.
- A manifest makes the external dependency auditable.

### Negative

- Chess now depends on R2 availability for optional media and heavy runtimes.
- R2 CORS and content types become deployment requirements.
- Root-relative URLs in upstream compiled CSS still need a compatibility route.
- Asset publication becomes a separate release step when upstream assets change.

## Security

- Never commit or expose R2 write credentials through `NEXT_PUBLIC_*` variables.
- Only the public read URL is available to browser code.
- CI credentials, if configured, must be scoped to the single bucket.
- The credentials supplied during setup must be rotated after migration because they were shared outside the secret manager.

## Verification

- Unit-test local, direct-CDN, and root-alias URL resolution.
- Verify every manifest object with a public `HEAD` request and sampled `GET` requests.
- Test Stockfish startup, level-eight play, Vosk model download, speech worker startup, sounds, piece promotion, puzzles, lobby, game round, analysis, and spectator pages.
- Test with an empty browser cache and with R2 unavailable to confirm explicit failure states.
- Run `scripts/preflight.sh` before delivery.

## Acceptance Criteria

- No R2 secret is tracked or present in a client bundle.
- The tracked chess static payload is reduced to the small integration runtime, with a target below 10 MB where compatibility permits.
- All manifest objects are publicly readable with correct MIME and cache headers.
- Stockfish, Vosk, pieces, sounds, themes, and server-rendered chess pages work without refreshes or 404 responses.
- A clean CI checkout passes asset verification and the production build without the removed local files.
