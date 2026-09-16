# ADR-2026-09-08: Making the app stop asking the same questions over and over (Plain English Guide / ADR for Dummies)

## Status

Proposed, 2026-09-08. Waiting for a human maintainer to read and approve.

Nothing gets built until that happens. The technical version of this document is
`docs/adr/ADR-2026-09-08-frontend-caching-and-request-reduction.md`.

## What Is This Document?

The technical ADR next door is written for the engineers who will make the change. This one explains
the same decision to anyone else: what is wrong, what we propose to do, and what could go wrong.

A few words used throughout, defined once:

- **Request.** One question the app asks a server, like "what is this user's balance?" Every request
  costs time, data, and money.
- **Cache.** A short-term memory of an answer. If the app remembers that the balance was $412 five
  seconds ago, it can show that instead of asking again.
- **Reload.** Pressing refresh in the browser.
- **Idle.** The app is open on screen but the user is not doing anything.
- **Poll.** The app asking the same question on a repeating timer, for example every 20 seconds.

## The Problem

The report was: too many requests, both when reloading and when sitting still.

We measured it rather than guessing. Ten separate reviews ran across different parts of the app, and
two of them arrived at the idle number independently using different methods and got the same answer.

Here is what is actually happening on the main portfolio screen:

| Situation                   | Requests                                  |
| --------------------------- | ----------------------------------------- |
| Open the app fresh          | 18                                        |
| Reload the page             | 11 to 12                                  |
| Sit still and touch nothing | 9.3 every minute, which is 558 every hour |

### The surprising part

The app **does** already have a memory. It saves 16 kinds of information in the browser and restores
them on reload. That part works.

But it turns out this memory was solving the wrong half of the problem. When the app reloads, it
restores the saved answer, shows it on screen immediately, **and then asks the question again anyway**
in the background.

So the user stops seeing a loading spinner, which is good and was the intended goal. But the number of
requests stays exactly the same, and requests are what was being measured. The memory removes the
waiting, not the asking.

A second issue makes it worse. Six of the things at the very top of the screen were never added to the
saved list at all: the Kash card, the notification bell, part of the balance total, and the token
list. Those start from nothing on every single reload. That is why a reload _feels_ like nothing is
saved, even though nine other things restored instantly.

### Where the idle requests go

Half of the constant background chatter is spent on two things nobody opened the portfolio to look at.
One is a secondary balance figure that refreshes three times faster than the main balance it is added
into. The other is a rotating list of trending coins.

The rotating list is the interesting case, because **the app already has the code to switch it off when
nobody is looking at it.** Two earlier pieces of work built exactly that mechanism, and it was built
correctly.

Then a recent change moved every service onto its own page. That change was fine in itself, but it
disconnected the "is anyone looking at this?" mechanism from the things it was watching. The mechanism
is still there. It is just no longer plugged into anything, so it always answers "yes, someone is
looking", and everything keeps refreshing.

**This is good news.** The hard part is already written. We mostly need to plug it back in.

### Two things we found that are not about speed

While reviewing the caches we found problems that matter more than speed, and they should be said
plainly.

**One.** Ten of the app's server routes return private financial information (balances, positions,
orders in progress) without telling anyone whether that information is allowed to be stored. There is
no evidence this has caused a real problem, and the routes that _do_ have instructions all have
correct ones. But "no instruction" is not the same as "do not store this", and private money data
should never rely on a default. The fix is one line per route.

**Two.** The app can generate a permanent deposit address, meaning an address a user sends money to.
The note in the code says clearly that such an address is permanent and can never be pointed
somewhere else. But the app's memory of that address is filed under a label that does not include the
destination it was created for. Nobody has been able to make it go wrong in practice, and there is a
safety check that prevents the most likely path. Even so, a permanent money-receiving address filed
under an incomplete label is not something to leave alone once you have seen it.

### One more thing, unrelated to caching

There is a single image file in the app that is **11 megabytes** and is used to draw a card smaller
than a business card. It is a design export that accidentally has six full-size photographs buried
inside it. Two more near-identical 11 MB copies are sitting in the project unused.

