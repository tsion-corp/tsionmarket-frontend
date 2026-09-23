# ADR for dummies: adopting management's tracking list

- Status: accepted
- Date: 2026-09-22
- The technical version: [ADR-2026-09-22-mixpanel-management-catalog](./ADR-2026-09-22-mixpanel-management-catalog.md)

## What happened

Management sent a list of about 150 things they want measured, covering every
part of the app. It replaces the list we were working from this morning. Where
the two disagree, management's wins.

## What we are doing now, and what comes later

We are doing the money and sign-up half first: the landing page, signing up,
adding funds, withdrawing, Kash, trading, prediction and perps. Those flows
already send something, so this is mostly correcting and extending.

The other half is the games, the Square social feed and the Arkivity history
page. Those send almost nothing today, so every one of those events is new work
on screens that have never been touched for tracking. Square alone is thirty
events. It is a second piece of work.

## The one decision worth reading

Mixpanel identifies each person by their wallet address. We have been using the
address in its normal mixed-case form. Management's list asks for it in all
lowercase.

Those are two different strings as far as Mixpanel is concerned. So on the day
this ships, every existing user comes back looking like somebody Mixpanel has
never seen before. Their history does not follow them.

In practice that means:

- Any report that covers dates on both sides of the release counts a single
  person twice.
- Everything we know about them (their email, when they signed up, when they
  first deposited) stays attached to the old record.
- The running totals we keep on each person (money deposited, trades made,
  volume traded, referrals) go back to zero.

You asked for it as specified, so that is what is built. It is fixable, but not
by us: the data team has to run a merge inside Mixpanel afterwards that tells it
the old and new IDs are the same person. Until they do, treat anything spanning
the release date as two separate groups of users.

None of this affects the app itself. Nobody gets logged out, no money is
touched, nothing on screen changes.

## Three smaller things

**Some events got renamed.** Management uses slightly different words for a few
things we had already built. We took their words. This costs nothing, because
none of those events have actually gone live yet.

**Naira deposits get their own name back.** We had merged them with crypto
deposits, because at one point every Naira deposit was being counted twice.
Management wants them separate again. That is fine now, because the new setup
sends one name or the other, never both.

**Every page now reports itself.** Before, only the main sections reported being
opened. Now every page does, and it says both which page it was and the address
it was at, so marketing can see which link someone arrived through.

## One thing we cannot do from here

Management asked that "signed up" be recorded by the server when the account is
actually written, rather than by the browser. The browser is all we have on this
side. It still records it, just from the browser as before. Doing it properly
needs the backend work already written up for that team.
