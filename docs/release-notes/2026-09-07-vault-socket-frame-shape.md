---
title: Last Man lobby survives a malformed socket snapshot
date: 2026-09-07
area: casino
scenario-impact: none
---

# Release Note: the Last Man lobby no longer breaks on a bad socket frame

## What happened

`/casino/last-standing` went to the error boundary with
`indexed.map is not a function`. The vault hub's periodic `activeGames`
snapshot arrived as `{"games": {}}`, an object where the contract says an
array. The socket handler wrote it into the React Query cache with only a
truthiness check, and the lobby's merge called `.map` on it.

Captured from the production hub on 2026-09-07:

```
{"type":"activeGames","topic":"vault:king-of-night","data":{"games":{}},"revision":458}
```

The vault keeper passes an array to its feed, so the shape changes
somewhere between the vault and the gateway. Reported to the backend team.

A second fault sits behind it: the vault's domain `Game` carries `potWei`
and `minWagerWei`, while the lobby renders the API view with `pot` and
`minWager` in USD. The socket feed publishes the domain shape, so when a
snapshot does arrive as an array, its rows have no `pot`, and a game card
died on `pot.usdValue`.

## What changed

Every game row is validated before it is kept, at both boundaries: the
REST list and the socket snapshot (`features/casino/lib/vault-game.ts`). A
snapshot replaces the lobby only when `games` is an array, and only its
well-formed rows are kept; a single game in the wrong shape is an error
rather than a half-rendered card. Malformed input is dropped with a console
warning and the last good snapshot stands. The polled REST read and the
chain read keep the lobby fresh regardless.
