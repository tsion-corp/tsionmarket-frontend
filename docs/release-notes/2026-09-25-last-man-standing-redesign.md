---
date: 2026-09-25
feature: The Last Man wears its new design, on the state machine it already had
scope: feat
scenario-impact: needs_automation
---

# The Last Man, re-skinned

The arcade screen at `/casino/last-standing/[gameId]` now draws the rebranded
design: a breadcrumb and status pill over a two column layout, the stage card
on the left, one rail card on the right, and a tabbed activity panel across the
foot.

Nothing under the presentation moved. The socket, the polling cadence, the
countdown's freeze on a degraded connection, the bigint money maths, the
round-end sequence, the settle and claim paths, the coin flight, the music, the
pop-out prompt and the reveal overlay are the code that was already there.
See `docs/adr/ADR-2026-09-25-last-man-standing-redesign.md`.

## What changed

`features/casino/components/last-standing/last-standing-section.tsx` keeps
every hook, effect and handler it had and hands its numbers to three
presentational components instead of drawing them itself:

- `stage-card.tsx` takes the phase, the formatted clock, the ring's progress,
  the leader strip and the two stat tiles.
- `rail-cards.tsx` takes whichever single card the state allows, under a pager.
- `activity-panel.tsx` takes the feed as formatted rows, with the game rules
  and the past rounds behind its other two tabs.

The design draws four states. The screen has about sixteen, and the eleven the
design never drew are restyled rather than dropped:

| State                   | How it reads now                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Loading                 | A skeleton the stage's own height, not an empty clock                                         |
| Load failed / not found | The same alert, retry and lobby link, under the new header                                    |
| Connection lost         | The clock dims and freezes; a banner above says why                                           |
| Final ten seconds       | The stage's own edge pulses red, through its overlay slot                                     |
| You are leading         | The leader strip is marked as yours, with a "You" chip, plus the tension line under the stage |
| Someone else leading    | The strip names them and the rail badges you as behind                                        |
| Needs funds             | The rail's action button reads "Add money to play" and opens the deposit flow                 |
| Placing a play          | The button spins and locks                                                                    |
| Round ended, unsettled  | The rail's claim card carries the settle action, and says "Not Claimed"                       |
| Round ended, settled    | The claim card leaves, and the stage points at a new game                                     |
| Pending winnings        | The claim card offers "Claim {amount}"                                                        |
| Empty feed              | The table says nobody has played                                                              |

## The rail

The state picks the card and the pager reaches the rest. A card whose action
cannot be taken is never listed, so the pager's length is the state's own
answer to "what can I do here": play while a round runs, settle or claim when
one has ended owing money, and invite at every moment, because the starter
earns from everyone who joins through the link.

## Money

The stake is held in the game asset's base units as a `bigint` and stepped by
the game's own minimum, never below it and never past the wallet balance. The
figure on screen is derived from those units at the display edge, so what is
shown and what is signed cannot drift apart. The free-typed liquidity field it
replaces is gone; a larger stake is now the same control, stepped up.

## Additions to the finished components

Two optional props, each with its own tests, both to keep behaviour that
existed before:

- `RailActionCardProps.ctaRef` gives the section the action button's box, which
  is where the wager's coin flight launches from.
- `ActivityRow.href` links a row's player cell to the play on chain, which the
  old feed did on every row.

`components/ui/qr-code.tsx` gained a `bare` prop so the invite card's own white
tile is not nested inside a second one, and `useVaultFeeds` now reports
`activitiesLoading` so the table can tell a first paint from an empty round.
`share-game.tsx` grew a `useGameShare` hook, which the card, the header button
and the rail's invite card all share instead of holding three copies of the
link, the toasts and the native-sheet fallback.

## Locales

All 56 new keys were already in `en`, `de`, `es`, `fr` and `pt`. No key was
added, renamed or removed by this change. Activity timestamps go through
`next-intl`'s own relative time formatter, so they are localised rather than
English-only.

## Tests

`features/casino/components/last-standing/last-standing-section.test.tsx` is
new: 25 tests with every hook mocked, covering each stage phase, the rail
showing the right card and never an impossible one, the pager reaching the
invite, settle still reachable on a round that ended unsettled, the frozen
clock, the needs-funds CTA, the stepper's floor and ceiling, and the tabs
reaching the rules and the past rounds. Four more were added to the rail and
activity suites for the two new props.

