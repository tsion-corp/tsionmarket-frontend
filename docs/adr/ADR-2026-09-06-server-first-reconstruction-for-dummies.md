# ADR-2026-09-06: Server-first reconstruction of the signed-in app (Plain English Guide / ADR for Dummies)

## Status

Accepted — 2026-09-06

---

## What Is This Document?

The plain-English companion to
[`ADR-2026-09-06-server-first-reconstruction.md`](ADR-2026-09-06-server-first-reconstruction.md).
It explains what changed on branch `v1.4`, why, and what it means for people
who use or review the app.

---

## The Problem

The app felt slow and jumpy. When you opened it, you saw a black loading screen,
then the frame, then empty grey boxes, then numbers that shoved everything
down the page as they arrived. Moving between sections rebuilt the whole frame
each time. Behind the scenes the dashboard was asking the servers thirty times
a minute for things, including some servers that were switched off and could
never answer. And two things were unsafe: a signed-out browser still kept your
balances stored on the device, and one server check could be tricked into
treating someone else's identity as yours.

Someone handed us a plan to fix this. We checked it line by line against the
real code and it described a different app, so we did not follow it. We audited
the real app instead.

---

## What We Did

1. **The frame is built once.** The sidebar, top bar and tab bar are mounted
   once and stay put while you move between the dashboard, spot, perps and the
   rest. Only the page inside changes.

2. **The server checks who you are before it sends the page.** Your sign-in
   cookie is verified on the server, so the page can be drawn immediately
   instead of waiting for the wallet software in the browser to start. The
   browser still confirms it afterwards; if it disagrees, you are sent to sign
   in.

3. **Your balance is in the page when it arrives.** The server fetches it while
   it is writing the HTML and hands it to the browser already filled in. No
   grey box, no jump.

4. **The dashboard's public numbers come as one package.** Prices, the perps
   majors, trending memecoins, real assets and the live-game chips are put
   together once on the server every twenty seconds and shared by everyone.
   Each browser asks for that one package every thirty seconds instead of
   asking thirteen different services. If a service is down, its section says
   so, and no browser bothers it.

5. **Pages that never sign in stopped downloading the wallet.** The landing
   page and the privacy policy went from over a megabyte of JavaScript to
   under a quarter of that.

6. **The two safety holes are closed.** Signing out now wipes the stored
   balances, and the server no longer trusts an identity token that does not
   match the session that sent it.

7. **A dead game server cannot take the app down.** Before, three failures from
   the chess server made the whole app say "Can't reach the server" and stop
   loading balances. Now each service has its own breaker, and the game
   servers never raise that banner.

8. **Placeholders are the same size as what replaces them**, so the page does
   not jump when numbers arrive.

9. **A size budget runs in CI.** If a change makes a page's JavaScript bigger
   than its budget, the build fails, so this cannot quietly regress.

---

## What It Means For You

- The dashboard appears at once, with the frame and your balance, instead of
  after a loading screen.
- Moving between sections is instant; the frame does not flicker.
- Far fewer network requests, so less battery and data on phones, and less
  load on the servers.
- Signing out on a shared device really does sign you out.

## What Did Not Change

- The addresses of all pages are the same.
- The full spot, perps, memecoin and real-asset pages still fetch their own
  live data; only the dashboard's summaries come from the shared package.
- Casino and earn still build their own frame for now.

## Things To Know

- Open pull requests that edit the old dashboard or perps page files need to
  be rebased onto this branch, because those files moved.
- The live-round chip from the blockchain was not seen with a real game
  running during the work; if it fails it shows nothing and writes the reason
  to the server log.
