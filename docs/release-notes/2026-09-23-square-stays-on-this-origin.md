---
date: 2026-09-23
feature: The Square stays on tsionark.com, and a gist room card shows who is in it
scope: fix
scenario-impact: none
---

# Every way into the Square keeps the reader on this origin

Market Square is served at `/square` as a Next.js multi-zone: `next.config.ts`
rewrites `/square` and `/square/*` to its deployment. Every link into it was
still built as an absolute `https://square.tsionark.com/...`, opened in a new
tab. So a reader tapping "Join gistroom" left tsionark.com for a sub-domain, in a
second tab, to read something this app already serves.

`marketSquareHref()` now returns the zone path. It is the one place every
square link is built, so the whole set moved at once: posts, profiles, houses,
rooms, the feed, the notifications bell, the composer's "view your post", the
Square page's own "view more" pills, the portfolio banner and the dashboard's
rooms card.

`MARKET_SQUARE_URL` still decides whether there is a square and still backs the
rewrite. It is simply no longer the base of the link.

## Same tab, not a new one

Thirty-odd anchors carried `target="_blank"`, which made sense when the
destination was another deployment and does not now. They open in the same tab
and hand the reader to the Square's own code with their session.

They stay plain anchors rather than becoming `next/link`: the zone is another
app, and this router has no route under `/square` to transition to.

Three links keep their new tab, because they really do leave the platform: a
link somebody wrote inside a post, and the block-explorer links on the Kash
receipts.

`SquareOutboundLink` was the one trap. Its name says outbound; it points into
the Square, so it moved with the rest.

## A gist room opens on the gist room screen

The Square draws a gist room and a broadcast with different pages —
`app/gist-rooms/[id]` and `app/live/[id]` — and both take a stream id. Every
room was sent to `live/`, so an audio room opened on the broadcast screen.

`squareRoomPath(id, category)` picks between them. Upstream marks an audio room
`category: "house"`. Until the category is known the broadcast route is the
fallback: it is the screen every stream had before gist rooms existed, and it
renders rather than 404ing.

## The card shows who is in the room

The rooms card drew the host's avatar and nothing else, and the scatter filled
its slots by repeating that one face — a card about a conversation showing one
person six times.

The feed names a live room but says neither who is in it nor what kind of room
it is. Both come from the room's own row, `GET /streams/{id}`, one read per
room, capped at the six the card rotates through. Each is cached and polled on
its own key, so a room that stays live is not re-read and a failing one does
not disturb the others. A room renders before its detail lands and corrects
itself when it arrives, rather than flickering in and out.

Upstream sends at most three people, host first then the most recent joiners,
and only for a live room whose category is `house` — a broadcast never carries
it, because that field would be publishing who is _watching_, and watching is
not joining. Remaining scatter slots keep the committed artwork rather than
repeating a face.

**This list is not a head count.** Presence is keyed by view session upstream,
so a signed-out listener has nobody behind theirs: it is routinely shorter than
the room's viewer count and can be empty while a room is busy.

## The proxy

`GET /streams` and `GET /streams/{id}` are now public reads in the proxy's
allowlist. They answer anybody upstream — a private room is 404ed there for a
non-member, and the list filters by membership — and gating them here turned
the dashboard's rooms card into a 401 for a signed-out visitor. The session is
still forwarded when there is one, so a member keeps seeing their own rooms.

## Not verified live

No room was live while this was built, so the participant faces were proved
against the documented shape and unit tests rather than a running room. The
routing, the origin and the same-tab behaviour were all verified directly.