`features/casino/lib/last-standing/rounds.test.ts` is new: 12 tests written
before the fix, covering the opening stake as round 1, a stake adding a round,
an out-of-order feed, the same player staking twice, a win not counting as a
round, an earlier game that reused the id, and the two cases that must answer
"not known" rather than guess.

Four section tests were added with it: the round climbing with each stake, the
count ignoring a reused id, no label at all before the feed lands, and the
table leaving out a finished game's plays. Two feed tests pin the single
request — a game's page reads its own feed and never the cross-game strip, and
the lobby reads the strip and never a game's.

Two existing tests changed, both because the behaviour they pinned was the bug:
one asserted the label read "Rounds #59" on game 59, and one had an activity
fixture with no opening stake in it.

Full suite: 697 files, 7044 tests passing, 3 skipped. Typecheck, lint at zero
warnings, Prettier and the production build are clean.

## The round number, and the feed it is counted from

The stage's round label printed the game's id, so game 253 announced
"Rounds #253" while it was still on its first round. A round is a counter
inside one game: opening it is round 1, and every player who stakes after that
adds one, climbing for as long as the game is alive. The player who staked last
when the clock runs out is the Last Man.

Counting them needed a different feed. `/game/activities` is the cross-game
recent-activity strip and is capped: measured against the service it answered
with 25 rows spanning 12 games, two per game. A game's own page now reads
`/games/:id/activities`, which carries that game's complete history. It is one
request either way, not two: `useVaultFeeds` picks the endpoint by whether it
was given a game, so the lobby keeps the cheap strip. The table of plays was
reading the capped feed as well, and was silently truncated; it is complete now.

That feed needs narrowing before it can be counted. The vault reuses a game id
when the contract is redeployed, so one id's rows can span more than one game:
253 carries a started/won pair from 30 August and another from 25 September.
`features/casino/lib/last-standing/rounds.ts` anchors the run to the LAST
`started` row and ignores everything before it, which the round count and the
table of plays both read.

`currentRoundCount` returns null rather than a number when the feed has not
arrived or carries no opening stake, and the stage draws no round label at all
in that case. The slot keeps its line box so nothing jumps. A number in this
position is read as fact, and "Rounds #1" on a game already on its ninth is
worse than no number.

## The second face

The design sets two families on the same card, and the first pass shipped only
one of them. Mona Sans carries the display and the numbers: the page title, the
countdown digits, the stage heading, the pot and winner-share values, and every
button label. **Quicksand Bold carries the round label, the stage hero
sub-copy, the leader bar, the status pills, the tab strip and every cell of the
activity table.** All of that was rendering in the body face.

Quicksand is loaded in `app/layout.tsx` under `--font-quicksand`, bold alone
because no other weight of it appears in the design, and reached through a
`ws-quick` utility rather than a family class per call site. The table's cells
were also at weight 500 against the design's 700; the weight now comes from the
utility and the overrides are gone.

`features/casino/components/last-standing/quicksand.test.ts` guards the wiring.
A missing font is the one styling fault nothing else catches: jsdom reports no
computed family, the build does not fail, and the screen renders in the body
face exactly as it did before. The test asserts the font is loaded at bold
under that variable, that its class reaches the document, that the utility is
defined against it, that the three components ask for it, and that no element
carrying it also carries a weight class that would win over it.

Three colours and one size were wrong against the design and are corrected: the
active tab and its indicator were `#FFD62F` where the design says `#F7A92F`
(the file uses six distinct golds, which are easy to conflate); the primary
button was 44px tall with a 13px body-face label against the design's 31.798px
and 11px Mona Sans SemiBold; and its inset highlight and drop shadow were both
at twice the drawn offsets.

Two things depart from the design deliberately, and neither is a mistake to fix
silently:

- **The primary button keeps a 44px box below 980px**, and is the design's
  31.798px from there up. 31.798px clears WCAG 2.5.8's 24px minimum, so the
  design is not inaccessible, but it is under the 44px a finger wants and this
  is the button that moves money. The design was drawn at 1339px and says
  nothing about a phone.
- **Its horizontal padding is `px-4`, not the drawn 8.376px.** The button is
  full width, so this changes nothing in the drawn case; it keeps a longer
  German or Portuguese label off the pill's edge.

The status pill label is reproduced at the design's own 8.494px rather than
rounded up. It is very small, but font size is a design call and not a
standards one, so it is drawn as specified and flagged for the designer.

## Proportions

