# Asset audit, `public/` tree, 2026-09-08

Status: investigation only. Nothing was deleted, moved, or re-encoded. Every row
below is a proposal for a human to approve.

Scope: all 465 files under `public/`, 98,895,722 bytes (94.31 MiB) at the time of
the scan.

## How reference status was established

A literal grep is not sufficient in this repo, and the audit found four separate
cases where it would have given the wrong answer. The method used was:

1. **md5 of every file** under `public/`, grouped to find byte-identical sets.
   Recomputed from scratch, not taken from the brief.
2. **Inverted index scan.** Every file under `app/`, `components/`, `features/`,
   `hooks/`, `lib/`, `messages/`, `config/`, `i18n/`, `scripts/`, `__tests__/`,
   `reference/`, `docs/`, the repo root config files, and every text asset inside
   `public/` itself (SVG, CSS, JS, JSON, HTML) was tokenised for anything shaped
   like a filename or a URL path. 2,087 files scanned. Asset paths were then
   matched against that index with word boundaries, so `stake-flame.svg` does not
   match inside `promo-stake-flame.svg`.
3. **Independent cross-check.** A second scan using a per-asset boundary regex
   over the same corpus was run separately. The two agree: 264 versus 268
   no-literal-hit files, the delta being four files whose extensions (`.md`,
   `.atlas`) only the second scan indexed.
4. **Template and concatenation search.** Every `${...}` interpolation and every
   `+` concatenation that lands on an asset extension was found and resolved to
   the set of files it can reach.

### Four traps a literal grep falls into, all found here

| Trap                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Substring collision          | `stake-flame.svg` appears inside `promo-stake-flame.svg`. A naive substring scan marks the dead file as live. Same for `icon-coins.svg` inside `balance-icon-coins.svg`, `topbar-icon-bell.svg` inside `/rollout/chrome/topbar-icon-bell.svg`, and `house-icon.png` inside `convo-house-icon.png`. Four dead files would have been kept and, worse, four live files could have been deleted if the survivor had been chosen wrongly. |
| Emscripten path rewrite      | `public/stockfish/stockfish-18-lite-single.wasm` (7,295,411 bytes) is named nowhere in the repo. `public/stockfish/stockfish-18-lite-single.js` builds it at runtime with `location.pathname.replace(/\.js$/i,".wasm")` and a `locateFile` hook. The `.js` is registered as a worker at `features/casino/hooks/use-chess-engine.ts:13`. Deleting the wasm on grep evidence would have broken the chess engine.                       |
| Array-index template         | `public/film/` (23 files, 15,184,204 bytes) is entirely built by `lib/landing/journey.ts:161-164`, `FILM[]` mapping `/film/w${i}-still.jpg`, `-amb.mp4`, `-transit.mp4` over `WAYPOINTS = 9`. Not one filename appears literally.                                                                                                                                                                                                    |
| Runtime data drives the path | `features/casino/lib/chess/puzzle.ts:39` builds `/chess/puzzle-themes/${theme}.svg` where `theme` comes from upstream puzzle data. All 69 files in that directory are reachable and none can be proven dead from the repo alone.                                                                                                                                                                                                     |

### Scan caveat

The extension list used for path tokenisation initially omitted `.js`. That made
`public/sw.js` look unreferenced. It is not: `hooks/use-push-notifications.ts:12`
holds `const SW_PATH = "/sw.js"` and registers it at line 80. Corrected in the
tables below. No other `.js` file under `public/` is affected.

### Tree is moving

Nine agents are writing to this tree concurrently. `public/rollout/` is still
untracked (`?? public/rollout/`) and `features/discovery/`, `public/market/` and
`app/promo-rail-preview/` changed state during the audit. **Re-run the
verification commands in the appendix immediately before acting on any row.**

---

## Summary of recoverable bytes

| Category                                          |  Files |          Bytes |       MiB |
| ------------------------------------------------- | -----: | -------------: | --------: |
| Tier 1: provably unreferenced, delete now         |     36 |     43,737,646 |     41.71 |
| Tier 2: dead twin of a live duplicate, delete now |     14 |        639,668 |      0.61 |
| **Delete subtotal**                               | **50** | **44,377,314** | **42.32** |
| Tier 3: re-encode, not delete (current size)      |      4 |     12,585,164 |     12.00 |
| Tier 4: unreferenced but needs owner confirmation |     69 |      3,691,245 |      3.52 |
| Tier 5: leave alone, runtime-constructed or live  |    346 |     38,241,999 |     36.47 |

`public/` after Tier 1 and Tier 2: **51.99 MiB**, down from 94.31 MiB. That is a
45% reduction from deletion alone, before any re-encoding.

Tier 3 is not counted as recovered because the files must be replaced, not
removed. Realistic additional saving from Tier 3 is estimated at 11.9 MiB (see
that section), which would bring `public/` to roughly 40 MiB.

---

## Tier 1: delete now, with confidence

Every file here has zero literal references, is not reachable by any template or
concatenation in the repo, carries no licence obligation, and is not a survivor
of a duplicate group. Where a file belongs to a duplicate group, **every** copy
in that group is also unreferenced, so nothing needs to survive.

### 1a. `public/market-square/`, the whole directory except one file

`public/market-square/` is 51.7 MiB. Exactly one file in it is referenced:
`card-linked.svg` at `features/square/components/square-promos.tsx:207`. Every
other file is dead.

The strongest evidence is that the loose PNGs are a **third** copy of art already
inlined in the SVG that ships. Decoding the six base64 payloads inside
`card-linked.svg` gives these md5s:

