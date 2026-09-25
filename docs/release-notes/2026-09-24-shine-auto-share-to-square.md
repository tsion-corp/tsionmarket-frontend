---
date: 2026-09-24
feature: Shine — auto-sharing activity to Market Square
scope: shine
scenario-impact: needs_automation
adr: docs/adr/ADR-2026-09-24-shine-auto-share-to-square.md
---

# Shine

A switch on each service page, **default ON**, that posts a confirmed action to
the user's Market Square by itself — no per-post confirmation.

Seven independent settings: memecoin, spot, RWA, prediction, perps, arcade,
sports. Shine-on-memecoins is a different setting from Shine-on-perps. Not on
deposits or withdrawals.

Posts carry **what was done and, where the outcome is settled, a percentage
return**. No amounts, no position sizes, no balances, ever.

## This reverses a documented position, deliberately

`components/share/share-to-square.tsx` stated the old stance as an invariant:

> It NEVER posts on its own. Everything here is a draft the user edits and
> confirms, because a platform that publishes your activity without asking is a
> different product from one that lets you share it.

That first sentence is superseded. The second half of the same file's reasoning
is **kept**: amounts stay out, and the composer is typed so a dollar figure
cannot reach a post by accident rather than by anyone remembering.

## What a post looks like

Composed in the **author's own locale**, not English.

```
Aped into $PEPE at $0.0000042.
Closed my long on BTC-PERP at $67,410.00. +24.9%.
Won at Chess in the arcade. +180%.
Backed Arsenal in Arsenal vs Chelsea at odds of 2.10.
```

Posts state **what cannot go stale**. The maintainer's original ask was a post
showing whether a coin is pumping or dumping, to drive engagement. A post is
stored once and — after the decision that Shine posts carry no deep link — there
is nothing for any surface to resolve later, so such a post would be wrong within
the hour with no way to correct it. An entry price is true forever, and a reader
can look up the rest.

## The engineering is almost entirely about not posting twice

Seven of the thirteen success signals in this app are **derived state from a poll
or a socket**. They re-fire on refetch, on remount and on tab refocus. With a
confirmation dialog that was harmless. As an automatic public post it is a
duplicate nobody approved and nothing downstream can catch.

Three layers hold the line.

**A durable dedup store** (`lib/shine/posted-store.ts`) keyed by account DID +
service + the service's own natural id, surviving a reload. Of the four dedup
patterns already in the repo only one survived a reload; that was the bar.
Keying by DID is what stops an account switch inheriting someone else's record.

The claim is written **before** the post is attempted, never from a success
callback — a reload between send and callback would otherwise leave the app
believing nothing was posted. The claim is never released, including after a
permanent failure: a refusal and an acceptance we failed to hear are
indistinguishable, and releasing would let a poll re-fire into a second copy of
a post that may already be public.

**Unreadable storage posts nothing.** `features/tour` fails the other way — it
assumes "already seen" so a broken private-mode session is not nagged. Here the
costs are not comparable: guessing "not posted" means a duplicate on every
reload for the whole session, permanently; guessing "posted" means a
private-mode user gets no Shine posts, which is invisible, reversible, and
leaves them the manual share button. There is deliberately no in-memory
fallback, because an in-memory record is exactly what a reload loses.

**A queue** (`lib/shine/queue.ts`): one post in flight, a 1200 ms minimum gap,
four attempts with jittered backoff and a 5s floor on a 429. `createPost` had no
rate limit, retry, queue or dedup, client or proxy, and its only 429 handling
was a sentence written for someone who had just pressed a button.

### The backlog, which nearly shipped

The dedup store stops the _second_ post of something. It does nothing about the
first — and on the day this ships every user has settled state sitting in the app
against an empty store.

The sharpest case: a sportsbook ticket that won weeks ago stays `won` forever,
and that history **refetches on every window focus**. A naive "status is won →
report" would publish ten old wins the first time a user focused the tab. A Shine
post carries no date, so the square stamps them as happening now: a week-old win
reads as one that just landed.

Two rules, applied everywhere a call site reads polled state:

- **Only report a transition this client witnessed.** Chess and draughts post
  only when this client saw the match go from in-progress to terminal; opening a
  settled match cold posts nothing. The sportsbook records its first sight of a
  ticket and reports nothing from it.
- **A freshness bound**, `24h`, on the outcome's own settlement time. A post
  missed because nobody opened the page can be written by hand; a wrong one
  cannot be retracted.

Imperative call sites — memecoin, perps open, prediction, the crash-game
cash-outs — need neither, and each says so in a comment rather than leaving the
next reader to work it out.

The spot Dextopus path is safe for a different reason, now written at both call
sites: `useDepositStatus` keeps the terminal row cached, and the only thing
preventing a backlog is `requestId` starting null on a fresh mount. Lifting it
into a store or a URL param would silently turn that into a backlog publisher
with no test failing.

## The switch lives on the account

Seven booleans in Privy custom metadata, through a new `app/api/preferences`
route modelled on `app/api/consent/route.ts`, merge-spread so an unrelated key
is never clobbered.

Sign-out clears exactly one localStorage key — the React Query snapshot — and no
preference, ever. A device-local Shine would therefore mean: you turn it off for
perps, someone else signs in on your laptop, and their first memecoin trade is
auto-posted with no notice shown, because the "already notified" flag is yours.
That is a privacy incident on a shared device, and account storage removes it.