The design draws the stage at 1006px beside a 295px rail. The rail was built as
a fixed 295px column against a fluid stage, so on a monitor wider than the
mockup every extra pixel went to the stage and the rail's cards — invite, stake,
claim — ended up looking shrunken. The pair now holds the drawn ratio and grows
together, with 295px kept as the rail's floor. The pot and winner-share tiles
are larger: 184px wide against 152px, 18px of padding against 15px, and a 40px
value against 36px.

## Second pass, after the maintainer reviewed the page

The first pass was reviewed against the Figma and did not match it. An audit of
every element against the extracted spec found roughly thirty divergences, four
of them serious enough to dominate the screen.

**The Share and Claim buttons were invisible.** A missing space in a template
literal emitted `min-h-[31.798px]ws-chrome-pill` as one unknown token, so the
class carrying the pill's gradient was dropped while `text-ink` survived — a
near-black label on a transparent pill over a dark card. It predates this
branch. The guard against it reads the browser's parsed `classList` rather than
the class string, because a substring match passes while the pill is blank.

**Three of the four cards were the wrong surface.** The rail and activity cards
used the translucent `ws-card` glass with a white hairline at radius 20 where
the design draws solid `#121314` at radius 15, so a near-black stage sat beside
three lighter, rounder cards.

**Every ExtraBold in the app was rendering as Bold.** `app/layout.tsx` declared
Mona Sans as `weight: "500 700"`, and CSS clamps a request to the declared
bounds. The font's own `fvar` table carries one `wght` axis running **200 to
900**, so the declaration was not describing the file but capping it. The
countdown digits and the stage heading are drawn ExtraBold and were where it
showed. The same table says there is no `wdth` axis, so the design's
`"wdth" 100` is a no-op here and should not be added.

**The leader badge used the wrong gold and invented a state.** `#FFD02C` — the
countdown stage's badge — appeared nowhere in the codebase; both live states
drew `#F7A92F`, which the design uses only on the Winning stage. "Leading" was
drawn as a grey outline pill with a white-stroked crown, neither of which
exists in the design.

Also: seven text sites silently fell back to Geist where the spec says Mona
Sans; the tab strip's 3px track was a 1px hairline; the stepper was 44px with a
sign at half the drawn stroke weight; and "You earn 10%" shipped through the
status-pill component, so it carried a border and 8.494px type instead of being
the borderless chip it is drawn as.

## The images were flattened, which is why they read as screenshots

Every asset in `public/casino/last-standing/` shipped fully opaque with the
card's `#121314` baked in as a background rectangle. Measured: `clear 0.0%` on
all four glyphs, corner pixel `rgba(18,19,20,255)`. So each glyph stamped a
flat dark square over the backdrop, the glow and the inside of the countdown
ring — the hourglass, which sits inside the ring, punched a patch out of it.

A Figma node _export_ does not fix this: Figma composites whatever sits behind
the node, so the export is opaque too. The fix is the **original uploaded
bitmap**, which the API returns separately. The crown's source is 64.1% fully
transparent with a 34.9% soft edge.

All four are now genuinely transparent and, resampled to 3× their drawn size,
**34% smaller** than the flattened versions they replace — 367 KB to 243 KB.
Before installing them the ink bounding box of each old file was measured
against the alpha bounding box of each new one; they agree within 0.3%, so no
CSS moved.

**The backdrop is now a real SVG.** It is the one asset with a vector source —
the four glyphs are 3D renders that exist in Figma only as raster, so no SVG of
them exists to fetch. The assembled file was verified against Figma's own
render of the node at **0.081% mean per-channel delta**, with a shift search
confirming a sharp symmetric minimum at zero offset in both axes rather than a
layer having drifted. It is 51 KB gzipped against the PNG's 218 KB, and being
vector it cannot blur at any stage width.

That verification earned its keep: it caught a layer that had been reasoned
away as sitting below the clip. The coordinate that suggested so was a _rotated_
bounding box; the layer is visible, and the pixel diff is what noticed.

**On the artwork reading flat:** it is drawn flat. Every fill in the vector
source is `white`, `#3B3B3B` or `#929292` — not one chromatic value — and the
crown measures 0.0% of pixels above 0.15 saturation. The blur was real and is
fixed; the greyness is the design.

## The hero block sits where it is drawn

