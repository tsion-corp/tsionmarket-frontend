---
title: The Last Man lobby reads the chain only when the socket cannot tell it
date: 2026-09-09
area: casino
scenario-impact: none
---

# Release Note: Last Man lobby from 46 chain calls a minute to about 2

## What changed

The lobby made about 46 chain-RPC requests a minute while idle. Most fed
nothing: an activity feed the lobby never renders, a winners list for a
closed modal, and a games read fired twice by two timers. The WebSocket was
connected and pushing games, but the app dropped every row because the hub
describes a game in the contract's shape (`potWei`, `minWagerWei`) and the
handler expected the API's priced shape.

Now:

- The frame handler keeps the hub's contract-shaped rows as chain games,
  priced by the lobby the same way it prices its own chain reads. Tested
  with the frames captured from the hub on 2026-09-09.
- The chain games query has its own key, so invalidating the API list no
  longer refetches it, and the lobby no longer re-reads on every block.
- While the socket is up, the chain is reconciled once a minute; while it
  is down, every 8 s as before. Settled games are not polled while the
  socket is up; the `gameSettled` frame invalidates them.
- The lobby no longer reads recent activity. Game pages still do, and only
  poll it while the socket is down.
- Winners load when the Hall of Winners opens and stay fresh for five
  minutes.
- Live games are read on the server through `GET /api/vault/chain-games`,
  cached 10 s per instance with `s-maxage=8`, so every browser on the lobby
  shares one upstream read. The lobby makes no `/api/evm-rpc` request.

## Files

- `features/casino/lib/vault-game.ts`: `toChainGame`, `sortGameRows`.
- `features/casino/hooks/use-vault-socket.ts`: rows sorted by shape;
  `gameSettled` also invalidates the chain settled read.
- `features/casino/lib/last-standing/keys.ts`: `chainGames` key.
- `features/casino/hooks/use-vault-lobby.ts`, `use-vault-feeds.ts`,
  `components/last-standing/last-standing-lobby.tsx`.
- `lib/server/vault-chain.ts` (new, the Base read client moved here from
  the dashboard feed), `app/api/vault/chain-games/route.ts` (new),
  `features/casino/lib/vault-api.ts`: `fetchChainGames`.

## Decision records

- `docs/adr/ADR-2026-09-09-last-man-lobby-reads.md`
- `docs/adr/ADR-2026-09-09-last-man-lobby-reads-for-dummies.md`

## Verification

- `use-vault-socket.test.ts`: the captured hub frame lands in the chain
  games cache; mixed rows sort by shape; an empty snapshot clears both.
- `use-vault-lobby.test.tsx`: chain read once a minute with the socket up,
  every 8 s down; no activity or winners reads on the lobby; winners on
  modal open; socket rows priced into the list.
- `app/api/vault/chain-games/route.test.ts`.
- Manual: the lobby idle and a live game on the dev server with the
  Network tab open, socket up and with the hub URL blocked.
