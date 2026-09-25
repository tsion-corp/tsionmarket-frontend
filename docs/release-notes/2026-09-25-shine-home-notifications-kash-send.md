---
date: 2026-09-25
feature: Shine moves to the account menu, Last Man notifications reach the bell, Kash+ Send returns, and three fixes
scope: feature
scenario-impact: needs_automation
---

# One PR, five pieces

## 1. Game names never saved. They do now.

The bug behind "the title and desc are not showing".

A game created in production came back from the vault with **no `metadata` key
at all**. Traced rather than guessed:

- the endpoint is live: a deliberately bad signature was refused with exactly
  the error the service documents;
- `GameMetadataService` requires a **`signer`** field and compares it to the
  address it recovers from the signature;
- the OpenAPI confirms it: `required: ['txHash','title','signer','timestamp','signature']`;
- we never sent `signer`.

Every submission was refused as a mismatch, and **silently**, because naming is
fire and forget so the game still opened. The service's own comment says why
the field exists: `verifyMessage` does not fail on a wrong message, it recovers
a _different_ address, so without something to compare against a worthless
signature is accepted and only found to be worthless much later.

Fixed test-first. The test now asserts every field the service marks required,
so a future addition fails here rather than in production.

Worth recording, because the lesson generalises: the byte-exact message port
shipped with fifteen tests and was correct. Nothing tested the **request
envelope**. The suite was green while the feature did nothing.

## 2. Shine lives in one place

It was a card on seven service pages. It is now one panel in the account menu,
which is also what took that height off the top of every service page.

The seven per-service answers are **kept**, not collapsed: the panel has a
master switch above the seven, and the storage and the route are unchanged, so
there is no migration.

State, which is most of the work here:

| State                 | Behaviour                                                 |
| --------------------- | --------------------------------------------------------- |
| Record still arriving | every switch busy and locked; a click writes nothing      |
| Read failed           | says so, offers a retry, draws no settled state           |
| All seven on          | master reads on                                           |
| Services disagree     | master reads **mixed**, not off                           |
| Mixed, tapped         | turns everything on, in ONE write                         |
| One service           | writes only that service                                  |
| Save rejected         | error on that row alone, cleared on the next attempt      |
| Write in flight       | every switch locks, only the one being written reads busy |
| Signed out            | nothing flippable                                         |

Mixed is drawn rather than collapsed: seven booleans do not fit in a
two-position switch, and showing "off" while four services are still posting
would be a lie about somebody's privacy. It is stated as `aria-checked="mixed"`.

`setAll` writes all seven in one request. Seven writes are seven chances to
half-apply and leave a person believing Shine is off everywhere while one
service still posts.

The sheet is hosted by the sidebar rather than the popover that opens it: the
popover closes on an outside click and would take the sheet with it the moment
somebody reached for a switch.

`components/shine/shine-toggle.tsx` is deleted. Nothing outside its own test
imported it.

The nine suites that asserted "this page carries a Shine switch" now assert it
does **not**. Kept rather than deleted: those cases are what stops the cards
reappearing one page at a time.

## 3. Last Man notifications reach the bell

There are two notification systems and the app was reading the other one.

|                      | `notification` service   | `user-management`    |
| -------------------- | ------------------------ | -------------------- |
| Filled by            | RabbitMQ, from the vault | an operator, by hand |
| Vault publishes here | **yes**                  | no                   |
| The bell read here   | **no**                   | yes                  |

Verified against production: both answer 200 on `/health` and 401
unauthenticated, and user-management has no broker consumer — its inbox is
`create` then `publish`. So "you won" was being sent correctly and stored
correctly somewhere nothing in the app looked.

Per ADR-2026-09-25-vault-notifications, and per the maintainer's instruction to
sync the two rather than retire either, the bell now reads **both** and merges
them into one list with one badge. A reader never learns there are two.

- `app/api/notification/[...path]` allowlists the five routes the bell needs,
  refuses health, docs and traversal, requires a session on every route, and
  never caches. The bearer token is forwarded because the service resolves the
  Decane wallet from it, and that link is what stops a payout notice being
  dropped.
- `useServiceNotifications` reads **on sign-in, not when the bell opens**. That
  read is what links the wallet on the service side, and a wallet the service
  has never heard from has its notifications dropped rather than stored. Waiting
  for somebody to open the bell would mean the first win is the one lost.
- Zod is imported on response, not statically: the bell is in the first-load
  payload of every route and pulling zod in broke the bundle budget once before.
- The merge is display only. Each store keeps its own read state, so every row
  carries the store it came from; sending a vault read to user-management would
  answer 404 and leave the badge stuck.
- One store failing does not blank the other's rows. It says so and offers a
  retry that refetches both, because half of somebody's mail presented as all of
  it is how a missing payout notice looks exactly like no payout notice.

**Not yet verified end to end.** The proxy, the parse, the hook and the merge
are tested, but whether a real `vault.game.won` reaches a real bell needs a real
win on a real account. The ADR names that as the acceptance test precisely
because the failure is silent.

**Push is still missing a key.** The notification service publishes no VAPID
public key, so a browser cannot subscribe to it. A win reaches the bell and the
app but will not buzz a closed phone until the backend exposes one.

## 4. Kash+ Send is back

Between Buy and Convert on both cards. The modal, its validation and its
mounting were never removed; only the button had gone, with a comment saying
restoring it was one pill. The phone card goes to three columns rather than a
second row, which would have pushed the cloud bank off the card.

## 5. Two fixes and two banners

**The tour popover was dimmed by its own backdrop.** `.driver-overlay` and
`.driver-popover` were both pinned to `z-index: 400`, so DOM order decided the
winner and driver.js appends its overlay last: the overlay painted its 72%
black over the card, which is why the title, body and the Back and Next buttons
all read as disabled. One step apart now, still under the 440 sheets so the
tour cannot cover the upgrade gate.

**The Last Man hero** absorbed the "Start your own game" card that sat below it.
One banner instead of two stacked, tightened padding, and the hourglass scaled
from 230px to 170px or it crops against the shorter card. The start button
takes the card's own dark ink with amber type rather than the generic pale
accent, so it reads as the one thing to press.

**The live game row is redrawn** in the 2.0 card language: one rounded surface,
a ground from ink to a warm shadow, and a soft amber wash only at the clock end.
Deliberately not the hero's gold: the hero is a poster and can be artwork, but
this is a row somebody scans several of, and a bright ground repeated down a
list is noise. The amber survives as the accent on the clock and the live dot.
The name leads, the description shows under it, and `#252` is demoted to a chip.

**On the game's own page** the name rides the eyebrow that was already there,
beside "Prize pool", rather than taking a heading of its own: it says WHICH
game this is, which is a label on the pot rather than a second title above it,
and it costs no height on a page whose whole job is the figure below. The
description is one clamped line under it, and only for a game that has one.

## Verification

Full suite **6938 passed**, 3 skipped. Typecheck, production build and bundle
budget all clean. Lint at its 145-warning baseline with none added.

The Shine removal was the risky part and did not come out clean first time: a
regex broke one file (caught by typecheck), two more were left with an empty
wrapper and a comment describing a control that no longer existed (caught by a
scan, since typecheck cannot see those), and a comparison against `origin/main`
found seven further empty wrappers that were **pre-existing** and were left
alone rather than "fixed".
