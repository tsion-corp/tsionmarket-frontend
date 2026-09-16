---
date: 2026-09-15
feature: Perps on the current Ark contract (CCTP funding rail)
scope: perps
scenario-impact: needs_automation
adr: docs/adr/ADR-2026-09-15-perps-cctp-rail.md
---

# Perps on the current Ark contract (CCTP funding rail)

The perps desk now follows the backend's integration guide, `apps/perp/llms.txt`
(2026-09-14). Four things changed.

## 1. Top up goes over Circle's CCTP (llms.txt §6a)

Before, a top-up sent USDC to a Dextopus deposit address, waited for it to
reach Arbitrum, then bridged it across. Now it is one sponsored Base
transaction that burns USDC and mints it straight into the perps balance.

- The app reads who pays the mint relay from `ark/deposit/cctp/config`. When
  the platform pays, no fee line is shown. When the user pays, the modal shows
  the most the transfer can cost and the least that arrives, from Circle's live
  fee quote.
- The burn's `maxFee` comes from that live quote in exact base units. If the
  quote cannot be read, nothing is burned and the modal says the fee is
  unavailable. A burn with too low a fee would sit unminted.
- After the burn, the app records it (`ark/deposit/cctp/record`, three tries)
  and follows `ark/deposit/cctp/status` or a rising perps balance. The modal
  then says one of: funded, on its way, sent but not yet registered (with the
  burn hash to give support), or needs attention (with the hash). It never shows
  an error after money has moved.
- The Dextopus deposit path is gone from the app, and `funding/deposit-address`
  and `funding/deposit-status` are off the perp proxy's allowlist.

## 2. Withdraw sends the platform fee and finishes over CCTP (llms.txt §6b)

Withdrawals against the current backend were failing: `withdrawals/prepare`
now returns `{ withdraw, fee }`, and submit expects the signed fee leg.

- The typed amount is the total that leaves the perps wallet. The withdraw3
  carries it less the $0.50 platform fee, and the fee travels as its own signed
  sendAsset. If the backend prepares a different fee, or none, the app prepares
  again with that figure before signing anything.
- The modal shows one combined fee ($1 venue + platform fee) and what arrives,
  refuses a total the fees would swallow, and never lets Max exceed the free
  balance. All of this is exact string and bigint arithmetic.
- The last leg, Arbitrum to Base, is now CCTP: a sponsored Arbitrum burn, the
  attestation through the app's new `/api/cctp` proxy, and a sponsored Base mint.
  It replaces the Dextopus reroute, and `resumeWithdrawal` uses it too, still
  gated strictly on `withdrawals/pending`.

## 3. Polling follows the freshness model (llms.txt §10)

- Positions poll every 10 seconds only while a position is open or an order is
  resting. Orders poll every 30 seconds only while one is resting. A flat,
  orderless desk makes no repeat calls.
- The clearinghouse balance is never polled. It refreshes after a trade or a
  money move, and on returning to the tab.
- The balance card's perps balance (`useGlobalBalance`) stopped polling every
  20 seconds on every page. It refreshes on focus and whenever the desk moves
  perps money.
- A cancel or a trigger edit refreshes only orders; a top-up or withdrawal only
  the balances; an open or close everything.

## 4. The venue is not named to traders (llms.txt §0)

- The ticket's over-balance note said "HyperCore margin" in all five languages;
  it now says "perps margin".
- Every perps error shown on the desk passes through `scrubVenue`.
- A test fails the build if any English catalogue string names the venue.
- **Not changed, pending a maintainer decision:** the Terms and Privacy pages
  name Hyperliquid as the execution venue and a data recipient.

## New pieces

- `app/api/cctp/[...path]`: GET only, signed-in sessions, two allowlisted Iris
  routes (attestation, fee quote), responses validated with Zod.
- `lib/cctp/` (Circle constants, calldata encoders, attestation poller, fee
  math), carried over from `origin/feat/perps-on-mainline` with added tests.
- The fund and withdraw modals are translated (`perpsFunds`, 38 strings, all
  five catalogues). Before, they were English only.

## Scenario impact

`needs_automation`. Top-up and withdrawal move real USDC across three chains and
depend on Circle's attestation service; none of it can be exercised in jsdom.
Before this merges, a funded wallet on the staging deployment must:

1. Top up a few dollars and see the balance arrive, recording the Base burn hash.
2. Withdraw back to Base and see it land, recording the withdraw, the Arbitrum
   burn and the Base mint hashes.

The HyperCore forward hook bytes (`encodeForwardHookData`) follow Circle's
forwarding format plus the HyperCore recipient and dex. Circle's public docs do
not publish the HyperCore variant, so step 1 is also the proof of those bytes.

## Tests

New suites: `lib/cctp/fees`, `app/api/cctp` proxy, `features/trade/lib/cctp-api`,
`cctp-transfers`, `perps-withdrawal`, `perps-polling`, `venue-scrub`, and the fund
and withdraw modals. Updated: `hyperliquid-actions` (withdraw, resume, top-up),
the perp proxy, `hyperliquid-pro-perps` (narrow refetch and withdraw wiring),
`use-global-balance` (no poll), `lib/cctp/cctp` and `attestation` (Arbitrum to
Base burn, lookup injection), and `perp-order-ticket` (de-branded copy).
