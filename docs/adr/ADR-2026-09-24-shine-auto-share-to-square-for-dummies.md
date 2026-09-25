# ADR-2026-09-24 in plain English: Shine

## What we're building

A switch called **Shine** on each service page — memecoins, spot, real assets,
prediction markets, perps, arcade games, sports. It's **on by default**.

While it's on, when you successfully do something, it's posted to your Market
Square automatically. You don't confirm each one. Posts say **what you did and
how it's performing as a percentage** — never how much money was involved.

Not on deposits or withdrawals.

## The one thing that could genuinely go wrong

**Posting the same thing twice, in public, without asking.**

Half the services tell the app "this succeeded" in a clean way: you press buy,
and when it's done the code that ran it knows. Those are safe — it happens once.

The other half don't. They tell the app by _changing a number the app keeps
checking_. The app asks "is this game over yet?" every few seconds, and at some
point the answer becomes yes — and stays yes, forever. Every time you reopen the
screen, switch back to the tab, or reload, the app asks again and gets the same
yes.

With the popup we originally planned, that was harmless — you'd see the same
message twice and close it. **As an automatic public post, it's your feed filling
up with duplicates.** The worst one we found: a list that refreshes every minute
and re-reports every game you've ever finished. Wired up carelessly, it would
post your entire game history on a loop.

So the centre of this build isn't the switch or the posts. It's **a permanent
record of what's already been posted** that survives closing the tab, reloading,
and coming back tomorrow. The app has four ways of remembering things like this
today and only one of them survives a reload — so that's the one we use.

## Five things had no "done" signal at all

You said post only when confirmed. For five of them, "confirmed" didn't exist:
selling on spot, closing a perps position, winning on ArkBall, prediction bets,
and real assets on certain chains.

You asked whether we can create those signals. Mostly yes — and for perps, the
signal **already exists and nobody is listening to it**. The code waits for your
position to actually change, then throws the answer away. We just catch it.

For real assets on some chains the app's own code calls its result
"best-effort" — it doesn't truly know. There we post nothing, rather than
announce something we can't stand behind.

## "Is the coin pumping or dumping?"

**Decided on approval: a Shine post is a plain post**, like anything else
written in the square. No attached card, no link.

That answers this question by removing it. A post is written once and stored,
and with nothing attached there's nothing for the app to look up later — so a
post can't change after it's written, anywhere.

Which means the post has to say something that stays true. "Bought PEPE at
$0.0000042" is correct forever. "PEPE is pumping" is wrong within the hour, and
there's no way to fix it afterwards. Anyone reading can look up where the coin
is now themselves.

Where an outcome is already known when we post — a game you won, a position you
closed — the percentage goes in the text, because by then it's settled.

## The switch belongs to your account, not your laptop

Signing out of this app clears almost nothing from the browser. If Shine were
stored on the device:

> You turn Shine off for perps. A friend signs in on your laptop. Their first
> memecoin trade gets posted publicly — and they're shown no warning, because
> the "already warned them" note is yours, not theirs.

So the switch is stored on your **account**, the same place your terms
acceptance already lives. It follows you between devices, and a shared computer
can't leak one person's setting onto another.

## Telling people the first time

You asked to use platform notifications. We checked — that system can only send
a message to _everyone at once_. There's no way to send one person a note, so it
can't be used here.

Instead: a small message the first time Shine posts something for you, remembered
against your account so each person on a shared device gets their own.

## What we need from the backend

**Nothing blocking, after the plain-post decision.** The original plan needed the
square to support links to a coin, a real asset and a perps market — none of
which exist. Posting plain text removes that dependency, so this can ship
without waiting on anyone.

Worth raising with them separately: a crowd of automatic posters is a different
kind of traffic from people pressing a button, so they may want their own limit
on how fast posts can arrive.

## In one sentence

We're building the switch, posting only on real confirmations (creating a couple
that were missing, and catching one the code already had), keeping money out of
the posts, storing the switch on your account so a shared laptop can't leak it,
and putting most of the engineering into making sure nothing is ever posted
twice.
