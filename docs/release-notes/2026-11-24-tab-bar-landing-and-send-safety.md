---
date: 2026-11-24
branch: feat/ux-and-send-safety
base: main
scenario-impact: updated
---

# New tab bar, landing and funds tweaks, and two double-send guards

## Interface (maintainer's changes)

- **Bottom navigation:** the curved tab bar is replaced by a simpler
  `TabBar` (`components/layout/tab-bar.tsx`) in the dashboard shell and on
  Market.
- **Landing and portfolio:** the ArkStore links are hidden (landing "Get the
  app" CTA, the portfolio promo ticket) while the store listing is paused.
  Ark ID now leads the promo strips.
- **Bank withdraw:**
  - The pill reads "Select" until a bank is picked.
  - The Recent/Favorite/View All tabs, which had nothing behind them, are
    now a plain "Recent" heading.
- **Bank deposit:** a failed order shows a friendly error instead of the raw
  rail message.
- **Crypto deposit:**
  - A voice prefill no longer re-selects itself after the user backs out of
    it.
  - The address warning names the actual token and chain instead of
    "KASH+".
- **Dextopus proxy:** logs which purpose and path the provider refused on a
  401 or 403.

## Send safety

From the 2026-11-24 balance/sending audit, §2:

- **Remit review:** a sponsored send that reached the bundler but has no
  receipt yet now shows "submitted, don't send again" with no Retry. Before,
  Retry could pay the same deposit address twice.
- **Move funds:** the Move button stays disabled while the post-run rescan
  is in flight, so it can't resubmit the stale plan and resend transfers
  that already landed.

Both fixes have regression tests that fail without the fix
(`features/remit/components/review-step.test.tsx`,
`features/wallet-upgrade/components/move-funds-panel.test.tsx`).