| Embedded image  | Pixels    | Decoded bytes | md5         | Identical to                                           |
| --------------- | --------- | ------------: | ----------- | ------------------------------------------------------ |
| `image0_1_4818` | 1200x1500 |     1,277,328 | `59f0f6bf…` | `avatar-1.png`, `card-avatar-1.png`                    |
| `image1_1_4818` | 1024x1024 |     1,544,919 | `281f41b1…` | `avatar-2.png`, `card-avatar-2.png`                    |
| `image2_1_4818` | 1024x1024 |     1,231,129 | `dcb037a1…` | `avatar-3.png`, `avatar-main.png`, `card-avatar-3.png` |
| `image3_1_4818` | 1024x1024 |     1,383,742 | `fff38be6…` | `avatar-4.png`, `card-avatar-4.png`                    |
| `image4_1_4818` | 1024x1024 |     1,260,825 | `82f2dfe4…` | `avatar-5.png`, `card-avatar-5.png`                    |
| `image5_1_4818` | 1024x1024 |     1,552,242 | `58be25b8…` | `house-icon.png`, `card-avatar-6.png`                  |

So all 14 loose avatar and icon PNGs are redundant against the SVG, and none of
them is referenced by any component.

`Card.svg` and `card-bg-clean.svg` are near-identical siblings of
`card-linked.svg`, each carrying the **same** 11,000,252 bytes of base64 payload.
Their only mention anywhere in the repo is prose inside
`docs/adr/ADR-2026-09-08-frontend-caching-and-request-reduction.md`. A mention in
a document is not a reference.

| Path                                            |      Bytes | Evidence                                                                                                                                                    |
| ----------------------------------------------- | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/market-square/Card.svg`                 | 11,151,692 | No code reference. Only mention is prose in an ADR. Same 6 payloads as `card-linked.svg`.                                                                   |
| `public/market-square/card-bg-clean.svg`        | 11,090,414 | No code reference. Only mention is prose in an ADR. Same 6 payloads.                                                                                        |
| `public/market-square/card-avatar-6.png`        |  1,552,242 | No reference. md5 `58be25b8…`, inlined in `card-linked.svg`.                                                                                                |
| `public/market-square/house-icon.png`           |  1,552,242 | No reference. The apparent hit in `features/discovery/components/conversation-row.tsx:319` is `convo-house-icon.png`, a different file in `public/market/`. |
| `public/market-square/card-avatar-2.png`        |  1,544,919 | No reference. Inlined.                                                                                                                                      |
| `public/market-square/avatar-2.png`             |  1,544,919 | No reference. The apparent discovery hit is `convo-avatar-2.png`.                                                                                           |
| `public/market-square/card-avatar-4.png`        |  1,383,742 | No reference. Inlined.                                                                                                                                      |
| `public/market-square/avatar-4.png`             |  1,383,742 | No reference.                                                                                                                                               |
| `public/market-square/card-avatar-1.png`        |  1,277,328 | No reference. Inlined.                                                                                                                                      |
| `public/market-square/avatar-1.png`             |  1,277,328 | No reference.                                                                                                                                               |
| `public/market-square/card-avatar-5.png`        |  1,260,825 | No reference. Inlined.                                                                                                                                      |
| `public/market-square/avatar-5.png`             |  1,260,825 | No reference.                                                                                                                                               |
| `public/market-square/card-avatar-3.png`        |  1,231,129 | No reference. Inlined.                                                                                                                                      |
| `public/market-square/avatar-3.png`             |  1,231,129 | No reference.                                                                                                                                               |
| `public/market-square/avatar-main.png`          |  1,231,129 | No reference. Third copy of the same bytes.                                                                                                                 |
| `public/market-square/conversation-card.png`    |    663,492 | No reference.                                                                                                                                               |
| `public/market-square/audience.png`             |    479,057 | No reference.                                                                                                                                               |
| `public/market-square/conversation-card-bg.png` |    320,087 | No reference.                                                                                                                                               |
| `public/market-square/avatars-layer@3x.png`     |    195,414 | No reference.                                                                                                                                               |
| `public/market-square/stardust-field.svg`       |     80,125 | No reference. The card's stardust is drawn inside `card-linked.svg`.                                                                                        |
| `public/market-square/center-avatar@3x.png`     |     46,899 | No reference.                                                                                                                                               |
| `public/market-square/sparkle-field.svg`        |     30,933 | No reference.                                                                                                                                               |
| `public/market-square/wave-left.svg`            |      3,226 | No reference.                                                                                                                                               |
| `public/market-square/mic-bubble-2.svg`         |      2,232 | No reference.                                                                                                                                               |
| `public/market-square/mic-bubble.svg`           |      2,229 | No reference.                                                                                                                                               |
| `public/market-square/bubble-mark.svg`          |      2,086 | No reference.                                                                                                                                               |
| `public/market-square/wordmark-icon.svg`        |      2,072 | No reference.                                                                                                                                               |
| `public/market-square/chess-icon.svg`           |      1,396 | No reference.                                                                                                                                               |
| `public/market-square/volume-icon.svg`          |      1,299 | No reference.                                                                                                                                               |
| `public/market-square/two-hearts.svg`           |        884 | No reference.                                                                                                                                               |

Subtotal: 30 files, 40,004,916 bytes (38.15 MiB).

### 1b. Elsewhere in the tree

| Path                                                   |     Bytes | Evidence                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/prediction/Prediction Market card - 1 (1).svg` | 1,144,257 | No reference. Filename carries a Figma export suffix `- 1 (1)`, which is an untouched download. Contains 2 embedded base64 images.                                                                                                                                                        |
| `public/arena/playroom-card@3x.png`                    |   663,492 | No reference. Byte-identical to `public/market-square/conversation-card.png`, which is also unreferenced, so no copy needs to survive.                                                                                                                                                    |
| `public/trade/token-moves/card-template.svg`           |    44,116 | No reference. See the mock-data-art section: this is the frozen source template for the token-moves card.                                                                                                                                                                                 |
| `public/fonts/mona-sans-latin.woff2`                   |    39,796 | Byte-identical (md5 `344f39e5…`) to `app/fonts/mona-sans-latin.woff2`. `app/layout.tsx:40` loads the font through `next/font/local` from `./fonts/mona-sans-latin.woff2`, that is the `app/` copy. The `public/` copy is served by nothing. No `@font-face` anywhere points at `/fonts/`. |
| `public/fonts/chewy-regular.ttf`                       |    39,756 | No reference. Chewy is loaded through `next/font/google` at `app/layout.tsx:2,24` and again at `features/portfolio/components/set-the-stake-banner.tsx:4`. The self-hosted TTF is never used.                                                                                             |
| `public/topbar-rays.svg`                               |     1,193 | No reference. A third, distinct topbar rays export (532.304x212.667) at the tree root. The apparent hit at `features/trade/components/mobile-market-view.tsx:108` is `/market/topbar-rays.svg`, a different 1071x79 file.                                                                 |

