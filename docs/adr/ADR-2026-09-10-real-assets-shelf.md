# ADR-2026-09-10: the "Own the Real World" shelf

## Status

Proposed. Awaiting maintainer approval.

## Context

The dashboard's discovery area has four shelves, each a heading that leads to
a desk and a carousel of cards under it with prev and next controls: token
moves, the conversation, the next 100X memecoins, predictions. Real assets
returned to the build on 2026-09-09, and the desk lists 45 tokenised assets
across six chains: US treasuries and money-market funds with a published
yield, tokenised stocks and ETFs, gold, private credit, real estate and
carbon. The dashboard says nothing about any of it.

Onboarding asks for one interest. Five of the eight answers, stocks, gold,
yield, real estate and treasuries, map to the Real assets section (see
`INTEREST_TO_SECTION` in `lib/sections.ts`); the choice is kept in
`localStorage` under `ws.interest.v1` and read through `lib/preferences.ts`.

The shelf must not look like the memecoin shelf. Memecoins are chips, sunbursts
and "is Booming". Real assets are yield, ownership and issuers with names.

## Decision

A fifth shelf, "Own the Real World", last on the desktop and phone discovery
areas, rendered only for a reader whose saved interest maps to Real assets.

**Four cards**, each a distinct hue and motif drawn in CSS, each featuring
live assets from one category and leading into the desk:

| Card        | Category                        | Motif                                                  | Featured                                                     | Action      |
| ----------- | ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ | ----------- |
| Gold        | commodity                       | three bevelled bars in a soft glow, charcoal to bronze | best-priced gold token (PAXG, XAUt, GLDx) with price and 24h | Buy         |
| Treasuries  | treasury, fund, cash-equivalent | the yield figure in a ring, navy to teal               | the highest published APY (USTB 3.76%, USDY 3.60%)           | Earn        |
| Real estate | real-estate                     | a skyline with lit windows, slate to terracotta        | PRO, PRCL, LAND with price and 24h                           | Own a share |
| Stocks      | equity                          | a restrained ticker tape of the xStocks, ink to forest | rotates through TSLAx, NVDAx, SPYx, AAPLx every ten seconds  | Trade       |

Every figure is the feed's. A card with no live asset shows its category and
issuer copy and the desk link, never an invented number. Every action leads
to `/rwa`, the only desk that trades these.

**Data comes from the dashboard feed, not a new poll.** The feed's `rwa`
section grows from the top eight listed assets to every listed asset, and
each row carries `category` and `apyBps` alongside the price and change it
already has. The server composes and caches the feed once for everyone every
twenty seconds; the client already polls it every thirty for the briefs and
the conversation cards. The route's adapter (`dashboard/discovery/real-assets.ts`)
picks the four featured assets from that section and formats them. No RWA
hook is mounted on the dashboard, so the registry's 60-second poll and the
price enrichment stay on the desk where they belong.

**Gating** is a client read of the saved interest through a small
`useInterest` hook on `useSyncExternalStore`, with a null server snapshot so
the first paint matches and the shelf appears after hydration for the
readers it is for. A reader with no saved interest, or one that maps
elsewhere, never sees it.

## Consequences

- One more feed field. `lib/dashboard-feed.ts` gains `category` and `apyBps`
  on `RwaBriefRow`; the rwa section returns all listed assets (about 30 rows
  after dedupe) rather than eight. The brief that already reads the section
  still slices its own four.
- Discovery gains a `RwaSpot` type and the `RealAssetsRow` with its four cards;
  `features/discovery` imports nothing from `features/rwa`, per the layering.
- New `discovery.*` strings in five catalogs.
- Tests: adapter (grouping, formatting, no invented figures), each card's
  idle and live copy and links, row order and gating, feed composer rows.

```
dashboard feed (server, cached)  ──rwa rows──►  route adapter  ──RwaSpot[]──►  RealAssetsRow
                                                                                   ├─ GoldCard
localStorage ws.interest.v1 ──► useInterest ──► interestToSection === "rwa" ──►     ├─ TreasuriesCard
                                                                                   ├─ RealEstateCard
                                                                                   └─ StocksCard
```

## Amendment, 2026-09-10

The shelf shows for everyone. A reader from before onboarding asked for an
interest has none saved, and would otherwise never meet real assets on the
home screen. The saved interest now only decides where the shelf sits: first
in the discovery area for a reader whose interest maps to Real assets, last
for everyone else.
