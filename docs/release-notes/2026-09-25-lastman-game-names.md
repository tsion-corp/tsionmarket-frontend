---
date: 2026-09-25
feature: Players can name their Last Man Standing game, and the lobby hero joins the 2.0 design
scope: feature
scenario-impact: needs_automation
---

# Naming a Last Man Standing game

A game was identified by nothing but its number. With three open at once, the
only way to tell them apart was the stake and the clock. Whoever starts a game
can now give it a name and a short description.

ADRs: [technical](../adr/ADR-2026-09-25-lastman-game-metadata.md),
[plain English](../adr/ADR-2026-09-25-lastman-game-metadata-for-dummies.md).
Both approved before any code was written.

## No image

The vault's endpoint accepts an `imageUrl`. We are not using it: it needs
hosting or an origin allowlist, it is a moderation surface a 60-character title
is not, and it crowds a card that exists for sixty seconds.

The `image:` line stays in the signed message, empty, because the service
builds the same six lines whether or not one was sent. Dropping the feature
does not drop the line, and a test asserts it is still there.

## How it works

1. The player types a name, optionally a description, and confirms.
2. The transaction opens the game.
3. The name is signed and sent afterwards, keyed on the transaction hash.

Steps 2 and 3 are separate because the contract only assigns a game id when the
transaction mines. Step 3 is never awaited: the player has already paid, so a
refused name leaves a game called "Game 246", never a game that failed to open.

The signature proves the namer started the game. The vault confirms the signer
against the `GameStarted` log and discards anything that does not match.

## The signed message

`features/casino/lib/last-standing/game-metadata.ts` is a port of
`apps/world-street-vault/src/domain/game-metadata.ts`. The service rebuilds the
message to verify the signature, so the two must agree character for character.
Three things would break every submission while looking correct:

- the empty `image: ` line, per above
- the **em dash** (U+2014) on the first line, which `AGENTS.md` bans in prose
  and which is copied verbatim here because it is signed data
- `sanitizeText`, which `llms.txt` describes as whitespace collapse and trim.
  The code also strips control characters **and the bidirectional overrides**
  U+202A-202E and U+2066-2069. Those reorder how text renders, so a title can
  display as something other than what it says, which is a spoofing tool in a
  list of other people's games. Tab, newline and carriage return are
  deliberately not stripped: the whitespace collapse turns them into the single
  space a reader expects, and removing them would join words.

The port was verified against the service source, not transcribed and trusted.
That caught a real problem: the file had ended up containing literal invisible
bidi characters instead of `\uXXXX` escapes. The tests passed either way, since
a character range between literal characters matches the same set as one
between escapes. The cost was a file whose own source could not be reviewed,
in the one module whose job is stripping such characters. Both the module and
its test are ASCII escapes now, the regex is byte-identical to the service's,
and a test reads the file's own source and fails if any non-ASCII character
other than that em dash reappears.

## The start button now says what it is doing

Starting a game ran the wallet's work and Base's confirmation behind one
boolean, so the button read "Starting…" for ten seconds or more without
changing. It reports two phases now, "Starting your game…" then "Confirming on
Base…", with a spinner beside the label rather than replacing it, so the button
never resizes between them. Wrapped in `aria-live="polite"` so the change is
announced once.

Naming is deliberately **not** a third phase. It runs after the game is open
and the sheet has moved on, and it gates nothing; putting it on the button
would make people wait on a label.

## Display

The name shows on the lobby card and at the top of the game page, with the
description under it there. Both render **only when present**. Games started
before this have no metadata, so that is the common case for a while, and
reserving a line for a title most games will not have would leave a gap on
every row.

The lobby merges two sources and the merge was checked rather than assumed:
REST rows win, and socket rows only fill games the service has not indexed yet
(`use-vault-lobby.ts`), so a name can never be overwritten by a nameless frame.
The one nameless window is a brand-new game, because the reconciler publishes
`gameStarted` before it binds the metadata. The service's row replaces it with
the name on the next read, keyed by game id, which is one clean transition
rather than a flicker.

## Proxy

`games/metadata` is allowlisted for POST. That file forwarded exactly one write
path and said so deliberately, so widening it brought the test file it never
had: `lib/api/vault-proxy-paths.test.ts` pins both allowed writes and asserts
the admin surface, `games/1/metadata`, bare `metadata` and the empty string are
all still refused.

## The lobby hero, redrawn

The lobby opened with a dark card, pale gold serif type and two blur lamps.
The dashboard already carries a Last Man identity, the Marathon poster in
`features/discovery/components/arkade-cards.tsx`, so people arrived through
gold artwork and landed on something that read as a different product.

The hero is drawn in that same world now: the poster's gold sky
(`linear-gradient(126.36deg,#ffd52d,#f5c500)`), both cloud layers, the
hourglass with its blurred `mix-blend-screen` copy for the glow around the
glass, and the wordmark in the poster's gold-to-bark ink, serif over
`ws-chewy`, broken over the same two lines.

Three things differ from the poster on purpose, because a lobby has a job a
poster does not:

- **Contrast.** The poster is artwork; this carries live state. White on that
  yellow fails contrast at every size, so body copy is `#4a2f00` ink and the
  status pill is dark glass with gold text.
- **The hourglass hides below `sm`.** At a phone's width it sat under the type
  rather than beside it.
- **The live state sits on the gold**, not on a second card below: the running
  count and the three facts (60s, entry, winner's share) read as one band, so
  somebody deciding whether to join reads it in one place.

## Tests

- The exact six-line signed message, including the em dash and empty image line
- Every bidi override individually, and tab/newline becoming a space
- Length measured after sanitising, so padding cannot smuggle a title past the cap
- The source's own bytes, guarding the invisible-character regression above
- Metadata parsed off game rows: absent, malformed, blank title, and a
  description with no title, none of which may drop a live game from the lobby
- A phase label in all five locales for every phase that shows one

Full suite: 6885 passed, 3 skipped. Typecheck, production build and bundle
budget clean; lint back at its 145-warning baseline with none added.
