---
date: 2026-09-23
feature: The referral screen becomes a page, and shows the reader's network
scope: feat
scenario-impact: needs_automation
---

# Referrals move to their own page, with the network behind them

Invites were a sheet reached from the account menu. They are a route now,
`/referrals`, for two reasons: the network view below is something people come
back to and read rather than glance at, and a route can be linked, shared and
returned to, which a sheet that exists only while a menu is open cannot.

Everything the sheet carried is still there: the mascots, the invite link with
Copy, the progress card, the eligibility rule, how it works, and the people
invited. The claim step still comes first for anyone without a username, since
the username is the invite link.

## The network

Underneath, a reader can now see who sits below them:

- Two figures: how many people are in their network, and how many of those have
  counted.
- One row per generation. Generation 1 is who they invited, generation 2 is who
  those people invited, and so on. Each row opens to the people in it, marked
  counted or not yet, and pages if the generation is long.

Rows start closed, because the counts answer the question most of the time and
a generation can hold hundreds of people. A generation is fetched the first
time it is opened and kept afterwards, so closing and reopening costs nothing.

## Where the data comes from

A new pair of reads on the Kash engine, `/referrals/me/network` and
`/referrals/me/downline`, scoped to the signed-in wallet upstream. The wallet
is never in the request, so a reader cannot ask about somebody else's network.
The referral graph was previously readable only through the admin app's
key-guarded routes, which the product cannot use.

Until those routes are deployed everywhere, a 404 reads as "no network yet"
rather than an error: the rest of the page works without them, and a failure
banner over something the backend has simply not shipped helps nobody.

## Entry points

"Invite friends" in the account menu, the account sheet on a phone, and the
marquee's invite item all navigate to the page instead of opening the sheet.
