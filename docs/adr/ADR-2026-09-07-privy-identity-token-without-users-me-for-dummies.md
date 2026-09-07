# ADR-2026-09-07: Stop asking Privy who the user is on every hiccup (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-07; the maintainer delegated the decision and the fix.

---

## What Is This Document?

The plain-English companion to
[`ADR-2026-09-07-privy-identity-token-without-users-me.md`](ADR-2026-09-07-privy-identity-token-without-users-me.md).
It explains the repeating `users/me` request in the video, why "cache it
with TanStack" was not the answer, and what we did instead.

---

## The Problem

Every request our app makes to our own server carries a small signed note
from Privy that says who the user is (the "identity token"). Our code asks
Privy's software for that note before each request. Privy's software has a
copy already, but the function we were calling does not look at its copy: it
phones Privy's servers first, every time. That phone call is the
`users/me` request in the video.

We had already arranged to make that call only about once an hour. The
trouble started when the call failed. Privy answered "429, too many
requests", and our code had no plan for that: it simply let the next request
try again straight away. On the deposit screen there is always a next
request a second or two later (balance polling), so the failed call was
repeated, Privy kept answering 429, and the limit never cleared. That is the
loop on the screen.

"Cache it with TanStack Query" cannot fix this, because the request is not
one we make. It happens inside Privy's library. There is nothing of ours to
cache.

## What We Do

1. **Read the copy Privy already has.** Privy's library keeps a fresh note in
   the browser and renews it on its own whenever the session renews. We now
   read that copy and attach it, with no phone call at all.
2. **Phone Privy only when there is nothing to read**, which is a brief
   moment right after sign-in.
3. **When a phone call fails, wait before trying again**: one second, then
   two, four, up to a minute; after a "too many requests" answer, a full
   minute. Meanwhile we keep using the last good note, which is still valid.

## What Changes For Users

Nothing visible, except that the deposit screen and everything else keeps
working when Privy is having a bad moment, instead of piling on and making
it worse.

## What To Watch

After this deploys, open the deposit screen, filter the network panel to
`auth.privy.io`, and leave it for five minutes. You should see `users/me` at
most once, at load, and nothing after. If you see it repeating, the browser
console now prints a line saying exactly why each retry happened.
