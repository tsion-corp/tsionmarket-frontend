# ADR-2026-09-10: Discovery banner Buy CTAs open a trade modal, not a page

## Status

Proposed. Awaiting maintainer approval.

## Context

Three discovery shelves on the dashboard feature a live asset with a Buy
pill: "Stay Ahead of Token Moves" (spot, `token-moves-row.tsx`), "Find the
Next 100X" (memecoins, `next-100x-row.tsx`), and "Own the Real World" (RWA,
`real-assets-row.tsx` / `real-assets-cards.tsx`). Every one of those pills is
today a plain `<Link>` (or a `DiscoveryCta` wrapping one) to `/spot`,
`/meme`, or `/rwa`, which takes the reader off the dashboard just to buy.

That is the only place left doing it that way. The app already has a shared
modal stack for exactly this: `useAppModals()` / `<AppModalHost>`
(`components/layout/modals/app-modals.tsx`), mounted on the dashboard, spot,
rwa, and market pages. It opens a `DetailModal` in place, chart (via
`AssetChart`) and stats, whose primary button chains straight into the
asset's buy sheet: `BuySheet` for spot, `RwaTradeModal` for RWA. The
portfolio holdings list already opens this exact detail-then-buy sheet for a
held asset (`portfolio-view.tsx`'s `onOpenDetail`, `cta: buyMore`, `onCta:`
into `openBuy`/`openRwaTrade`), and the phone home's own "Token moves"
insight card (`features/trade/components/token-moves-section.tsx`) already
routes its Buy pill through `openBuy` instead of a link. Memecoins are the
one gap even in that existing machinery: `DashboardModal` only has a
`memeSell` variant, used to sell a held meme token from the holdings list;
there is no modal path to buy one yet, only the page.

Discovery's own card types (`TokenSpot`, `MemeSpot`, `RwaSpot` in
`features/discovery/types.ts`) are deliberately display-ready and formatted
only, by design: "the cards rotate through live content, but discovery must
not reach into trade... and each card takes a plain array of shapes... a
card formats nothing and rounds nothing." That means none of them currently
carries what a trade sheet needs: a raw `priceUsd` number, or, for RWA, the
registry's `network`/`address`. `dashboard-page.tsx` already holds the
richer objects these cards are built from (`useSpotMarkets`, the meme spot
source, the RWA registry) and already imports both `useAppModals()` and the
three row components. The data just isn't threaded down yet.

## Decision

Extend the existing modal stack to the three discovery shelves; do not build
a second one.

1. **One new `DashboardModal` variant, `memeBuy`,** mirroring the existing
   `memeSell`: same `MemeTradeSheet`, `defaultSide="BUY"`. `useAppModals()`
   gains an `openMemeBuy` opener alongside `openMemeSell`.

2. **Each card's Buy pill opens `openDetail(...)`** with the chart and
   stats, exactly the shape `portfolio-view.tsx` already builds for a held
   asset, whose primary CTA chains to:
   - `openBuy(...)` for a spot token,
   - `openRwaTrade({ ..., mode: "buy" })` for an RWA asset,
   - `openMemeBuy(...)` for a memecoin.

   This is the one pattern already in the codebase for "chart and stats,
   then buy." Nothing new is designed here; it is applied to three more call
   sites.

