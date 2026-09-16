---
date: 2026-09-16
feature: Chess game results and review
scope: casino
scenario-impact: none
---

# Chess game results and review

Ships #500 by ANAVHEOBA: a rebuilt end-of-game modal, richer analysis output on
the review board, captured-material tracking, and an Ark coach panel over the
lichess analysis view.

`ChessResult` gains two draw reasons the service already reported and the app
collapsed into "agreement": `fifty_move_rule` and `timeout_insufficient`. The
match now carries the service's own `resultReason` and `finishedAt`, so an
ending is explained rather than guessed at.

## What was fixed before merging

**The modal was English only.** 500 lines of new UI with about 30 user-facing
strings, none of them through next-intl, in an app that ships in five
languages. The locale catalogues had gained two keys.

All of it now reads from `casino.chess.gameOver`, added to `en`, `de`, `es`,
`fr` and `pt` together: the headline for each outcome, every draw and win
reason (including the parameterised "{name} won by checkmate" forms), the six
coach messages, the metric labels, and the rematch button's five states, which
`lichess-round.tsx` was also naming in English.

The four string helpers take the translator as an argument rather than calling
the hook themselves, so they stay pure.

## How it was verified

The compiled lichess bundles were checked against their sources rather than
taken on trust: `lichess-round.tsx` points at `round.KX7CDMD5.js`, that bundle
imports the four new `lib.*` chunks, the retired `round.DDOZHOU5.js` is gone
rather than left behind, and `node scripts/verify-chess-assets.mjs` passes on
all eleven required local assets and 6,254 R2 manifest entries.

`lichess-round-host.test.tsx` now renders inside `NextIntlClientProvider`,
which the new hook requires.

Full `./scripts/preflight.sh` clean: 4,766 tests.

## Noted, not changed

`chessGameOverCounters` falls back to White's moves when there is no viewer, so
a spectator sees White's counters under neutral labels ("Best / good",
"Blunders") with nothing saying whose they are. Harmless, but worth a label.

The PR also carries small chicken-game styling changes, unrelated to chess.
