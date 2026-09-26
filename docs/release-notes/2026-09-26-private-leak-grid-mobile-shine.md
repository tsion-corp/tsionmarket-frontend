---
date: 2026-09-26
feature: A private game no longer leaks to other devices, the lobby is a grid on desktop, and Shine reaches the phone
scope: fix
scenario-impact: needs_automation
---

# A private game appeared in somebody else's lobby

Reported after #573 shipped: a game started privately on a laptop was listed on
a phone. #573 was live at the time, so the server-flag filter was not the
problem.

## What was actually wrong, and it is in the backend

`apps/world-street-vault/src/chain/ethers-chain-client-v5.ts`:

```ts
private supportsPrivacyField(): Promise<boolean> {
  this.privacyFieldSupported ??= this.contract.version()...
```

That `??=` caches the answer **for the life of the process**. The keeper read
`version()` at startup, before the v5.1 upgrade, cached `false`, and now
permanently uses `LEGACY_GAMES_ABI`:

```ts
const tuple = await this.legacyContract.games(BigInt(gameId));
return [...tuple, false];
```

So every lobby snapshot it sends reports **every game public**, including games
its own index correctly records as private. The client replaced its cache with
that snapshot, and REST's correct `isPrivate: true` was overwritten.

Same shape as the metadata bug, and worse: the socket carried a value that was
**wrong**, not merely absent.

**The backend fix is a restart.** No code change: the keeper and api will
re-read `version()`, see `5.1.0`, and select the v5.1 ABI. Worth recording that
_any_ future contract upgrade needs the same, which is not obvious from the
code and has now cost a privacy leak once.

## Two frontend defences, because we are not waiting for that

**Private latches.** A snapshot can no longer flip a known-private game to
public. A missing name is carried across; a privacy flag that contradicts what
we already know is refused. The asymmetry is deliberate: the harmful direction
is exposure, and a game wrongly kept private is still reachable by its link.

**The contract is asked directly.** `GET /api/vault/privacy?ids=…` reads
`games(id)` over `BASE_READ_RPC_URL` and takes the eleventh word. Server-side,
because that token must never reach the browser, and batched through the
existing `readEvm` helper, so it is one request per lobby refresh rather than
one per game. Verified against the live chain: 261 true, 259 false, matching
the index exactly.

The latch covers a game the client has already seen correctly. The contract
read covers the case it cannot: a game seen only over the socket, before REST
or the index has it, where there is nothing to latch onto.

Unknown never means public:

| Case                     | Answer                                                    |
| ------------------------ | --------------------------------------------------------- |
| Provider unreachable     | `{}` with HTTP 200; the lobby keeps what the service said |
| One call errors          | that id is omitted                                        |
| A ten-word (v5.0) answer | omitted, because guessing public exposes a game           |

Capped at fifty ids, which is one lobby's worth.

## Also in here

**The live games list is a grid.** One to a row on a phone, three across from
`lg`. A single live game used to stretch the full width of a desk, which made
one row look like a page. The error and empty states span every column, since
each is about the whole list rather than a cell.

**Shine reaches the phone.** It was only in the desktop account menu, so a
phone had no way to reach it at all. It opens as a sub-view of the account
sheet rather than stacking a second modal, and the icon moved into the shared
icon set so both platforms draw the same one.

The sub-view holds its own state in a small component that unmounts with the
sheet, rather than an effect that resets it. The React Compiler lint rule
refuses a synchronous `setState` in an effect, and it is right to: unmounting
is what already expresses "this view does not outlive the sheet".

## Verification

Full suite **6980 passed**, 3 skipped. Typecheck, production build and bundle
budget clean; lint at its 145-warning baseline with none added.
