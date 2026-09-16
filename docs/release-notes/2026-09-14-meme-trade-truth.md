---
title: Memecoin trades tell the truth about what the trade service recorded
date: 2026-09-14
area: memecoins
adr: ADR-2026-09-14-memecoins-trade-contract
scenario-impact: updated
---

# Release Note: trade truth and transport (slice 1 of the trade contract)

The first of five slices bringing the memecoins feature onto the trade
service's frontend contract (`trade-llms.txt`). This one is about what the
user is told after a trade, and about the plumbing that carries the
service's word.

## What changed

- **`delivered` and `pending`, distinct from `confirmed`.** The trade hook's
  phase machine gains two states. `confirmed` is set only when the service's
  status is `CONFIRMED`. When the swap's own receipt proves the wallet was
  paid but the service records `FAILED`/`REVERTED` or refuses the
  registration with 409, the phase is `delivered`: the sheet and every ticket
  show "Delivered on-chain" with the amount and the reference, and the toast
  says delivered, never bought or sold. When the status poll passes ten
  minutes without a terminal state, the phase is `pending`: closable, with
  the same reference, and the swap stays in the transactions card. Before
  this, both cases read as "Trade confirmed"/"Bought", and an on-chain
  receipt was treated as settled while the service was still confirming.
- **`requestId` end to end.** The contract's failure envelope carries a
  `requestId`; it now survives on `TradeApiError`, the relay's own error
  bodies mint one (and echo it as `x-request-id`), the transport tags its
  Watchtower report with it, and every warning, analytics event and
  Watchtower report in the trade hook carries the swap id, the request id and
  the hash. `trade_recording_mismatch` now also goes to Watchtower.
- **Our copy for the service's error codes, in five languages.** Every code in
  the contract's "Important errors" (plus the relay's own codes and the swap
  lifecycle's terminal states) maps to a `tradeErrors.*` string in en, de,
  es, fr and pt, with "Ref: <requestId>" appended as the support detail. The
  service's `message` text no longer reaches the screen on any memecoin
  surface, including the spot desk's swap-market path, which printed it raw.
- **User-operation hashes are registered.** When the bundler accepts a
  sponsored operation but never produces a receipt, the hook registers
  `{ userOperationHash }` for that call and continues to the status poll,
  instead of failing with nothing registered.
- **Same-key retry on `QUOTE_PROVIDER_ERROR`.** The quote is retried once,
  1.5 s later, with the same `Idempotency-Key`, as the contract asks. Every
  other path keeps a fresh key per user action, including the relink after
  `WALLET_OWNERSHIP_MISMATCH`.

## Copy

- Delivered: title "Delivered on-chain"; body "{amount} {symbol} reached your
  wallet. Ark is still recording this trade (ref <swapId · requestId>). You
  can close this."; toast "{symbol} delivered on-chain. Still being recorded
  (ref …)."
- Pending: title "Sent, still being recorded"; body "The transaction went out
  and Ark is still recording this trade (ref …). You can close this; it stays
  in your transactions."; toast "{symbol} trade sent. Still being recorded
  (ref …)."

The ADR wrote "World Street is still recording"; the catalogues carry the
brand as a `{brand}` parameter (`lib/brand.ts`, currently "Ark"), so the
copy follows the app's brand rather than hard-coding a name.

## Tests

- `lib/meme/api.test.ts`: `requestId` on the thrown error (service and relay
  minted, and null when absent); `registerSubmission` bodies for both hash
  kinds.
- `app/api/trade/[...path]/route.test.ts` (new): minted ids on
  `SERVICE_UNAVAILABLE` and `BAD_RESPONSE`, distinct per failure; upstream
  ids echoed as `x-request-id`.
- `lib/errors.test.ts`: every contract code → its key; "Ref:" appended;
  upstream wording never returned for a trade error, with or without a
  translator; other services unchanged.
- `lib/analytics/watchtower.test.ts`: `request_id` tag; the mismatch report's
  tags and fingerprint.
- `features/trade/hooks/use-meme-trade.test.tsx`: delivered + FAILED →
  `delivered`; delivered + 409 → `delivered` with the 409's `requestId`;
  `CONFIRMED` → `confirmed`; the ceiling → `pending` and the poll stops;
  user-operation hash registered and polling continues; provider error
  retried once with the same key, other failures not, relink gets a fresh
  key; the failure object kept on `error`.
- `features/trade/components/meme-trade-sheet.test.tsx`: delivered title,
  body with the reference, toast never "bought"; confirmed only on
  `confirmed`; pending closable; a receipt while confirming is not "All
  done"; mapped copy with "Ref:" and no upstream wording.
- `features/trade/hooks/use-spot-buy.test.tsx`: bought only on `confirmed`;
  delivered and pending toasts otherwise.

## Still needed from the backend

- Fix verification of EIP-7702 sponsored user operations (the service records
  `FAILED`/409 for swaps that delivered), or verify the bundle transaction
  from a `{ userOperationHash }` submission. Until then `delivered` is what
  users of the sponsored Base path will see on every trade that completes.
- Confirm the canonical gateway host: the contract names
  `api.worldstreetwebservices.com`; the app runs on `api.tsionark.com`.

`scenario-impact: updated`: the memecoin buy/sell scenarios now end in one of
confirmed, delivered or pending, and the copy for each is above.
