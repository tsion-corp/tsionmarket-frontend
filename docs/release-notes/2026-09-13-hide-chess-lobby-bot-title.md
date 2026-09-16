---
title: Hide the chess lobby bot title
date: 2026-09-13
area: chess
scenario-impact: updated
---

# Release Note: lobby fallback opponents show only their player name

## What changed

Chess games filled by a lobby fallback opponent no longer show a `BOT` title
before the opponent's name in the round player panel. The opponent persona,
rating, and server-owned bot behavior are unchanged.

## Verification

- The Lichess round adapter test confirms that a lobby fallback opponent keeps
  its persona name and internal bot flag without receiving a visible title.

## Scenario impact

`updated`: chess round visual checks should expect only the fallback opponent's
name in the player panel.