On the Winner stage the hero group is at y=33 in the 372px card and is 252
tall, and the leader strip starts at 301 — so the design leaves 33 above and 87
below. The column was centred, which puts 60 either side and pulls the
sub-line toward the strip. It now aligns to the top for the ended and won
phases and keeps centring for the clock phases, which are drawn centred. The
whole stack reconciles exactly: 33 + 252 + 16 + 60 + 11 = 372.

## The activity table fills its card

The columns are drawn 150 wide on a 174 pitch, 672px in total — but the design
runs the row rules across the **whole card**. The table was sized to its
columns from a 672px container up, so the rules stopped mid-card and left the
dead space the maintainer saw. The table is now full width with the trailing
column absorbing the surplus; the measured rhythm is unchanged and a test
guards it against being evened out.

## The header, the sound switch, and the reader's own face

**The Share button is gone from the header.** The rail carousel's invite card
already carries one, so it was a second way to do the same thing. `ShareGameButton`
had no other caller and went with it; `useGameShare` stays, because the rail
uses it.

**The sound switch is raised rather than painted.** It was a 32px flat pill —
an outline at 12% white on a 5% fill, with a 11.5px label at 60% white. It is
now 34px with a 13px label at 85%, a dark neutral gradient, a lit top edge and
a drop shadow, and it presses like the other pills.

The maintainer asked for it to look "more 3D like the Start a new Game button".
That one is the **gold** primary; this took its _depth_ and not its _colour_,
because a gold sound control competes with the gold button that starts a game
and moves money. The gradient angle and stop positions are the house chrome
pill's exactly; the lit edge was dropped from `rgba(255,255,255,0.95)` to
`0.24`, because 0.95 white over a dark face is a seam rather than a highlight.
Every colour sits in one `SOUND_PILL` object, so a change of mind is one line.

**The reader's own Market Square picture now shows** wherever they are drawn —
the leader strip when they are the king, and their own rows in the activity
table. Everyone else keeps the drawn face.

This is wiring, not an integration: `useSquareAvatar` already existed, the
leaderboard in this same feature already used it, and both row types already
carried `avatarUrl`. The call sites were passing `null`.

Worth knowing what `null` means here, from the hook's own documentation: the
square never stores an avatar for someone who has not uploaded one, and the
face it draws in that case comes from a seeded hash of their identity — the
same seed this app's fallback uses. So a reader with no picture sees the same
drawn face on both products, which is the point.

The pre-play "nobody" strip keeps its `null` deliberately: its seed is empty of
address characters because there is no player yet.

## The sound switch moved into the stage card

With Share gone, the sound switch was the only thing left beside the title, and
the maintainer asked for it in the stage card's top-right corner instead —
mirroring "Rounds #1" at the top-left. The design leaves that corner empty, so
nothing was displaced by taking it.

It is a slot, not a flag: `StageCard` takes a `cornerAction?: ReactNode`. The
card draws a position; the switch it holds owns mute state the card has no
business knowing, and the next control to want that corner needs no change here.

The placement is measured off the label opposite it, not chosen. The round label
sits at left 29 / top 22 — the card's 12px padding plus the paragraph's own
17/10 — so the slot takes the same top and the same inset from the right.

It is absolutely positioned rather than sharing the label's line box, and that
has a consequence worth stating. The switch is a 34px box against the label's
16px line, so in flow it would grow that row and push the ring, the tiles and
the leader strip down. Out of flow it does not — but it now overlaps where the
design puts the Total Pot and Winner's Share tiles, 25px in from the same
corner. The maintainer chose, out of two options, to shift the tiles down: they
start at 70px with a corner control present (22 + the 34px box + a 14px gap) and
stay at the drawn 25px without one. So the tiles sit about 45px below their
drawn position on the two phases that show them. That is a deliberate departure
from the Figma, made to free the corner, and the conditional in `stage-card.tsx`
says so at the call site.

`PageHeader` lost its `children` slot entirely rather than keeping an empty one,
since nothing sits beside the title any more.

One side effect: the switch is inside the card, so it is absent while the stage
is still a loading skeleton. It was absent then before too — the header rendered
it, but there was nothing to hear until the game arrived.

Three tests cover it, and each was confirmed to fail against the unchanged
component: the slot's position and stacking, the tiles moving and staying put,
and the section putting the switch in the card rather than the header.

## The pop-out switch is back, beside the sound switch

The floating clock — `mini-timer.tsx`, document picture-in-picture where the
browser has it, a canvas video where it does not, an in-app overlay otherwise —
was never removed. What went, before this redesign, was the **button that
raises it**. Since then the only way in was `KeepWatchingDialog`, which catches
a click on a link leaving the arena and asks.

