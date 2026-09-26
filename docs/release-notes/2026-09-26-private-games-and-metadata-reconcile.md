---
date: 2026-09-26
feature: Private games are real, the lobby lists only public ones, and a game's name actually arrives
scope: feature
scenario-impact: needs_automation
---

# Why the name never appeared, and private games

## The name was unreachable, not late

Reported twice with screenshots: a game named "TGIF" showed "Game 258".

The data was never the problem. `GET /games/258` returns
`{"title": "TGIF", "description": "All good"}` — the vault had it. Three
separate causes had to be cleared, and only the third made it visible:

1. **The submission was refused** (fixed in #570). The vault requires a
   `signer` field and compares it to the address it recovers from the
   signature; we never sent one. Silent, because naming is fire and forget.
2. **The socket wiped it** (fixed in #572). The keeper builds its snapshot with
   `toGameDto(game, usd)` — two arguments, where the third is the metadata — so
   no frame carries a name, and the snapshot replaced the cache wholesale.
3. **REST never refetched.** `refetchInterval: connected ? false : …` in both
   `use-vault-lobby` and `use-vault-game`. A name is bound when the reconciler
   indexes the `GameStarted` log, which is AFTER the row first appears. The one
   REST read had already happened, the socket then drove everything forever,
   and the name never arrived at all.

Carrying a known name across snapshots protects one you already have; it cannot
conjure one you never got. So both hooks now run a slow reconcile (20s) even on
a healthy socket. It is the only path by which anything the snapshot does not
carry can reach the client.

The lobby's test asserted exactly one read while the socket was up. That
assertion _was_ the bug, so it is inverted rather than deleted, with a second
case pinning that the reconcile stays slow and does not quietly become a poll.

The game's own page renders the name in the eyebrow beside "Prize pool", with
the description on one clamped line under it.

## Private games are real now

The v5.1 upgrade went on-chain on 2026-09-26. Verified three ways before any
code was written: `version()` returns `5.1.0`, `startGame(bool)` reverts _with_
error data (so the selector exists and only rejected a zero stake), and
`games(1)` returns 11 words instead of 10, the extra one being `isPrivate`.

- The ABI is regenerated from the backend's own artifact with
  `scripts/generate-vault-v5-abi.mjs`. The frontend's copy had only two
  `startGame` overloads; it has four now. The generator's own comment forbids
  hand-typing this file, and the reason is good: v5's `games()` tuple gained
  fields in the middle, and a transcription that looks right decodes a pot of
  7.49e29.
- `startGameCalls(vault, stake, isPrivate)` uses the three-argument overload.
  The contract records the choice and emits `GamePrivacySet`, which is what
  puts `isPrivate` on every row the service serves.
- `publicGames()` filters the lobby. An absent or malformed flag reads as
  **public**: the failure that matters is a public game vanishing, not a private
  one appearing.

### What was removed, and why

The one-public-game cap is gone. It existed only because privacy was
unenforceable: every client had to compute the same "only the lowest id is
listed" rule so a private game was hidden from more than its creator. With a
real flag on every row it protected nothing and was hiding genuinely public
games from the lobby. Several public games can now run at once.

What remains of that workaround is the starter's own local record, for one
window: a game can reach the client before the reconciler has indexed its
privacy log, and until then the row honestly says public. Without it the
starter's private game appears in their own lobby for a few seconds. It only
ever hides, so one browser's list cannot reveal or affect anything for anyone
else.

### It is not access control

The vault is blunt about this and so is the code: anyone holding a game id can
still join a private game. The flag decides **listing**, nothing else. The
sheet's copy already says "Hidden from the lobby. Only your link gets people
in", which is honest about discovery — worth a product pass if it should say
more.

## Verification

Full suite **6969 passed**, 3 skipped. Typecheck, production build and bundle
budget clean; lint at its 145-warning baseline with none added.
