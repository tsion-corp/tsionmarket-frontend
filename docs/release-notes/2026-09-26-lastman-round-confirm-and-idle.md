---
date: 2026-09-26
feature: A game keeps its name, the winner suspense waits for the service, and the idle sign-out moves to six hours
scope: fix
scenario-impact: needs_automation
---

# Three fixes

These were written against #570 and missed its merge: the ship script had
already opened and merged that PR, so a second run pushed them to a branch
nothing was reading. They are cherry-picked onto the merged main here.

## 1. A game's name vanished a second after it appeared

Reported with screenshots: a game showed "TGIF / Testing" at 0:50 and "Game
256" at 0:30.

The vault keeper builds its lobby snapshot with `toGameDto(game, usd)` — two
arguments, where the third is the metadata — so **a socket frame never carries
a name**. `use-vault-socket` then replaced the games cache wholesale, which is
right for everything the snapshot does carry (a game missing from it has
settled or gone away) and wrong for the one thing it does not: absent meant
"not sent", and the code read it as "cleared".

So REST loaded the name and the next keeper snapshot wiped it.

`keepKnownMetadata` carries a name the client already holds onto rows the
snapshot lists. The snapshot still decides which games exist, so nothing is
resurrected by this; that is asserted rather than assumed.

## 2. "Calculating the winner" on a round that was still running

The arena opened the winner suspense on its own clock reaching zero, because
the service can be seconds behind and 00:00 with nothing happening is dead air.
If the round turned out to be alive it "quietly backed out" — the old comment's
words. It is not quiet to a player: the game appears to glitch at the exact
moment money is decided.

Zero is a signal now, not a verdict:

1. the clock hits zero, the arena asks the service, **the timer stays on
   screen** and no modal opens;
2. the service says the round ended, and only then does the suspense open;
3. the service says the clock has time on it, the timer simply carries on, and
   a toast says the round is still running, because a clock that visibly hit
   zero and then moved needs explaining.

`resolveRoundEndConfirmation` holds the decision and is tested on its own. A
six second deadline stops a slow service freezing the arena at 00:00, which is
the dead air the prediction existed to avoid. **A running clock beats the
deadline**: positive evidence the round is alive must never be turned into a
winner card by a slow answer, and that case has its own test.

## 3. Idle sign-out: two hours to six

`IDLE_TIMEOUT_HOURS` in `components/auth/auth-guard.tsx`. The toast already
interpolates the number, so every locale reads correctly with no other change.

Worth knowing about the timer, since the number alone is misleading: any of
mousemove, mousedown, keydown, touchstart or scroll resets the full six hours,
nothing that is not user input counts (a live game ticking down does not), the
countdown does not survive a reload, and it runs per tab.

## Verification

Full suite **6959 passed**, 3 skipped. Typecheck, production build and bundle
budget clean; lint at its 145-warning baseline with none added.

Rebased onto #571 rather than merged into it, and checked key by key across all
five locales: nothing from #571 is lost, one string is added.