That covers navigating to another page of Ark. It does **not** cover switching
browser tabs or switching apps, which is when a player most wants the clock —
and it cannot, because both picture-in-picture APIs require a user gesture and
looking away is not one. Chrome's automatic picture-in-picture is gated behind
a permission tied to installed PWAs and active camera/mic capture; the arena has
neither. So the honest fix is a deliberate control, where the click **is** the
gesture. That is what this restores. The module's own comment had assumed it all
along: "the section's button (which unmounts on navigation) and the app-root
host (which never does)".

It sits in the stage card's top-right corner beside the sound switch, and it is
the same control: both render through one `CornerPill`, so "exactly like the
sound button" holds by construction rather than by a copy that drifts. The pill
style object was renamed `SOUND_PILL` → `CORNER_PILL`, since it now dresses two.

Like Sound, it is a toggle that says which state it is in — "Pop-out timer" /
"Close pop-out", with `aria-pressed` — which needed the pop-out's store to be
readable from outside: `mini-timer.tsx` now exports `subscribeMiniWindow` and
`isMiniWindowOpen` beside the `miniWindowSnapshot` it already exported.

`followGame(gameId)` runs before the window is raised, for the reason the
leaving dialog does it: the pop-out draws whichever game is followed, and
following is otherwise only set by wagering, so a watcher who never played would
carry an empty clock away. A test locks that order, not just the two calls.

It disappears once the round is over — there is no clock left to take, which is
why `useLeavePrompt` stops asking then too. Sound outlives the round and stays.

No new strings: `miniOpen` and `miniClose` were still in all five catalogues,
orphaned when the button went. `miniFailed` is still orphaned — see below.

## The tiles stop landing on the countdown

The Pot and Winner's Share tiles float into the card's top-right corner above a
container width of 560px. They should not: at that width they sit on top of the
countdown number.

The threshold is arithmetic, not taste. The clock is centred on the card, so its
right edge is at `W/2 + 111`. The tiles are 184 wide and inset 25 from the right,
so their left edge is at `W - 209`. They overlap while

```
W/2 + 111 > W - 209   ⟺   W < 640
```

So the floating layout needs 640px and was turning on at 560. The breakpoint is
now **672**, which clears the clock by 16px; the design's own 696px card clears
it by 28.

This was latent long before anyone saw it. At the design's drawn tile width of
152px the collision began at 576 — a 16px band nobody would ever resize through.
At the 184px width the maintainer asked for, the band runs 560 to 640 and is
impossible to miss. Enlarging the tiles did not cause the bug; it revealed it.

The typography on this card still steps up at 560 and should. One breakpoint was
doing two unrelated jobs and only the tiles' half of it was wrong.

The guard test recomputes the threshold from the numbers in the class names
rather than hard-coding 640, so changing the tile width or the inset without
moving the breakpoint fails the build instead of quietly reopening the overlap.
It also asserts that every floating utility shares one breakpoint — the tiles
going absolute at one width and taking their width at another is the same bug
wearing a different hat.

## "Past rounds" is gone

The tab never showed past rounds. It drew the **winners** feed: `GET
/game/winners`, which is global, capped at the 25 newest settlements across
every game, then filtered client-side to this one. A game whose settlement had
aged out of that window showed an empty tab no matter what had happened in it,
and a busy vault ages a game out in minutes.

It is removed rather than repaired, at the maintainer's direction. Two tabs that
report honestly beat three where one misleads. Repairing it properly needs a
per-game winners endpoint or cursor paging, which is backend work.

Removed with it: `WinnersList` (that tab was its only caller, so the file is
deleted), the `pastRounds` member of `PanelTab`, the now-unused `winnersLoading`
from the feeds hook, and the `tabPastRounds` / `hallEmpty` keys from all five
catalogues. The `winners` feed itself stays — it drives the win reveal, the
payout refresh and the amount shown on a "Won the round" row.

A stale comment in `features/trade/components/meme-gamified-bits.tsx` pointed at
`winners-list.tsx` for the rank-ring styling; it now names the surviving board.

## A live join now reaches the game's own feed

During a live round the pot, the king and the clock moved while the activity
table and "Rounds #N" sat frozen — for the whole round, since nothing else
touches that key while the socket is healthy. This is what "the round is showing
just one" and "the activities is showing just two" would have looked like on any
game with more than one player.

