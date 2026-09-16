# ADR-2026-09-12 in plain English: turning on crash reporting

- **Status:** Accepted (approved by MarkDavid Ojukwu, 2026-09-13)
- **Companion to:** `ADR-2026-09-12-watchtower-error-tracking.md`

## The problem

Right now, when the app breaks for somebody, we do not find out.

If a screen crashes, the reader sees a tidy "something went wrong" message and
can carry on. That part works. What does not happen is anyone being told. There
is no alert, no list of recent breakages, no count of how many people hit it.
The way we currently learn about a broken screen is that a person notices and
tells us.

That is fine for a small site. It is not fine for an app holding people's money,
where the difference between "one person had a bad minute" and "nobody can
withdraw" is something we should know within minutes, not whenever somebody
complains.

## What we are turning on

Watchtower, the monitoring service another Worldstreet team has built. Think of
it as a smoke alarm for the app: when something breaks, it records what broke,
where, which version of the app it was, and how many people hit it, and puts
that on a dashboard.

## The one decision worth understanding

Watchtower comes with its own plug-in kit. We are **not** using it. We are using
a standard, widely used kit (Sentry's) that Watchtower is deliberately built to
understand, and pointing it at Watchtower.

Here is why, and it is genuinely important.

Error reports work by scooping up whatever the app was doing when it broke, and
sending that off to be read later. Sometimes what the app was doing involves
something secret. The worst case: somebody is typing their twelve-word wallet
recovery phrase, something breaks, and that phrase gets scooped up with
everything else. Anyone holding that phrase can empty their wallet.

Watchtower removes secrets like that **when the report arrives at its servers**.
That sounds fine until you notice what it means: the phrase has already left the
person's phone and travelled across the internet before anything cleaned it up.
The cleaning happens one step too late.

The standard kit lets us clean the report **on the person's own device, before
it is sent anywhere**. Nothing secret leaves the phone in the first place.

For a normal website that difference is academic. For an app holding money it is
the whole decision.

Two smaller reasons point the same way. Watchtower's plug-in kit is four days
old and published from a personal account rather than a company one, and we would
rather not have our wallet app depending on a personal account. And because we
are using the standard kit, if Watchtower ever goes away we change one line of
configuration instead of rewriting anything.

To be clear: Watchtower being compatible with the standard kit at all is a smart
piece of design by whoever built it, and it is the reason this was easy.

## What we deliberately left switched off

**Session replay.** Some monitoring tools can record a video-like replay of what
someone did before a crash. It is genuinely useful, and it is also the single
most dangerous thing here: a replay of somebody funding their account or typing
a recovery phrase _is_ the leak. Turning it on should be its own decision, with
its own review of which fields get blanked out. Not something that arrives
quietly alongside crash reporting.

**Anything that identifies a person.** The setting that would automatically
attach IP addresses and browsing details is off.

**Local development.** Nothing you break on your own laptop reaches the
dashboard. Otherwise the feed fills with noise from developers and real problems
get lost in it.

## What this costs

One new library. A small amount of extra build time, and only in CI. No change
to how the app looks or behaves for anybody using it.

If Watchtower is down, nothing happens to the app. Reports quietly fail to send.
Monitoring going quiet must never take the product down with it, and it will not.

## What we still owe

Watchtower is four days old. It has no uptime guarantee, no status page, and no
written position yet on data protection. That is normal for something this new
and it is not a reason to avoid it, but it does mean two things:

1. We should turn it on for the preview environment first and watch it, before
   trusting it in production.
2. Before we start attaching user identities to reports, somebody needs to write
   down our data-protection position for European users. Crash reports with
   someone's ID in them count as personal data.

## In one sentence

We are turning on a smoke alarm for the app, wiring it up with a standard,
well-tested connector rather than the brand-new one, specifically so that
secrets get cleaned off the report before it leaves the user's phone rather
than after it arrives.
