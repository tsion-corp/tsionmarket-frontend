# ADR-2026-09-23 in plain English: the balance endpoint

## What we're doing

Plugging in one new backend endpoint: the one that returns a user's balance.

The activity endpoint is off the table for now, on your backend lead's call. The
Activity screens that went live yesterday are untouched — they don't use the new
endpoint and never did, so nothing there changes.

## The one thing worth understanding

The app already knows your balance. It asks a blockchain service directly, and
**52 different places in the app** use the answer — mostly not for the total,
but for one specific line of it: "how much USDC do you have on Base, and is that
enough for this trade?"

The new endpoint returns a summary. A summary can't answer that question, so it
can't simply take over from what's there.

There's also a subtler problem. The app adds up **the wallets it created for
you**. The new endpoint adds up your **linked wallets**, which can include
wallets you connected yourself. Same person, two different totals — and neither
is wrong, they're just answering slightly different questions. If we quietly
swap one for the other, someone opens the app tomorrow and their balance has
changed, with nothing to point at as the cause.

## So what we propose

**Plug it in properly, but leave the big number alone for now.**

Wire up the endpoint with real checking on the way in, and use it first where
there's an actual hole: there's a balance the app currently **cannot show at
all** — money sitting in the games/vault side — and this endpoint can fill it.
Right next to it, there's a bug where a real dollar balance gets rounded through
a decimal number, which we'd fix at the same time.

Leave the headline balance card exactly where it is until your backend confirms
which wallets it counts.

## Two small security fixes while we're in there

The app has a gateway that private data passes through. It checks you're signed
in — but it never checks that the data you're asking for is **yours**. It trusts
the backend to refuse. That's survivable for a notifications inbox. It's not
what anyone wants sitting in front of wallet balances. It's a one-line fix.

Separately: there's a way to add a new route and forget to describe what its
response should look like — and if you forget, the app silently stops checking
it altogether. It looks like it's working. We'd add a test that catches that.

## What's not in this change

**Live updating.** The spec describes the balance refreshing by itself the
moment money moves. The pipe for that doesn't exist in this app yet — the
groundwork was postponed when notifications shipped, and building it properly
means new shared plumbing. Without it, the balance refreshes when you come back
to the tab, which is how the rest of the app already behaves.

## What we need before we can start

**One example of what the balance endpoint actually returns.** We have a
one-line description and nothing else. You can't write the code that checks a
response without knowing its shape, and guessing would either reject good data
or check nothing at all.

That one sample also answers the two open questions:

1. Does it return **token amounts** or **dollar values**? Amounts are simpler —
   the app already has its own prices. Dollar values would give us two different
   dollar figures for the same token, which will eventually disagree.
2. Does it count **linked** wallets or **app-created** wallets? This decides
   whether the headline balance can ever move to it.

## In one sentence

We're adding the balance endpoint carefully, using it first where the app is
currently blind, fixing two small security gaps on the way past, and we need one
example response before the work can start.
