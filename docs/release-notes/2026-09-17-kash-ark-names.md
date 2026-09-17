---
title: Send on the KASH card, with .ark name recipients
date: 2026-09-17
area: portfolio
scenario-impact: none
---

# Release Note: Send on the KASH card, with .ark name recipients

## Temporary, on purpose

This is a showcase of Ark names on production. It is expected to be reverted
once it has been demonstrated. Reverting it restores the hidden Send button and
removes the name registry; nothing else depends on either.

## What changed

Send is back on the KASH card, as the pill it was designed as before
[#416](https://github.com/Worldstreet-Web-Services/wsws-frontend/pull/416) hid
it. The send modal and its wiring never left the codebase.

The recipient field now takes an Ark name as well as an address:

- Typing `dave` or `dave.ark` looks the name up once the field goes quiet for a
  second, then shows the name and the address it resolves to. The send goes to
  that address.
- Pasting a `0x` address behaves exactly as before, with no lookup.
- A name the registry does not know says so, and Send stays disabled.

The amount field also shows the approximate dollar value of the KSH entered.
That figure is orientation only; the send moves the exact KSH amount.

## The registry

`features/portfolio/lib/ark-names.json` holds the names, three for now:
`dave.ark`, `demitchy.ark` and `zach.ark`. Each address was confirmed by its
owner and checked on Base: all three are live accounts with transaction history.

`resolveArkName` is async although it reads a bundled file, so the same call
can later point at a backend without changing anything that uses it.

Since the file routes money, a test asserts every entry is keyed by a canonical
`.ark` name, carries an address in its exact EIP-55 checksummed form, and
resolves. An address that fails its checksum was typed rather than copied from a
wallet; three invented entries in the first version of this file were caught
that way. A checksum cannot prove someone holds the key, so a new name still
needs its owner to confirm the address.

The registry ships in the client bundle, so those names and addresses are
public. That is acceptable for a showcase of three volunteers and is another
reason this is temporary.

## Locales

`sendLookingUp` and `sendUnknownName` were added to `en`, `de`, `es`, `fr` and
`pt`.
