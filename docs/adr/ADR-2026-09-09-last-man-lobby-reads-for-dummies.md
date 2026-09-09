# ADR-2026-09-09: Why the Last Man lobby asked the blockchain 46 times a minute for nothing (Plain English Guide / ADR for Dummies)

## Status

Proposed — 2026-09-09, waiting for the maintainer to approve.

## The Problem

Open the Last Man lobby and leave it alone, and the browser asks the
blockchain provider about 46 times a minute: is there a game, has anything
settled, what happened recently, what block are we on. Providers charge per
question. Most of these questions were pointless:

- One feed, "recent activity", is fetched every 12 seconds and never shown
  on the lobby at all. It is the heaviest read on the page.
- The list of winners is fetched every 12 seconds to fill a panel nobody
  has opened.
- The list of live games is fetched twice as often as intended, because a
  "new block" timer and an 8-second timer both trigger it.
- There is a live feed from our own server, the WebSocket, that already
  announces games starting, players joining and games ending. It is
  connected and working. But it describes a game in the contract's own
  words, and the app expected a different wording, so the app threw every
  message away and kept asking the blockchain instead.

## What We Do

- Understand the live feed's wording. Its messages now land in the same
  place the blockchain answers do, priced the same way.
- While the live feed is up, stop polling the blockchain for games; check
  once a minute just to be sure. If the feed drops, go back to polling right
  away, exactly as the other lobby feeds already do.
- Stop fetching the activity feed on the lobby. The game page still has it.
- Fetch winners when someone opens the Hall of Winners, and refresh them
  when a game ends.
- Read the live games on our server, once for everyone, instead of once per
  browser.

## What Changes For Users

Nothing visible. Games still appear when they start, pots still move when
players join, and the winners panel still opens with current data. Under the
hood the lobby goes from about 46 provider calls a minute to about 2.

## What Does Not Change

The blockchain is still the final word. The lobby still reconciles against
it, and the moment the live feed is unavailable, polling resumes at the
current pace.