Subtotal: 6 files, 1,932,610 bytes (1.84 MiB).

**Tier 1 total: 36 files, 43,737,646 bytes, 41.71 MiB.**

After this, `public/fonts/` is empty and can be removed as a directory. All seven
fonts the app uses are already served hashed and immutable from
`/_next/static/media/`, which the audit confirms: `app/layout.tsx` loads six
Google faces plus one local face, none through `public/`.

---

## Tier 2: byte-identical duplicates, one copy must survive

Each row is a file whose bytes are also present at a path that **is** referenced.
Delete the left column, keep the right. All 23 md5 groups in the tree were
recomputed for this audit; the groups the brief listed were all confirmed, and
three it did not mention were found (`BTC Top update.svg`, `nav-bar.svg`,
`plane-1.svg`).

| Delete                                     |   Bytes | Keep, and why                                                                                                                                                                                                  |
| ------------------------------------------ | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/trade/token-moves/btc-card@3x.png` | 238,550 | Keep `public/memecoins/btc-token-moves.png`, referenced at `features/trade/components/token-moves-promos.tsx:12`.                                                                                              |
| `public/trade/token-moves/card-bg@3x.png`  | 238,550 | Third copy of the same md5 `4c0ed42f…`. Same survivor.                                                                                                                                                         |
| `public/BTC Top update.svg`                | 113,869 | Keep `public/trade/token-moves/card-bg.svg`, referenced at `features/trade/components/token-moves.tsx:39`. md5 `fbb5648f…`. Filename with a space and a capital is an untouched Figma export at the tree root. |
| `public/nav/nav-bar.svg`                   |  30,981 | Keep `public/nav/nav-bar-base.svg`, the only one of the pair with a reference. md5 `881c1693…`.                                                                                                                |
| `public/bg-composite.png`                  |   8,204 | Keep `public/wallet/balance-bg.png`. md5 `441e4a47…`.                                                                                                                                                          |
| `public/market/stake-flame.svg`            |   3,247 | Keep `public/market/promo-stake-flame.svg`, referenced at `features/portfolio/components/portfolio-view.tsx:268` and `app/promo-rail-preview/page.tsx:15`.                                                     |
| `public/market/icon-coins.svg`             |   1,488 | Keep `public/market/balance-icon-coins.svg`, referenced at `features/portfolio/components/balance-card-desktop.tsx:86`.                                                                                        |
| `public/prediction/coins-icon.svg`         |   1,307 | Keep `public/market/prediction-coins-white.svg`, referenced at `features/discovery/components/prediction-starts-row.tsx:416`.                                                                                  |
| `public/market/topbar-icon-bell.svg`       |     898 | Keep `public/rollout/chrome/topbar-icon-bell.svg`, referenced at `components/layout/notification-bell.tsx:139`. Note this is the reverse of what a substring grep suggests.                                    |
| `public/market/icon-add-funds.svg`         |     723 | Keep `public/market/balance-icon-add-funds.svg`, referenced at `balance-card-desktop.tsx:170`.                                                                                                                 |
| `public/market/banner-scallop.svg`         |     539 | Keep `public/market/promo-stake-scallop.svg`, referenced at `components/ui/promo-rail.tsx:168`, `portfolio-view.tsx:269`, `app/promo-rail-preview/page.tsx:16`.                                                |
| `public/market/stake-glow-left.svg`        |     464 | Keep `public/market/promo-stake-glow-left.svg`, referenced at `portfolio-view.tsx:272`.                                                                                                                        |
| `public/market/stake-glow-right.svg`       |     464 | Keep `public/market/promo-stake-glow-right.svg`, referenced at `portfolio-view.tsx:279`.                                                                                                                       |
| `public/market/icon-withdraw.svg`          |     384 | Keep `public/market/balance-icon-withdraw.svg`, referenced at `balance-card-desktop.tsx:181`.                                                                                                                  |

**Tier 2 total: 14 files, 639,668 bytes, 0.61 MiB.**

### Duplicate groups where BOTH copies are live: DO NOT DELETE

These are byte-identical but each copy has its own consumer. Deduplicating them
needs a code change, so they are out of scope for a delete pass.

| Group                                                                                               | Bytes each | Both consumers                                                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public/market/topbar-rays.svg` and `public/rollout/chrome/topbar-starburst.svg`                    |      1,392 | `features/trade/components/mobile-market-view.tsx:108` and `components/layout/topbar.tsx:64`.                                                    |
| `public/memecoins/eth-africa-token-moves.png` and `public/trade/token-moves/eth-africa-card@3x.png` |     89,222 | `token-moves-promos.tsx:16` and `token-moves.tsx:121`.                                                                                           |
| `public/casino/arkjet/canvas/plane/spribe/plane-1.svg` and `plane-3.svg`                            |      2,786 | Both reached by `arkjet-stage.tsx:421`, which builds `'plane-' + frame + '.svg'` over frames 0 to 3. Removing either breaks the animation index. |

