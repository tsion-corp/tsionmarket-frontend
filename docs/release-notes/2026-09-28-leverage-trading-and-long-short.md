---
date: 2026-09-28
feature: Perps becomes Leverage Trading, and the ticket's buttons say Long and Short
scope: refactor
scenario-impact: updated
---

# Two renames, and the line between a name and a thing

Two pieces of wording changed, both asked for by the team:

1. The product called **Perps / Perpetuals** is now **Leverage Trading**, everywhere
   a person reads it.
2. The two buttons on the leverage order ticket now say **Long** and **Short**
   instead of Buy and Sell.

Neither is a find-and-replace, and the reason is the same in both cases: the old
words are doing more than one job in this codebase, and only one of those jobs
is naming the product.

## What did NOT change, and why it matters

**The `/perps` URL stays.** So do the section id `"perps"`, every `perp_*`
analytics event, the `["perps-balance"]` query key, the `shine.perps` preference
persisted in user metadata, the migration ledger's `venue: "perps"` ids, the
`/api/perp` proxy path, and every type and file name. Decided with the
maintainer: renaming the URL touches nine source sites, a dozen test fixtures
and the CI bundle-budget key, and the real exposure is elsewhere — push and
in-app notification URLs are authored **server-side, outside this repo**, so a
frontend rename would 404 them. A redirect would cover that, but only for as
long as someone remembers it exists. Renaming the stored preference key or the
analytics names would silently orphan saved settings and split historical
dashboards.

**"Perpetual" survives where it names the instrument.** A perpetual future is a
kind of contract; Leverage Trading is the name of a product. `perps.perpetualOf`
is `{name} perpetual` — "Bitcoin perpetual" — and rewriting that to "Bitcoin
leverage trading" would be false rather than merely odd. It is the one string in
all five catalogues that still says the word, deliberately. (It is also dead:
nothing in the repo reads that key. Worth removing on its own, not here.)

**The Terms and Privacy pages are untouched.** Five instances of "perpetual
futures" across `app/terms/content.ts` and `app/privacy/content.ts` name the
instrument for legal purposes. Changing a contract with users is a different
kind of decision from renaming a nav label, and it is not this change's to make.

**The order side stays `"buy" | "sell"`.** That is the protocol value: it is what
`PlaceOrderRequest.side` carries, what the backend turns into Hyperliquid's
`b: boolean`, and what `perp-analytics.ts` normalises into `direction`. Only the
two labels moved. Every `side === "buy"` branch, every `onBuy`/`onSell` prop and
the `bg-buy`/`bg-sell` tokens are as they were.

## The translations were already decided

The catalogues did not need new wording invented for them. This product is
already described as leverage trading in two places, in all five languages:

|     | `markets.tabLeverage` | `discovery.ownMarketTitle` |
| --- | --------------------- | -------------------------- |
| de  | Hebel                 | Hebel-Trading              |
| es  | Apalancamiento        | trading apalancado         |
| fr  | Levier                | trading à effet de levier  |
| pt  | Alavancagem           | trading alavancado         |

So the rename converged on those rather than adding a sixth way to say it. The
full name is used for the product itself — nav, page title, eyebrow, the tour
step, the Shine service row, the migration venue, the onboarding interest — and
the short form only for the activity feed's filter chip, which is where the
catalogues already kept a short form ("Perps" in all five).

Twenty values per locale, one hundred in total, each written per language rather
than substituted. Three of the twenty are not the product's name at all and were
reworded rather than renamed:

- `perps.signInToTrade` — "Sign in to trade perps." became "Sign in to trade with
  leverage.", because "trade leverage trading" is not a sentence.
- `perps.balanceMayBridge` — "your perps margin" became "your trading margin".
- `marquee.perps` — the strip explains what the product IS, and its opening
  clause was "Perpetuals let you trade a price move with leverage". Substituting
  the name gives "Leverage trading lets you trade a price move with leverage", so
  the clause now explains the leverage instead: "back a price move with more than
  you put down".

## The wallet

Eight strings called it "your perps wallet". The maintainer chose **"your trading
wallet"** over "leverage wallet" and "leverage trading wallet" — the context
already says which product it is, and the literal reading is a mouthful in every
language ("votre portefeuille de trading à effet de levier").

Internal JSDoc in `hyperliquid-withdraw-modal.tsx` and `perps-withdrawal.ts` still
says "the perps wallet's free balance". Left alone on purpose: those comments
describe the venue's clearinghouse account, where "perps wallet" is the precise
term and "trading wallet" would lose information.

