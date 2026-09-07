# ADR-2026-09-06: Buying and selling Solana memecoins, gas-free (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-06. The maintainer said yes; it is built and awaiting review.

## What Is This Document?

A plain-English companion to the technical decision record of the same name.
It says what we want to change, why, and what it means for people using the
app. If you only read one of the two, read this one.

## The Problem

Our memecoin backend now knows about coins on two networks: Base and Solana.
The app only knows how to trade on Base. So when a Solana coin showed up in
"Trending" or in search, tapping it produced an error, because the app asked
the backend about it the Base way. Right now, as a stopgap, we hide Solana
coins altogether.

That leaves money on the table. Most of the trending memecoins are on
Solana — on the day we measured, 30 of the top 33 were.

## What We Propose

Teach the app which network a coin lives on, and trade it the right way for
that network. Solana trades will be gas-free for the user, the same way Base
trades already are: our sponsor wallet pays the network fee.

The good news is that nearly everything needed already exists. The app
already sends gas-free Solana transactions (that is how withdrawals to Solana
work today). The backend already builds the Solana trade and checks it. We
are connecting two things that are both already working.

A Solana trade will go:

1. You pick a coin and an amount, and see a preview with the fee.
2. The backend builds the transaction and hands it to the app.
3. The app asks our sponsor to cover the fee, you sign once, the sponsor
   sends it.
4. The backend watches the chain and marks the trade confirmed. Only then
   does the app say "done".

## What Changes For Users

- Solana memecoins appear again in Trending, search and the catalog, and can
  be bought and sold.
- No SOL needed for fees. Ever.
- The first Solana trade asks for one extra signature to link the wallet,
  the same as the first Base trade did.
- Base trading does not change.

## What We Give Up, For Now

- Our sponsor wallet now pays for trades as well as withdrawals. Someone needs
  to keep an eye on its balance; if it runs dry, Solana trades stop until it
  is topped up.
- Balances update when the trade is confirmed, not the instant you tap. That
  is a few seconds, and it is deliberate: we never say "success" before the
  chain does.

## What We Need From You

A yes or no on building it. If yes, the technical plan goes in
`docs/plans/`, then a branch, then a preview link where you can do one small
real trade on each network before it ships.
