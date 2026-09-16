# The phone Market page, in plain English

## What is happening

On a phone, the developers' branch has one "Market" screen with tabs across the
top: Spot, Leverage, Memecoins, Prediction. Our production branch does not have
that screen yet, so a phone user sees older, separate screens for each. The two
have drifted apart.

## What we are doing

We are adding the same Market screen to the production branch, with three tabs
instead of four. The Leverage tab is left out because perpetuals are not on
production. Opening Spot, Memecoins or Prediction on a phone now lands you on
the matching tab of that one screen; on a laptop nothing changes.

Two small differences from the developers' branch, on purpose: prediction cards
have no "open the market page" link, because that page is not on production,
and the bottom bar's last button still opens the side menu, because on a phone
that menu is the only way to reach Real assets.

## Why it matters

Once the phone looks the same on both branches, the developers' next changes
merge cleanly instead of fighting an older layout. And when perpetuals launch,
the Leverage tab is a one-line addition.
