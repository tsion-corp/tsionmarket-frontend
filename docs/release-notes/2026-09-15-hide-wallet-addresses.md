---
date: 2026-09-15
feature: Wallet addresses leave the app's chrome
scope: shell
scenario-impact: none
---

# Wallet addresses leave the app's chrome

## What changed

The EVM and Solana addresses are no longer printed anywhere in the shell, on
any screen size.

- **The desktop sidebar's account footer** showed the Base address under the
  name. It now shows the name alone.
- **The account popover** carried a Wallets shelf listing Base and Solana, each
  with a copy button. The shelf is gone.
- **The account modal** carried the same shelf, opened from the phone header.
  Also gone.
- **The phone header** already had no address; its comment pointed at the
  sidebar as the place to find one, which is no longer true, so the comment
  goes with it.

`wallet-addresses.tsx` and its test are deleted rather than left unrendered:
nothing imports them now, and a component kept alive for no caller is the kind
of thing that comes back by accident.

## Why

An address is an identifier somebody can be asked to read out or hand over, and
the chrome put one on screen on every page whether or not the reader wanted it
there. Nothing about it was a decision the reader made.

## Where an address still lives, on purpose

**The deposit screen.** `AddressPanel` shows the full address with a QR and a
copy control, and that is untouched. It is the one place an address is the
answer to the question being asked, and hiding it there would leave nobody able
to fund an account.

Everything that USES an address is untouched as well: the session provider,
analytics identity, and every trade path read the wallet exactly as before.
Only the places that displayed it to the reader changed.

## Tests

- `sidebar.test.tsx`: the account footer shows no address, and the name is the
  whole footer rather than a name over a blank row. Both replace tests that
  asserted the address was there.
- `account-popover.test.tsx`: the mock for the deleted component is dropped.
