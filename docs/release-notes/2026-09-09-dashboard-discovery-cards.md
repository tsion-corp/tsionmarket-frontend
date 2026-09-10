---
title: The dashboard's discovery shelves show what is live
date: 2026-09-09
area: ui
scenario-impact: needs_automation
---

# Release Note: discovery shelves, one live thing to a card

## What changed

The four shelves under the dashboard's balance cards now deal live content
rather than editorial stand-ins, and every button on every card is a link
that works.

- **Stay Ahead of Token Moves on Spot.** Renamed from "Stay Ahead of Token
  Moves". The Eth Africa promo is gone; the shelf deals up to three coins
  from the spot ranking, one to a card, and every card moves one place when
  the featured coin advances. With nothing to feature the shelf is not drawn.
- **Join the Conversation.** Four cards join the chess room: the Last Man
  round (the richest open round, its pot and its clock, a link into it),
  the rooms live on Market Square (host, title, faces, links into the room
  and to the square in a new tab), Checkers (matches live right now, links
  to play and to the rules) and ArkBall (links to the game and the Arkade).
  The heading opens Market Square in a new tab. A hidden square drops its
  card and the heading falls back to chess.
- **Find the next 100X on Memes.** Renamed. The two Pepe cards are gone;
  the shelf deals up to three trending memecoins, black card, orange card,
  black card, each with its own move on the chips and its ticker in the
  heading. A listing named after a link (a repository, a website) is no
  longer featured. With nothing to feature the design's Pepe and Shiba
  stand in as before.
- **Your Next Prediction Starts Here.** Each card carries one pill, Predict
  Now, into the market on show.

## The bug fixed

The looping carousel switched every cloned slide off with `inert`. On the
last real position, a three-slide two-up loop fills the frame beside the
last slide with a copy of the first, so the card the reader saw had a
button that did nothing. A copy that is in the frame is now live; copies
behind the frame stay inert so nothing is read out or tabbed through twice.
Regression test: `components/ui/carousel.test.tsx`.

## Files

- `features/discovery/components/conversation-card.tsx` (new): the shared
  frame, face scatter, pills with new-tab support.
- `features/discovery/components/conversation-cards.tsx` (new): the four
  cards.
- `features/discovery/hooks/use-live-conversations.ts` (new): the square's
  live lane, polled every minute, idle when the square is hidden.
- `features/discovery/components/conversation-row.tsx`,
  `token-moves-row.tsx`, `next-100x-row.tsx`, `prediction-starts-row.tsx`,
  `discovery-row.tsx`, `components/ui/carousel.tsx`.
- `app/(session)/(app)/dashboard/discovery/memecoins.ts`: link-named
  listings are not promotable.
- `messages/{en,de,es,fr,pt}.json`: new `discovery.*` strings; the Eth
  Africa and "See Other Prediction" strings removed.
- `public/market/token-coin.svg`, `token-coin-right.svg`,
  `token-crowd.svg` removed.

## Scenarios

Manual, on the preview: step every shelf with the arrows and click a pill
on each visible card, including the one beside the last slide. Open the
square card's links and confirm they land on square.tsionark.com in a new
tab. Automation for the carousel's last-frame case exists; the shelf-level
flows still need a browser scenario.

## The phone home

The same three changes, on the phone's own sections:

- "Join the Conversation" is the desktop row, one card to a frame, in
  place of the static chess image with link zones over it.
- "Stay Ahead of Token Moves on Spot" shows the featured mover and the
  mover after it, in place of the Eth Africa promo.
- The prediction banner carries Predict Now only.

## Picked from PR #428 (consolidating-2.0-ux-with-staging)

Merged the open PR's delta over staging, then dropped again what this
build does not carry: the perps components, the Explore event detail, the
phone Market page and the prediction market list only it rendered. Kept:
the meme desk rebuild (board, chart, live transactions, trade ticket, base
units, swaps hook, trade sheet states), the spot ticket and spot section,
the Arkade game card shared by phone and desktop, the prediction card's
click fix, the phone prediction banner redesign (Predict Now only, opening
the desk), Polymarket volume, and the new catalog strings. The meme board's
fresh reads are scoped to the traded network as on main.

## Real assets return

Checked live against the production gateway on 2026-09-09: `/v1/rwa/health`
and `/v1/gas-sponsor/health` answer ok, `/v1/rwa/assets` lists 45 assets
across Ethereum, Base, Arbitrum, BSC, Polygon and Solana, `/v1/rwa/quote`
and `/v1/rwa/build` validate requests, and `/v1/gas-sponsor/capabilities`
and `/v1/gas-sponsor/solana/sponsor` are served. Perps (`/v1/perp/*`) is
still not.

So the Real assets removal is reverted in full (page, desk, proxies,
client, trade modal, brief, feed section) and `HIDDEN_NAV_SECTIONS` in
`lib/sections.ts` is emptied, which is the switch that had kept the section
out of the rail on main. Real assets now shows in the desktop rail, the
phone drawer, the marquee and the dashboard briefs.

## The phone Market page

The phone now has the 2.0 Market page at `/market`, with Spot, Memecoins,
Real assets and Prediction tabs. Spot and Memecoins are paged lists that open
a ticket in place; Real assets hosts the desk's section; Prediction hosts the
market list with its bet modal. Below `md`, `/spot`, `/meme`, `/rwa` and
`/prediction` hand off to the matching tab, and the Market page hands back to
the desktop route at `md` and up. The dock's second icon opens the Market
page and its last icon opens Activity; the phone has no drawer. The phone
balance card's coins button opens the holdings modal. The Kash banner's
headline is fitted by measuring the rendered font. Leverage, the PR's fourth
tab, is not on this build.

## Banner headlines at production's font

The comp draws the Set The Stake and Get Kash+ headlines in Chewy and pins
what sits beside them at fixed offsets. At Mona Sans bold the headlines are
wider and ran into their taglines. Both are now fitted by measuring the
rendered text (`hooks/use-fit-text.ts`): the Set The Stake words are a row
whose pitch takes what the tagline leaves, and the Kash headline scales to
its slot. Fonts are unchanged.

## The Real assets tab as a list

The phone Market page's Real assets tab now draws the same list as the
Memecoins tab: logo, ticker and name on the left, price and the day's move
on the right, as many rows as the phone holds with the shared foot pager,
filtered by the page's search box. A tap opens the asset's sheet, which
carries Buy. The desk's section keeps its sheets and renders the list in
place of its table when hosted on the phone.

## Own the Real World (2026-09-10)

A fifth shelf on both the phone and desktop discovery areas, for everyone:
first for the reader whose onboarding interest was stocks, gold, yield, real
estate or treasuries, last for everyone else, including readers from before
onboarding asked. Gold, Treasuries, Real estate and Stocks cards, each in its own
hue with a motif drawn in CSS, each featuring live assets from the desk with
the feed's price, move or yield, each leading to the desk. The stocks card
rotates through the tokenised stocks. The cards read the dashboard feed the
page already loads: its real-assets section now carries every listed asset
with its category, issuer and yield, so no new poll is mounted. ADR:
`docs/adr/ADR-2026-09-10-real-assets-shelf.md`.
