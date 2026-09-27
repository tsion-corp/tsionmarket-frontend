---
date: 2026-09-27
feature: Checkers comes off production
scope: chore
scenario-impact: updated
---

# Checkers is hidden on production

By the team's call: it is not ready to be offered. Nothing is deleted, and the
whole game — components, hooks, API clients, tests — stays in the tree.

## What a player can no longer reach

Four entry points, not one. The card in the screenshot was the obvious one; the
others would have kept the game reachable after it was removed.

| Surface                           | Change                                                          |
| --------------------------------- | --------------------------------------------------------------- |
| The Arkade hub card               | Catalogue entry commented out in `features/casino/lib/games.ts` |
| The Discovery carousel card       | Not dealt in `features/discovery/components/arkade-row.tsx`     |
| The dashboard live marquee        | The `checkers` arm of `liveEventsFrom` is off                   |
| Seven `/casino/checkers/*` routes | Redirect to `/casino`                                           |

The routes redirect rather than 404 so a shared invite link or a bookmark lands
somewhere real. The feed still carries live checkers matches; the marquee
simply does not chip them, because a chip would link to a route that now
redirects away.

## One knock-on, deliberately left

`lib/shine/arcade.ts` reads a game's display name out of the catalogue, so with
the entry commented out a checkers win would post to Shine as "checkers" rather
than "Checkers". That path is unreachable while the game is hidden —
`useDraughtsShine` is mounted only by `checkers-play.tsx`, and that route
redirects — so the fallback is recorded in the tests rather than worked around.
Restoring the catalogue entry restores the name.

## Restoring

Uncomment the catalogue entry, the discovery card and its import, and the
marquee arm, then restore the seven route files from git. Each carries a
comment pointing at the others. `games.test.ts` asserts the game is absent, so
a half-restore fails there rather than shipping.

## Verification

`./scripts/preflight.sh` clean: 719 test files, 7,321 tests, 0 lint errors,
production build compiled, first-load budgets under.