---

## Tier 3: re-encode, do not delete

These are wanted assets in the wrong container or at the wrong resolution. Each
recommendation below is a **lossy re-encode**, so it is a proposal for a human,
not something this audit performed.

### 3a. The three Arkade card photos

Measured with `sips`. All three are photographs shipped as PNG, which is a
lossless format built for flat art, not photographs. All three render into a
370 x 212.6 card box (`features/casino/components/arkade-desktop-row.tsx:10`
documents the 370px card width inside a 1038px strip), so at a 2x device pixel
ratio the required raster is about 740 x 426.

| Path                                                         |   Bytes | Pixels   | Oversample vs 740x426           | Recommendation                                                     |
| ------------------------------------------------------------ | ------: | -------- | ------------------------------- | ------------------------------------------------------------------ |
| `public/rollout/arkade/card-arkball-billiard-balls.png`      | 889,339 | 1344x768 | 1.82x linear, 3.3x area         | Resample to ~740x426, convert to WebP                              |
| `public/rollout/arkade/card-last-man-standing-hourglass.png` | 349,575 | 1199x654 | 1.62x linear, 2.6x area         | Resample to ~740x426, convert to WebP                              |
| `public/rollout/arkade/card-chess-red-king.png`              | 193,930 | 562x1000 | Portrait art in a landscape box | Crop to the card's aspect first, then resample and convert to WebP |

Estimated recovery: 1,432,844 bytes down to roughly 150,000 bytes across the
three, about 1.22 MiB. The exact figure depends on the WebP quality chosen and
should be measured after encoding, not promised in advance.

Note that none of the three is referenced by any component yet
(`features/casino/lib/games.ts` points the Arkade catalogue at
`/casino/arkball/hero.png`, `/casino/arkjet/hero.webp`, `/casino/chicken/ark-chicken.png`
and three remote URLs). They are staged exports. **Re-encode them before a
component picks them up, not after.**

### 3b. `public/market-square/card-linked.svg`

| Path                                   |      Bytes | Status                                                                                |
| -------------------------------------- | ---------: | ------------------------------------------------------------------------------------- |
| `public/market-square/card-linked.svg` | 11,152,320 | **Referenced**, at `features/square/components/square-promos.tsx:207`. DO NOT DELETE. |

This single file is 11.8% of the entire `public/` tree. The breakdown:

- 11,000,252 bytes, 98.6% of the file, is base64 text.
- Stripped of its payloads the SVG is 152,122 bytes.
- The payloads decode to 8,250,185 bytes of PNG. Base64 inflates that by 33%.
- The six images are 1024x1024 and 1200x1500. They are drawn through
  `<pattern>` fills into a `viewBox="0 0 363 173"` card, and the component
  renders it at `width={363} height={173}`.

An avatar occupying roughly 40px of a 363px card is being delivered at 1024px.
That is about a 25x linear oversample. The file is served on the mobile
dashboard promo, so this is 11.15 MiB reaching phones for a 363x173 graphic.

Recommendation for a human: re-author the export so the six avatars are external,
resampled to about 96x96 (2x of their drawn size), and referenced by `href`
rather than inlined. Estimated result is roughly 152 KB of SVG plus about 60 KB
of avatars, saving on the order of 10.7 MiB. This is a Figma re-export plus a
component change, so it needs its own ADR under Directive 2, not a quick edit.

Two further defects in this file, for the record:

