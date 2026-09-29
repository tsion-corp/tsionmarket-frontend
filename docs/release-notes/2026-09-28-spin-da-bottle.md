---
date: 2026-09-28
feature: Spin Da Bottle joins the Arkade with live comments and isolated game custody
scope: feat
scenario-impact: needs_automation
---

# Spin Da Bottle is playable in the Arkade

Spin Da Bottle now appears after Pilot Chicken in the casino catalogue and on
the discovery carousel. Its immersive route scales a fixed 360 by 640 game
surface to phones and larger displays while preserving the reference layout,
assets, bottle animation, result art and dark page background.

Players choose UP or DOWN, set a stake from 0.10 through 20K, confirm the wager
and receive the settled result from Arkjet. Winning rounds pay 2x; a MIDDLE
result loses. The controls validate the server's minimum, the 20K product cap
and the player's available balance without changing the bottle geometry.

The game drawer contains only How to Play and Add Money. Music, Sound,
One-Tap Bet, Bet History and the rejected onboarding flow are not exposed.

# Chat belongs to Ark

The chat sheet uses Arkjet's own Spin comments API rather than a third-party
feed. It polls the authenticated comment history, refreshes presence, posts
messages with a 160-character limit and masks other players' display names.

# Both session providers reach Arkjet

The same-origin Arkjet proxy now exposes the Spin wager, proof and comment
routes. It forwards either Decane or Privy bearer cookies to authenticated
upstream calls, preventing a valid Decane session from becoming unauthorized
between the web app and Arkjet. Provider-configuration errors are reduced to an
actionable sign-in-again message instead of exposing backend wording.

No new frontend environment variables are required. The existing Arkjet URL
configuration is reused. The backend Spin service and its dedicated reserve
wallet must be deployed before enabling the game in production.

## Verification

Prettier, ESLint, TypeScript, both Vitest shards, the production build and the
first-load bundle budget pass. Route and component coverage includes Decane
cookie forwarding, public rules, responsive sizing, the 20K cap, removed menu
items, chat state, catalogue order and discovery links.

The complete signed-in wager, funding and comment flow should also be exercised
against the deployed backend preview because it depends on live Base USDC and
the dedicated Spin reserve wallet.