## The strings that were never in a catalogue

Fourteen user-facing strings were hardcoded English rather than translated, and
the rename surfaced them:

- `lib/sections.ts` — the `SECTION_LABEL.perps` fallback, used whenever the nav
  is built without a translate function. It has to agree with `sections.perps`,
  and now does.
- `features/trade/components/hyperliquid-trade-terminal.tsx` — the back link out
  of `/trade/:symbol` said `label="Perps"` in English for every locale. It now
  reads `t("perps")` from the `sections` catalogue, so it is translated for the
  first time rather than merely renamed.
- `features/trade/lib/pnl-card.ts` — the wordmark drawn on the shareable PnL
  image, beside "MARKET". It is right-aligned and grows leftwards, so the new
  longer word had to be measured rather than assumed: "LEVERAGE TRADING" at
  600 26px is about 269px on a 1200px card, leaving roughly 645px of clearance
  before "MARKET". The measurement is recorded in a comment next to it.
- `features/trade/lib/venue-scrub.ts` — this rewrites the venue's name inside
  upstream error messages, so the substituted word lands mid-sentence. It is
  lowercase for that reason: "Insufficient leverage trading balance".
- `features/trade/lib/migration-adapter.ts` (five), plus the service-unavailable
  messages in `hyperliquid-api.ts`, `use-global-balance.ts`,
  `lib/api/services/trade.ts` and the `/api/perp` proxy route.

Log lines that name the product were renamed with them. They are not UI, but an
engineer reads them, and a log that says "Perp proxy failed" beside a product
called Leverage Trading is a small future confusion for no saving.

## Long and Short

The ticket has no side control — the direction IS the button you press, so those
two labels are the whole decision surface. They now name the position a trader is
opening rather than the order being sent, which is what the rest of the screen
already did: the liquidation summary has read "Est. liquidation · Long" all along,
the fill toasts say "Long BTC-USD is open", and the position pills say LONG and
SHORT. The buttons were the last place that disagreed with everything around them.

`perps.long` and `perps.short` already existed in all five catalogues, so the
buttons point at them. Note the consequence: Buy and Sell **were** translated
(Kaufen/Verkaufen, Comprar/Vender), and Long/Short are not — no locale translates
them. That is the house convention for this product's jargon and it is now
applied to the two most prominent words on the desk. A German trader sees "Long"
and "Short" where they saw "Kaufen" and "Verkaufen".

Two new keys, `perps.longBlocked` and `perps.shortBlocked`, replace `buyBlocked`
and `sellBlocked` for the reason lines under the buttons — so a blocked short now
reads "Short: Take profit sits above the entry price" rather than "Sell: …". They
are built from each catalogue's own `long`/`short` value and its own colon
convention, which is why the French pair carries the space before the colon that
the rest of that deck uses.

`perps.buy`, `perps.sell`, `perps.buyBlocked` and `perps.sellBlocked` are removed
from all five catalogues. The ticket was their only reader — checked call site by
call site, because `t("buy")` appears fourteen times in this repo and thirteen of
those are the `spot`, `meme` and `rwa` namespaces, which are untouched.

## What was deliberately left alone on the ticket's side

**The resting-orders list still says BUY and SELL.** `hyperliquid-orders-list.tsx`
renders `order.side.toUpperCase()`, and mapping buy→LONG there would be wrong,
not merely inconsistent: a resting order carries a `reduceOnly` flag, and a
reduce-only **sell** is closing a long, not opening a short. A take-profit on a
long position is exactly that order. Labelling it SHORT would tell a trader they
hold the opposite of what they hold. An order side and a position side are
different things, and that list is showing order sides.

The team asked for the change "for the perps ticket", which is the surface this
change moved. If the orders list should read differently, it needs a rule that
accounts for `reduceOnly` — a separate decision with a correctness trap in it.

## Tests

`perp-order-ticket.test.tsx` renders against the real shipped `messages/en.json`,
by design — its own comment says a renamed or dropped key should fail there. It
did, and the two `getByRole` lookups that feed some forty downstream assertions
were the single point of update.

## The top of the screen, and where the money buttons live

Three layout changes to `/perps`, all asked for after looking at the running
page.

**The header is one row now.** The hamburger and the screen's name sat on
separate lines with the title below in an 11.5px uppercase eyebrow. They share a
row, and the title is a real `h1` at 22px (26px from `sm`) in the house display
font. The arithmetic that made the old top feel empty:

|                               | before     | after     |
| ----------------------------- | ---------- | --------- |
| page `pt-5`                   | 20         | 20        |
| hamburger (36px) + its `mb-4` | 52         | 36        |
| section `lg:py-8` top half    | 32         | 0         |
| eyebrow line box              | ~14        | 0         |
| `mt-4` under the eyebrow      | 16         | 0         |
| header row's own `pb-4`       | 0          | 16        |
| **to the top of the desk**    | **~134px** | **~72px** |

Two of those lines are the point: the title stopped costing a row of its own,
and the padding that framed the eyebrow went with the eyebrow.

The title is drawn by `PerpsMenuDrawer` through a new `title` slot rather than
by the route, because the button and the title have to share a row and the
button is that component's. The route cannot simply wrap both in a flex row:
the drawer renders the button and the off-canvas rail as siblings, so the rail
would become a third flex item between them and open a second gap.

It stays outside the route's `inert` wrapper, with the hamburger. That is
load-bearing rather than incidental — `inert` covers an element and everything
under it, so a header inside it would take the hamburger out of reach at exactly
the moment the rail is open and the hamburger is the only way to close it. The
title is static text, so nothing is lost by its living out there.

`PerpsSection` keeps its eyebrow everywhere else. It is mounted twice — `/perps`
and the phone Market view's "Leverage" tab — so the eyebrow became a `heading`
prop defaulting to on, not a deletion. `/perps` passes `heading={false}`; the
phone tab is untouched. The prop also drops the section's top padding, since
that padding existed to frame the eyebrow, and it is written as two whole
padding sets rather than a `pt-0` override: `lg:py-8` sits in a media query and
would beat an unprefixed `pt-0` at exactly the width this is meant to reclaim.

**Top up and Withdraw moved from under the ticket to the top of it.** They
arrive through a new `accountActions` slot on `PerpOrderTicket` — a `ReactNode`,
not a set of handlers and flags. Whether Withdraw is reachable depends on the
clearinghouse's withdrawable figure, and whether Top up is accented depends on
the wallet id and on the collateral the trader has typed. Carrying all of that
in as props would make the ticket know what an account is, which its own header
comment says is the one thing it must not. The desk already holds every piece,
so it hands the finished row down and the ticket only draws a position.

The row lost the `border-t` it used to carry. That rule divided it from the
ticket above; at the top of the ticket there is nothing above it to divide from,
and a rule there would read as a heading rule for the pair strip beneath it.

### A test that proved nothing

The first guard written for this was in the desk's own suite and it was
worthless: that file **mocks** `PerpOrderTicket`, so it can only show the prop
was handed over, never that anything renders it. Deleting `{accountActions}`
from the real component left all 48 of its tests green.

The real assertions live in `perp-order-ticket.test.tsx`, which renders the
actual component: that the slot renders, that it draws nothing when empty, and
that it comes before the market identity rather than after the Long/Short pair.
Both mutations — slot removed, slot rendered last — fail them.

### The gap was the panel, not the row

Moving the buttons to the top of the ticket made a second, older gap obvious.
The ticket panel is a fixed 924px from 1080px up, so that it stands level with
the market column beside it, and the ticket inside it is shorter than that. The
panel was `justify-center`, so the leftover height was split in two and half of
it sat above the ticket's first control — dead space between the card's top edge
and the first thing in it.

It is `justify-start` now. The whole remainder falls below the content, where a
card with room left under it simply reads as a card with room left, and the only
space above the first row is the card's own `pt-3`.

Worth being clear about cause: this was not introduced by moving the buttons.
Adding a ~48px row at the top made the ticket TALLER, which shrank the slack.
The centring had been putting a gap up there all along; it only became the first
thing the eye landed on once a button was what sat beneath it.

The seam under that row is 8px wider than the column's own rhythm — 16px where
the rest of order entry uses 8. That is on the slot's own wrapper, not on the
column's gap: raising the gap would have pushed the Long/Short pair away from
the summary above it by the same amount, which is one group moving, not two.
Moving money in and out is a different job from placing an order, so the space
between those two groups is twice the space inside either.

The wrapper only renders when there is something to put in it. A bare
`{accountActions}` would leave a zero-height box still carrying its margin,
which is 8px of nothing above the pair strip on any surface that passes no
account actions.

## Still to check

Nothing here has been seen in a browser. The risk is length, not logic: "Trading
à effet de levier" is three times the width of "Perps" and now sits in a sidebar
rail, a tour step, a Shine settings row and a migration venue list. The short
form exists for exactly this reason if any of those overflow.