No caching change can help this. The file simply needs to be exported again at a sensible size. It is
the largest single problem we found and also the easiest to fix.

## What We Do

Eight pieces of work, which can be approved together or one at a time. They are ordered so the most
visible improvements come first.

| #   | What                                                                                                          | Why it matters                  |
| --- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | Fix the app's memory so saved answers survive, and stop re-asking questions whose answers cannot have changed | Fewer requests on reload        |
| 2   | Plug the "is anyone looking at this?" mechanism back in                                                       | Fewer requests while idle       |
| 3   | Where the app has a live connection already feeding it updates, stop _also_ asking on a timer                 | Removes duplicated work         |
| 4   | Tell every server route explicitly whether its answer may be stored                                           | Protects private financial data |
| 5   | Fix the filing labels that are missing part of their information                                              | Protects the deposit address    |
| 6   | Delete unused images, re-export the 11 MB one, and set up proper image handling                               | Much less data downloaded       |
| 7   | Give images and files sensible storage instructions                                                           | Fewer round trips               |
| 8   | Stop loading code and fonts on pages that do not use them                                                     | Faster first load               |

### What we are deliberately **not** doing

This matters as much as the list above.

- **We are not touching the six "is my money there yet?" checks.** When a user has started a deposit,
  a withdrawal or a payout, the app checks repeatedly until it completes. Slowing those down would
  slow down someone's money. In one case the check itself is what pushes the payment forward. These
  stay exactly as they are.
- **We are not caching balances or prices harder.** Those must stay fresh.
- **We are not adding an offline mode.** The app's own notes explain why: a system like that on a live
  trading screen can show stale prices, and it is very hard to correct once a user has a stale copy.
- **We are not marking images as "never check again".** It sounds appealing and it is a trap. That
  instruction cannot be taken back. If a wrong logo went out, there would be no way to replace it for
  users who already had it, because our image files do not have version numbers in their names. Today
  the browser does check, and that check is cheap.

## What Changes For Users

- Reloading should go from about a dozen requests down to roughly eight, and feel quicker.
- Leaving the app open should cost roughly half the background traffic it does now.
- Pages should load faster, especially the portfolio screen, which is currently the heaviest in the
  app.
- Much less mobile data used, mostly from the image work.
- No visible change to how anything works. Nothing moves, nothing looks different.

The one honest trade: a section the user has scrolled away from may hold information that is one
refresh cycle older than it is today. When they scroll back, it updates. Balances and prices are
excluded from this.

## What To Watch

**Before we build anything**, one measurement has to be taken against a real deployed version of the
site. Our review could read the code but could not confirm how our hosting provider actually delivers
files to a browser. That single answer decides how much of item 7 is worth doing at all. We would
rather measure it than assume it.

**While building**, per the project's own rules, every bug fix starts with a test that fails first,
proving the bug is real, before anything is changed.

**After building**, we check:

- The three numbers from this document, measured again in a real browser: 18, 11-12, and 9.3. If they
  have not moved, the work did not do what it claimed.
- That private financial information is confirmed private, by requesting it as two different users and
  checking the response each time.
- That the money flows still work, by hand, in a preview version: a deposit, a withdrawal, a Kash
  convert, and a trade. Reading the code is not enough for a change like this.
- A new automatic test that fails if someone accidentally disconnects the "is anyone looking?"
  mechanism again. The recent change that caused this would have been caught by it.

**The main risk** is caching something private by mistake. We reduce it by defaulting to "do not store
this" for anything that involves a logged-in user, and by having a second person check that
classification before it merges.

## One Open Question For The Maintainer

Not a caching matter, but we found it and it should not go unmentioned.

In a video-enabled chess match, the player's **camera and microphone appear to switch on and start
broadcasting as soon as the page loads**, without the player clicking anything. There is a "Join
video" button, but on the normal path the user never sees it. Spectators are correctly unaffected.

This may well be intended. But it is a question about consent rather than performance, so we are not
changing it either way. It needs a human decision.
