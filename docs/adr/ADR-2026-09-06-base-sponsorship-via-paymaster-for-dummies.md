# ADR-2026-09-06: Making gasless Base transactions work again (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-06, approved by the maintainer.

---

## What Is This Document?

The plain-English companion to
[`ADR-2026-09-06-base-sponsorship-via-paymaster.md`](ADR-2026-09-06-base-sponsorship-via-paymaster.md).
It explains why buying Kash+ fails today and what we propose to do about it.

---

## The Problem

When you buy Kash+, the app pays the network fee for you through Alchemy, using
a "gas policy" that says whose transactions to sponsor. Alchemy has two
different ways of doing that, and they need two different kinds of policy:

- **The bundler way** ("Bundler Sponsored Operations"): the policy's id is sent
  as a label on the transaction. This is what the app uses for Base.
- **The paymaster way**: the app first asks Alchemy's paymaster to sign off,
  then sends. This is what the app uses for Polygon.

The policy you created is the **paymaster kind**. We proved it: asked the
paymaster way, it answers; asked the bundler way, Alchemy says
"does not support bundler sponsorship". Both policies made today came out
this way, and Alchemy's documentation does not say which dashboard choice
makes the other kind.

Your key and account are fine now; the earlier out-of-capacity problem is gone.

---

## What We Propose

Switch Base to the **paymaster way**, the one Polygon already uses in
production, so it works with the policy you already have.

- One setting in the network registry flips Base from "bundler" to
  "paymaster".
- The server learns to use Base's own policy id in that mode (today that mode
  only knew Polygon's).
- The sending code does not change; it is the same path Polygon runs today.

## What Changes For Users

Nothing visible. Purchases and other gasless actions on Base work again. Under
the hood each one makes two quick extra calls to Alchemy's paymaster, which is
slightly slower than the bundler way but proven.

## What We Give Up, For Now

The bundler way is a little faster and retries on its own. If the team later
gets a Bundler Sponsored Operations policy from Alchemy, switching back is one
line.

## What We Need From You

Approval of this document and its technical companion. Then: tests first, the
two small changes, the full preflight, and a real purchase on the local server
to prove it end to end.
