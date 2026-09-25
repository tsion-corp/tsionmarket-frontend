---
date: 2026-09-23
feature: The Arkivity All Activity screen
scope: activity
scenario-impact: needs_automation
adr: docs/adr/ADR-2026-09-23-activity-screens.md
plan: docs/plans/2026-09-23-activity-screens-spec.md
---

# The Arkivity All Activity screen

The redesigned Activity screen, built ahead of the user balance and user
activity endpoints rather than after them. Nothing here talks to those
endpoints yet. The point of doing it in this order is that the screens render a
shape the endpoints can fill, so plugging them in later is one adapter and no
component changes.

## What a reader sees

A search box and two filter pills over a day-grouped list.

- **Day headings** read "Today, 9th September" with the number of rows drawn
  under them on this page. The ordinal is an ICU `selectordinal` in the
  catalogue, not a suffix table in TypeScript, so German writes "9." and French
  writes "1er septembre" but "2 septembre".
- **Each row** carries a coin, what happened, the time and the product that
  produced it, a coloured status, the amount, a caption under it, and a chevron.
- **The chevron opens a detail sheet** with two actions: share to Market Square,
  and view the transaction on-chain.
- **Filters**: All Products plus the nine products the model carries, and a date
  window of 7 days, 30 days, 90 days, 12 months or all time. The screen opens on
  Last 30 Days, because the design's pill rests there. Worth knowing: that is
  narrower than the screen it replaces, which always showed everything.
- **Five states**, each tested: loading, unreadable, empty history, a partial
  read that still has rows (the rows stay, under a banner), and filters that
  match nothing, which offers a way back to the defaults.

## The decision this rests on

`ActivityEntry` describes a blockchain transfer: hash, network, token, amount,
direction. The new design describes a product event: what you did, how it ended,
what it is worth. A transfer record cannot say whether a prediction won or a
withdrawal is still processing, so the screens render a new view model,
`ActivityFeedItem` in `lib/activity/feed.ts`, and `fromChainEntry` maps today's
feed into it. `fromActivityApi` is the one function the integration adds.

`ActivityEntry` itself is untouched. It is the output of a pure transfer reducer
that also feeds `lib/pnl.ts`, `PnlCards` and the notification bell, and
`useActivity` shares a query key with that bell, so the adapter sits above it
and nothing downstream changes.

## Scope held back deliberately

Per the ADR, accepted with **option 3**: this ships **All Activity only**.

- The **In Progress** surfaces (`730:1748`, `730:1134`) are not built. They need
  stake, odds, payout and a settlement status, none of which exists in the repo
  or the current endpoint.
- The **tab strip is not rendered**. A tablist with one tab, or with a tab that
  leads nowhere, reads as broken. It arrives with In Progress.
- The `PerpLedgerTabs` promotion is therefore **deferred, not cancelled**.

## Three primitives moved below the feature line

`features/activity` may not import `features/trade`, so the pieces worth reusing
were unreachable where they sat. Each move keeps a re-export at the old path, so
no existing caller changed:

| from                                                      | to                            |
| --------------------------------------------------------- | ----------------------------- |
| `useModalTrigger`, `MODAL_PANEL_CLASS` (`meme-sort-menu`) | `components/ui/modal-trigger` |
| (new)                                                     | `components/ui/status-chip`   |

`useModalTrigger` also gained a sibling, `useModalDismiss`: the Escape and
Tab-trap half, with no opinion about who owns the open state. The trigger hook
owns its own, which suits a toolbar button opening a menu; a dialog whose
subject arrives as a prop cannot use that without keeping two copies of the same
truth. `useModalTrigger` now calls it, so there is still exactly one copy of the
trap in the tree and all four existing callers are unchanged.

`StatusChip` is the one genuinely new shared piece. Six hand-rolled status chips
already exist in the tree (`TypeChip`, `meme-activity-row`, ArkBall's ticket
history, two in Earn, `DepositStatus`), no two alike and none reusable, because
each keyed its colours off its own feature's status strings. This one takes a
tone, not a status, which is the only thing two features can agree on.

Its `live` tone is green, the same pair as `win`, because the Activity frames
draw Live in the signal green they draw Won in; the pulsing dot is what tells
the two apart. A surface that wants Live to read as unresolved passes `pending`
instead, which is how the In Progress cards will get their amber. The chip's
"every tone is distinct" test records that one intended exception rather than
being deleted.

## Three defects caught in review, before they shipped

Each was in a seam, where both sides looked correct on their own:

- **Every token lost its logo.** `ActivityEntry` carries a `logo` URL, which is
  the only art most of this feed has: `AssetIcon` ships marks for the majors and
  nothing for the long tail. The adapter dropped it, so every unlisted memecoin
  would have rendered as a gradient placeholder. The model now carries an `icon`
  field and the row passes it through.
- **A KASH+ buy showed a USDC coin.** It is a USDC transfer to the treasury, so
  the figure is USDC and relabelling it would misstate it, but the row it
  replaces deliberately showed the KASH+ coin — you read the thing you got. That
  is why `icon` is its own field rather than `amount.symbol`.
