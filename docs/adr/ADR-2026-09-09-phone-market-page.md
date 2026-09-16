# ADR-2026-09-09: the phone Market page on the 2.0 build

## Status

Proposed. Awaiting maintainer approval.

## Context

PR #428 (`consolidating-2.0-ux-with-staging`) gives the phone one Market page,
`/market`, with tabs for Spot, Leverage, Memecoins and Prediction. Each tab is a
full-screen phone surface: the Spot and Memecoins tabs are paged lists that open
a ticket in place, the Prediction tab hosts the market list with its bet modal,
and the Leverage tab embeds the perps desk. Its latest commit (6e77fdf0) pairs
each tab with the matching desktop route in both directions: below `md` the
`/spot`, `/meme` and `/prediction` pages hand off to `/market?tab=<tab>`, and at
`md` and up the Market page hands off to the desktop route.

ui/2.0 removed `/market` with the Explore market, because the page carried a
perps tab and the Explore prediction routes. Its phone therefore keeps the older
per-page surfaces: `/spot` draws `SpotSection` below `md`, `/meme` draws
`MemeBoard`, and the dock's second icon goes to `/spot`. The two phones have
diverged, and every further commit on #428 widens the gap.

## Decision

Bring the phone Market page to ui/2.0 without its Leverage tab.

- `app/(session)/market/page.tsx`, `features/trade/components/mobile-market-view.tsx`,
  `features/trade/hooks/use-fit-rows.ts` and `hooks/use-market-handoff.ts` come
  from the PR head as they are, except that the view's tab table, desktop-route
  map and render lose the Leverage entry and the perps import.
- `features/prediction/components/prediction-market-list.tsx` comes from the PR
  head with its detail links removed: this build has no
  `/prediction/markets/[eventId]` route, so a card's question is plain text and
  the Yes and No buttons remain the way in, through the bet modal.
- `/spot`, `/meme` and `/prediction` take the PR's handoff: below `md` they
  render nothing and replace the URL with the matching Market tab.
- The dock's second icon opens `/market`. The centre icon keeps opening Market
  Square in a new tab, and the last icon keeps opening the drawer: on this
  build the drawer is the phone's only way into Real assets, Memecoins and
  Prediction by name, so it is not traded for Activity as the PR does.
- The eight catalog strings the PR added for the Market page's metrics panel
  and the prediction cards are added in all five locales. `tabLeverage` is
  dropped from all five, since no tab reads it.
- `vitest.setup.ts` gains the PR's inert `ResizeObserver`, which the fit-rows
  measurement needs to mount under jsdom.

## Consequences

- The phone matches #428's Market page, minus Leverage, so later commits on
  that branch merge onto a like-for-like base.
- `SpotSection` and `MemeBoard` stop being the phone's trade surfaces. They
  stay in the tree: the desktop meme desk still composes `MemeBoard`, and
  `SpotSection` is left for the follow-up that decides its fate.
- A phone user opening `/spot`, `/meme` or `/prediction` by URL lands on the
  Market tab instead. Desktop users see no change.
- When perps come to production, the Leverage tab is one entry in the tab
  table and one import away.

```
phone (<md)                                  desktop (>=md)
/market?tab=spot        <-- hands off -->    /spot
/market?tab=memecoins   <-- hands off -->    /meme
/market?tab=prediction  <-- hands off -->    /prediction
dock icon 2 -> /market                        rail -> /spot
```

## Amendment, on approval

Built with these changes to the decision above:

- **A Real assets tab.** The phone Market page has four tabs in the rail's
  order: Spot, Memecoins, Real assets, Prediction. The Real assets tab hosts
  the desk's own section through a slot the route composes, the way
  Prediction does, and `/rwa` hands off to it below `md`.
- **No drawer on the phone.** The 2.0 phone has no toggleable sidebar, so the
  dock's last icon opens Activity as the PR does, and the shell no longer
  wires a drawer opener. Real assets is reached through its Market tab.
- **Fonts stay production's.** The PR's Chewy, Quicksand and Inter are not
  brought back. The Kash banner's headline, which the PR fits with a table of
  Chewy glyph widths, now measures the rendered Mona Sans headline and scales
  to its slot, so it no longer overlaps its subline.
- **The phone balance card** carries the coins button beside the currency
  pill, opening the holdings modal, in place of the question mark that opened
  the walkthrough. The holdings launcher is shared with the desktop card.
- The Enter the Arena banner stays out: its only destination is the perps
  desk.