`wagerPlaced` did two things: `applyWager` patched `VAULT_KEYS.game(id)`, and
`applyActivity` appended the new row to `VAULT_KEYS.activities` — the **global**
cross-game strip. The game detail page reads `VAULT_KEYS.gameActivities(id)`, a
different key. Nothing wrote it and nothing invalidated it.

`keys.ts` had already written down the intent: "Deliberately nested under
`game(gameId)`: a wager invalidates that game, and the rows it just added should
be refetched with it." `setQueryData` does not invalidate child keys, so the plan
was recorded and never wired.

`applyActivity` now writes the row into the game's own feed as well. Three
decisions in it are worth keeping:

**Patched, not invalidated.** For the same reason `applyWager` patches: the
indexer trails the chain by a few blocks, so refetching on the frame can return
a feed that does not have the row yet and would drop it straight back out — the
row would appear, vanish, and reappear. The frame carries the row the feed will
index under the same transaction hash, so the eventual refetch reconciles
against it rather than fighting it.

**An unfetched feed is left unfetched.** If nobody has loaded that feed, the
updater returns `prev` untouched and no cache entry is created. Seeding it with
the single row the socket happens to carry would look like a complete history
while missing the `started` row the round count is measured from — which the
page reads as "no game here", not as "not loaded yet". A test holds this line,
and it fails against a version of the fix that seeds.

**Uncapped.** `MAX_ACTIVITIES` bounds the strip that spans every game; one
game's own history is not the thing that needs bounding.

`applySettled` now invalidates the same key, so the "won" row lands too — the
other half of the gap. Invalidated rather than patched there: the frame carries
a payout split rather than a feed row, and the round is already over, so the
indexer catching up a moment later costs nothing a mid-round flicker would have.
It invalidates exactly `gameActivities(id)` and not the `game(id)` prefix above
it, which would refetch the game and undo the settled state just patched in.

Five tests, written before the fix and each confirmed to fail against the
unchanged socket: the row arriving, a replayed frame not duplicating it, the
round number moving 1 → 3 across two joins, the settle invalidation, and the
guard against seeding an unfetched feed.

## Still to do

**Other players' faces.** The reader's own picture is wired; everyone else
still draws the seeded fallback, because the square exposes no lookup from a
wallet address to a profile. The maintainer has asked the square's backend
engineer for that mapping. When it lands it replaces one line per call site —
the row type already carries the field, and the comment at each site names it.

**Dead share copy.** `casino.lastStanding.shareCta` lost its last live consumer
with the header button. Five more — `shareHeading`, `shareEarnTag`, `shareBody`,
`shareCopyCta`, `shareCopyLink` — are referenced only by the `ShareGame` card in
`share-game.tsx`, which nothing in the repo renders and which was already dead
before this change. The catalogues were left alone deliberately: removing a key
that dead code still references is how a revival crashes on a missing message.
Dropping the card and its six keys is a tidy-up of its own.

**The per-game activity fetch never pages.** `fetchVaultGameActivities` sends no
`limit` and no `cursor` and never reads `nextCursor`, so it takes whatever that
endpoint's default first page is. A comment asserts it returns "every row that
game ever had", and nothing verifies that; the endpoint is absent from the
gateway's OpenAPI document while its siblings are documented as cursor-paged. If
it defaults to 25, long games silently lose rows **and** under-report their round
count, since the count is `1 + the joined rows present`. Needs a backend answer
before it is worth changing.

**The pop-out's failure message.** `casino.lastStanding.miniFailed` has no
consumer in any of the five catalogues. It reads "Couldn't open the floating
timer in this browser." — but `openMiniWindow` falls back to the in-app overlay
when a window is refused, so nothing has actually failed and a toast saying so
would be wrong. The `onFail` hook it was written for is still there and still
unused. Decide whether the overlay fallback deserves a quieter note of its own,
or drop the key.

**Automatic pop-out on tab switch.** Explicitly out of scope here, and the
reason is in the section above: the APIs need a gesture. If it is ever wanted,
the path runs through Chrome's automatic picture-in-picture permission, which
would mean installing Ark as a PWA — a much larger decision than this button.

**A browser pass.** Nothing on this screen has been checked against a running
page — every verification here is against the Figma geometry, the extracted
spec, or the suite. The transparent glyphs over the sunburst, the gold badge,
the restored Share and Claim pills, the vector backdrop and the table rules
reaching the card edge all want one human look.
