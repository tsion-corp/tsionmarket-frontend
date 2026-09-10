# Dead code audit, 2026-09-08

## What this is

A reachability audit of the code the Roll Out 2.0 desktop redesign has stranded, plus everything
else the sweep turned up on the way. Nothing here has been deleted or edited. Every row is a
finding for a human to act on.

## Snapshot and volatility warning

- Working tree: `/Users/markdavidojukwu/Desktop/wsws-frontend`, branch `feat/desktop-portfolio-redesign`.
- HEAD at audit time: `425dbb45`.
- Audit window: 2026-09-08, roughly 19:00 to 19:40 WAT.

Several other agents were writing to this tree throughout. Three concrete things changed underneath
this audit while it ran:

1. `app/(session)/casino/page.tsx` was rewritten twice, and the `TRACKED_GAMES` duplication
   (candidate 5 below) was fixed by another agent mid-audit.
2. `app/preview-market/` existed as an untracked directory when the audit started and no longer
   exists on disk. It was never tracked in git.
3. Line numbers in `features/casino/components/arkade-mobile.tsx` shifted by nine while the audit
   ran.

**Treat every line number here as a pointer, not an anchor.** Grep the symbol before acting on a
row. Rows whose answer depends on an in-flight adoption are marked MOVING.

## Method

1. Built a word index over all 1,607 tracked and untracked `.ts`/`.tsx` files (excluding
   `node_modules`), mapping every identifier to the set of files it appears in.
2. Extracted 3,158 top-level `export function|const|class` declarations and cross-referenced them
   against that index, discounting the declaring file and its own `.test.ts(x)` sibling.
3. Walked every candidate upward by hand to a route or a layout. A component imported only by
   another dead component is reported as dead.
4. Checked barrel re-exports separately. `features/*/index.ts` re-exporting a symbol is not a
   consumer, and this audit does not count it as one.
5. Enumerated every `dynamic(() => import(...))` and bare `import("...")` target in the tree and
   checked each dead candidate against that list. No candidate below is reached dynamically.

Reproduce the sweep with the index script approach above, or spot check a single symbol with
`grep -rn "\bSymbol\b" --include="*.ts" --include="*.tsx" app features components hooks lib`.

---

## Tier 1: provably unreachable, safe to remove

No product switch guards these, no route reaches them, and nothing dynamic imports them.

| Path and line                                                           | Symbol                   | Evidence                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/layout/feature-marquee.tsx:134`                             | `FeatureMarquee`         | No importer anywhere. The identifier occurs exactly once in the whole tree, at its own declaration.                                                                                                      |
| `features/funds/components/kyc/kyc-onboarding.tsx:48`                   | `KycOnboarding`          | No importer. `kyc-onboarding` appears in no import specifier and no dynamic import. The only three hits for the name are the props interface, the declaration and the type annotation, all in that file. |
| `features/prediction/components/prediction-slider.tsx:14`               | `PredictionSlider`       | No importer. Single occurrence in the tree.                                                                                                                                                              |
| `features/prediction/markets/components/combo-bet-receipt-modal.tsx:13` | `ComboBetReceiptModal`   | No importer. Single occurrence.                                                                                                                                                                          |
| `features/prediction/markets/components/provider-sport-tabs.tsx:14`     | `ProviderSportTabs`      | No importer. Single occurrence.                                                                                                                                                                          |
| `features/casino/components/chess/chess-live-now-dialog.tsx:37`         | `ChessLiveNowDialog`     | No importer. Single occurrence.                                                                                                                                                                          |
| `features/casino/components/chess/chess-tournaments-dialog.tsx:53`      | `ChessTournamentsDialog` | No importer. Single occurrence.                                                                                                                                                                          |
| `features/casino/components/draughts/match-social.tsx:34`               | `MatchSocial`            | No importer. Single occurrence.                                                                                                                                                                          |
| `components/ui/promo-rail.tsx:308`                                      | `PromoArtBanner`         | Exported from a live file, but never used. Not even `app/promo-rail-preview/page.tsx` renders it; that harness uses `PromoBanner` only.                                                                  |
| `features/portfolio/components/portfolio-donut.tsx:38`                  | `PortfolioDonutSkeleton` | The file is live (`PortfolioDonut` is imported at `features/portfolio/components/balance-card-desktop.tsx:5`), but the skeleton export has no consumer.                                                  |

### 1a. The casino desktop hub, replaced by ArkadeDesktop (candidate 4): MOVING

`app/(session)/casino/page.tsx` in the working tree (uncommitted) swapped `HubSection` for
`ArkadeDesktop`. What survives of `HubSection` is a barrel line.

| Path and line                                   | Symbol         | Evidence                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/casino/components/hub-section.tsx:28` | `HubSection`   | Its only ever consumer was `app/(session)/casino/page.tsx`. The uncommitted diff replaced that import with `ArkadeDesktop` and left a comment at line 30 saying so. The only remaining reference by name is the barrel re-export at `features/casino/index.ts:2`, plus two prose mentions in comments (`casino/page.tsx:30`, `arkade-mobile.tsx:120`). Nothing imports `HubSection` from the barrel. |
| `features/casino/components/game-tile.tsx:78`   | `GameTile`     | Sole importer is `hub-section.tsx:8`, used at `hub-section.tsx:117`. Dead with its only parent.                                                                                                                                                                                                                                                                                                      |
| `features/casino/index.ts:2`                    | re-export line | Delete alongside `hub-section.tsx`.                                                                                                                                                                                                                                                                                                                                                                  |

