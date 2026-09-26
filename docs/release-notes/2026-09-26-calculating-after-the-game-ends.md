---
date: 2026-09-26
feature: "Calculating the winner" only opens once the game has actually ended
scope: fix
scenario-impact: needs_automation
---

# The suspense was still opening on live rounds

Reported after #572: a round ended, "Calculating the winner" appeared, the
modal closed, and the timer was counting again.

#572 added a confirm step but guarded only one of the two ways a round can look
over. `shouldBeginRoundEnd` returns false as soon as `gameActive` is false, so
the **server-transition path never reached the confirm at all**: the effect
watching active -> inactive called `beginRoundEnd` directly.

That path is the one that misfires. The service derives `active` from
`endTime`, so a wager landing at the buzzer leaves a window where endTime has
passed but the extension is not indexed yet. For that moment the service
honestly reports the game inactive, the arena believed it, and the extension
then put time back on the clock.

## What changed

Both paths now go through the same confirm step, and `beginRoundEnd` has one
call site: the confirm effect. Nothing else can open the suspense.

An inactive report also has to **hold** before it is believed
(`ROUND_END_SETTLE_MS`, 2s) — long enough for a buzzer-beater wager to be
indexed and put time back on the clock, short enough that a real ending does
not feel stalled. A clock with time on it still beats everything, so no answer,
however slow, can turn a live round into a winner card.

| What the arena sees                     | What it does                             |
| --------------------------------------- | ---------------------------------------- |
| Clock has time on it                    | Round continues, timer carries on, toast |
| Inactive, just arrived                  | Waits                                    |
| Inactive, held 2s                       | Opens the suspense                       |
| No answer, local clock at zero, 6s gone | Opens the suspense                       |

The cost is up to two seconds between a genuine ending and the suspense. That
is the trade: the alternative is what was shipping, which showed a winner card
for a round that was still running.

## Tests

The old suite asserted an inactive report was believed at 500ms. That
assertion was the bug, so it is replaced rather than deleted, alongside the
cases for a clock that comes back inside the settle window and one that beats
the deadline.

Full suite **6982 passed**, 3 skipped. Typecheck, production build and bundle
budget clean; lint at its 145-warning baseline.
