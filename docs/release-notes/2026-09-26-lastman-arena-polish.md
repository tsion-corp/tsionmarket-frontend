---
date: 2026-09-26
feature: The arena names its own game, takes a typed stake, and asks the chain before naming a winner
scope: fix
scenario-impact: needs_automation
---

# Five fixes on the Last Man arena

All on `/casino/last-standing/[gameId]`, against the design that landed in #576.

## The heading is the game

The page used to print "The Last Man" over its tagline whatever game you were
looking at, and drew the starter's own name for the game separately, above the
stage. A named game now puts that name in the heading and the starter's
description on the line under it; an unnamed game falls back to the product's
name and tagline, which is what every game showed before naming existed. The
name is drawn once, not twice.

## The stake is a field

Stepping is in units of the game's own entry, so a ten-times stake was nine
presses of `+`. The figure is now editable: type over it, commit with Enter or
by leaving it, drop the edit with Escape. Both ends clamp rather than refuse —
under the game's minimum is what the contract reverts, over the balance is what
the player cannot pay — and the field redraws showing what it settled on.

Nothing is parsed in the card. It hands the raw text back to the section, which
owns the amount in base units and converts through the same FX rate the figure
was shown at. `moneyInputValue` / `moneyInputToUsd` in `lib/currencies.ts` are
the conversion, and `useMoney` exposes them as `toInput` / `fromInput`.

## The newest play is at the top

The activity table listed a round oldest first, so the play that just landed
appeared at the bottom of the page. It now reads newest first. The round count
still measures the run oldest first, which is what `currentRunActivities` is
for; only the table is reversed.

## No pop-out switch beside the clock

The redesign added a "Pop-out timer" pill to the stage card. The dialog that
catches a click leaving the arena already offers the floating clock, and that
is where a reader wants it, so the pill is gone. The leave prompt, the
picture-in-picture tiers and `MiniTimerHost` are untouched.

## The contract decides whether a round ended

**The defect.** "Calculating the winner" could open on a round that was still
running. The service's `active` is derived from an indexed `endTime`, and the
indexer trails the chain by a few blocks, so a wager landing on the buzzer
leaves a window where the service reports the round over while the chain has
already extended it. #575 added a settle window and a deadline to ride that
window out; it made the wrong call rarer without removing it.

**The fix.** The clock reaching zero now opens a progress toast and asks the
contract directly. `GET /api/vault/status?id=<n>` reads `games(id)` over
`BASE_READ_RPC_URL` and compares `endTime` against the latest block's own
timestamp, not the reader's clock. A wager extends `endTime` in the
transaction that places it, so this answer has no lag to ride out:

- still live → the toast turns into "the round continues" and the timer carries
  on, no winner suggested;
- ended or settled → the toast clears and the suspense opens.

A read that fails or is slow falls back to the service-based confirmation that
was already there, unchanged. `known: false` never means "ended".

## Files

| Path                                                                 | What                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------ |
| `app/api/vault/status/route.ts`                                      | new: the contract's view of a game, over the read pool |
| `features/casino/lib/last-standing/chain-status.ts`                  | new: its client, validated at the boundary             |
| `features/casino/lib/last-standing/round-end.ts`                     | `resolveChainRoundEnd` beside the existing resolver    |
| `features/casino/components/last-standing/last-standing-section.tsx` | heading, feed order, typed stake, the confirm step     |
| `features/casino/components/last-standing/rail-cards.tsx`            | the stake figure as a field                            |
| `lib/currencies.ts`, `components/ui/currency-select.tsx`             | the editable-figure conversion                         |
| `messages/{en,de,es,fr,pt}.json`                                     | `toastCheckingRound`, `stepperEdit`                    |

## Verification

`./scripts/preflight.sh` clean: 713 test files, 7,277 tests, 0 lint errors,
production build compiled, first-load budgets under.

Still to exercise on a real round: a buzzer-beater join that extends the clock
past zero, which is the case the contract read exists for.