**Absent means ON**, and a non-boolean value falls back to the default rather
than being coerced — only a value someone actually set can turn Shine off.

**The switch shows ON while the read is in flight**, disabled and reading
"Checking…". The two mistakes are not symmetric: showing ON when the truth is
OFF makes someone more careful than they needed to be; showing OFF when the
truth is ON tells them they are private at the moment the app is about to post.
Separately and non-negotiably, `mayPost()` is false until the account's record is
in hand, so the posting path never runs on the guess. `isOn` and `mayPost` are
two functions precisely so the wrong one is hard to reach for.

## Amounts cannot reach a post

Three independent mechanisms, none of which is "remember not to":

1. **No event type has a field for an amount**, and there is no free text
   anywhere. The numeric inputs are an entry price, a percentage return, odds and
   a leverage multiplier.
2. **Branded types with no constructor for an amount.** A balance or position
   size cannot be expressed.
3. **A runtime guard** scans the composed sentence and _refuses_ to post if a
   money-shaped figure appears outside the price or return it was given.
   Mutation-tested: interpolating `" with $1,200.00"` fails 11 tests.

The guard survives translation. Each value reaches the translator as an opaque
marker and the rendered sentence is cut back apart on those markers, so a
template that writes a currency symbol trips the same refusal in German as in
English. It also refuses a template that drops or repeats a value — next-intl
returns the key path for a missing message, and publishing
`shine.post.spot.buy` to a public feed is exactly what that catches.

## Localisation

28 new post keys plus 11 UI keys, in all five catalogues; parity verified
programmatically at **3,313 identical keys** per file, insertion-only.

Optional clauses are **separate key variants rather than ICU**, so no locale can
end up with a dangling "at" when the app has no price. The voice is preserved
rather than flattened: "aped into" is de `kopfüber … rein`, es `me metí de
cabeza`, fr `j'ai foncé sur`. French avoids gendered participles so a post does
not assume its author's gender.

## The one-time notice

The platform notification service **cannot address one user** — inbox rows are
written only by an admin campaign that fans out to every user in the directory,
and this app cannot reach the admin surface by design. So the notice is a toast
on the first Shine post, with the seen-marker keyed per account so two people on
one device each get their own.

## Where each service posts

| Service              | Confirmation               | Notes                                    |
| -------------------- | -------------------------- | ---------------------------------------- |
| Memecoin             | swap service `CONFIRMED`   | `delivered` and `pending` post nothing   |
| Spot (swap route)    | same engine                | buys and sells                           |
| Spot (Dextopus buy)  | settlement poll            | keyed by request id                      |
| Spot sell (Dextopus) | —                          | **not wired**, see below                 |
| RWA                  | receipt awaited            | not on chains the app cannot confirm     |
| Prediction           | filled fill-and-kill order | the strongest signal that service offers |
| Perps open           | `waitForPositionsChange`   | a resting limit order posts nothing      |
| Perps close          | closed-position record     | carries the realised return              |
| Arcade (6 games)     | result flip                | a loss posts nothing; a draw does        |
| Sportsbook           | accepted, and won          | two moments, two ids                     |

**Perps close was moved** to the closed-position record, which already carried
the close price and realised PnL that the position row had lost by then. Its
return uses the same definition as the existing share card, asserted equal to
six places by a test, so a post and the card for the same trade cannot drift.

**Solana memecoin trades post only with a ticker handed down from the caller.**
The Solana swap payload is a single unsigned transaction with no symbol; nothing
is ever derived from the mint address. No ticker, no post.

## Known gaps and decisions for the maintainer

- **Spot sell via Dextopus is not wired.** There is no confirmation for it — the
  toast says "takes a moment" and means it. A real one needs a new
  `SettlementProduct`, a reconciler that signals "proceeds landed", and a tracker
  mounted in `app/`. A sell posting on submission is what the ADR forbids.
- **The 24-hour freshness bound** is a product decision, not a derivation.
- **Games against the engine post.** A player can generate posts by beating the
  computer. One line to restrict to real opponents.
- **"in the arcade" uses the product's own name** in the four non-English
  locales ("in der Arkade"), where English keeps a generic noun.
- **The sportsbook win uses a suffixed id** (`ticketId:won`) because the store
  keys on id alone and the bare ticket id is already claimed by the placement.
  Removing that suffix would silently stop wins posting — both moments have
  tests.
- **Market Square applies no server-side rate limit.** The queue's 1200 ms gap is
  this app's answer, not a substitute for one.

## Scenario impact

`needs_automation`. Nothing here can be judged from a unit test alone, because
the output is public and permanent. Before this merges, on a preview with a real
account:

1. Turn Shine off for one service, confirm an action there posts nothing, and
   that the other six are unaffected.
2. Sign out, sign in as a second account on the same browser, and confirm the
   first account's settings and its "already notified" state do not carry over.
3. Open a service page holding old settled state — a won sportsbook ticket, a
   finished game — and confirm **nothing is published**.
4. Make two trades inside a minute and confirm two posts, correctly spaced.
5. Switch language and confirm the next post is in the new one.
6. Confirm no post anywhere contains a figure that is not a price, a percentage
   or odds.
