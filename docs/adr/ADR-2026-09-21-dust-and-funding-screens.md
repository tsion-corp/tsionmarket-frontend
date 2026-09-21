---
date: 2026-09-21
status: proposed
---

# Dust is not a balance, and a funding step is not a peek

## Context

**The balance.** Production users, new accounts included, saw a total of
`<$0.01`. The cause is not an error: anyone can mint a token and send it to any
address, and people do it in bulk to harvest attention. Those arrivals are worth
a fraction of a cent. The portfolio counted them, the formatter refuses to print
a figure under a cent, and the balance card printed `<$0.01` where the honest
answer was `$0.00`. The holdings list already hid such rows (`isDustHolding`);
the figure above it did not.

**The funding screens.** Each step of the deposit and withdraw flows drew its
own chrome inside a shared bottom sheet. A step set its own height (`h-[75vh]`),
split itself into a sticky header and an inner scroller, and rendered its own
`< Back` wherever its markup began, which is why Back sat above the close button
rather than beside it. On a phone the result was a sheet inside a sheet: the
deposit address sat below the fold of an inner scroll area, and the modal ended
short of the viewport while the page behind it showed through.

## Decision

**Dust.** One rule in `lib/portfolio/dust.ts`, used by both the figure and the
lists. A holding worth more than nothing and less than a cent is dust; an
unpriced holding never is, because its value is unknown rather than small.
`usePortfolio` totals what it can show as a figure, so a wallet holding only
unsolicited tokens totals exactly zero. The holdings table's toggle covers dust
as well as zero-value rows and is renamed "Hide small balances": hidden by
default, one switch away from visible, because the tokens are still theirs.

**The funding screens.** The shell owns the chrome. A screen declares what it
needs with `useModalScreen({ back, fullScreen, fits })`:

- `back` puts Back on the shell's own header row, opposite the close button.
- `fullScreen` gives the screen the whole phone (`100dvh`, edge to edge) and
  leaves the desktop dialog as it was.
- `fits` tells the shell not to scroll, for a screen built to fit.

Every step of both flows is full screen on a phone except the two entry sheets
("Add funds", "Withdraw"), which stay as bottom sheets because they are a choice
between two options, not a task. The inner scrollers are gone; each screen is
one column in the shell's scroll.

## Consequences

- A balance reads `$0.00` until there is a cent to show, and the total is the
  sum of what the app will print rather than of everything in the wallet.
- Screens can no longer size themselves. A new step declares its needs and
  inherits the flow's behaviour, so Back cannot drift out of line again.
- The withdraw flow's search box now filters. It was wired to state nothing
  read, so it looked like a search and did nothing.
