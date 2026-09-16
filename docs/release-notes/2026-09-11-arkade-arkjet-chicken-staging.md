---
date: 2026-09-11
feature: Arkjet and Pilot Chicken are back in the Arkade on staging
scope: casino, arkjet proxy
scenario-impact: updated
---

# Arkjet and Pilot Chicken are back in the Arkade on staging

## What changed

The 2.0 interface port to staging (#431) removed Arkjet and Pilot Chicken,
because their backend was not on production yet and staging was about to be
merged into `main`. The staging backend serves both games, so they return to
the staging Arkade.

- **The two games sit after Checkers.** The order is Last Man, Chess,
  ArkBall, Checkers, Arkjet, Pilot Chicken. Both carry the "New" tag.
- **The screens are the ones that were removed**, restored unchanged from the
  last staging tree that had them: `/casino/arkjet` and `/casino/chicken`,
  the Arkjet stage, bet cards, cashier and chat rail, and the Pilot Chicken
  lanes.
- **The `/api/arkjet` proxy is back.** It allowlists the Arkjet and Chicken
  paths, verifies the session for bets, funding and chat, and reaches the
  service at `/v1/arkjet` on the gateway.
- **The cashier refreshes Base only.** After a deposit or withdrawal it asks
  the portfolio for a fresh read of `base-mainnet`, the one network the
  cashier moves USDC on, instead of the old whole-portfolio refresh that the
  scoped refresh API no longer offers.
- **Names and notes in all five languages** come back from the removed
  catalogue entries.

## Left out on purpose

Fourteen images and sounds from the old tree are not restored, because no
screen loads them: three Arkjet canvas icons, the two partner logos, four
Chicken keypad icons, three Chicken overlays and the two Chicken sound tracks.

## Not on production

Nothing here reaches `main`. Before the two games go to production, the
Arkjet service has to be registered on the production gateway.

## Tests

`features/casino/lib/games.test.ts` (Arkjet and Pilot Chicken come right
after Checkers, and the order of the four games before them is unchanged),
`__tests__/arkjet-route.test.ts` (the proxy allowlist and session checks),
`features/casino/lib/arkjet-funding.test.ts` (deposit and withdrawal
amounts).
