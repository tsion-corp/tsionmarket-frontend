---
date: 2026-09-15
feature: The Arkade hub gets a featured banner and new game art
scope: casino
scenario-impact: none
---

# The Arkade hub gets a featured banner and new game art

Ships #499 by Uchechukwu-Ekezie: a featured banner at the head of the Arkade
hub, rebuilt game cards on both desktop and mobile, a shared section header, and
self-hosted artwork in place of the Unsplash URLs the cards used to load.

`featuredImage` is new on a catalogue entry: the banner's wide backdrop, which
is a different crop from the card cover, falling back to `image` when unset.
Strings are in all five catalogues.

## What was fixed before merging

**It re-imported `PortfolioFab` through the `features/portfolio` barrel.** That
import was deep-linked in #479 precisely because the barrel also exports
`PortfolioView`, which the shell then drags into the first load of every route.
Restoring the deep import saves, measured on this branch:

| route      | via the barrel | deep import |
| ---------- | -------------- | ----------- |
| /dashboard | 1588           | **1473**    |
| /activity  | 1610           | **1499**    |
| /casino    | 1873           | **1812**    |
| /spot      | 1630           | **1570**    |
| /meme      | 1635           | **1578**    |
| /rwa       | 1635           | **1573**    |

**It raised the first-load budgets, and did not need to.** The branch carried a
stale copy of the ratchet from before #479 resolved it, adding 40–60 kB to six
routes and fifteen new chess entries at 1940–1950. Measured against staging's
existing budgets, every route on this branch passes with room to spare, and
every chess route lands at 1872–1880, under the 1900 default, so none of them
needs an entry at all. The budget file is restored to staging's.

## How it was verified

Built twice on the merged tree and compared with `pnpm bundle:report`: once as
filed, once with the import restored, which is where the table above comes from.
`pnpm bundle:check` passes on staging's unmodified budgets.

Full `./scripts/preflight.sh` clean: 4,746 tests.

## Noted, not changed

The new artwork is 2.0 MB of PNG across seven files, the largest being
`arkball.png` at 872 kB, drawn through plain `<img>` rather than `next/image`.
The comment justifying `<img>` says the covers are remote URLs the app sets no
`remotePatterns` for — this PR makes them local, so that reason no longer holds
and `next/image` could serve AVIF at the rendered size. Left as it is: the hub
already ships `public/casino/arkball/hero.png` at 1.8 MB, so this is the
existing practice rather than a regression, and re-encoding someone's artwork is
not a reviewer's call. Worth doing as its own change.
