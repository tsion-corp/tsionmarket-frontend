# ADR-2026-09-07: Stop paying Alchemy to list spam tokens (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-07; the maintainer delegated the decision and asked that
ZeroDev be checked first. It was.

---

## What Is This Document?

The plain-English companion to
[`ADR-2026-09-07-portfolio-balances-via-multicall.md`](ADR-2026-09-07-portfolio-balances-via-multicall.md).
It explains where the Alchemy bill comes from and what changes.

---

## The Problem

Every time the app refreshes someone's balances, it asks Alchemy's Portfolio
API for **every token the wallet has ever received on 28 chains**. That list
is mostly airdrop spam, so it comes back in several pages, and each page is
one of the most expensive calls Alchemy sells. The app then keeps only the
handful of tokens it recognises and throws the rest away. Multiply by every
signed-in user, once a minute, and that one call is most of the bill.

## Can ZeroDev take it?

Not that call. ZeroDev is a relay for blockchain nodes; the Portfolio API and
the price feed are ordinary web APIs on Alchemy's side and cannot be routed
anywhere else. We checked ZeroDev chain by chain: plain blockchain reads work
on 24 of our 28 chains, four are not supported at all, and Alchemy's special
token methods only work through it on 11 chains by luck of routing. Zack is
also right that ZeroDev is a paid service on mainnet.

## What We Do Instead

We already know exactly which tokens we care about on each chain. So instead
of asking "what does this wallet hold?", we ask the chain directly "how much
of these specific tokens does it hold?", in one bundled read per chain. That
is a plain read every node supports, so it goes to ZeroDev first and to
Alchemy only when ZeroDev cannot answer.

The five chains people actually use (Base, Ethereum, Arbitrum, Optimism,
Polygon) are refreshed as often as today. The other 23 are refreshed every
ten minutes, immediately after an in-app purchase, and more often once a
wallet is seen holding something there.

Solana keeps the old method for now; it gets its own change.

## What Changes For Users

Nothing on the main chains. On the rarely used chains, a deposit that did
not come through the app shows within ten minutes instead of one. A few
tokens may show a letter badge instead of a logo.

## What Changes On The Bill

The expensive Portfolio API call disappears for EVM chains entirely. What
remains on Alchemy is a small price lookup for tokens actually held, shared
between users, and the Solana read until that is moved too.
