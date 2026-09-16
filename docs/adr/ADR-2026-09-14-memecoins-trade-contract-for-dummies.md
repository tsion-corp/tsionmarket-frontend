# Bringing memecoins onto the trade team's rulebook (plain English)

**Date:** 2026-09-14 · **Status:** approved by the maintainer on 2026-09-14; being built in five steps. Was: proposed, waiting for the maintainer's
approval. Nothing has been built yet.

## What is the problem?

The trade team wrote down, in one document, exactly how any app that trades
memecoins through their service must behave. It covers what to show when a
number is missing, when to warn people, how to place a trade safely, what fees
to show, and — new — how to show someone's memecoin holdings, profit and loss.

We read that document line by line against what our app does today. The core
of trading is solid: we link wallets properly, we ask for a fresh quote each
time, we run the steps in the right order on both Base and Solana, and we wait
for the service to confirm. But there are real gaps around it:

1. **We sometimes say "bought" before the service has confirmed.** When the
   coins have visibly landed in the wallet but the service records the trade
   as failed (a known bug on their side with sponsored transactions), we show
   success anyway. The rulebook says only the service's "CONFIRMED" may be
   called success.
2. **We never ask for consent on thin coins.** The service flags coins with
   under $50,000 of liquidity and tells us to show a "proceed at your own risk"
   confirmation before even asking for a price. We show the warning as small
   text on one screen, and not at all on the desktop or phone tickets.
3. **We never show the platform fee.** The service returns it with every
   price; none of our screens print it.
4. **We pretend the catalogue is one page.** We load 500 coins and call that
   everything. The service has over 11,000 on Base and 100,000 in total. It
   also means a coin someone bought can quietly vanish from their holdings if
   it is not in the first 100 rows we look at.
5. **Our holdings page guesses.** It reads wallet balances from a third party
   and prices coins from that first page; a coin with no price shows as
   `$0.00`. The service now offers a proper holdings, profit-and-loss and
   activity feed that we do not use at all.
6. **Small honesty bugs.** A coin with no 24-hour change is painted green; the
   error reference number the service sends is thrown away, so support cannot
   trace a complaint.

Two of our choices go against the rulebook on purpose: we hide low-rated and
thin coins (the maintainers asked for that on 7 September), and we hide Solana
coins (the sponsor wallet was empty). The rulebook says thin coins should be
shown with a warning and a consent step, not hidden. We are not silently
undoing either choice; we are asking the maintainer to decide again with the
rulebook in front of them.

We also checked the live service. The address in the rulebook does not answer
from here at all; the address our app actually uses does, and every route the
rulebook describes exists there. The Solana sponsor wallet is no longer empty
(about 0.06 SOL — enough for a few dozen trades, not a lot).

## What are we going to do?

Five pieces of work, each its own pull request, in this order:

1. **Tell the truth about a trade.** A new "delivered" state for the case where
   the coins arrived but the service has not confirmed: the screen says
   "Delivered on-chain, still being recorded", not "bought". Every error keeps
   the service's reference number so support can find it. A trade whose
   receipt is slow no longer reads as failed.
2. **Check everything the service sends and stop turning blanks into zeros.**
   Every response the app relays gets validated. A missing number is shown as
   "unknown", never as green, never as `$0`.
3. **Consent, fees and expiry on every trade screen.** The first time someone
   types an amount for a thin coin, a dialog shows the service's own warning
   and asks them to confirm before we even fetch a price. Every ticket shows
   the platform fee and blanks out when a quote has expired.
4. **Admit how big the catalogue is.** "Load more" walks the service's pages
   properly. A "Curated / All" switch shows either today's filtered list or
   everything the service lists (with warnings) — if the maintainer wants the
   switch; otherwise the current filters stay, written down as a deliberate
   exception. Solana coins come back behind a flag once ops promise to keep the
   sponsor wallet funded.
5. **A real Memecoins section on the portfolio.** Holdings, cost basis, profit
   and loss, and an activity list come straight from the service. Where the
   service cannot price something it says "Valuation unavailable"; where the
   figures are incomplete it says so; stale prices show their age. Selling
   from that list always previews first, on the coin's own chain.

## What does this cost?

- A few more requests when someone keeps loading catalogue pages, and four
  small requests a minute while the portfolio is on screen. Nothing new runs
  in the background.
- No new libraries. Two small helper files.
- Users will see: a consent dialog on thin coins, a fee line, page counts, the
  word "delivered" where "bought" used to appear too early, and a new
  portfolio section.
- The backend still has to fix how it verifies sponsored transactions before
  we can retire the "delivered" state; until then it stays.

## What we decided not to do

- Not keep calling a delivered-but-unrecorded trade "confirmed".
- Not add a maths library; the tools already in the app are enough.
- Not compute profit and loss ourselves from the raw trade list; the service's
  ledger is the source of truth.
- Not remove the third-party wallet balances entirely; they are how we see a
  coin that arrived from outside, and they now say "unavailable" instead of
  `$0`.

## How will we know it works?

Tests are written first, for each piece: the reference number survives every
error; "confirmed" only ever comes from the service; the price is never
requested for a thin coin before consent; the fee row shows the service's
number; the app fetches exactly as many pages as the total says and never more
than 500 at a time; a coin with no price reads "Valuation unavailable" and never
`$0` or `-100%`; a sell from the portfolio opens on the right chain.
