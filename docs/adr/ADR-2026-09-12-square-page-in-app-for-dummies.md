# A Market Square page inside the app (plain English)

**Date:** 2026-09-12 · **Status:** approved by the maintainer, built

## What is the problem?

Today the "Market Square" button in the sidebar throws people out of the app
into another website. The team asked for the opposite: people should be able
to see what is happening on the Square while they stay here, and only go over
to the Square when they want to do something more.

There is a second problem. The Square just rebuilt its front page. It now
shows, in this order: rooms that are live right now, people to make friends
with, rooms coming up soon, popular houses, and then posts. The little Square
box on our dashboard still shows the old front page, which was just posts with
tabs. So even the part of the Square we do show here is out of date.

## What are we going to do?

1. **Add a Square page to the app**, at `/square`. It looks exactly like the
   Square's own front page — same sections, same cards, same styling — in the
   same order: live rooms, people, coming-soon rooms, houses, posts. A section
   that has nothing to show simply does not appear.
2. **Keep what already works.** Liking, reposting, commenting and following
   from a post keep working here, as they do on the dashboard today.
3. **Send people to the Square for the rest.** Joining a live room, winking at
   someone, joining a house, setting a reminder, or opening a full thread opens
   the Square in a new tab, on exactly that room, person, house or post.
4. **Change the sidebar button** so it opens the new page instead of leaving
   the app. An "Open the Square" link sits at the top of the page for anyone
   who wants the whole thing.
5. **Point the home page's Square cards at the new page** where they only
   open the Square today. "Join" on a live room and "Start" on Go live still go
   to the Square, because those are things you do there.
6. **Leave the portfolio alone.** The Square feed stays off the portfolio, as
   the maintainers asked; the new page is where it lives instead.

## What does this cost?

- One new page. No new background polling: the page asks for its five lists
  when opened and keeps them for a minute.
- A small change to the server relay so the app can read the list of houses;
  it already reads everything else.
- Two front pages that could drift apart over time. We limit that by reading
  exactly what the Square reads and keeping our cards simple.

## What we decided not to do

- Not an embedded copy of the Square website inside ours: two logins, two
  menus, and it can simply go blank.
- Not a bigger dashboard section: the dashboard is for trading, and a full
  social feed there would push the markets off the screen.

## How will we know it works?

Tests are written first: the sidebar opens `/square` in the same tab; the page
shows the five sections in the right order and hides empty ones; every
"do more" button carries the right Square link; the relay allows the new read
and refuses anything that writes.
