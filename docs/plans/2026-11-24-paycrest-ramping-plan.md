# Plan: Paycrest as the one onramp/offramp rail, Pouch KYC rewired

Branch: `feat/paycrest-ramping`, off latest `origin/main`.

## Decisions (confirmed with the product owner)

- Paycrest **replaces** the live Pouch/Yellowcard NGN bank rail
  (`lib/ramping/*`, `bank-withdraw-screen.tsx`, `bank-transfer-screen.tsx`)
  once it's live — not run alongside it.
- End-user KYC: wire the orphaned, already-built
  `features/funds/components/kyc/*` (`KycOnboarding`, `kyc-form.tsx`,
  `kyc-field.tsx`, `date-field.tsx`, `use-pouch-kyc.ts`) back in, rather than
  building new. Paycrest itself does **not** do end-user KYC — its docs are
  explicit that KYB (business-level) is Paycrest's job and customer KYC is
  the sender's (us) — so this piece is ours regardless of rail.
- `features/remit/*` (the dark Dextopus+PouchPay rail) and the dead
  `hooks/use-pouch-onramp.ts` / `features/funds/hooks/use-pouch-offramp.ts`
  are out of scope here — not touched by this plan.

## Verified against the live API (not docs mirrors — docs.paycrest.io's own

pages 404'd on several paths; everything below was confirmed by calling
`api.paycrest.io` directly with the real key)

- Base URL: `https://api.paycrest.io/v1`. Auth: `API-Key: <key>` header.
- `GET /tokens` — public, no auth. Confirms Base USDC is
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (matches the address already
  used elsewhere in this repo) at `networkFee: "0.02"`. Also lists USDT/cNGN
  across ethereum, base, arbitrum-one, polygon, bnb-smart-chain, celo,
  starknet, solana, tron.
- `GET /currencies` — public. Live rates for NGN, KES, UGX, TZS, plus ZMW,
  GHS, RWF (more corridors than the docs page's "4 active" claimed).
- `GET /institutions/{currencyCode}` — public. Returns the real bank/PSP
  list with Paycrest's own institution codes (e.g. `{"name":"Guaranty Trust
Bank","code":"GTBINGLA","type":"bank"}` for NGN) — this directly replaces
  whatever bank list `bank-withdraw-screen.tsx` currently sources from Pouch.
- `GET /rates/{token}/{amount}/{fiatCode}` (optionally `?network=`) —
  public. Returns `{status, message, data: "<rate string>", metadata}`.
  Confirmed live: `GET /rates/USDC/10/NGN` → `"1443"`.
- `POST /sender/orders` — authenticated, this is the real request shape
  (confirmed by iterating on the live validator's error messages, not
  guessed from docs):
  ```json
  {
    "amount": 10,
    "token": "USDC",
    "network": "base",
    "rate": 1443,
    "recipient": {
      "institution": "GTBINGLA",
      "accountIdentifier": "0123456789",
      "accountName": "Test Tester",
      "memo": "Test withdrawal"
    }
  }
  ```
  `recipient` is a nested object (a docs mirror had shown it flat — wrong).
  `GET /sender/orders/{id}` is the order-status read (per docs; not
  independently probed since it needs a real order id).

## Blocking prerequisite — not something I can do

Posting the payload above with a real token now answers
`{"field":"Token","message":"Provided token is not configured"}`. Paycrest's
own quickstart says this plainly: **the Sender Dashboard needs tokens,
networks, `feePercent`, `feeAddress` and `refundAddress` configured per
token/network before any order can be created.** This is a web-dashboard
action tied to the business account, not an API call — **you need to log
into the Paycrest Sender Dashboard and configure at least USDC on Base**
(and whichever other token/network pairs you want live) before order
creation will work, regardless of how complete the code is. Nothing below
can be verified end-to-end until that's done.

## Scope of this pass

Build the backend foundation (client, proxy, tests) only. The two live UI
screens it will eventually replace are a bigger, riskier rewrite (real
money, live traffic) — sequenced as the next pass, after the dashboard
prerequisite is cleared and the foundation is proven against a real test
order.

## Steps

1. **`lib/server/paycrest.ts`** (new, server-only): typed client —
   `getPaycrestTokens()`, `getPaycrestCurrencies()`,
   `getPaycrestInstitutions(currency)`, `getPaycrestRate(token, amount,
fiat, network?)` (all public, no key needed server-side either, but kept
   server-side to match this repo's proxy convention and so the key is
   ready the moment order creation needs it), `createPaycrestOrder(input)`,
   `getPaycrestOrder(id)` (both authenticated with `PAYCREST_API_KEY`).
2. **`app/api/paycrest/[...path]/route.ts`** (new): proxy mirroring
   `app/api/kash/[...path]/route.ts`'s shape — a `PUBLIC_GET_PATHS` set for
   `tokens`, `currencies`, `institutions/:currency`, `rates/:token/:amount/:fiat`,
   and a session-gated `POST orders` that stamps the session's own wallet
   address as `returnAddress`/refund destination so one user can't create an
   order that refunds to another's wallet.
3. **Tests.** `lib/server/paycrest.test.ts` + the route's own test, mocking
   `fetch`, mirroring `lib/server/pimlico-bundler.test.ts`'s shape: auth
   required for the order endpoints, public paths reachable without a
   session, the request body built exactly as verified above.
4. **Env.** `PAYCREST_API_KEY` added to `.env.local` (done) and
   `.env.example` (server-only, never `NEXT_PUBLIC_`).

## Next pass (not this one)

- Swap `bank-withdraw-screen.tsx`'s bank list + order creation onto this
  client; retire `lib/ramping/*` and the Pouch-backed bank list once proven.
- Rewire `features/funds/components/kyc/*` back into the funds modal ahead
  of a Paycrest order, gated on whatever threshold/corridor needs it.
- Decide what becomes of `bank-transfer-screen.tsx` (onramp) similarly.
- A real test order, once the Sender Dashboard is configured, to confirm
  the response/status shape this plan had to leave unverified.

## Out of scope

`features/remit/*`, the dead Pouch onramp/offramp hooks, any change to
Base/Pimlico sponsorship work from the same session.

## Revision 2026-11-24 (supersedes the steps and scope above)

The maintainer confirmed Paycrest works in both directions and that USDC on
Base (and other tokens) is configured in the Sender Dashboard, which clears
the blocker above. The build now targets the **v2** API, where one
`POST /v2/sender/orders` serves offramp and onramp, and onramp carries the
customer KYC inline. Scope and design are in
[ADR-2026-11-24-paycrest-ramping](../adr/ADR-2026-11-24-paycrest-ramping.md):

1. `lib/paycrest/types.ts`, `lib/paycrest/amounts.ts`: domain types and
   bigint decimal helpers.
2. `lib/server/paycrest.ts`: v2 client with Zod-parsed responses.
3. `app/api/paycrest/[...path]/route.ts`: public reads, session-gated
   verify-account and orders, server-stamped wallet, ownership check on reads.
4. `hooks/use-paycrest.ts`: react-query hooks.
5. `features/funds/components/paycrest-withdraw-screen.tsx` and
   `paycrest-deposit-screen.tsx`, switched in by `BANK_RAIL` in
   `features/funds/lib/flags.ts`.
6. Tests for each layer, strings in all five locales, and a release note.