- It has **zero `<text>` nodes and 189 `<path>` nodes**. The button copy ("Join
  Space", "Play Chess", per the overlay comments at `square-promos.tsx:216-217`)
  is outlined into vector paths. The `alt` is translated through
  `t("joinConversation")` but the visible copy inside the card is English only in
  all five locales. That fails the locale-completeness rule in the pre-review
  checklist.
- The interactive regions are transparent `<a>` elements positioned at hardcoded
  percentages over the artwork (`left: "67.8%", top: "46.5%"`). Any re-export
  that shifts a button by a pixel silently misaligns the hit zones.

---

## Tier 4: unreferenced, but confirm with the owning agent first

69 files, 3,691,245 bytes (3.52 MiB). Each has zero literal references and is not
reachable by any template found in the repo. They are held back from Tier 1
because they are plausibly staged for work another agent has in flight, or they
sit in a directory whose consumer is being rewritten right now.

### 4a. Staged rollout exports, untracked, no consumer yet

`public/rollout/` is untracked in git. 15 SVGs and 3 PNGs. Only two files in it
are consumed: `chrome/topbar-icon-bell.svg` and `chrome/topbar-starburst.svg`.

| Path                                                         |   Bytes | Note                                                                                                                                            |
| ------------------------------------------------------------ | ------: | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/rollout/arkade/card-arkball-billiard-balls.png`      | 889,339 | Also Tier 3. Re-encode before use.                                                                                                              |
| `public/rollout/arkade/card-last-man-standing-hourglass.png` | 349,575 | Also Tier 3. Not a duplicate of `public/casino/last-man-hourglass.png`, which is a different image at 393x675.                                  |
| `public/rollout/arkade/card-chess-red-king.png`              | 193,930 | Also Tier 3.                                                                                                                                    |
| `public/rollout/leverage/chart-line-green.svg`               |   1,603 | Mock data art, see below. Recommend delete, not adopt.                                                                                          |
| `public/rollout/nav/icon-marketsquare.svg`                   |   1,366 | Near-twin of `public/nav/market-square.svg` (1,217 bytes, different md5), which is referenced at `components/layout/sidebar.tsx:158`. Pick one. |
| `public/rollout/arkade/icon-chess-pawn-white.svg`            |   1,358 |                                                                                                                                                 |
| `public/rollout/leverage/chart-area-fill-green.svg`          |     872 | Mock data art, see below.                                                                                                                       |
| `public/rollout/leverage/slider-leverage-track.svg`          |     824 | Mock data art, see below.                                                                                                                       |
| `public/rollout/meme/icon-bar-chart-yellow.svg`              |     711 |                                                                                                                                                 |
| `public/rollout/spot/icon-search.svg`                        |     702 | `components/ui/search-field.tsx` is new and untracked. Check whether it should use this.                                                        |
| `public/rollout/spot/icon-chart-line-yellow.svg`             |     636 |                                                                                                                                                 |
| `public/rollout/spot/chevron-down-view-chart.svg`            |     473 |                                                                                                                                                 |
| `public/rollout/meme/chevron-down-panel-collapse.svg`        |     380 |                                                                                                                                                 |
| `public/rollout/spot/chevron-down-pair-selector.svg`         |     353 |                                                                                                                                                 |
| `public/rollout/spot/chevron-down-token-pill.svg`            |     290 |                                                                                                                                                 |
| `public/rollout/spot/dot-live-yellow.svg`                    |     271 |                                                                                                                                                 |

The meme and spot chevrons and icons most likely belong to
`features/trade/components/meme-desktop-board.tsx`,
`spot-desktop-view.tsx` and `spot-pair-header.tsx`, all new and untracked. Ask
the agents owning those before removing anything under `rollout/spot/` or
`rollout/meme/`.

### 4b. Design-system icons with no consumer

| Path                                         |   Bytes | Note                                                                                                                                                                                               |
| -------------------------------------------- | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/market/promo-kash-banner.svg`        | 174,593 | The live Kash banner uses `kash-banner-art.svg` at `features/portfolio/components/kash-banner.tsx:157`. This looks like a superseded export.                                                       |
| `public/market/kash-icon-metamask.svg`       |   2,719 | `features/portfolio/lib/metamask.ts` exists, so a consumer may be coming.                                                                                                                          |
| `public/market/sidebar-icon-arkade.svg`      |   1,418 | The nine `sidebar-icon-*.svg` files have no consumer. `components/layout/sidebar.tsx` is modified in the working tree, so a sidebar rework may be mid-flight. Confirm before deleting any of them. |
| `public/market/sidebar-icon-portfolio.svg`   |   1,250 |                                                                                                                                                                                                    |
| `public/market/kash-icon-arrow-send.svg`     |   1,136 | `kash-icon-arrow-buy.svg` and `kash-icon-convert.svg` are live at `kash-card.tsx:273,280`. This third one is not.                                                                                  |
| `public/market/sidebar-icon-meme.svg`        |     800 |                                                                                                                                                                                                    |
| `public/market/promo-kash-scallop-right.svg` |     606 |                                                                                                                                                                                                    |
| `public/market/promo-kash-scallop-left.svg`  |     606 |                                                                                                                                                                                                    |
| `public/market/sidebar-icon-prediction.svg`  |     550 |                                                                                                                                                                                                    |
| `public/market/sidebar-icon-arktivity.svg`   |     509 |                                                                                                                                                                                                    |
| `public/market/sidebar-icon-rwa.svg`         |     428 |                                                                                                                                                                                                    |
| `public/market/sidebar-icon-switch.svg`      |     381 |                                                                                                                                                                                                    |
| `public/market/sidebar-icon-spot.svg`        |     374 |                                                                                                                                                                                                    |
| `public/market/sidebar-icon-perps.svg`       |     364 |                                                                                                                                                                                                    |

### 4c. Older orphans, lower risk but still unconfirmed

| Path                                                          |   Bytes |
| ------------------------------------------------------------- | ------: |
| `public/prediction/boxing-banner.png`                         | 484,893 |
| `public/casino/last-man-hourglass.png`                        | 336,961 |
| `public/perps/perps-coins.png`                                | 226,982 |
| `public/perps/perps-rocket.png`                               | 174,157 |
| `public/casino/kash-plus-ad/kash-plus-ad@3x.png`              | 158,222 |
| `public/perps/perps-queen.png`                                | 133,050 |
| `public/perps/perps-glow.png`                                 | 106,465 |
| `public/nav/bar-fill.png`                                     |  86,483 |
| `public/trade/token-moves/rocket.png`                         |  79,896 |
| `public/ark-logo-dark.png`                                    |  59,172 |
| `public/ark-credit-card.jpg`                                  |  49,710 |
| `public/Group 48098473.svg`                                   |  34,677 |
| `public/casino/arkjet/canvas/partners-logo/official.svg`      |  24,171 |
| `public/vivid/avatar.png`                                     |  21,459 |
| `public/carousel_one.svg`                                     |  19,307 |
| `public/casino/arkjet/canvas/partners-logo/partners-logo.svg` |  14,308 |
| `public/carousel_two.svg`                                     |  13,849 |
| `public/carousel_three.svg`                                   |   7,499 |
| `public/vivid/action-post.png`                                |   5,134 |
| `public/vivid/action-predict.png`                             |   4,767 |
| `public/nav/game.svg`                                         |   2,783 |
| `public/vivid/action-btc.png`                                 |   1,772 |
| `public/prediction/cloud-mid.svg`                             |   1,706 |
| `public/prediction/cloud-small.svg`                           |   1,689 |
| `public/prediction/cloud-large.svg`                           |   1,679 |
| `public/nav/card.svg`                                         |   1,357 |
| `public/prediction/sunburst-yellow.svg`                       |   1,218 |
| `public/prediction/sunburst.svg`                              |   1,157 |
| `public/nav/glow.svg`                                         |   1,096 |
| `public/nav/home.svg`                                         |   1,031 |
| `public/prediction/stopwatch-icon.svg`                        |     949 |
| `public/casino/arkjet/canvas/icons/login-timer.svg`           |     729 |
| `public/trade/token-moves/coins-icon.svg`                     |     637 |
| `public/casino/arkjet/canvas/icons/clock.svg`                 |     587 |
| `public/casino/arkjet/canvas/icons/up-down.svg`               |     558 |
| `public/prediction/arrow-right.svg`                           |     451 |
| `public/nav/chart.svg`                                        |     422 |
| `public/nav/bar-curve.svg`                                    |     348 |

Notes on this group:

- `public/nav/` has 8 dead files. Only `market-square.svg` (`sidebar.tsx:158`)
  and `nav-bar-base.svg` are live. `components/layout/curved-tab-bar.tsx` is the
  likely former consumer.
- `public/vivid/` (4 files, 33,132 bytes) has no asset reference anywhere. The
  Vivid voice surface is implemented in `app/globals.css:920` and `lib/voice/`
  with no images.
- `public/carousel_one|two|three.svg` are unreferenced. The `.png` versions of
  the same three names are referenced, so this is an SVG-versus-PNG leftover.
- `public/casino/arkjet/canvas/icons/` and `partners-logo/` are unreferenced.
  `arkjet.module.css` uses only `bg/bg-sun.svg`, `multiplier/bg/blur.svg` and
  `prop/prop.svg`.

---

## Tier 5: leave alone

346 files, 38,241,999 bytes. Either referenced literally, or reachable only at
runtime. **Every directory below would look unreferenced to a grep.**

| Directory                                                | Files |      Bytes | How it is reached                                                                                                                                                                                                            |
| -------------------------------------------------------- | ----: | ---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/film/`                                           |    23 | 15,184,204 | `lib/landing/journey.ts:161-164`, `/film/w${i}-{still.jpg,amb.mp4,transit.mp4}` over `WAYPOINTS = 9`.                                                                                                                        |
| `public/stockfish/`                                      |     3 |  7,352,661 | `use-chess-engine.ts:13` registers the `.js` as a worker; the `.js` derives the `.wasm` path itself. `Copying.txt` is the GPL text and must stay for licence compliance.                                                     |
| `public/casino/chicken/spribe/`                          |    19 |    743,547 | `chicken-section.tsx:10`, `const ASSET = "/casino/chicken/spribe"` plus `${ASSET}/img/${PLANES[plane.texture]}@2x.png` and eleven `${ASSET}/icons/*` paths. `pilot-chicken-new@2x.atlas` is read by `chicken-character.tsx`. |
| `public/chess/puzzle-themes/`                            |    69 |     98,874 | `features/casino/lib/chess/puzzle.ts:39`, `${asset}.svg` where the theme comes from upstream puzzle data. Not provable dead from the repo.                                                                                   |
| `public/piece/neo/`                                      |    11 |     77,382 | `chess-board.tsx:15`, `/piece/neo/${color}${type}.png`.                                                                                                                                                                      |
| `public/chess/learn/`                                    |    13 |     50,540 | `lesson-artwork.tsx` static map plus `lesson-runner.tsx:68`. Some files in this directory are genuinely unmapped, but they are small and share a `NOTICE.md`, so treat the set as one licensed bundle.                       |
| `public/piece/cburnett/`                                 |    11 |     42,528 | `chess-computer-dialog.tsx:93,100,111` uses the kings only. The remaining pieces are unused but ship under `NOTICE.txt` as a licensed set. Splitting a licensed piece set is not worth 34 KB.                                |
| `public/casino/arkjet/canvas/plane/spribe/`              |     4 |     10,961 | `arkjet-stage.tsx:421`, `'plane-' + frame + '.svg'`.                                                                                                                                                                         |
| `public/draughts/pieces/`                                |     2 |      1,245 | `draughts-board.tsx:291`, `` `${side}${king ? "K" : "M"}.svg` ``.                                                                                                                                                            |
| `public/images/sporticons/`, `public/images/sportsbook/` |  many |            | `market-browser.tsx:279` and `sport-icon.tsx:55`.                                                                                                                                                                            |
| `public/casino/set-the-stake/`                           |     5 |            | `set-the-stake-banner.tsx:13`, `const ART = "/casino/set-the-stake"`.                                                                                                                                                        |
| `public/sw.js`                                           |     1 |      1,497 | `hooks/use-push-notifications.ts:12,80`. Push-only, does not cache assets, so it does not pin any other file.                                                                                                                |

---

## Mock data art

The rule: artwork representing data must come from the data at runtime, not from
a static export of a designer's placeholder. Every SVG in `public/` was scanned
for chart, graph, sparkline, progress-bar and slider element ids, and for baked
`<text>` nodes. Five files are in breach. Three were already known; **two are
new findings, and both are worse because they are live in shipped code.**

### Already flagged, unreferenced, recommend delete rather than adopt

| Path                                                | Bytes | Evidence                                                                                                                                                                                                                       |
| --------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public/rollout/leverage/chart-line-green.svg`      | 1,603 | A single `<path id="Chart">` with 24 hand-placed vertices. A designer's curve, not a price series.                                                                                                                             |
| `public/rollout/leverage/chart-area-fill-green.svg` |   872 | The same curve, same x-positions (0, 18.299, 36.3634, 54.4278, …, 419), area-filled with a `#22C55E` gradient. Note the fill is hardcoded green, so a losing position would still render as a green up-and-to-the-right chart. |
| `public/rollout/leverage/slider-leverage-track.svg` |   824 | `<g id="_ProgressBarAtom">` with the track at 326 wide and the fill frozen at 205.807, that is 63.1%, and a `<circle id="Slider Thumb">` pinned at `cx="201.5"`. A control at one frozen position, not a control.              |

Recommendation: these three should not be adopted by the leverage UI at all. A
leverage slider is a control and a P&L chart is data. Both must be rendered from
state. Their presence in a staged export directory is the risk.

### New findings, both live in shipped code

| Path                                         |   Bytes | Consumer                                                              | Baked content                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------: | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/prediction/card-bg.svg`              | 994,707 | `features/prediction/components/prediction-mobile.tsx:77`, as `data=` | Four `<text>` nodes: "Will Pastor Benny Hinn Be At", "Healing Stream", "68¢ Yes · $4.2M vol", "Politics". A specific market, a specific price, and a specific volume, frozen as artwork and shipping to users.                                                       |
| `public/trade/token-moves/card-template.svg` |  44,116 | None. Unreferenced, listed in Tier 1.                                 | Nine `<text>` nodes: "BTC", "$1,876.67", "+12.8%", "BTC is up 12.8% in the last 6 hours. I recommend increasing your position by 10%", "Buy Eth". A frozen price, a frozen percentage, a frozen trading recommendation, and a CTA that says "Buy Eth" on a BTC card. |

`public/prediction/card-bg.svg` is the serious one. It is nearly 1 MB, it is
rendered on the mobile prediction surface, and it presents a hardcoded price of
68¢ and a hardcoded $4.2M volume as though they were live. It also bakes English
copy into artwork, so it cannot be localised. This should be rebuilt as a
component that takes the market, the price and the volume as props. It needs its
own ADR and is out of scope for a delete pass.

`public/market-square/card-linked.svg` is a third case, described in Tier 3b: six
fixed avatars and outlined English button copy standing in for what should be
live square participants.

---

## `preserveAspectRatio="none"` audit

113 of the 280 SVGs under `public/` carry `preserveAspectRatio="none"` on the
root element. That is Figma's export default and it **stretches** rather than
letterboxes, so any consumer that sets both dimensions to a ratio other than the
artwork's own will distort the glyph.

All 15 SVGs added this session under `public/rollout/` carry it. So does every
new file under `public/market/`.

The findings below are read from the source and the SVG headers. They are
arithmetic on stated dimensions, not browser measurements, and are labelled as
such. One of them is independently confirmed as a real visible defect by another
agent measuring the live app.

### Confirmed defects

| Asset                                        | Intrinsic            | Consumer                                               | Box                                                                 | Distortion                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------- | -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/rollout/chrome/topbar-starburst.svg` | 1071x79, ratio 13.56 | `components/layout/topbar.tsx:64`                      | `bg-[length:100%_100%]` on a full-width bar, `md:h-[79px]`          | Height is correct, width follows the viewport. At 1440px the box ratio is 18.23, a **1.34x horizontal stretch**. At 1920px it is 24.30, a **1.79x stretch**. The ray fan splays visibly wider than designed. Independently confirmed against the live app.                                                       |
| `public/market/topbar-rays.svg`              | 1071x79, ratio 13.56 | `features/trade/components/mobile-market-view.tsx:108` | `bg-size-[100%_100%]` in `h-[100px]` inside a `max-w-[440px]` shell | Box ratio 4.4 against artwork ratio 13.56, a **3.08x relative aspect error**. The same artwork is squeezed to 41% of its width and stretched to 127% of its height at the same time. Worse than the topbar case, and the two files are byte-identical, so the same export is being distorted two different ways. |

### Distortion risk, needs a browser measurement to confirm

| Asset                                          | Intrinsic                    | Consumer                                                      | Why it is at risk                                                                                                                                                                             |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/market/next100x-sunburst.svg`          | 731.126x312.541              | `features/discovery/components/next-100x-row.tsx:552`         | Sized `h-[312.541px] w-[143.64%]`. Height is fixed in pixels, width is a percentage of the row. The ratio changes with every viewport width.                                                  |
| `public/market/next100x-sun-rays.svg`          | 682x355.898                  | `next-100x-row.tsx:556`                                       | Same pattern, `h-[355.89px] w-[133.99%]`.                                                                                                                                                     |
| `public/market/next100x-card-rays.svg`         | 598.916x312.541              | `next-100x-row.tsx:98`                                        | Same pattern, `h-[312.541px] w-[123.74%]`.                                                                                                                                                    |
| `public/market/prediction-sunburst-red.svg`    | 668.094x456.178, ratio 1.465 | `features/discovery/components/prediction-starts-row.tsx:360` | Sized `h-[205.4856%] w-[136.0680%]`. Both are percentages of the same parent, so the rendered ratio is the parent's ratio times 0.662. It is correct only if the parent's own ratio is 2.213. |
| `public/market/prediction-sunburst-yellow.svg` | 441x222                      | `prediction-starts-row.tsx:188`                               | `h-full` with no width constraint stated at the call site.                                                                                                                                    |

### Stretched deliberately, documented, not a defect

`public/market/balance-stars.svg` (551x370) is painted at
`features/portfolio/components/balance-card-desktop.tsx:56` with
`bg-[length:100%_100%]` over `absolute inset-0`. The author documented the
decision in the comment above it: the star field is exported at the card's own
551x370 frame, the stars are about a pixel across, and the stretch does not read.
That is a reasoned trade-off, recorded in the code. Leave it.

`public/market/kash-stars.svg` and `kash-stars-overlay.svg` are sized as
percentages of the Kash card (`h-[56.95%] w-[71.55%]` and `h-[59.4%] w-[74.4%]`),
so their ratio tracks the card's ratio rather than the viewport's. Lower risk.

### Consumers that are safe, and the pattern worth copying

- **`components/ui/promo-rail.tsx` is the correct pattern.** It pins the card to
  a fixed `aspectRatio: ${CARD_WIDTH} / ${CARD_HEIGHT}` (line 176) and sizes
  every piece of art with a single `cqw()` container-query unit for both width
  and height (lines 200-222). Because both axes scale by the same factor,
  `preserveAspectRatio="none"` can never distort anything in this rail. All four
  `promo-stake-*.svg` files are safe for this reason.
- **Square icons in square boxes.** `balance-icon-add-funds.svg`,
  `balance-icon-withdraw.svg`, `balance-icon-eye.svg`, `balance-icon-dot.svg`,
  `kash-icon-*.svg` and `rollout/chrome/topbar-icon-bell.svg` are all square
  artwork in `size-[…]` boxes. No distortion.
- **Exact-intrinsic backgrounds.** `next100x-icon-chart.svg` and
  `next100x-icon-coins.svg` use `bg-[length:11.72px_11.72px]` and
  `bg-[length:12.93px_12.93px]`, matching their own intrinsic sizes exactly.
- **`bg-cover` instead of `100% 100%`.** `balance-clouds.svg` and
  `kash-clouds.svg` use `bg-cover`, which preserves aspect by definition.
- **Exact `width`/`height` props.** The `convo-arena-*.svg` and
  `convo-chess-art.svg` files are given their exact intrinsic dimensions at
  `conversation-row.tsx:235,440,448,491`.

### New assets carrying the attribute with no consumer yet

All 15 `public/rollout/*.svg` files carry `preserveAspectRatio="none"`. Thirteen
have no consumer. The non-square ones are the ones to watch when a component
does pick them up:

| Asset                                                                                                                                                                                                                                                         | Intrinsic                      | Square?                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------- |
| `rollout/leverage/chart-line-green.svg`                                                                                                                                                                                                                       | 423.682x185.966                | No, ratio 2.28                                |
| `rollout/leverage/chart-area-fill-green.svg`                                                                                                                                                                                                                  | 419x182.581                    | No, ratio 2.29                                |
| `rollout/leverage/slider-leverage-track.svg`                                                                                                                                                                                                                  | 326x23                         | No, ratio 14.17. Extremely stretch-sensitive. |
| `rollout/nav/icon-marketsquare.svg`                                                                                                                                                                                                                           | 17.1207x12.7408                | No, ratio 1.34                                |
| `rollout/arkade/icon-chess-pawn-white.svg`                                                                                                                                                                                                                    | 8.6332x10.6067                 | No, ratio 0.81                                |
| `rollout/spot/chevron-down-view-chart.svg`                                                                                                                                                                                                                    | 11.2425x6.59028                | No, ratio 1.71                                |
| `rollout/spot/icon-search.svg`, `chevron-down-pair-selector.svg`, `chevron-down-token-pill.svg`, `dot-live-yellow.svg`, `icon-chart-line-yellow.svg`, `meme/chevron-down-panel-collapse.svg`, `meme/icon-bar-chart-yellow.svg`, `chrome/topbar-icon-bell.svg` | square within a rounding error | Yes, safe in a `size-[…]` box                 |

Recommendation: strip `preserveAspectRatio="none"` from every export where the
consumer is not the promo-rail pattern, or add it to the export checklist that
the attribute is removed unless the artwork is deliberately a stretchable band.

---

## Appendix: verification commands

Re-run these immediately before acting. The tree is being written by nine agents.

```sh
# Re-derive the md5 duplicate groups.
find public -type f -print0 | xargs -0 md5 -r | sort | awk '{h=$1; $1=""; print h, $0}' \
  | awk '{c[$1]++; f[$1]=f[$1]"\n  "$2} END {for (h in c) if (c[h]>1) print h, f[h]}'

# Confirm a single file is still unreferenced. Substitute the path.
grep -rn "/market-square/Card.svg" app components features lib hooks config i18n messages

# Confirm no template can reach it.
grep -rn 'market-square' app components features lib hooks | grep -v node_modules

# Re-list every dynamic asset path construction in the repo.
grep -rnoE '\$\{[^}]{1,60}\}[^"`'"'"']{0,60}\.(png|jpg|svg|webp|mp4|mp3|wasm|ttf|woff2)' \
  app components features hooks lib config i18n scripts | grep -v node_modules

# Current size of the tree.
find public -type f -exec stat -f "%z" {} \; | awk '{s+=$1} END {print s, s/1048576" MiB"}'
```

After any deletion, run `./scripts/preflight.sh` in full. A missing asset does
not fail a type check, so the Next.js production build and the Vitest suite are
the only gates that will catch a bad removal, and neither catches a 404 on a
runtime-constructed path. Exercise the Vercel preview for the chess board, the
Arkjet stage, the Pilot Chicken game, the landing film reel and the mobile
dashboard promo before merging.