MOVING: the casino adoption is uncommitted. If `app/(session)/casino/page.tsx` is reverted, both
files come back to life immediately.

Note for the person doing the removal: `game-tile.tsx` no longer holds its own `TRACKED_GAMES` copy.
That was lifted out mid-audit (see candidate 5 below) and the file now imports it at line 6, so
deleting the file drops one of the three import sites rather than a duplicated constant.

### 1b. Prediction markets workspace, orphaned by the sportsbook

An entire barrel's worth of components with no route above them. Pre-existing, unrelated to the
desktop redesign, but the same shape.

| Path and line                                                          | Symbol                    | Evidence                                                                                                                                                            |
| ---------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/prediction/markets/components/markets-workspace.tsx:42`      | `MarketsWorkspace`        | Root of the cluster. Referenced only by `features/prediction/markets/index.ts:2`. `app/(session)/prediction/markets/page.tsx:43` renders `SportsbookShell` instead. |
| `features/prediction/markets/components/markets-header.tsx:33`         | `MarketsHeader`           | Barrel line 1 only.                                                                                                                                                 |
| `features/prediction/markets/components/discovery-event-detail.tsx:18` | `DiscoveryEventDetail`    | Barrel line 3 only. `app/(session)/prediction/markets/[eventId]/page.tsx:31` renders `CategoryEventDetail` instead.                                                 |
| `features/prediction/markets/components/sports-event-detail.tsx:25`    | `SportsEventDetail`       | Barrel line 6 only. That same route renders `SportsbookShell` at line 38 instead.                                                                                   |
| `features/prediction/markets/components/discovery-market-board.tsx:18` | `DiscoveryMarketBoard`    | Reachable only through `markets-workspace.tsx:133`. Dead with its parent.                                                                                           |
| `features/prediction/markets/components/sports-market-board.tsx:23`    | `SportsMarketBoard`       | Reachable only through `markets-workspace.tsx:121`. Dead with its parent.                                                                                           |
| `features/prediction/markets/resolve-navigation.ts:26`                 | `resolveMarketNavigation` | Barrel line 7 and its own test only.                                                                                                                                |

Do not delete the directory. `features/prediction/markets/query-broadcast` is live at
`app/(session)/providers.tsx:15`, and `features/prediction/markets/hooks/use-discovery-markets` is
live at `features/prediction/components/politics-markets-shell.tsx:9`. Only the barrel's component
exports and `index.ts` itself are dead.

### 1c. Chess arena, orphaned by Swiss

| Path and line                                                   | Symbol               | Evidence                                                                                                                          |
| --------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `features/casino/components/chess/arena/list-section.tsx:113`   | `ArenaListSection`   | Referenced only by `features/casino/index.ts:26`. `app/(session)/casino/chess/tournaments/page.tsx:8` renders `SwissListSection`. |
| `features/casino/components/chess/arena/create-form.tsx:51`     | `ArenaCreateForm`    | Barrel line 24 only.                                                                                                              |
| `features/casino/components/chess/arena/detail-section.tsx:348` | `ArenaDetailSection` | Barrel line 25 and its own test only.                                                                                             |

### 1d. hooks/use-user.ts (candidate 8): CONFIRMED

| Path and line          | Symbol    | Evidence                                                                                                                                                                                                                      |
| ---------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/use-user.ts:44` | `useUser` | Zero production call sites. The only two references in the tree are `hooks/use-user.test.ts:41` and `:88`, both `await import("./use-user")`. The dynamic-import enumeration confirms no other `import("./use-user")` exists. |

