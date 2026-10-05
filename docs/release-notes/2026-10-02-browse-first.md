---
date: 2026-10-02
feature: Every page opens without signing in; money and play actions ask for a sign-in on the spot
scope: feat
scenario-impact: needs_automation
---

# Browse first

Decision: [ADR-2026-10-02-browse-first](../adr/ADR-2026-10-02-browse-first.md)
([plain-English version](../adr/ADR-2026-10-02-browse-first-for-dummies.md)).

## What a visitor sees now

Any page, and any shared link, opens without a session. That includes every
game, a private Last Man link, the markets, Real assets, Memecoins, Arkivity,
Referrals and Ark ID. The account upgrade is the only flow that still needs
one.

- **Sign in, in the chrome.** The rail's account button and the phone
  topbar's account button become a white **Sign in** pill while signed out.
  It opens the sign-in as a modal over the current page, so the visitor is
  still there once signed in. The `/auth` page stays for links and for
  sign-out, and it now sends people to the dashboard, not to interests.
- **The gate.** A money or play action without a session stops and shows a
  toast naming it ("Sign in to play", "Sign in to buy", ...) with a Sign in
  button. Wired into: Add funds and Withdraw everywhere (the balance card,
  the floating button, every Top up, which all go through the shared modal
  hook), the buy, sell, meme and RWA sheets, the spot and RWA trade buttons,
  the meme tickets, the spot pro panel, prediction market orders, the
  sportsbook and house bet slips, Last Man (play and start a game), ArkBall
  (Quick Pick and Buy), Arkjet, Pilot Chicken, Spin (bets and Add Money),
  chess (arena create and join, spectator bets, every game form inside the
  chess lobby frame), Kash (buy, send, convert, history, upgrade), Ark ID
  reserve, and the Earn bounty forms. Trade buttons stay pressable while
  signed out, so the press can ask, rather than sitting disabled behind a
  "Not enough balance" that is not the real reason.
- **Signed-out states.** The balance card shows `$0.00` with "Sign in to see
  your balance" in place of "ready to spend". The Kash card, Arkivity and
  Referrals ask for a sign-in instead of a skeleton or spinner that never
  resolves, or an empty history that is not true.
- **Chess.** The chess backend renders the play lobby and challenge pages only
  for a session (`/v1/chess/play` and `/v1/chess/challenge/<id>` answer 401
  without a token, checked 2026-10-03), so a visitor sees "Sign in to play"
  with a Sign in button there instead of being signed out and sent to
  `/auth`. Tournament and swiss pages are served by the backend to anyone,
  so the proxy now lets a visitor read them; a signed-in caller still has
  their wallet forwarded.
- **Market data.** `/api/rwa-prices` and `/api/rwa-chart` answer without a
  session for assets in the RWA catalogue only, so the Real assets table
  and charts render signed out without letting anyone spend the Alchemy key
  on arbitrary tokens.
- **Also open to visitors:** the perps market list and prices (they were
  hidden behind "Sign in to trade"); Earn's public pages, with the personal
  ones (applications, profile, sponsor, drafts) asking for a sign-in and the
  Earn bell hidden. Broadcast cards and the Go Live button ask for a sign-in
  instead of failing against Market Square.
- **Reads that needed a session no longer run for visitors:** the prediction
  market's on-chain group lookup (visitors lose only the parent-event
  breadcrumb on grouped markets), the RWA live quote, and the deposit catalog
  prefetch. The landing page's "known user" mark is now set only by a real
  session.

## Add funds wherever the balance is short

Added 2026-10-03 at the maintainer's request (ADR addendum). Wherever a play,
trade, bet or purchase says the balance is too low, an Add funds button sits
next to the message, or on the toast when that is the only place the
shortfall shows. It opens one deposit modal that works on every page, so
someone who followed a shared link can sign in, fund and carry on in place.

Newly covered: the Last Man start-game sheet, ArkBall, chess funded games in
the lobby (computer, lobby, friend, tournament entry), chess spectator bets
and the chess cashier, the perps top-up modal, prediction market orders,
the house accumulator, the first-party sportsbook and the sportsbook slip,
Kash buy and upgrade, Ark ID, Earn reward funding, the RWA Solana funding
shortfall, the `/spot/[id]` buy sheet and the phone Market's meme sheet.
Already covered and unchanged: spot and RWA tickets, meme tickets and sheets,
Last Man's play button, and the Arkjet, Chicken and Spin cashiers.

Not offered where a deposit cannot help: selling more than you hold, and
KASH sends or conversions above the KASH balance. The RWA trade panel no
longer shows Top up on a sell that is over the holding.

## Other changes

- Every "Get started" on the landing page (hero, enter, closing call to
  action, navbar) now opens the portfolio instead of the sign-in page; the
  visitor signs in from the app when they first act. The navbar's "Log in",
  shown to returning visitors, still opens the sign-in page.
- The interests step is gone. `/interests` redirects to the dashboard, and
  the dashboard's sections are in one fixed order for everyone: the balance
  cards, Arkade, Join the Conversation, Prediction, Real assets, Memecoins,
  then the rest. The sidebar keeps its own order.
- The sign-in modal and its screen load on first open, so routes that never
  ask for a sign-in carry none of it. Every route stays inside its
  first-load budget; no budget was raised.
- New copy in all five locales: `auth.signIn`, `auth.signInToSeeBalance`,
  `auth.signInToInvite` and `auth.gate.*`.

## Not in this change

- The chess play lobby itself cannot be shown signed out until the chess
  backend renders it without a token.
- Prediction liquidity, resolve and comments, and the perps order ticket,
  keep their existing wallet checks. They are only reachable with positions
  or a live price feed, which a visitor does not have.

## Scenario impact

Needs automation: open a shared private Last Man link signed out and press
Play; open `/dashboard` signed out and press Add funds; sign in from the
toast and repeat the press.
