# ADR-2026-09-12: A Market Square page inside the app, fed by the Square's Home

## Status

Accepted — 2026-09-12. The maintainer approved the page in conversation and
steered one point of the decision while it was built: the page is the Square's
Home **as drawn** — its sections, headings, pills, cards, glyphs and exports —
not this app's own cards. Section 1 below records that; the data layer is
this app's, everything visible is the Square's.

## Context

Market Square is a sibling deployment. On `staging` today (tip 779429e1,
PR #461) this app reaches it in three ways:

1. The sidebar entry (`components/layout/sidebar.tsx`), seated between
   Prediction and Arkade, is an outbound link that opens the Square in a new
   tab.
2. The home page's "Join the Conversation" band (`features/discovery/
components/conversation-row.tsx`, PR #461) deals four cards — the chess
   room, the live Square room, Go live, The feed — and every Square card links
   out to the Square's own deployment.
3. The older in-app Square sections (the promos interleaved between the
   briefs, `SquareSection` at the foot, the compose button) are wired but
   **switched off** by `IN_APP_SQUARE_SHOWN = false` in `lib/market-square.ts`,
   at the maintainers' request: the portfolio is where someone reads their
   money, and a social feed under it is not what it is for.
4. A server-side proxy (`app/api/market-square/[...path]`) relays an
   allowlisted set of Square paths with the caller's own verified session
   (`lib/api/market-square-proxy-paths.ts`).

Two things changed:

- The Square's Home was rebuilt on its `staging` (market-square-frontend PR
  #110). Home is now a column of sections in a fixed order: the search row, a
  banner, **live gist rooms**, the **"Make some friends" deck** of people,
  **coming-soon rooms**, **popular houses**, then the **posts** and suggested
  pals. The dashboard section here still shows the old shape: lanes and topic
  tabs over a post list. It no longer matches what the Square shows on its
  own front page.
- The maintainers asked (2026-09-12) that the Square be **a page in this app**
  rather than a link out: readers should see what the Square's Home feed shows
  without leaving, and be sent to the Square only when they want to do more.

Every piece of data the Square's Home reads is already served by the same API
this app proxies (`/v1/market-square/*` on the gateway):

| Home section      | Square call                    | Proxy today |
| ----------------- | ------------------------------ | ----------- |
| Live gist rooms   | `GET streams?status=live`      | allowed     |
| People deck       | `GET profiles`                 | allowed     |
| Coming-soon rooms | `GET streams?status=scheduled` | allowed     |
| Popular houses    | `GET conversations/discover`   | **not yet** |
| Posts             | `GET feed?lane=for-you`        | allowed     |
| Topic vocabulary  | `GET topics`                   | allowed     |

The reads are cheap and already cached client-side (`useSquareFeed` has a 60 s
`staleTime` and no interval). The upstream feed shape is unchanged; the change
on the Square is what its Home composes, not the routes.

## Decision

### 1. A `/square` route in the app shell

`app/(session)/(app)/square/page.tsx` renders `features/square/components/square-home.tsx`.
It sits in the `(app)` group like `/perps` and `/spot`, so it gets the auth
guard, the chrome, `loading.tsx` and `error.tsx` for free.

`SquareHome` composes the Square's Home order with the Square's own cards,
ported from `market-square-frontend` (the maintainer's instruction on
2026-09-12: "exactly the UI, styling and UX"). The Square's SVG glyphs and
exports are copied under `public/square-home/` and `square-home-icons.tsx`;
Manrope and Roboto are loaded for this route. Only the data layer — the proxy,
the fetchers, the schemas, the engage hooks — is this app's.

```
┌─ /square ────────────────────────────────────────────────────────┐
│ Eyebrow "Market Square"            [Open the Square ↗]  (outbound)│
│                                                                   │
│ Search row + settings seat ("Open the Square" ↗)                  │
│ Banner (Host Room ↗)                                              │
│ Top GistRooms       ← streams?status=live     (gist room card)    │
│ Make some friends   ← profiles                (person card)       │
│ Coming Soon         ← streams?status=scheduled (upcoming card)    │
│ Popular Houses      ← conversations/discover  (house card)   NEW  │
│ Post For You        ← feed?lane=for-you       (SquarePostCard)    │
└───────────────────────────────────────────────────────────────────┘
```

Each section renders nothing when it has nothing, the rule the dashboard
promos already follow. The post list is the existing `SquarePostCard` with the
existing engage hooks (like, repost, comment, follow, `$TICKER` → buy sheet),
so nothing the reader can do today is taken away.

### 2. "Do more" goes to the Square

Every action this app does not back is a deep link into the Square, opened in
a new tab, through `lib/square/links.ts`:

| Card             | In-app                        | Sent to the Square          |
| ---------------- | ----------------------------- | --------------------------- |
| Live room        | title, host, viewer count     | Join → `live/{id}`          |
| Person           | name, handle, follow          | Wink / profile → `u/{name}` |
| Coming-soon room | title, host, time             | Remind me → `live/{id}`     |
| House            | name, members, description    | Join house → `houses/{id}`  |
| Post             | like, repost, comment, follow | Open thread → `p/{id}`      |

`squarePath` gains `house(id)` and `pals()`; nothing else in `links.ts` moves.

### 3. The sidebar entry and the band lead to the page

The sidebar entry keeps its seat between Prediction and Arkade and its mark,
but becomes a `next/link` to `/square` without `target="_blank"`. The outbound
"Open the Square ↗" moves onto the page header. `SectionId` gains `"square"`
with `SECTION_ROUTES.square = "/square"`, so the chrome marks the entry active
on that route the way it does for every other page.

On the "Join the Conversation" band, the two cards that only _open_ the Square
now open the page instead: The feed's action and the live card's idle
"Open the Square" go to `/square` in-app. The two that _do_ something stay
outbound — "Join" on a live room and "Start" on Go live — because joining and
broadcasting are the Square's.

The page gates on `MARKET_SQUARE_HIDDEN` only (URL unset or operator takedown).
It does NOT read `SQUARE_SECTIONS_HIDDEN`: that switch answers for Square
content _on the portfolio_, which stays off; a page of its own is the answer to
the reason it was turned off there.

### 4. Proxy allowlist

`GET conversations/discover` is added to `GET_PATHS` and to the public set
(the Square serves it without a session, as it does `profiles` and `feed`).
No POST or DELETE is added: joining a house, winking and reminders stay in the
Square, which is the point of "do more".

### 5. The portfolio page is left alone

`IN_APP_SQUARE_SHOWN` stays `false`; the promos, `SquareSection` and the
compose button stay off the portfolio. `SquareSection`'s tabbed feed is not
reused on the page either — the page is the Square's Home order, not the old
lane view. A later ADR can delete the dormant dashboard sections once the page
has proven itself.

## Alternatives considered

- **Embed the Square in an iframe.** Rejected: two shells, two sessions, no
  deep links back into this app's buy sheet, and a blank frame when the
  Square's CSP forbids embedding.
- **Keep the outbound link only.** Rejected by the maintainers: it is what
  exists today.
- **Point the existing dashboard section at Home's order.** Rejected: the
  dashboard is the trading front page; a full social column there would push
  the briefs off the fold. A route of its own is what the maintainers asked for.

## Consequences

- One more route in `(app)`; one more nav id. No new provider, no new poll.
- Five reads on first visit (feed, live, scheduled, profiles, discover), each
  cached 60 s, none on an interval. The dashboard's existing reads are
  unchanged.
- The page presents the Square's Home in this codebase, so the two can drift.
  Mitigation: the page reads the same routes the Square reads; the ported
  cards name the Square node they came from so a change there can be carried
  over; anything richer than the routes return is a deep link.
- Not ported, by choice: Home's in-place search (needs reads the relay does
  not carry), the Explore-settings menu, the gist card's audio hover, the
  swipe gesture on the deck, and the Square's full post card (this app's
  `SquarePostCard` stands in). Each is one tap from the Square.
- `lib/api/market-square.ts` gains `fetchLiveStreams`, `fetchScheduledStreams`,
  `fetchDiscoverHouses` and a `MarketSquareHouse` type, parsed the way the
  existing fetchers parse.

## Tests (red first)

- `lib/sections.test.ts`: `"square"` is a section whose route is `/square`, and
  `sectionForPathname("/square")` returns it.
- `lib/api/market-square-proxy-paths.test.ts`: `GET conversations/discover` is
  allowed and public; `POST conversations/discover` is not.
- `features/square/components/square-home.test.tsx`: with mocked queries the
  page renders the five sections in Home's order, omits an empty one, and each
  "do more" control carries the Square deep link.
- `components/layout/sidebar.test.tsx`: the entry links to `/square` in the
  same tab; the outbound link is on the page.
- `features/discovery/components/conversation-cards.test.tsx`: The feed's
  action and the idle live card open `/square` in-app; a live room's Join and
  Go live stay outbound.

## Release note

`docs/release-notes/2026-09-12-square-page.md`, `scenario-impact: updated`.
