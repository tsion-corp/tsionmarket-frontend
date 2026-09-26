---
date: 2026-09-26
feature: The shared QR names its game, and Kash Send comes down
scope: feat
scenario-impact: needs_automation
---

# The downloaded QR carries the game's name

The card handed over after a game is opened offers a PNG download built around
the game's QR. It named the game by number ("Game #274") whatever the starter
had called it, so an image pinned to a wall or dropped in a group chat said
nothing about which game it was for.

It now draws the starter's own name for the game, with their description under
it, and falls back to the number when a game has neither. The card on screen
follows the same rule, so what is downloaded is what was on display.

The values drawn are the ones the vault was actually given: the sheet now
derives `normalizeMetadata(...)` once, sends that, and hands the same object to
the card. An image can no longer name a game the service does not.

## The layout gives ground

`drawShareImage` used fixed y positions, which had no room for two more lines.
It now measures: the name shrinks (44px down to 34px) before it would run off
the card and wraps to a second line before it would shrink past reading size,
the description wraps to at most two lines and ellipsises the rest, and the
white QR panel takes whatever vertical space is left, down to 460px from 620px.
The scan line lands at the same baseline on every card, so a named game and an
unnamed one still look like the same card.

`fitFontSize` and `wrapLines` are exported and tested against a stub measurer,
which is why the expectations read as character counts rather than guesses
about a font.

# Kash Send comes down

`KASH_SEND_ENABLED` in `features/portfolio/lib/kash-send.ts` is `false`, and
both the desktop and phone Kash cards read it. The phone row drops to two
columns with it, so there is no hole where the button was.

Nothing else was removed. The Send modal, `onSend` and every handler are still
wired; flipping the constant back to `true` is the whole restore, and the tests
cover both states so switching it back does not break the suite.

This is the second time Send has come down. The first was because users were
sending KASH+ to the Dextopus deposit address and losing it, which is recorded
in the card tests.

# A name that stops flickering

Reported: a game's title and description showed on one read and were gone on
the next.

The name only reaches the client on paths that carry metadata: the service's
indexed list and its single-game read. Several other paths produce a row
WITHOUT one -- our own lobby route reading the chain when the service times
out, a row seeded from a start receipt, the keeper's socket snapshot -- and
each replaces the cache wholesale, so absent was being read as cleared.
`keepKnownMetadata` guarded the socket path alone; the two REST queries wrote
straight through.

`lib/last-standing/metadata-memory.ts` remembers each game's name for the
session and fills it back in wherever a row arrives without one. A name cannot
change and no path can unname a game, so this only ever adds. It is applied on
the game read, the lobby read, the priced chain rows and the socket snapshot.

Across devices the name was never in doubt: the backend's list and
single-game DTOs both carry metadata (`toGameDto(game, usd, metadata)`), and
only the keeper's snapshot omits it. Confirmed against production -- game 274
returns `{"title":"Special LM","description":"Testing"}`.

# "Calculating the winner" after "the round continues"

Reported: the checking toast appeared, then the round-continues toast, then the
winner modal came up anyway.

Two faults, both in the confirm step added in #579.

**It re-armed immediately.** On a `continued` verdict the local countdown still
read 00:00 -- the contract had extended the round, but that endTime was thrown
away and only the verdict kept, so the client's clock was still the stale one.
`shouldBeginRoundEnd` was satisfied on the very next render and armed a second
pass, which then rode out its 6s deadline and ended the round.

Fixed at the cause: the chain read's `endTime` is now applied to the cached
game (`useVaultGame().extendTo`), so the countdown restarts from the truth.
Plus a hold -- `ROUND_CONTINUED_HOLD_MS`, 4s, longer than the settle window it
protects against -- so neither arming path can fire while the clock catches up.

**The progress toast was re-raised every second.** The effect listed
`countdown` in its deps, so each tick tore it down and rebuilt it: the `done`
guard reset and a fresh `toast.loading` went up while the cleanup dismissed the
last. It is now keyed on `confirmingSince` alone and reads the live values
through refs.

## Verification

`./scripts/preflight.sh` clean: 716 test files, 7,307 tests, 0 lint errors,
production build compiled, first-load budgets under.

Not exercised here: the actual PNG. The painter is mocked in the component
test, so the copy handed to it is what is asserted. Worth downloading one from
the preview against a named game.