- **The share composer could reopen on the wrong event.** One detail sheet
  serves every row rather than being remounted per row, and whether the composer
  was open was local state that outlived the event it belonged to. Closing the
  sheet with the composer up left it up, so the next row tapped opened straight
  into a composer nobody asked for, carrying the previous event's draft. The
  path there is currently unreachable — Escape stands down while the composer is
  on top, and the composer's own backdrop covers the sheet's — which is exactly
  why it was worth closing now rather than after someone adds a close button.

All three were fixed test-first, per Directive 3.

## Money

No float touches an amount. `ActivityAmount.value` is a plain decimal string,
and `decimalFromNumber` expands the exponent form rather than rounding through
`toFixed`, because `String(1e-7)` is `"1e-7"`, which every decimal parser in the
repo rejects. That conversion is the only place a float crosses into the model,
and it disappears the day the endpoint sends strings.

Abbreviation runs on the digits of the string, so nothing is converted to a
float and nothing is lost past 2^53. Digits past the second are truncated, never
rounded: an abbreviation must not read higher than the amount it stands for, so
`-999999999` renders `-999.99M`, with the exact figure on the element's `title`.

## Strings

42 keys per catalogue, in all five (`en`, `de`, `es`, `fr`, `pt`), taking each
file to 3,273. New Activity copy sits in nested groups under `activity`
(`products.*`, `captions.*`, `subtitles.*`, `dayHeadings.*`, `filters.*`,
`ranges.*`, `detail.*`) rather than flat, because that namespace is keyed
by `ActivityKind` id — `activity.received` and `activity.sent` are already row
titles, and a flat `received` caption would have collided with one.

The eight status words stay flat as `activity.statusWon` and so on, which is
what the rest of the catalogue does for a status and cannot collide with a kind.

All five day headings state the day as an ICU `selectordinal`, including the
three languages that need no suffix table of their own — German renders `{day,
selectordinal, other {#.}}` as "9.", Spanish and Portuguese render a plain "9".
That is not decoration. `lib/i18n-catalogs` compares placeholders with a regex
that matches only the simple `{name}` form, so a locale written as `{day}`
against an English `{day, selectordinal, …}` reads as having a placeholder
English lacks, and the catalogue gate fails. Same argument kind in every
catalogue, same answer from the gate.

Both the row and the day-heading suites now render the shipped catalogue rather
than an inline copy of it, so a renamed or missing key fails a test instead of a
screen. A separate suite renders the day heading in all four non-English
locales and asserts the French ordinal is "1er août" but "2 août".

## What did not change

- **`useMarketHandoff` is deliberately not used.** `/spot`, `/rwa` and `/meme`
  redirect to the phone Market page below `md`. Activity must not: the curved
  tab bar routes its Activity seat straight to `/activity`, so a handoff here
  would break that seat.
- **`PnlCards` is kept**, above the list, though the design has no such block.
  Dropping it would have quietly removed a shipping feature from the route. It
  is scored over the whole history rather than the filtered slice, because a
  profit figure that moved when a date filter changed would read as a different
  profit.
- **`ActivityEntry`, `useActivity` and the notification bell** are untouched.

## Known follow-ups

- **The old `ActivityView` and `ActivityRow` are now dead.** No route renders
  them; only the `features/activity` barrel still exports `ActivityView`, and
  they keep their own test. They are left in place deliberately rather than
  deleted in this change, because removing them also orphans catalogue keys
  (`prevPage`, `nextPage`, `pageOf`, and the bare `from` / `to` / `vs`
  prepositions the old row composed in JSX) and that is a separate, reviewable
  change. They should go when In Progress lands.
- **Two explorer maps.** `explorerTxHref` here is keyed by the Alchemy network
  slug the activity feed carries; `lib/meme/chain.ts`'s `explorerTxUrl` is keyed
  by numeric EVM chain id. They cover the same six explorers and should converge
  on one map with a slug-to-id translation at the activity boundary.
- **`lib/format.ts`'s `timeAgo` hardcodes English** ("just now", "5m ago") and
  is rendered by nine components across `features/square`, `features/prediction`
  and `features/casino`, so those feeds are untranslated in de, es, fr and pt
  today. The activity version returns a catalogue key instead. Converging them
  means one set of thresholds across nine call sites: its own change.
- **`captions.netProfit` / `netLoss` / `notDebited` are not in the catalogue.**
  The design shows them, but nothing emits them until `fromActivityApi` exists,
  and shipping copy no code reaches is how a catalogue rots.

## Scenario impact

`needs_automation`. jsdom does no layout, so "does not clip at phone width" is
asserted structurally — the long-title test walks every ancestor from the title
to the breakpoint root and asserts none carries `overflow-hidden`, `absolute` or
a frozen width, which is what stops the design's clipping defect coming back.
That is not the same as looking at it. Before this merges, on the preview:

1. A real 402px capture of the phone list, with the capture size read back
   rather than trusted, including a row whose title is long in German.
2. The chevron opens the sheet; share and the explorer link both work; an
   off-chain Arkade row shows no explorer button rather than a dead one.
3. Filter from a later page and confirm the list returns to page 1.
4. Switch locale to each of de, es, fr and pt and read a day heading, a product
   label and a caption on a real row.
5. A memecoin row with a logo the icon set does not ship, to confirm the art
   arrives.