3. **Discovery types gain the minimum additive raw fields** each sheet
   needs. The three shelves are not equally cheap, and the RWA one reaches
   further than the other two:

   - **Spot** is free. `app/(session)/(app)/dashboard/discovery/tokens.ts`
     already holds a `MarketToken` with `priceUsd`, `name` and `logo`, and
     already formats `price` from that very number. `TokenSpot` gains
     `priceUsd: number`.
   - **Meme** is free. `discovery/memecoins.ts` already receives whole
     `MemeToken` objects from `useTrendingMemes` and discards all but five
     display fields. `MemeSpot` carries the `MemeToken` through, which is
     what `MemeTradeSheet` takes anyway.
   - **RWA needs a server change.** `RwaTradePayload` requires `network` and
     `address`, and `RwaBriefRow` (`lib/dashboard-feed.ts`) carries neither,
     only `id`. The composer already has both in hand: `lib/server/
dashboard-feed.ts` reads `a.chain` and `a.address` to build
     `rwaLogoPath(a.chain, a.address)` and then drops them. So this is two
     additive fields on a row the composer already assembles, not a new
     fetch, a new poll, or a registry hook on the dashboard. The alternative,
     resolving the asset client-side by id, would mount the RWA registry on
     the dashboard, which ADR-2026-09-10-real-assets-shelf deliberately
     avoided; we keep that promise.

   Everything then flows through `dashboard-page.tsx`, which already sits
   above `features/discovery` and `features/trade`/`features/rwa`. No
   cross-feature import is introduced: discovery still imports nothing from
   trade, meme, or rwa.

   One open detail for implementation: the registry's `chain` and the
   `network` string `RwaTradeModal` expects are not obviously the same
   vocabulary. Whoever implements the RWA path resolves that mapping against
   the modal's actual expectations rather than assuming the two match.

4. **Only the per-card action pill changes.** Each shelf's heading link
   ("View all" to `/spot`, `/meme`, `/rwa`) and the placeholder card shown
   when there is no live asset to feature keep navigating; there is nothing
   to show a detail sheet on in that case.

5. **The full pages are untouched.** `/spot/[symbol]`, `/meme`, `/rwa` keep
   working exactly as they do. The modal is a faster path layered on top for
   the dashboard's discovery shelves, not a replacement.

6. **Out of scope:** the portfolio feature's own banners, `KashBanner`,
   `GetKashBanner`, `SetTheStakeBanner`, `MarketSquareBanner`. None is a
   spot/RWA/meme buy CTA (Kash top-up, staking, an external Square
   deployment), so none changes. The portfolio holdings list is the existing
   reference implementation for this pattern, not a gap to close.

## Consequences

- `lib/modal-types.ts`: one new `DashboardModal` member, `memeBuy`.
- `components/layout/modals/app-modals.tsx`: one new opener and one new
  render branch, mirroring `memeSell`.
- `features/discovery/types.ts`: additive raw fields on `TokenSpot`,
  `MemeSpot`, `RwaSpot`. Existing consumers of these types are unaffected;
  nothing is removed or reformatted.
- `lib/dashboard-feed.ts` and `lib/server/dashboard-feed.ts`: `RwaBriefRow`
  gains `chain` and `address`, both already read by the composer. The feed
  is cached and shared, so this widens a payload every dashboard already
  fetches rather than adding a request.
- `token-moves-row.tsx`, `next-100x-row.tsx`, `real-assets-row.tsx` /
  `real-assets-cards.tsx`: the live-asset Buy pill swaps its `<Link href>` /
  `DiscoveryCta` for the corresponding modal opener.
- `dashboard-page.tsx`: threads `modals.openDetail` / `openBuy` /
  `openRwaTrade` / `openMemeBuy` into the three rows, alongside the `modals`
  it already holds for the portfolio view.
- The hook(s) backing `useTokenSpots` / `useMemeSpots` / `useRwaSpots` return
  the additive fields already available in their upstream source.
- Tests: a regression test per row proving the Buy pill opens the detail
  modal with the right payload and chains to the right buy sheet, instead of
  rendering a navigating anchor; a test for the new `memeBuy` branch in
  `app-modals.tsx`.
- **Coordination note:** a second concurrent session is reworking
  `components/ui/carousel.tsx`'s call sites in these same three row files
  (chevron buttons to a dot indicator, prop-only changes to the `<Carousel
.../>` invocation). This work starts on those files only after that change
  lands, to avoid a merge collision.

```
dashboard-page.tsx (useAppModals, useTokenSpots/useMemeSpots/useRwaSpots)
        │
        ├─ openDetail/openBuy/openRwaTrade/openMemeBuy ──► TokenMovesRow
        ├─ openDetail/openBuy/openRwaTrade/openMemeBuy ──► Next100xRow
        └─ openDetail/openBuy/openRwaTrade/openMemeBuy ──► RealAssetsRow

on Buy pill tap:
  card ──openDetail(chart+stats)──► DetailModal ──primary CTA──► BuySheet / RwaTradeModal / MemeTradeSheet(BUY)
```
