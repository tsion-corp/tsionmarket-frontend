---
date: 2026-09-15
feature: The Last Man is hidden on production, temporarily
scope: casino
scenario-impact: none
---

# The Last Man is hidden on production, temporarily

## Why

The vault service is pointed at the v5 contract. This app still opens games on
v4. The keeper takes its due-list from an index that holds both contracts' rows
but sends every `settle()` to the contract it is configured for, so a v4 game
becomes `settle(id)` on v5, reverts `GameNotFound`, and is caught and retried
for ever.

The effect is that **every Last Man game played on production has its pot
stranded** until somebody settles it by hand. Games 432 and 433 both had to be
cleared manually. Hiding the game stops us taking money for a round we cannot
reliably pay out.

The full analysis, with the on-chain evidence and the suggested fixes, is in
`vault-v5-cutover-report.md` at the repo root. The backend fix is in progress.

## What is hidden

| surface                     | before                        | now                           |
| --------------------------- | ----------------------------- | ----------------------------- |
| Arkade hub tile             | hero tile, first position     | absent; Chess leads           |
| `/casino/last-standing`     | lobby                         | redirects to `/casino`        |
| `/casino/last-standing/:id` | one game, the shared link     | redirects to `/casino`        |
| `/vault`                    | redirected to the lobby       | redirects to `/casino`        |
| Dashboard marquee           | live round chips              | no Last Man chips             |
| Pop-out timer host          | mounted on every Arkade route | only while a game is followed |

The routes redirect rather than 404 because players have shared those links.

## This is temporary, and built to be undone

Nothing is deleted. The catalogue entry is commented out in place with the
reason beside it, the two route files are one `git checkout` from their old
selves, and the feature itself — the lobby, the section, the wager flow, the
sounds — is untouched.

**`git revert` of this PR restores the game whole.** That is the intended path
back once the keeper is contract-scoped; it needs no reconstruction and no
decisions.

The one thing revert will not decide for you: whether to come back on v4 or go
straight to v5. If the index fix ships with the contract-scoped key, the v5
cutover is the better landing, and that is separate work.

## Grid note

Last Man held the hero slot, four of the six columns, with Chess in the
two-column slot beside it. With it gone, Chess, ArkBall and Checkers are each
two columns and fill the first row exactly, so removing the tile leaves no hole.
A test asserts that.

## How it was verified

Red first: tests that the catalogue has no `last-standing` entry, that the
remaining tiles still fill the grid, and that `liveEventsFrom` emits no Last Man
chip even when the service reports live rounds. Each failed against the old
code before the change.

Three existing tests changed with the behaviour rather than being deleted: the
catalogue order, the search for "last", and the timer gate's Arkade case, each
with a comment saying what it used to assert and why it moved.

Full `./scripts/preflight.sh` clean.
