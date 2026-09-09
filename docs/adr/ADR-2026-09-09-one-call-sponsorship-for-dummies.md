# ADR-2026-09-09: Why one gasless trade made twenty network calls, and how it now makes ten (Plain English Guide / ADR for Dummies)

## Status

Proposed — 2026-09-09, waiting for the maintainer to approve.

## The Problem

A recording of a memecoin buy on the live app showed the browser talking to
the blockchain provider fifteen times for one purchase, and fifteen more to
sell it back. Providers charge per call, so this is money, and it is also
slow.

Most of those calls were questions the app asked one at a time before every
gasless send: is this wallet set up, what is the current fee, what is the
relay's minimum fee, how much gas will this need, who is paying for it, and
what is the paying party's data. Six separate questions, then the send
itself, then a few "is it done yet" checks. And a trade is two sends
(permission, then the swap), so everything doubled.

## What We Do

Alchemy, the company that relays our gasless sends, has one request that
answers all six questions at once. We now ask that instead. Our server adds
the secret that tells Alchemy which account pays, so the browser never
knows it, exactly as before.

Three smaller changes go with it. The app used to check the wallet's
balance before and after a trade to prove the coins arrived; the receipt of
the trade already lists exactly what was paid into the wallet, so it reads
that instead. "Is this wallet set up" is now asked once
per session instead of before every send, because the answer never changes
once it is yes. And the "is it done yet" check waits for the chain to have a
chance to answer (one block, two seconds) before asking, then asks every
three seconds.

## What Changes For Users

Nothing visible, except that a trade should feel a little quicker. The same
money moves the same way and the same receipt comes back. Under the hood a
buy or a sale costs about ten provider calls instead of about twenty-two.

## What Does Not Change

If Alchemy's answer is incomplete the send stops with an error rather than
guessing a number. The fallback between our Alchemy keys works for the new
request exactly as it did for the old ones. And if a send is accepted but
its receipt never arrives, the app still looks for it on the chain itself
before giving up.
