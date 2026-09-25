---
date: 2026-09-25
feature: Load positions returns to the prediction page, and the holdings rows get their gutter back
scope: fix
scenario-impact: needs_automation
---

# "Your positions" is back on /prediction

A signed-in user with an open bet had no way to reach it from the prediction
page: no way to check it, claim a win or cash out. The panel is mounted again,
directly under the Shine switch and above the market list.

## What actually happened

This is the second time the panel has gone missing, and it was not #517.

It shipped in **#505**, which found `PredictionPositions` orphaned rather than
deleted: its only importer was `prediction-market-list.tsx`, which no route
renders. #505 mounted it in `trending-markets-feed.tsx`, the component
`/prediction` actually renders, and **#508** then gave it spacing and a real
empty state.

**#558 (`Feat/decane migration v2`) removed it again.** That branch was cut
before #505 and merged with main's side discarded, so it took the mount, the
controller and the whole 118-line `trending-markets-feed.test.tsx` with it. The
panel returned to exactly the orphaned state #505 had fixed, which is why
`PredictionPositions` had one importer again and no route rendered it.

Worth knowing for anything else that looks missing: #558 is a merge that
discarded main's side of the files it touched, so this is unlikely to be the
only thing it dropped. It is the first place to look.

## What changed

- `trending-markets-feed.tsx` mounts `PredictionPositions` again, with
  `usePolymarketPositionsController`. Placement is under the Shine switch and
  above the market list, on both phone and desktop: the panel is inside the
  same `max-w-[1350px]` wrapper the switch uses, so it takes the page gutter
  rather than the list's full-bleed rows and needs no breakpoint of its own.
- `trending-markets-feed.test.tsx` is restored.

Mounting it still costs the prediction service nothing. The controller holds no
query and polls nothing: it is state plus a refresh callback, so nothing is
requested until somebody presses Load. That is asserted, not assumed.

## Holdings rows

The token rows in "Your holdings" had vertical padding but no horizontal
padding, so the label and the amount sat flush against the sheet edge and the
hover band ran edge to edge like a stripe rather than reading as a row. They
take `px-2` now.

The loading skeletons beside them take the same padding, in both the coins list
and the memecoins one. Without that the list would step sideways the moment the
real rows replaced the skeletons.

## Tests

Three suites render this feed and all three predate the current dependency
tree, so each needed its setup brought up to date rather than its assertions
weakened:

- `prediction-view.test.tsx` asserted "Your positions" was **absent**, which is
  the assertion #505 had already inverted once. It asserts the panel is offered
  above the market list again, checked by document position rather than by
  reading the markup order.
- `trending-markets-feed.test.tsx` needed a stand-in for the Shine switch,
  which landed on this page after the suite was written and reads an account
  preference through React Query.
- `category-markets.test.tsx` renders the same feed and needed the intl
  provider and the controller stand-in.

Full suite: 6849 passed, 3 skipped. Typecheck, production build and bundle
budget all clean; lint reports no new warnings.