Knock-on effect: `use-user.ts:54` is the only consumer of `queryKeys.user.me()`. Removing the hook
makes the entire `user` branch of `lib/query-keys.ts` (lines 12 to 16) dead, since `user.session()`
is already unreferenced (see 1e).

### 1e. lib/query-keys.ts unreferenced exports (candidate 7): CONFIRMED

| Path and line             | Symbol                       | Evidence                                                                                                                                             |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/query-keys.ts:15`    | `queryKeys.user.session()`   | Referenced only by `lib/query-keys.test.ts:7`. No production call site.                                                                              |
| `lib/query-keys.ts:33-48` | the whole `dextopus` branch  | `all`, `chains`, `tokens`, `masterEligibility`, `staticAddress`, `status`. The only references in the tree are `lib/query-keys.test.ts:25` to `:32`. |
| `lib/query-keys.ts:37`    | `dextopus.masterEligibility` | Not even covered by the test. Zero references outside its declaration.                                                                               |
| `lib/query-keys.ts:38`    | `dextopus.staticAddress`     | Not even covered by the test. Zero references outside its declaration.                                                                               |

Adoption, measured: 361 `queryKey:` sites across `app/`, `features/`, `components/`, `hooks/` and
`lib/`, excluding tests. Four of them use the factory:

- `features/activity/hooks/use-activity.ts:40`
- `features/portfolio/hooks/use-kash.ts:44`
- `features/portfolio/hooks/use-kash.ts:59`
- `hooks/use-user.ts:54` (itself dead, see 1d)

Plus one indirect site, `hooks/use-portfolio.ts:68`, which assigns
`queryKeys.portfolio.byWallet(evm, solana)` to a variable. So five call sites, four of them live.

The parallel hand-written keys are real and byte-identical:

- `hooks/use-deposit.ts:209` `MASTER_ELIGIBILITY_KEY = ["deposit-master-eligibility"]`
- `hooks/use-deposit.ts:303` `DEPOSIT_CHAINS_KEY = ["deposit-chains"]`
- `hooks/use-deposit.ts:304` `depositTokensKey = (chainId) => ["deposit-tokens", chainId]`
- `hooks/use-deposit.ts:443` the `"deposit-static"` tuple
- `hooks/use-deposit.ts:536` `["dextopus", "status", purpose, depositRequestId]`

`lib/query-persist.ts:11` to `:14` lists the same four prefixes a third time, as persistence
allowlist entries.

The decision is binary and should be taken as one: either `hooks/use-deposit.ts` adopts the factory
and the duplication collapses, or the `dextopus` branch is deleted and `lib/query-keys.ts` shrinks
to what four hooks actually use. Leaving both is what produced two sources of truth for a cache key
that money flows through.

---

## Tier 2: unreachable, but do not remove yet

### 2a. features/trade/components/meme-section.tsx (candidate 1): CONFIRMED UNREACHABLE, KEEP

`MemeSection` at `features/trade/components/meme-section.tsx:18` has zero references in the entire
tree outside its own declaration. The only other hits for the name are in `docs/`. Confirmed.

Its exclusive dependency subtree, all reachable only through it:

| Path and line                                         | Symbol                          | Sole importer                                                                        |
| ----------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------ |
| `features/trade/components/meme-mode.ts:5`            | `useMemeMode`, `MemeModeSwitch` | `meme-section.tsx:5`                                                                 |
| `features/trade/components/meme-simple-view.tsx:19`   | `MemeSimpleView`                | `meme-section.tsx:6`                                                                 |
| `features/trade/components/meme-pro-view.tsx:57`      | `MemeProView`                   | `meme-section.tsx:7`                                                                 |
| `features/trade/components/memecoins-view.tsx:148`    | `MemecoinsView`                 | `meme-section.tsx:8`                                                                 |
| `features/trade/components/token-moves-promos.tsx:21` | `TokenMovesPromos`              | `meme-section.tsx:10`                                                                |
| `features/trade/components/memecoin-promos.tsx:24`    | `MemecoinPromos`                | `meme-section.tsx:9` and `memecoins-view.tsx:5`. Both are dead, so this is dead too. |

The live `/meme` route renders `MemeBoard` instead (`app/(session)/(app)/meme/page.tsx:3`).

**Why this is Tier 2 and not Tier 1.** The reason given in the task is correct and is confirmed by
`docs/adr/ADR-2026-09-08-frontend-caching-and-request-reduction.md`:

- ADR line 123 records the same finding: "still holds a correct wrapper, but `MemeSection` is dead
  code referenced nowhere".
- ADR line 395, work item W2.5: "Delete the dead `MemeSection` component, or restore it to use."
- ADR W2.1 (line 385) wants the standalone service routes wrapped in `SectionVisibility` so the
  existing `useSectionActive()` calls resolve against a real provider instead of the context default
  of `true`.

`meme-section.tsx:23` is the only place in the tree where `SectionVisibility` wraps a whole service
section from outside, which is exactly the shape W2 asks for. `dashboard-page.tsx:342` is the other
correct use, and it is inside the dead loop (see 2b). Deleting `meme-section.tsx` before the caching
ADR is settled throws away the working reference implementation of the pattern that ADR wants
restored.

Recommendation: hold this file until the caching ADR is decided. If W2 is adopted, copy the wrapper
onto `features/trade/components/meme-board.tsx` (which today has no `SectionVisibility`) and then
delete the whole subtree above. If W2 is rejected, the subtree is Tier 1.

MOVING: three new meme desktop components exist but are not yet adopted (see the moving-target
section). Whoever wires them will be editing `/meme`, which is the route that needs the wrapper.
That adoption is the natural moment to resolve this row.

### 2b. The dashboard brief machinery (candidate 2): CONFIRMED UNREACHABLE, PRODUCT SWITCH

`app/(session)/(app)/dashboard/dashboard-page.tsx:67` sets
`HIDDEN_BRIEFS = ["spot", "rwa", "meme", "perps"]`, which is every member of `BRIEFED_SECTIONS`
(line 61). The `briefs` memo at lines 145 to 154 filters the nav down to briefed ids and then
removes all four, so it always resolves to `[]`. The `briefs.map` at line 326 therefore runs zero
iterations and everything from line 326 to line 374 is live-but-unreachable.

Confirmed unreachable through that loop, with no other consumer anywhere in the tree:

| Path and line                                      | Symbol              | Reachable only via                                                                                                              |
| -------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `components/layout/explore-banners.tsx:35`         | `ExploreBanners`    | Imported at `dashboard-page.tsx:16`, rendered at `:358` and `:361`, both inside the empty loop. No other reference in the tree. |
| `components/ui/section-overview.tsx:20`            | `SectionOverview`   | Imported at `dashboard-page.tsx:9`, rendered at `:343`. No other reference.                                                     |
| `features/trade/components/spot-overview.tsx:15`   | `SpotOverview`      | `dashboard-page.tsx:10`, memoized `:120`, rendered `:349`. No other reference.                                                  |
| `features/trade/components/perps-overview.tsx:16`  | `PerpsOverview`     | `dashboard-page.tsx:11`, memoized `:121`, rendered `:349`. No other reference.                                                  |
| `features/trade/components/meme-overview.tsx:13`   | `MemeOverview`      | `dashboard-page.tsx:12`, memoized `:122`, rendered `:349`. No other reference.                                                  |
| `features/rwa/components/rwa-overview.tsx:16`      | `RwaOverview`       | `dashboard-page.tsx:13`, memoized `:123`, rendered `:349`. No other reference.                                                  |
| `features/square/components/square-promos.tsx:75`  | `SquarePostsPromo`  | Rendered only at `dashboard-page.tsx:368`.                                                                                      |
| `features/square/components/square-promos.tsx:286` | `SquarePeoplePromo` | Rendered only at `dashboard-page.tsx:369`.                                                                                      |

**Yes, the four brief components are unreachable too.** That was the open question in the task, and
it is confirmed. Each of the four standalone routes uses a different component:
`/spot` uses `SpotSection` or `SpotDesktopView`, `/perps` uses `PerpsSection`, `/meme` uses
`MemeBoard`, and none of them touch the `*Overview` briefs.

Also unreachable, supporting constants in the same file: `PREVIEW_ROWS` (`:52`), `BRIEFED_SECTIONS`
(`:61`), `isBriefed` (`:69`), `BRIEF_HREF` (`:73`), `INTERLEAVED_BANNERS` (`:83`),
`INTERLEAVED_SQUARE` (`:105`), `BRIEF_BODY` (`:125`).

Still alive: `SquareLivePromo` (`features/square/components/square-promos.tsx:162`) is also rendered
at `dashboard-page.tsx:299`, outside the loop, on the phone home. It is not affected.

**Why this is Tier 2.** The comment at `dashboard-page.tsx:64` to `:66` states the intent: "Briefs
hidden from the dashboard at request. All four stay full routes of their own ... Remove an id to
bring its brief back." This is a documented one-line switch, not an accident. Removing the machinery
converts a reversible product decision into a rebuild. The correct action is a product question to
whoever made the request, not a delete.

The one thing that is unambiguously wrong today: `DashboardPage` still pays the import cost of eight
components it can never render. `/dashboard` redirects to `/portfolio`
(`app/(session)/(app)/dashboard/page.tsx:6`), and `/portfolio` renders `DashboardPage`
(`app/(session)/(app)/portfolio/page.tsx:15`), so this is on the app's landing route.

---

## Tier 3: product question for the user

### The desktop promo rail (candidate 3)

Not dead code. It renders today.

- `components/ui/promo-rail.tsx:109` `PromoRail` and `:163` `PromoBanner`.
- Rendered at `features/portfolio/components/portfolio-view.tsx:363` to `:367`, inside
  `<div className="mt-3 hidden md:block">` at `:362`. Three slides: a stake banner defined at
  `:262`, `KashBanner` (`features/portfolio/components/kash-banner.tsx:142`), then the stake banner
  again.
- Also rendered by the harness at `app/promo-rail-preview/page.tsx:39`.

Evidence that it may predate the current design, offered as evidence and not as a conclusion:

1. Its artwork lives under `public/market/` (`promo-stake-flame.svg`, `promo-stake-glow-left.svg`,
   `promo-stake-glow-right.svg`, `promo-stake-scallop.svg`, `kash-banner-art.svg`,
   `kash-banner-scallop.svg`). That is the earlier "Market design" asset set.
2. The seven new screens brought a separate asset root, `public/rollout/`, with subdirectories
   `arkade`, `chrome`, `leverage`, `meme`, `nav` and `spot`. There is no promo art in it.
3. The measurement comment at `promo-rail.tsx:6` to `:24` cites Figma frame `1:11444` and node
   `1:11445`, a different frame family from the rollout nodes cited elsewhere in the new work (for
   example `261:977` in `arkade-mobile.tsx:117`).

**Question:** does Roll Out 2.0 keep the promo rail on the desktop portfolio?

- If yes, its artwork needs a rollout-era pass, and `app/promo-rail-preview` earns its keep as the
  review harness for that pass.
- If no, the following go together: `components/ui/promo-rail.tsx` in full (`PromoRail`,
  `PromoBanner`, and the already-dead `PromoArtBanner` at `:308`),
  `features/portfolio/components/kash-banner.tsx`, `app/promo-rail-preview/page.tsx`, the promo
  assets under `public/market/`, and the `promoRailCarousel` string in all five locale catalogs.
- Either way, `GetKashBanner` (`features/portfolio/components/get-kash-banner.tsx:10`) survives. It
  is the phone's separate banner, rendered at `portfolio-view.tsx:324`, and is not part of the rail.

---

## Tier 4: live bugs and stale comments found along the way

### 4a. `ws-chrome` (candidate 6): REFUTED, no bug

The premise does not hold. `.ws-chrome` **does exist** in `app/globals.css`, at line 178, inside a
`@media (max-width: 767px)` block:

```css
@media (max-width: 767px) {
  .ws-chrome {
    background-image: linear-gradient(177deg, #ffffff 0%, #ededf0 38%, #cbcbd1 63%, #f5f5f8 100%);
    ...
  }
}
```

Three points establish that the mobile CTA is styled correctly:

1. It is a plain CSS rule, not an `@utility`, so Tailwind emits it verbatim and the `source(none)`
   content scan documented at `globals.css:1` to `:14` cannot drop it.
2. `features/casino/components/arkade-mobile.tsx:89` renders inside the `md:hidden` branch at
   `app/(session)/casino/page.tsx:31`, so it only ever paints below 768px, exactly the range the
   media query covers.
3. The rule sets an opaque `background-image` gradient, which paints regardless of whether the
   element carries a `background-color`.

`ws-chrome-pill` (`globals.css:268`) is the all-widths sibling, and its own comment at `:265` to
`:267` says `ws-chrome` is deliberately phone-gated: "The same brushed chrome as .ws-chrome, but at
every width ... it cannot be gated to phones the way .ws-chrome is." Swapping `arkade-mobile.tsx:89`
to `ws-chrome-pill` would be the wrong change. Eleven other call sites use `ws-chrome` the same way,
including `components/auth/email-form.tsx:10` and
`features/portfolio/components/balance-card-mobile.tsx:114`, whose comment at `:112` explains the
same phone gating.

No fix needed. This row is closed.

### 4b. `TRACKED_GAMES` duplication (candidate 5): RESOLVED IN FLIGHT

The duplication was real at the start of this audit: `features/casino/components/game-tile.tsx:80`
and `features/casino/components/arkade-mobile.tsx:35` each declared their own
`Record<string, Game | undefined>` with the same three entries.

Another agent fixed it during the audit window. The constant now lives at
`features/casino/lib/games.ts:195` and is imported at three sites:

- `app/(session)/casino/page.tsx:5`
- `features/casino/components/game-tile.tsx:6`
- `features/casino/components/arkade-mobile.tsx:14`

That is the right home, and it is where this audit would have recommended lifting it:
`features/casino/lib/games.ts` already owns `CasinoGame`, `GAME_CATEGORIES` and `filterGames`, it
already imports the `Game` type from `lib/analytics/events.ts:22`, and it sits at the correct layer
(`features/*/lib/`) for something two components in the same feature share.

One follow-up: the `game-tile.tsx:6` import site disappears when that dead file is removed
(row 1a), leaving two.

### 4c. Analytics regression, already caught and fixed, worth reading as a warning

`app/(session)/casino/page.tsx:14` to `:17` now carries this comment:

> The event fires here rather than in the tile. It used to ride on GameTile's Link, and replacing
> the hub with ArkadeDesktop took the only desktop call site with it, so game_opened silently
> stopped reporting on desktop.

This is the exact failure mode this audit is about, and it already cost a working feature once
during this redesign. Every Tier 1 removal below should be checked for a behaviour that rides on the
dead component rather than on the route.

### 4d. Stale comment: `app/topbar-preview/page.tsx:3-5` (candidate 9): CONFIRMED

```
// Temporary preview for the ported ray-fan topbar (from new-approach-ui).
// Renders the non-home variant (avatar + centred MARKET wordmark); the home
// variant shows the account name + address in the same slot. Delete once verified.
```

True on phones only. `components/layout/topbar.tsx:78` gives the name and address block
`md:flex`, so it shows on every desktop screen regardless of route, and `:90` makes the `MarketLogo`
wordmark `md:hidden`. The page-level note at `:12`, "Preview: non-home variant shown (pathname
!= /portfolio)", is accurate; only the description of what that variant looks like is stale.

### 4e. Stale comment inside the component itself, contradicting a correct one 25 lines below

`components/layout/topbar.tsx:40` to `:41`:

> Only the home (portfolio) shows who you are; every other page puts the MARKET wordmark in the
> centre instead of the account.

`components/layout/topbar.tsx:66` to `:69`:

> The desktop head carries the name and the address on every screen, which is what the design
> repeats across all seven. The phone keeps its own rule: name and address on home, the centred
> MARKET wordmark everywhere else.

The second is correct and matches the code. The first is the pre-redesign rule. One of the two has
to go, and the preview page's comment (4d) was copied from the stale one.

### 4f. Stale comment: `features/casino/components/arkade-mobile.tsx:120`

> From `md` up the desktop `HubSection` takes over, so this renders phone-only.

`ArkadeDesktop` takes over, per `app/(session)/casino/page.tsx:41`. The behaviour described
(phone-only) is still correct; only the named component is wrong.

### 4g. Misleading barrel line: `features/casino/index.ts:2`

Still re-exports `HubSection`, a component no route mounts. This is the barrel-hides-death pattern
the method section warns about, and it is why a naive grep makes `HubSection` look used.

---

## Preview and scratch routes (candidate 10)

There is no `middleware.ts` in this repo, and none of these routes carry an env gate. All four ship
in the production build as publicly addressable pages.

| Route                                    | Verdict                                   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/preview-market/`                    | **Does not exist.**                       | Untracked directory present at session start, absent from disk at 19:36. Never tracked in git (`git ls-files` has no entry). Nothing to remove. Another agent removed or renamed it during the audit window.                                                                                                                                                                                                                                                               |
| `app/topbar-preview/page.tsx`            | Leftover. Safe to remove.                 | Comment at `:5` says "Delete once verified". The topbar it previews has since shipped (`components/layout/topbar.tsx` is imported by the app shell), and the page's own description of it is now stale (4d). It has served its purpose.                                                                                                                                                                                                                                    |
| `app/prediction-mobile-preview/page.tsx` | Leftover. Safe to remove.                 | Comment at `:4` says "Delete once done". It exists to scroll `PredictionMobile` to its second slide so one crop could be checked. `PredictionMobile` is live on the phone home at `app/(session)/(app)/dashboard/dashboard-page.tsx:300`, so the real thing is reviewable in the app.                                                                                                                                                                                      |
| `app/promo-rail-preview/page.tsx`        | Keep until Tier 3 is answered.            | Comment at `:4` says "Delete once verified". It is the only place the rail can be reviewed without signing in and reaching desktop width. If the rail stays and gets a rollout-era art pass, this is the harness for that pass. If the rail goes, this goes with it.                                                                                                                                                                                                       |
| `app/(session)/market-preview/page.tsx`  | Deliberate harness, but fix or remove it. | Comment at `:3` to `:4`: "under (session) for providers, no AuthGuard so it renders headless. Delete once verified." The `(session)` placement is a considered decision, not an accident: it gets the wallet providers without the shell. But the real `/market` route wraps the identical `MobileMarketView` in `AuthGuard` (`app/(session)/market/page.tsx:15`), and this one deliberately does not. That is an unauthenticated public route rendering the trading view. |

The argument for removing the three leftovers is not tidiness, it is that they are unauthenticated
routes in the production bundle that nobody is reviewing for regressions. If they are worth keeping
as review tools, they should be gated the way the launch switch gates other surfaces
(`lib/launch-gate.ts`, `NEXT_PUBLIC_APP_ACTIVE`), rather than left open with a "delete once
verified" note that has outlived the verification.

---

## Moving targets: in-flight adoptions that will change these answers

Eighteen new components landed with the redesign. Their adoption state as of 19:36:

**Adopted and reachable:**

- Spot desk: `features/trade/components/spot-desktop-view.tsx` is imported by
  `app/(session)/(app)/spot/page.tsx:4`. It pulls in `spot-asset-table`, `spot-asset-row`,
  `spot-pair-header`, `spot-amount-card`, `spot-order-summary`, `spot-order-mode-toggle`,
  `spot-quick-amounts`, `spot-trade-actions` and `components/ui/search-field.tsx`. All reachable.
- Perps: `chart-panel-shell.tsx` and `leverage-desktop-layout.tsx` are imported by
  `features/trade/components/hyperliquid-pro-perps.tsx:8` and `:9`, which is reached from
  `/perps` via `PerpsSection` and `perps-view.tsx:13`. Reachable.
- Arkade: `arkade-desktop.tsx` and `arkade-desktop-row.tsx` reached from
  `app/(session)/casino/page.tsx:41`. Reachable.
- `features/portfolio/components/kash-card-mobile.tsx` reached from
  `features/portfolio/components/portfolio-view.tsx:21`. Reachable.

**Not yet adopted (the meme route rewire is still in flight):**

- `features/trade/components/meme-desktop-board.tsx:116` `MemeDesktopBoard`
- `features/trade/components/meme-market-metrics.tsx:198` `MemeMarketMetrics`
- `features/trade/components/meme-sell-panel.tsx:76` `MemeSellPanel`

Each has a test and no production importer. **Do not report these as dead.** They are new work
mid-landing. Re-check after the `/meme` adoption commits, because that commit will decide two rows
above it:

1. Whatever `MemeDesktopBoard` replaces inside `features/trade/components/meme-board.tsx` becomes
   the next stranding candidate.
2. It is the natural moment to settle row 2a, since `/meme` is the route the caching ADR wants
   wrapped in `SectionVisibility`.

**One more thing to check after the spot adoption settles:** `app/(session)/(app)/spot/page.tsx`
now branches on `useIsMobile()` rather than on `md:` classes, so `SpotSection` only ever renders at
phone width. Any desktop-only markup remaining inside `SpotSection` and its children is unreachable
in practice, even though it is still mounted. That subtree was not walked in this audit and is worth
a follow-up pass once the branch is committed.

---

## Two rows that need a second look

Reported at lower confidence. Each has exactly one extra occurrence inside its own file, which the
word index cannot distinguish from a mention in a comment.

- `features/casino/components/chess/chess-site-shell.tsx:119` `ChessSiteHeader`: no external
  importer. Verify whether the second occurrence is a real internal use.
- `features/prediction/components/bet-modal.tsx:33` `PredictionBetForm`: no external importer, but
  the file is live (`BetModal` is imported at `features/prediction/components/prediction-view.tsx:12`).
  Likely an over-broad `export` on a component used only inside its own file, in which case the fix
  is to drop the `export` keyword rather than the code.

The same caveat applies to `components/layout/nav-items.tsx:14` `SECTION_ICONS`, which the sweep
flagged but which is genuinely used at `nav-items.tsx:39`. Its `export` is what is unnecessary, not
the constant.

---

## Summary counts

| Tier                    | Files fully removable                                  | Individual exports removable                  |
| ----------------------- | ------------------------------------------------------ | --------------------------------------------- |
| 1, safe to remove       | 17                                                     | 10 additional exports in otherwise-live files |
| 2, unreachable but hold | 7 (meme section subtree) + 8 dashboard-brief consumers | 7 constants in `dashboard-page.tsx`           |
| 3, product question     | 0 pending an answer                                    | 0 pending an answer                           |
| 4, bugs                 | 0 real bugs, 1 refuted                                 | 4 stale comments to correct                   |

The single highest-value row is not a deletion. It is 1e: `lib/query-keys.ts` and
`hooks/use-deposit.ts` hold two byte-identical definitions of the cache keys that deposits run on,
and only four of 361 query sites use the factory that was meant to be the single source of truth.
