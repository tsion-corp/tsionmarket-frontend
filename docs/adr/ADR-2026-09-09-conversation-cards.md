# ADR-2026-09-09: Four more cards on the dashboard's "Join the Conversation" band

## Status

Proposed, 2026-09-09. Awaiting the maintainer's authorization on `ui/2.0`.

## Context

The band under "Join the Conversation" on the dashboard is a looping carousel
that shows two cards and a sliver of the next. Since perps came off the
branch it holds one card, the square's chess room, which leaves the carousel
with nothing to loop through. The maintainer wants four more: Last Man
Standing, Checkers, ArkBall, and the conversations running on Market Square,
each unique but of one family with the chess card.

What is already on hand:

- The chess card's chrome: a 203 px article with an 18 px radius, a two-stop
  gradient, a full-card art layer, a kicker with a small icon, a two-line
  headline, and a column of two pills (solid, outline) that grow with their
  labels. `RoomPill` is that pill.
- Live data the dashboard already fetches once for every visitor: the
  Last Man rounds that can still be joined, with pot and end time, and the
  ids of live chess and checkers matches, all in `useDashboardFeed()`.
- The square's live rooms, through the proxied `GET /streams?status=live`,
  and `squareLinks` in `lib/square/links.ts` for the way into a room.
- ArkBall's hero artwork under `public/casino/arkball/hero.png`. The other
  games have no committed artwork; their registry images are remote.

Constraints: `features/discovery` may not import `features/casino` or
`features/square`, so the cards take routes as strings and data from `hooks/`
and `lib/` only. Copy lands in all five catalogs. Market Square opens in a
new tab, as the rail does.

## Decision

1. **One frame, five faces.** The chess card's chrome is lifted into a
   `ConversationCard` frame (gradient, dust layer, kicker, headline, pill
   column) in `features/discovery/components/conversation-card.tsx`.
   The chess card keeps its scatter of member faces and its art layer and
   renders through the frame unchanged in appearance. `RoomPill` moves with
   it.
2. **Four new cards, each a different hue and motif on that frame**, in
   `features/discovery/components/conversation-cards.tsx`:

   | card              | gradient                               | motif                                                                                         | kicker                           | headline                                                             | solid pill                                                                   | outline pill                        |
   | ----------------- | -------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
   | Last Man Standing | ink to ember (`#12030a` to `#c2263a`)  | a countdown ring drawn in SVG, its hand at the live round's remaining share                   | "Last Man Standing", hourglass   | live: "Pot $42, 58 s left"; idle: "Outlast everyone, take the pot"   | "Join the round" to the live round's page, else "Start a round" to the lobby | "How it works" to the lobby         |
   | Checkers          | ink to forest (`#03120c` to `#1f8a5b`) | a checkerboard corner in CSS gradients, two discs                                             | "Checkers", disc                 | live: "3 matches live now"; idle: "Fast staked matches"              | "Watch live" / "Play Checkers" to `/casino/checkers`                         | "Learn" to `/casino/checkers/learn` |
   | ArkBall           | ink to amber (`#1a0f00` to `#d99a1e`)  | the committed hero art, right-aligned, faded into the gradient                                | "ArkBall", ball                  | "Pick 5 white balls and 1 ArkBall"                                   | "Play ArkBall" to `/casino/arkball`                                          | "All games" to `/casino`            |
   | Market Square     | ink to teal (`#02121a` to `#1d9aa8`)   | the same face scatter as the chess card, fed by the live room's faces when the square answers | the live room's name, house icon | live: the room's title; idle: "See what the square is talking about" | live: "Join live" to the room; idle: "Open Market Square"                    | "Market Square", to the square      |

   Every link into Market Square opens in a new tab with `noopener`.

3. **Data.** `useDashboardFeed()` gives the Last Man round and the match
   counts at no extra request. A new `features/discovery/hooks/use-live-conversations.ts`
   reads live square rooms through `lib/api/market-square`, stale for a
   minute, polling only while the dashboard is visible, and yields nothing
   when the square is hidden or unreachable, so the card shows its idle face
   rather than an error.
4. **The row.** `ConversationRow` renders the five cards in the order chess,
   Last Man, Market Square, Checkers, ArkBall, so the two people-cards are
   never side by side. The heading keeps "Join the Conversation" and links
   to Market Square (new tab), since that is where conversations live; the
   maintainer may prefer `/casino`.
5. **Copy** for the four cards in `discovery.*`, added to `en`, `de`, `es`,
   `fr`, `pt`.

```
ConversationRow
  Carousel (2-up, loops)
    ChessShelf            ConversationCard + face scatter + chess art
    LastManCard           ConversationCard + countdown ring   ← feed.live.rounds
    SquareCard            ConversationCard + face scatter     ← use-live-conversations
    CheckersCard          ConversationCard + board motif      ← feed.live.checkers
    ArkBallCard           ConversationCard + hero art
```

## Consequences

- The band loops again with five cards; on a phone it is one-up with a peek.
- No new binary assets: motifs are SVG and CSS, ArkBall reuses its hero.
- One new request per dashboard visit for live square rooms, cached a
  minute; the game cards cost nothing new.
- Verification: a jsdom test per card (copy, links, live and idle faces),
  a row test for slide order and count, the five gates, and the cards on
  the 3001 dev server at 768, 1280 and 1520 px.
