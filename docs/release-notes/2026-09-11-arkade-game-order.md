---
date: 2026-09-11
feature: Arkade game order
scope: casino
scenario-impact: updated
---

# Arkade game order

## What changed

The Arkade lists the games in the order the team set on 2026-09-11:

1. Last Man
2. Chess
3. ArkBall
4. Checkers

Last Man takes the hero slot, four of the six columns, and Chess the
two-column slot beside it, so the first row still fills the grid. ArkBall
and Checkers follow. Every other game keeps its place after them.

The order lives in one place, the game catalogue in
`features/casino/lib/games.ts`. Every surface reads it in sequence, so the
desktop grid and the phone stack both follow it without changes of their
own.

## Tests

`features/casino/lib/games.test.ts` pins the four positions, that the first
tile is the hero, and that the first row spans six columns.

## Scenarios

- Open the Arkade on a desktop: Last Man is the large first tile, Chess
  beside it, then ArkBall and Checkers.
- Open it on a phone: the same four, top to bottom.
