---
date: 2026-09-28
feature: The Ark ID page reads like a product, and Kash receipts name a person
scope: fix
scenario-impact: updated
---

# Six fixes

## The receipt names who was paid

"You sent 0.1 KASH to 0x8ceA…ee73. **View on Basescan**" told the reader an
address they cannot check and the name of a website they did not ask about.

It names the **Ark ID** the money went to — which is what was typed, and what
the sender recognises — and the link is the **transaction hash** itself, shown
short enough to match against a wallet. The explorer is still where it goes; it
is just no longer what the link is called.

## The send flow confirms the name

It used to print "alice.ark resolves to 0xbbbb…" under the field. The address
is how the money gets there, not something a sender can verify, and it was the
one part of that screen that looked machine-written. It now says **"alice.ark
is ready to receive."**

## Prices read in USD

The registrar settles in USDC; nobody picking a name is thinking about that.
`USDC / year` is `USD / year`, and the payment copy drops the token where a
person is reading a price.

## The balance warning is a sentence

Was: _"Not enough USDC — this name is $267.53 and your balance is $1.246408.
Add USDC to continue."_

Now: **"This name costs $267.53. You have $1.24. Add funds to carry on."**

## The wallet addresses are gone

Both the desktop account popover and the phone account modal listed a Base and
a Solana address. An Ark ID is the identity people hand out now, and a hex
string nobody can read was all that block offered. The component and its copy
stay in the tree, one import from returning.

## The Ark ID page

Taken from the Basenames recording rather than invented:

- The verdict is a **panel attached under the field**, not a line of text
  beside it. Available shows the name with its price on the right; taken strikes
  it through; checking spins inside the same panel, so the answer arrives where
  the eye already is.
- A **clear button** in the field. Without one the only way back to an empty
  field is holding backspace.
- The drifting names have **depth**: the far ones sit out of focus, so the group
  reads as a scatter with distance in it rather than a flat ring.

## Verification

`./scripts/preflight.sh` clean: 723 test files, 7,346 tests, 0 lint errors (the
standing 145-warning baseline), production build compiled, first-load budgets
under.

Three tests changed to match: the receipt now names the recipient and links the
hash, and the send flow confirms rather than resolves.
