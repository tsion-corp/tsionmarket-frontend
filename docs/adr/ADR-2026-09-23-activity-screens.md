# ADR-2026-09-23: the Arkivity screens, and a view model the coming endpoints can fill

## Status

**Accepted** by the maintainer on 2026-09-23, with **option 3**: ship All Activity
now, hold In Progress until the activity endpoint lands.

Three consequences of that choice, recorded here so the scope is not rediscovered:

1. The In Progress surfaces (`730:1748`, `730:1134`) are **not built**.
2. The **tab strip is not rendered yet**. A tablist with one tab, or with a tab
   that leads nowhere, reads as broken. It arrives in the same change as In
   Progress, which is also when its promotion below the feature line earns its
   keep.
3. The `PerpLedgerTabs` promotion is therefore **deferred**, not cancelled. The
   `useModalTrigger` promotion and the new `StatusChip` still happen now, because
   the filter pills and the row statuses need them.

## Context

The maintainer has four Figma frames for a redesigned Activity ("Arkivity")
screen, and new backend endpoints for user balance and user activity that land
**after** this work. The screens come first; the integration follows.

| node       | surface                    |
| ---------- | -------------------------- |
| `730:1288` | Desktop, All Activity list |
| `730:1748` | Desktop, In Progress cards |
| `730:788`  | Phone, All Activity list   |
| `730:1134` | Phone, In Progress cards   |

They are two surfaces at two breakpoints, not four screens. Both share a search
field, a two tab switch, and two filter pills ("All Products", "Last 30 Days").

**All Activity** is a day grouped list. Each group heads with a date and a count
("Today, 9th September" … "5 Activities"). Each row carries an icon, a title, a
time and product line, a coloured status, a right aligned amount and a caption
under it, and a chevron into a detail.

**In Progress** is a card list grouped by product. Each card carries a product
label, a status, an icon with title and subtitle, one or two key/value pairs
(stake, odds, payout), a fine print line, and one or two actions.

### What the repo has today

`features/activity/` renders an on chain transaction feed. `ActivityEntry` in
`lib/activity/entries.ts` is:

```
{ id, hash, network, timestamp, kind, symbol, amount, direction,
  counterSymbol?, counterAmount?, counterparty, logo }
```

There is no `status`, no `product`, no `title`, no stake, no payout. The feed is
an Alchemy sweep: `app/api/activity/route.ts` has no product or status concept
server side, because none exists there.

`ActivityRow` is welded to that shape. It reads `network` twice (explorer URL and
label), `hash` (explorer href and as a game match id), `direction` (sign and
colour), `symbol`, `counterparty`, `counterSymbol`/`counterAmount`, and it uses
`kind` **as the translation key**: the thirty odd `ActivityKind` strings are
literally the keys under `activity` in `messages/*.json`.

## Decision

### 1. A view model, separate from the on chain entry

Introduce `ActivityFeedItem` in `lib/activity/feed.ts` as the shape the screens
render. It is a product event, not a transfer:

```
id, occurredAt, product, title, subtitle?, status,
amount { value, symbol, signed }, caption,
progress? { stake, odds?, payout?, note?, actions[] },
href?
```

Two adapters map into it and nothing else does:

- `fromChainEntry(entry: ActivityEntry): ActivityFeedItem` — today's on chain
  feed, preserving the existing `kind` to translation key mapping.
- `fromActivityApi(row)` — written when the endpoint lands.

**Why not widen `ActivityEntry`.** It is the output of a pure transfer reducer
that also feeds `lib/pnl.ts`, `PnlCards` and the notification bell. Adding
`status`, `stake` and `payout` to it would make every consumer carry fields that
are meaningless for a transfer, and would make the coming endpoint's shape a
second dialect of the same type. One type with two meanings is how a model rots.

**Why this ordering matters.** Building the screens directly against
`ActivityEntry` would mean rewriting them during the integration, which is the
expensive moment to discover a shape is wrong. A view model the endpoint maps
into means the integration is one new adapter and no component changes.

### 2. Three primitives move below the feature line

`features/activity` cannot import `features/trade` (Directive 7, no cross feature
imports), so the pieces we want are unreachable where they sit. Each moves to
`components/ui/` and its old home re-exports, so no caller changes:

| from                                                      | to                             |
| --------------------------------------------------------- | ------------------------------ |
| `PerpLedgerTabs` (`features/trade/`)                      | `components/ui/underline-tabs` |
| `useModalTrigger`, `MODAL_PANEL_CLASS` (`meme-sort-menu`) | `components/ui/modal-trigger`  |
| (new)                                                     | `components/ui/status-chip`    |

