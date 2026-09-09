---
title: Sponsored sends ask Alchemy once
date: 2026-09-09
area: trade
scenario-impact: none
---

# Release Note: one Gas Manager call per sponsored send

## What changed

A gasless send used to make six separate calls to work out fees, gas and
paymaster data before sending, read the wallet's delegation twice, and start
polling for the receipt at once. A two-call memecoin trade cost about
twenty-two provider calls plus two balance reads.

Now the send makes one `alchemy_requestGasAndPaymasterAndData` call through
the existing proxy, which fills every gas and paymaster field, and hands viem
a complete operation so it signs and sends with no further estimate. The
delegation check is read once per wallet and chain for the life of the page.
The receipt is first looked for after one block, then every three seconds.
The trade service status poll looks at 2 s, then backs off to 3, 5 and 8 s.

Delivery is now proven from the receipt's own Transfer logs instead of a
balance read before and after the trade, so those two reads are gone too.

A two-call buy measured 11 provider calls on the dev server before the
receipt-log change, against 12 to 15 in the production recording; without
the two balance reads it is 9.

## Files

- `lib/trade/gas-manager.ts` (new): the one call and its strict parser.
- `lib/trade/delegation.ts` (new): delegation memo per wallet and chain.
- `lib/trade/sponsor.ts`: the send rebuilt around the two above.
- `lib/server/alchemy-bundler.ts`: the method joins the allowlist; the
  proxy writes the pair's policy into the request, replacing any the client
  sent.
- `lib/trade/sponsor-fees.ts` and its test: removed; nothing called them.
- `lib/meme/delivery.ts` (new): what a receipt says the wallet received.
- `hooks/use-evm-send.ts`: `useEvmSendWithReceipt()` hands the logs back;
  `useEvmSend()` is unchanged for every other caller.
- `features/trade/hooks/use-meme-trade.ts`: delivery from the receipt,
  status poll backoff.
- `features/trade/components/meme-trade-sheet.tsx`: the preview query is
  off from the moment a trade starts. It stayed live before, and a window
  focus after a sale refetched it for the amount just sold, which the
  service refused with a 422 on every sell.

## Decision records

- `docs/adr/ADR-2026-09-09-one-call-sponsorship.md`
- `docs/adr/ADR-2026-09-09-one-call-sponsorship-for-dummies.md`

ADR-2026-09-07-paymaster-priority-fee-floor is superseded: the Gas Manager's
answer carries the bundler's own fees.

## Verification

- `lib/trade/sponsor.test.ts`: runs the real send against a fake fetch and
  pins the exact JSON-RPC methods per endpoint for a delegated wallet, an
  undelegated wallet, a second send and a slow receipt.
- `lib/trade/gas-manager.test.ts`: the parser refuses incomplete answers.
- `lib/server/alchemy-bundler.test.ts`: policy injection for the new method
  on Base and Polygon, with a client-sent policy discarded.
- `features/trade/hooks/use-meme-trade.test.tsx`: the status poll timing.
- Manual: a Base memecoin buy and sell on the local dev server, counting
  `base-mainnet` rows in the Network tab before and after.
