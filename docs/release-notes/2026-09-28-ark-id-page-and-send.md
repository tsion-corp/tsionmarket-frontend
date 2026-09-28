---
date: 2026-09-28
feature: Ark ID becomes a page, Kash sends to a name, and the promo reaches phones
scope: feat
scenario-impact: needs_automation
---

# Ark ID is a page

`/ark-id` replaces the sheet. Same reason invites became `/referrals` on
2026-09-23, and stronger here: this is a purchase, its commit-and-reveal flow
has to survive a reload mid-payment, and a name is worth linking to. A modal is
a bad container for a flow that can be interrupted.

The page is laid out as **Basenames and ENS lay theirs out**: the search is the
hero rather than a field in a card, under display type, with example `.ark`
names drifting around it so the page shows what it sells before it asks for
anything. The names are decorative, `aria-hidden`, at fixed positions so the
composition does not reshuffle on every render, and drawn only from `lg` up
where there is room beside the column.

It takes **the portfolio page's width** (`max-w-[1520px]`, the app's page
width), not the narrower one referrals was using. `/referrals` is moved onto the
same width here, since a route that opens narrower than the page it was reached
from reads as a modal that lost its backdrop. The referral **claim** step keeps
its narrow column: it is one field and a button, and a form stretched across
1520px is not easier to fill in.

`ArkIdModal`, `ArkIdCard` and the dialog store are gone. The view is the same
component with `open`/`onClose` removed; finishing now resets the page rather
than closing anything.

## The availability check says it is working

The check was already correct — 300ms debounce plus a `lookupReady` guard, so a
name is never called available before the answer for _that_ name is in. The
only sign of it was a line of grey text, which reads as nothing happening.
There is a spinner beside it now, and the price lookup that follows says it is
checking the price rather than repeating "Checking…".

# The promo moves where people can see it

The Ark ID card lived in the sidebar. On a phone that is a drawer behind the
hamburger, and the bottom tab bar is what people actually use — so the card was
effectively desktop-only, which is why it went unnoticed.

It is a banner in the promo strip now, second in both, directly after the
ArkStore ticket. That strip is `PromoCarousel` on a phone and `PromoRail` on a
desk, so every device shows it.

`PromoBanner` gained a `tone` prop. Every banner the rail carried was a
saturated fill with white words; a pale fill needs ink instead, and
white-on-white is the failure the prop exists to stop. The divider is a stroked
rule, so it gets the same swap. The default is unchanged, so no existing banner
moves.

# Kash goes to a name, not an address

The send modal accepted either a wallet address or an Ark ID, as ADR decision 4
specified. It takes an **Ark ID only**. A pasted `0x…` address is refused with a
message saying what to enter instead, so the sender types a name they can read
back rather than a hex string they cannot check.

The address is still shown — it is what the name resolves to, and it sits under
the input before the send.

`parseKashRecipient` is untouched: it still reports an address as an address,
because the Ark ID search shares it. The policy belongs to the send surface.

**Send is back on the card.** `KASH_SEND_ENABLED` is `true`. It came down on
2026-09-26 because people were pasting the Dextopus deposit address and losing
their KASH+; sending to a name is what makes that hard to do, so the button
returns with this change and not before it. Checked against production first:
`/v1/kash/status` reports `chainMode: "ethers"` with a chain, so this restores a
working button rather than a disabled one.

# The idle timeout is 24 hours

Was 6. The toast interpolates the figure, so every locale follows without a copy
change.

## Verification

`./scripts/preflight.sh` clean: 723 test files, 7,345 tests, 0 lint errors (the
standing 145-warning baseline, unchanged), production build compiled, first-load
budgets under.

Not covered by tests, and worth exercising on the preview: the paid registration
flow end to end, including a reload mid-payment — it spends real USDC through
Dextopus, which is exactly what the persisted request id exists to survive. The
page's own layout is also worth a look at phone, tablet and desktop widths.
