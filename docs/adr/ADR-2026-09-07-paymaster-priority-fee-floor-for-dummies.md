# ADR-2026-09-07: Why Arbitrum gasless sends were rejected (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-07; the maintainer asked for this fix on `main` now.

## The Problem

When the app sends a gasless transaction it has to name a "tip" for the
network. It asked the Arbitrum network what tip to use, and Arbitrum said
"zero", which is true for Arbitrum. But the company that relays our gasless
transactions (Alchemy's bundler) has its own minimum tip and refuses anything
below it. Hence "maxPriorityFeePerGas is 0 but must be at least 831187".
Base and Polygon suggest a tip above the minimum on their own, so only
Arbitrum failed.

## What We Do

Before sending, ask the relay for its minimum tip, add a little headroom,
and use whichever is higher: the network's suggestion or the relay's minimum.
The server proxy now lets that one question through.

## What Changes For Users

Gasless sends on Arbitrum go through. Nothing else visible.