`PerpLedgerTabs` already carries a comment asking for exactly this: it names
itself "the third hand rolled tablist in the tree" and says all three "should
collapse into one primitive under `components/ui/`". We are the fourth caller,
so we take the promotion rather than write a fifth.

`useModalTrigger` is sixty lines of Tab trapping, Escape handling and focus
return. It is domain free and worth exactly one copy.

`StatusChip({ tone, label })` is new, and deliberately shared. Six hand rolled
status chips exist (`TypeChip`, `meme-activity-row`'s `statusTone`, ArkBall's
ticket history, two in Earn, `DepositStatus`), none shared, none carrying this
screen's eight states. The tone vocabulary is smaller than the label set
(`win | loss | live | pending | done | neutral`), which is what makes it reusable
rather than a lookup table with our labels baked in.

### 3. Reused without change

`SearchField` (already the shared primitive under `components/ui/`), `ModalShell`,
`usePaged` + `ListPagination`, and the bigint backed formatters
`formatUsdString` and `compactCount`. `ActivityView` currently hand rolls its own
pager; it is replaced by `usePaged`, which it predates.

No new number formatting is written. Six `formatCompact*` variants already exist
in the tree and a seventh would be a defect, not a convenience. One thin
`signedTokenAmount(amount, symbol, { compact })` wrapper composes the two that
already handle these cases.

### 4. Built new

The row and the view. Both are welded to the transfer shape, and generalising
`ActivityRow` would mean six optional props layered on the branch it already
carries. `dayHeading` is rebuilt to return `{ key, label, date }` rather than a
bare string, because the design needs an ordinal date and a per group count that
a string cannot carry; its today/yesterday logic is kept verbatim.

`relativeTime`, `clockTime` and the grouping `useMemo` are lifted out of the row
file and exported, unchanged in behaviour.

### 5. Breakpoints

`md:` prefixes, as Activity already does, with `Responsive` only where the two
designs diverge structurally.

**Explicitly not `useMarketHandoff`.** `/spot`, `/rwa` and `/meme` redirect to
the phone Market page below `md`. Activity must not: it is a first class phone
destination, and `components/layout/curved-tab-bar.tsx` routes its Activity seat
straight to `/activity`. A handoff here would break the phone tab bar.

**Explicitly not `useIsMobile`** unless a branch costs a request. Both trees read
the same query, so mounting both is free and avoids the hydration correction.

### 6. The notification bell

`useActivity` is shared with `components/layout/notification-bell.tsx` through
the same query key. Its return shape does not change. The adapter sits above it.

## Consequences

**Gained.** The screens render from a shape the coming endpoint can fill, so the
integration is an adapter rather than a rewrite. Three primitives that six
features have been copying become shared, and the tablist promotion the codebase
asked for in writing finally happens.

**Cost.** Three files move, with re-exports so no caller changes. A new view
model type. The old `ActivityRow` and `ActivityView` are replaced, not edited.

**Risks.**

- The promotions touch files owned by the memecoin and perps surfaces. Each is a
  move plus a re-export, verified by typecheck, with no behaviour change.
- `usePaged` holds page state internally with no reset, so switching tab or
  filter can leave the reader on a page the new result does not have. It clamps
  on render so it is safe, but the component must be keyed or the state lifted.
- Paging a day grouped feed by row means a day straddling a page boundary shows
  its heading twice. The current code already does this. Decide deliberately
  rather than inherit it.

## The open question the maintainer must answer

**The In Progress tab has no data source today.** It needs stake, odds, payout
and a settlement status, and nothing in the repo or the current endpoint carries
them. Three options:

1. **Build it against the view model and leave the adapter empty** until the
   activity endpoint ships. The tab renders its empty state, which is honest and
   costs nothing to switch on later.
2. **Derive what we can** from existing per product sources (prediction
   positions, Arkade stakes, withdrawal status) by composing at the route, which
   is real work and duplicates what the endpoint will do.
3. **Ship All Activity only** and hold In Progress until the endpoint lands.

This ADR proposes **option 1**. It is the only one that does not build something
the backend is about to replace, and it leaves a tab a reader can see is empty
rather than one that is missing.

## Alternatives considered

**Widen `ActivityEntry` with optional status and stake fields.** Rejected: it
makes every existing consumer carry fields that are meaningless for a transfer,
and it pre commits the type to a guess about the endpoint's shape.

**Copy the tab strip and modal trigger into `features/activity`.** Rejected: it
would be the fourth and second copy respectively, and the codebase has already
written down that this is the wrong answer.

**Keep `ActivityRow` and add branches.** Rejected: it already branches once for
game rows, and the new design shares no visual decision with it.
