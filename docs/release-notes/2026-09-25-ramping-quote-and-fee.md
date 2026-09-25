---
date: 2026-09-25
feature: The withdraw screen shows the rail's own payout instead of one it worked out
scope: fix
scenario-impact: needs_automation
---

# The withdrawal figure was overstated by the fee

The withdraw screen multiplied the amount by the rate and showed the result as
the payout. The rail charges a flat fee and pays out net of it, so every
withdrawal was quoted about 20 NGN higher than what reached the bank.

Measured against api.tsionark.com on 2026-09-25:

| Withdrawal | Rail pays | We showed | Off by |
| ---------- | --------- | --------- | ------ |
| 10 USDC    | 13,480    | 13,500    | 20     |
| 50 USDC    | 67,480    | 67,500    | 20     |
| 500 USDC   | 674,980   | 675,000   | 20     |

The fee is flat, not a percentage, so the error is the same at every size and
proportionally worst on the smallest withdrawals. Deposits were unaffected: the
onramp side reports no fee.

## Why it happened

`GET /rates/quote` was never proxied. It is absent from the allowlist in
`app/api/ramping/[...path]/route.ts`, so the app had no way to ask the rail
what a withdrawal was worth and reimplemented the arithmetic instead. The fee
was the first thing that reimplementation did not know about.

## What changed

- `rates/quote` is allowlisted, with no shared cache: a quote is priced for one
  amount and must never be served to a second caller.
- `useRampingQuote(side, amount)` asks for it, debounced by React Query's own
  key and disabled until there is a positive amount to price.
- Both money screens now display the rail's figure. The withdraw screen shows
  `output.amount` as the payout; the deposit screen shows it as the USD
  equivalent.
- The local bigint conversion stays, but only to fill the moment before the
  quote lands, and the screen says "≈" while that is what it is showing.
  `payoutNgnAfterFee` makes that estimate net of the fee too, so the number
  does not jump when the quote arrives.
- `/rates` and `/rates/quote` no longer require a session. They are public on
  the rail, carry no order state and name no wallet, so gating them only meant
  a signed-out visitor could not be shown the rate at all. Every other route,
  including the bank list, still needs one.

`ngnForUsdcExact` is unchanged and still gross. It is the right answer to "what
is this worth at this rate", which is a different question from "what will
arrive", and both are needed.

## What the user sees

One line, and it is the truth: **You receive ₦67,480**. While the quote is in
flight it reads **You receive ≈ ₦67,480** from the local estimate, which is
already net of the fee, so the figure does not move when the quote resolves.
The rate line beside it is unchanged.

## Tests

Written before the fix, per the red-green protocol.

- `lib/ramping/orders.test.ts` pins the split: the gross helper stays gross,
  and `payoutNgnAfterFee` is the net figure. Covers a flat fee at three sizes,
  no fee, an unparseable input, and a fee larger than the withdrawal, which
  floors at zero rather than rendering a negative payout.
- `app/api/ramping/[...path]/route.test.ts` is new. It asserts the quote is
  forwarded with its query string intact, that the operator and list routes are
  still refused, that a write still needs a session, and that the price reads
  do not.
- `hooks/use-ramping-quote.test.tsx` asserts the hook returns the rail's 67,480
  rather than the 67,500 the arithmetic gives, sends each side's own amount
  parameter, asks for nothing until there is an amount, and sends no session.

Full suite: 6863 passed, 3 skipped. Typecheck, production build and bundle
budget clean; lint reports no new warnings.
