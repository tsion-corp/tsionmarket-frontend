---
date: 2026-09-15
feature: Global quick-action button for Add funds and Withdraw
scope: portfolio
scenario-impact: none
---

# Global quick-action button for Add funds and Withdraw

Ships #479 by Uchechukwu-Ekezie: a floating `+` on phones, mounted in
`DashboardShell`, that opens a two-item speed dial for **Add funds** and
**Withdraw**. It sits on the left edge above the tab bar, clear of the support
button on the right, and is hidden from `md` up. Both sheets are now wired into
the shell, so either action works from any page rather than only the dashboard.

## What was fixed before merging

**It shipped ~60 kB of JavaScript to every route.** `FundsModal` and
`WithdrawModal` were imported statically into the shell, which mounts on every
page, so the whole deposit and withdraw surface landed in each route's first
load for two sheets that render only after the dial is opened. Measured against
`origin/staging`: `/spot` 1643 → 1701 kB, `/activity` 1641 → 1702 kB, `/casino`
1877 → 1937 kB. The PR answered that by raising the budgets, which is the one
thing the ratchet exists to prevent.

Both are now loaded with `next/dynamic`, the way `AppModalHost` has always
loaded these same two sheets, and the FAB is deep-imported rather than pulled
through the `features/portfolio` barrel, which was dragging `PortfolioView`
into every route. Every route now ships _less_ than it did before the PR:

| route      | staging | with #479 as filed | merged |
| ---------- | ------- | ------------------ | ------ |
| /dashboard | 1616    | 1676               | 1473   |
| /activity  | 1641    | 1702               | 1499   |
| /spot      | 1643    | 1701               | 1570   |
| /meme      | 1650    | 1707               | 1577   |
| /rwa       | 1646    | 1706               | 1573   |
| /casino    | 1877    | 1937               | 1810   |

The budget file therefore keeps staging's numbers: the conflict against the
PR's raised values resolved to staging, and `pnpm bundle:check` passes on them
with room to spare. Tightening the ratchet to the new figures is worth doing,
but as its own change.

**The scrim sat under the chrome it was dimming.** At `z-76` it was below the
tab bar (`z-90`) and the support launcher (`z-80`), so opening the dial dimmed
the page while leaving both lit and tappable: a tap meant to dismiss navigated
instead, and because the shell does not unmount between pages the open dial
followed the user to the next screen. The scrim is now `z-91` and the dial
`z-92`, still under the support chat panel (95) and every modal (300).

**The trigger's accessible name was English in the markup.** It is the only
control on the dial with no visible label, so that name is the whole of what a
screen reader gets. `balance.quickActions` and `balance.closeQuickActions` were
added to all five catalogues.

## How it was verified

`features/portfolio/components/portfolio-fab.test.tsx` is new: seven tests
covering the closed state, opening, both actions closing the dial before their
sheet opens, scrim dismissal, the z-order against the tab bar, and the trigger
named from the catalogue under a German render. The last three were confirmed
failing against the filed code before the fixes went in.

Bundle figures above are `pnpm bundle:report` on a production build, compared
against the same build of `origin/staging`. Full `./scripts/preflight.sh`
clean.
