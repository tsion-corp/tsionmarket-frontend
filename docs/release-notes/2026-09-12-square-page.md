---
date: 2026-09-12
feature: Market Square is a page in the app, drawn as the Square draws its Home
scope: square, navigation, discovery
scenario-impact: updated
---

# Market Square is a page in the app

## What changed

- **A Market Square page at `/square`.** The sidebar entry between Prediction
  and Arkade opens it in the same tab, like every other rail row, instead of
  leaving for the Square's own deployment. It lights up on its route the way
  the other rows do on theirs.
- **The page is the Square's own Home, carried over as the Square draws it.**
  The maintainer asked (2026-09-12) that it be the same UI, not a version of
  it in this app's language. So the page is Home's column in Home's order and
  on Home's own cards: the search row and the gistroom banner, then "Top
  GistRooms", "Make some friends", "Coming Soon", "Popular Houses" and "Post
  For You", each with its two-tone Manrope heading and its "View more" pill.
  The cards are the Square's components brought across with their numbers,
  their glass, their purple ramp, their glyphs and their exports: the
  338-by-120 gist-room invite, the fanned people deck with its glass arrows,
  its five pills and its swipe (right goes back, left goes on), the pal card
  with its crown, follow badge, pass and wink discs, the 479-by-147
  upcoming-room card in container units, the 356-by-120 house card, and the
  Square's post card in its compact 467-by-367 form: the identity row with
  the seal, the org lockup and the role chip, tip, wink and follow, the rule,
  the media rail with its pager dots, the two-line caption, the tallies pill
  and share, Arkmark and more. Tapping the comment tally opens the Square's
  comments sheet: the thread with each author's marks, a heart on every
  comment, replies nested under their parent behind "View N replies", and a
  reply field that names who it answers. The column is Home's own 600px, so
  the deck and the rails scale as the file has them. A section with nothing
  to show does not appear.
- **What already works here keeps working.** On the post card, like, repost,
  reply and follow act on the same hooks the dashboard's card uses, and a
  `$TICKER` the app trades still opens the buy sheet. Following from a
  person's badge stays in the app; pass steps the deck on, as on the Square.
- **Everything else is a trip to the Square**, in a new tab, on exactly the
  thing the card shows: "Join Gistroom" and "Remind me" open the room, the
  wink and the photo open the person's profile, "Join House" opens the house,
  the post's arrow opens the thread, "Host Room" opens the rooms page with the
  create sheet up, a search opens the Square's Explore with the words typed,
  and each "View more" opens the Square's matching page. "Open the Square"
  sits where Home keeps its Explore settings, for anyone who wants all of it.
- **The home page's band points at the page** where it only opened the
  Square before: "Open the feed" and the idle "Open Square" go to `/square`
  in the app. "Join live" on a live room and "Start a room" still leave for
  the Square, because joining and broadcasting are the Square's.
- **The portfolio is untouched.** The square's sections there stay off
  (`IN_APP_SQUARE_SHOWN` is still false), and the page does not read that
  switch. It follows the rail entry's switch alone: a hidden square has no
  page.

## What is not carried over, and why

- Home's Explore-settings pill acts on the Square's session (location,
  filters), so its seat carries "Open the Square" instead. The search itself
  answers in place, as Home's does: the Square's one search route is relayed
  (public), and the results list people (follow acts here, the wink and the
  identity open the profile in the Square), gist rooms, posts and ARK Store
  hits, each opening in the Square, plus a way into a room when the words
  are a room code.
- The gist-room card's hover preview listens to the room's audio through the
  Square's LiveKit session; this app has no room session, so the card is the
  file's resting state.
- Home's filter pill on the deck acts on the Square's directory facets;
  the Square's post card's own sheets (edit, delete, report, quote, the
  image viewer), its mention picker and its rich text (quotes, lists, bold)
  are not here: tip, wink, share, Arkmark, more and a media tile open the
  post or the author in the Square, and the caption renders mentions, tags,
  links and cashtags. Deleting a comment stays in the Square. The
  "Suggested pals" foot and the ecosystem partners rail are the Square's own.

## The relay

`GET conversations/discover`, the house directory, is now relayed, as a public
read like profiles and the feed, and its payload is judged at the boundary.
For the comments sheet, `GET comments/{id}/replies` is relayed as a public
read and `POST|DELETE comments/{id}/like` with the session; a reply carries
its `parentId`. For the search row, `GET search` is relayed as a public
read. Nothing that joins a house, winks, hosts, sets a reminder or
deletes a comment is relayed; those stay in the Square, which is what "do
more" means.

## Cost

Six reads on first visit (live rooms, people, scheduled rooms, houses, the
feed, the topic vocabulary), each kept for a minute or longer, none on an
interval. The dashboard's own reads are unchanged. The page reports as
`market_square` in analytics. The root layout now loads Manrope (600, 700)
and Roboto (400, 600) for this page's headings and people cards; eight of the
Square's exports sit under `public/square-home/`.

## Tests

- `lib/sections.test.ts`: `square` is a section whose route is `/square`,
  and it stays out of the reorderable rail list.
- `lib/square/links.test.ts`: `house(id)`, `pals()`, `gistRooms()`,
  `houses()`, `feed()`, `hostRoom()`, `roomCode(code)` and `product(slug)`
  are the Square's own routes, escaped.
- `lib/square/room-code.test.ts` (new): a room code is recognised with or
  without its dashes and printed in the Square's grouping.
- `lib/square/starts-in.test.ts` (new): the "starts in" chip counts the
  largest whole unit and says now for a room whose time has come.
- `lib/api/market-square-proxy-paths.test.ts`: the house directory is a
  public GET; nothing under `conversations/` is written to; a thread's
  replies and a like on a comment are relayed and nothing else under
  `comments/`.
- `lib/square/comment-thread.test.ts` (new): the thread's shape, the
  expander's count and the optimistic heart.
- `lib/api/schemas/market-square.test.ts`: the directory payload is modelled,
  and a house without an id is refused.
- `lib/api/market-square.test.ts`: the live, scheduled and house reads ask
  for what Home asks for and treat an absent list as nothing to show; a reply
  carries its parent, a thread's replies page, and a comment like renders the
  server's count.
- `lib/square/deck.test.ts` and `post-media.test.ts` (new): the deck's fan
  fits its column and a drag only commits sideways and far; a post's media
  list and the rail's dots.
- `features/square/components/square-home.test.tsx` (new): the five sections
  in Home's order and words, an empty one omitted, a topic labelled from the
  vocabulary, every "do more" control on its Square deep link in a new tab,
  the banner and the search row, the reader left out of the deck, follow kept
  in the app and never offered on the reader's own post, the deck's pass and
  arrows stepping through people, the comments sheet opening from the tally
  with replies expanded, liked and answered, the search answering in place
  with every row on its Square link and the page coming back when cleared,
  a room code offered as a way in, and nothing rendered while the square is
  hidden.
- `components/layout/sidebar.test.tsx`: the entry links to `/square` in the
  same tab and lights up on it.
- `features/discovery/components/conversation-cards.test.tsx` and
  `conversation-row.test.tsx`: the feed pill and the idle rooms card open
  `/square`; Join and Start stay outbound.
- `__tests__/mixpanel.test.ts`: the page reports as `market_square`.
