---
date: 2026-09-25
feature: The Arkade shelf leads the dashboard, and its games get a new order
scope: ui
scenario-impact: updated
---

# The Arkade leads the dashboard shelves

## Where it sits

On `/portfolio` the balance cards come first, then the promo strip (Get Our
App, Set The Stake). Under those the dashboard draws a stack of shelves, and
the Arkade was fourth on desktop and third on the phone — below the fold on
both.

It now leads that stack, on both widths, directly under the promo strip.

```
desktop  before   Real assets*, Token Moves, Conversation, Arkade, Next 100X
         after    Arkade, Real assets*, Token Moves, Conversation, Next 100X

phone    before   Real assets*, Conversation, Arkade, Token Moves, Next 100X
         after    Arkade, Real assets*, Conversation, Token Moves, Next 100X
```

\* Real assets only leads when the onboarding interest points at it (stocks,
gold, yield, real estate, treasuries). The Arkade now sits above that too, so
no interest can push it down. Everything below the Arkade keeps the order it
had, `rwaLeads` included.

These shelves are hand-placed JSX in `dashboard-page.tsx`, so this is a move in
two blocks, one per width. **The navigation order is untouched** — `lib/sections.ts`
and `orderedSections()` are unchanged, so the rail, the phone drawer and the
tab bar still lead with whatever was picked at onboarding.

## Games

`CASINO_GAMES` in `features/casino/lib/games.ts` is the one catalogue, so its
array order is the Arkade page's order. It was Last Man, Chess, ArkBall,
Checkers, Arkjet, Pilot Chicken. It is now:

**Last Man → Arkjet → Pilot Chicken → Chess → ArkBall → Checkers**, then Ayo,
Poker and Racing as before.

The dashboard's Arkade shelf (`features/discovery/components/arkade-row.tsx`)
hand-writes its slides rather than reading the catalogue, so its order was
changed to match. The two are meant to agree and a test on each holds them
there.

### What follows from the catalogue order

Three things on the Arkade page are derived from the list rather than set
separately, so they moved with it:

- **The featured banner** takes the first three playable games, so it now
  cycles Last Man, Arkjet and Pilot Chicken. Only Last Man has entries in
  `FEATURED_STATS`; the other two show the banner without a stat column, which
  is what Chess and ArkBall did in those slots before.
- **Trending** is the first row of the list, and **New** is everything after
  it, so both shift by the same amount.
- **Layout is unchanged.** Last Man keeps the four-column hero and every game
  after it is the two-column "tall", so the first row still fills six columns —
  Arkjet simply sits where Chess did.

## Verification

Preflight clean. The game order is asserted in two places, both updated to the
new expectation and watched fail before the code moved:
`features/casino/lib/games.test.ts` and
`features/discovery/components/arkade-row.test.tsx`.

The shelf order itself is **not** covered by a test. `dashboard-page.tsx` has no
test today and rendering it needs the whole signed-in tree — session, wallet,
queries and the dashboard feed — so a test for the order of five JSX children
would be most of a harness for one assertion. Worth doing when that page gets a
harness for something else; called out here rather than left implied.

No new user-facing strings, so no catalogue changes.
