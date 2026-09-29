---
date: 2026-09-28
feature: A shared link earns for whoever shared it
scope: feat
scenario-impact: needs_automation
---

# Every wallet has a referral code, and every share can carry it

The frontend half of kash **ADR-0015**. The engine now gives every wallet an
opaque code on its first authenticated read of `/referrals/me`, so someone who
never claimed a username can still be credited. Nothing here worked with those
codes, and nothing failed loudly either.

## What was broken

`/r/7k4m9x2p` was **dead**, silently, in two places:

- `app/r/[code]/route.ts` gated the cookie on the username pattern, which
  requires a leading letter. A code set no cookie at all; the visitor was
  redirected to `/auth` and the referral was gone. The comment said it outright:
  _"an invalid code simply sets no cookie."_
- `readRefCode` dropped anything that failed the same pattern, so even a cookie
  set another way would not have survived the read.

Both now accept either kind.

## What did not exist at all

**Nothing read `?ref=`.** Only `/r/<code>` ever set the cookie, so attaching a
code to a market, a round or a room would have attributed nobody. The middleware
(`proxy.ts`) captures it on any page now, strips it from the address so the
visitor cannot pass somebody else's code onward, and **never overwrites a code
already held** — the referral belongs to whoever brought them first. API routes
are skipped: the matcher covers `/api`, and answering a fetch with a redirect
would break the call rather than credit anyone.

## The shape lives in lib

`lib/referral-code.ts` holds both patterns, `isReferralCode` and `withReferral`.
It is in `lib/` and not in `features/referrals` because the casino needs it too
and a feature may not import another feature. `REF_CODE_PATTERN` mirrors kash's
exactly, and a test asserts the source string so a drift in the engine is caught
here rather than in production.

## A link without a name

`useReferralCode` (in `hooks/`, for the same layering reason) returns the
username when there is one and the given code otherwise. Reading
`/referrals/me` is also what _mints_ the code, so a share surface asking for one
brings it into being.

It shares one query key and one fetcher with the referral page's own hook
(`lib/referral-me.ts`). Two queries on one key with two fetchers is a race over
which fills the cache; there is one of each.

The referral page no longer puts the claim form in front of a working link. A
wallet with a code gets its link immediately, and the username is offered under
it as an upgrade to a nicer one.

## Wired in, everywhere a link leaves the app

`useShareLink()` is the one call a share surface makes: it reads the code and
returns the url with it on. Wired into all of them:

| Surface            | What is shared                         |
| ------------------ | -------------------------------------- |
| Last Man           | the round's link, and the starter's QR |
| Chess              | the invite that fills a seat           |
| Chess arenas       | the arena's own link                   |
| Swiss tournaments  | the tournament page                    |
| Checkers           | the match invite                       |
| Prediction markets | **new** — see below                    |

**Prediction markets had no way to share at all.** A link to one only ever came
off the address bar, which carries nothing. `ShareLinkButton` is a reusable
control that shares the page it sits on — native sheet where there is one, the
clipboard everywhere else — and it is now on both event detail views. It reads
the address at click time, so it is right on a route that changed under it, and
it strips the sharer's own query: a share is a link to the thing, not to
whatever state their session left in the bar.

`withReferral` returns the url untouched when there is nothing to add, so no
call site branches and re-sharing somebody else's link never takes their
referral off them.

## A username is free; an Ark ID is not

The hint under a working link opens the **username form in place**. It briefly
linked to `/ark-id`, which is the paid `.ark` name — a different thing
entirely, and the wrong door: it would have sent someone to buy what they can
have for nothing. A test asserts it is not a link to that page.

## The flow, end to end

1. Wallet A opens the app; `/referrals/me` mints and returns its code.
2. A shares a round; the link carries `?ref=<code>`.
3. B opens it; the middleware stores the code and cleans the address.
4. B signs up; the claim hook posts the code.
5. kash branches on the first character and attributes B to A.

Every hop has a test. The one that could have killed it quietly is hop 4: kash's
`claimReferralBodySchema` is length-only by design, and if it ever validated the
username shape every generated code would be refused with a 400 before `claim`
ran. There is now a test in kash asserting exactly that.

## Verification

`./scripts/preflight.sh` clean: 730 test files, 7,386 tests, 0 lint errors (the
standing 145-warning baseline), production build compiled, first-load budgets
under.

**Still not shared with a code:** the Hyperliquid PnL card, which shares an
image file and no link at all. Adding a url to that `navigator.share` call can
make `canShare({files})` refuse on some platforms, so a working image share was
not risked for it.

Not covered: a real end-to-end claim against the live engine, which needs two
wallets and a deposit. Worth walking once on the preview — share a round from
one account, open it in another, sign up, and check the referral lands.
