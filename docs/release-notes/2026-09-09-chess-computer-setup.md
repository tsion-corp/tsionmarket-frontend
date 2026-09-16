---
title: Lichess computer game setup
date: 2026-09-09
area: chess
scenario-impact: improved
---

# Release Note: computer games start from the Lichess lobby

## What changed

Selecting **Play against computer** now opens the Lichess game-setup modal
inside the chess lobby instead of navigating to the legacy challenge page.
Players choose Stockfish strength from 1 through 8 and play as White, Black,
or a server-selected random color before entering the round.

The form never accepts a player wallet from the browser. The frontend proxy
forwards the verified Privy session and embedded wallet, and the chess service
uses that authenticated identity when it creates the game. The resulting
round redirect remains inside the same-origin chess proxy.

## Verification

- Full frontend test suite: 2,230 passed, 3 skipped.
- Production build and first-load bundle budget passed.
- Full database-backed chess CI suite passed.

## Scenario impact

`improved`: computer play uses the Lichess setup and round flow with Privy
identity enforced server-side.
