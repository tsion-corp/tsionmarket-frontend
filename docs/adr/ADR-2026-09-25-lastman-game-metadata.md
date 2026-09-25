# ADR-2026-09-25: Naming a Last Man Standing game

- Status: **Proposed — awaiting human approval**
- Date: 2026-09-25
- Area: `features/casino` (Last Man Standing), `app/api/vault`
- Author: Claude Code. **Not self-approvable** (Directive 2).

## Context

A Last Man Standing game is currently identified by nothing but its number.
The lobby lists "Game 244", and a player deciding which of three open games to
join has only the stake and the timer to go on.

The vault service shipped an endpoint for this. `POST /games/metadata` accepts
a title and an optional description, keyed on the transaction hash, and every
game row served by the REST and socket feeds carries an optional `metadata`
object back.

The backend also accepts an `imageUrl`. **We are not building it.** A title and
a description are enough to tell two games apart, and an image field is a
hosting question, a moderation surface and a layout problem for a card that is
sixty seconds long. The field stays unused, and the reasons are recorded in
"Rejected" below because the endpoint will keep offering it.

### What the backend actually does

Read from `apps/world-street-vault` on 2026-09-25, not from its README, which
`llms.txt` marks stale.

| Fact                                                                                                                                      | Source                         |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `POST /games/metadata`, answers 202                                                                                                       | `src/docs/openapi.ts:48`       |
| Keyed on the **transaction hash**, because the contract assigns the game id only when the transaction mines                               | `openapi.ts:52`                |
| Authorised by a **signature**, not a session: the vault has no login                                                                      | `openapi.ts:52`                |
| The signer is confirmed against the `GameStarted` log when it is indexed; a submission signed by anyone else is discarded and never shown | `openapi.ts:52`                |
| `title` required, max 60; `description` optional, max 280                                                                                 | `domain/game-metadata.ts:11`   |
| Metadata rides on every game row, batched one query per page                                                                              | `services/game-service.ts:273` |
| A metadata lookup failure serves the games **without** it rather than failing the page                                                    | `game-service.ts:284`          |

### The two things that will break this if we get them wrong

**1. The signed message is byte-exact.** `metadataMessage` builds it and the
service rebuilds it to verify. Reproduced from `domain/game-metadata.ts:123`:

```
World Street — name your King of Night game
tx: <lowercased hash>
title: <sanitised>
description: <sanitised, or empty>
image: <trimmed, or empty>
ts: <epoch ms>
```

Three traps, all of which produce a valid-looking signature the service
rejects:

- **The `image:` line must stay**, with an empty value. Dropping the feature
  does not drop the line. `normalizeMetadata` omits `imageUrl` from the object,
  and `metadataMessage` then renders `image: ` via `?? ''`.
- **Line one contains an em dash** (U+2014), not a hyphen. The repo's own style
  forbids em dashes in comments; this is signed data, and it is copied
  verbatim.
- **`ts` is epoch milliseconds** and the signature is valid for five minutes
  (`SIGNATURE_TTL_MS`).

**2. `sanitizeText` must be ported, not paraphrased.** `llms.txt` describes it
as whitespace collapsed and trimmed. The code does more
(`game-metadata.ts:47`): it strips control characters **and the bidirectional
overrides** U+202A–U+202E and U+2066–U+2069. Those reorder how text _renders_,
so a title can be made to display as something other than what it says — a
spoofing tool in a list of other people's games. Tab, newline and carriage
return are deliberately **not** stripped; the whitespace collapse turns them
into the single space a reader expects, and removing them would join words.

We sign what we send, so our normalisation must equal theirs exactly or the
signature verifies against different bytes.

## Decision

1. **Collect a title and an optional description** in the start-game sheet,
   before the transaction is sent. No image field anywhere in the UI.
2. **Port `sanitizeText`, `normalizeMetadata` and `metadataMessage`** into
   `features/casino/lib/game-metadata.ts`, character for character, with a test
   that pins the exact signed string including the empty `image:` line and the
   em dash.
3. **Submit after the transaction is sent**, keyed on its hash, signed with the
   player's own wallet through the existing headless signing path.
4. **Treat the whole thing as cosmetic.** A failed submission never fails the
   game. The player has already paid and the game is already open; a missing
   title is a missing label.
5. **Render the title in the lobby and on the game card**, falling back to
   "Game N" when there is none. Every game before this has none, so the
   fallback is the common case for a while.
6. **Escape nothing by hand.** The title is other people's text rendered in a
   list. React escapes it; it never reaches `dangerouslySetInnerHTML`, and it
   is never used as a URL, a key or an attribute.

## Shape

```
start-game-sheet
  title, description  ──► useStartVaultGame
                               │
                               ├─ 1. contract startGame()  ──► tx hash
                               │
                               └─ 2. sign metadataMessage(hash, meta, now)
                                        │
                                        └─► POST /api/vault/games/metadata
                                                 (202, fire and forget)

lobby / game card  ◄── game.metadata?.title ?? "Game {id}"
```

Step 2 failing leaves step 1 intact. That ordering is the decision: the game
exists whatever happens to its name.

## A timing detail the lobby must handle

The reconciler publishes `gameStarted` to the live feed **before** it binds the
metadata to the game (`chain-event-reconciler.ts:146`, then `:149`). The log is
the first thing that says who started a game, so it is also the first moment a
signed submission can be authorised, which is why the order is that way.

The consequence for us: a game arriving over the socket has no name for a
moment, then gains one on the next fetch. Rendered naively that is a card that
says "Game 246" and then visibly changes to a title.

So the fallback is not a placeholder to be replaced. A card renders its number
until a name is actually present, and the name settling in is a normal update
rather than a correction. Nothing spins, nothing reserves space for a title
that may never come, because most games will not have one.

## Consequences

**Good.** Games become distinguishable. No new service, no new auth, no
backend change. The image field costs nothing by staying unused.

**Costs.** A second signature after the transaction. It is headless (memory:
no wallet popups), but it is a second failure point, which is why it cannot
block. Our ported sanitiser can drift from the vault's; the test pins the
message, and a vault-side change to it is a breaking change for us.

**Deliberately not handled.** No editing after the fact: the signature binds
the metadata to one transaction, and an edit endpoint does not exist. No
moderation: a title is 60 characters of other people's text in a list, and if
that becomes a problem it is a backend problem, because a client-side filter
protects nobody.

## Rejected

**An image.** The endpoint takes one and we are not using it. It needs hosting
or an allowlist of remote origins, it is a moderation surface a title is not
(a 60-character string cannot be a picture of something illegal), and it
changes a card that exists for sixty seconds into a layout problem. The signed
message keeps its `image:` line regardless.

**Storing the title on-chain.** It would survive without the vault's database,
and cost gas on every game to carry a label that decides nothing. The contract
settles by its own logic; a title cannot change who gets paid, which is exactly
why it belongs off-chain (`game-metadata.ts:1`).

**Blocking the game on the metadata call.** It would trade a missing label for
a failed game after the player has already paid.

**Submitting before the transaction.** There is no game id yet, which is why
the endpoint is keyed on the hash at all.

## How we will know it works

- The exact signed string, including `image: ` and the em dash, is pinned by a
  test that would fail on a one-character drift.
- `sanitizeText` is tested against the bidi overrides specifically, not only
  against whitespace.
- A game with no metadata renders "Game N" and never an empty heading.
- A rejected metadata submission leaves the game open and joinable.
